import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';
import vm from 'node:vm';
function load(file) { const mod = new Module(file); const original=mod.require.bind(mod); mod.require=name=>name.startsWith('./')?load('lib/'+name.slice(2)+'.ts'):original(name); mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file); return mod.exports; }
const {summarizePatientActivity}=load('lib/pilot-insights.ts');
const {buildPatientSummaries}=load('lib/clinician-overview.ts');
const now=new Date().toISOString();
test('a single hard response is not described as mostly appropriate',()=>{
 const s=summarizePatientActivity([], [{id:'a',difficulty:'too_hard',performed_at:now,completion_status:'partial'}]);
 assert.equal(s.difficultyTrend,'1 exercises rated hard');
 assert.equal(s.completionRate,100);
 assert.equal(s.completedSessions,1);
});
test('unrated skipped exercise is not a difficulty assessment',()=>{
 const s=summarizePatientActivity([], [{id:'a',difficulty:null,performed_at:now,completion_status:'skipped'}]);
 assert.equal(s.difficultyTrend,'No ratings yet');assert.equal(s.completionRate,0);assert.equal(s.skippedExercises,1);
});
test('Since Last Visit excludes earlier reports, preserves latest symptoms',()=>{
 const s=summarizePatientActivity([{id:'a',created_at:'2020-01-01',pain_score:8},{id:'b',created_at:now,pain_score:3,symptom_direction:'improving',patient_comment:'Better stairs'}],[], '2021-01-01');
 assert.equal(s.averagePain,3);assert.equal(s.symptomDirection,'Improving');assert.equal(s.comments.length,1);
});
test('new feedback enters inbox and explicit review clears new-feedback reason',()=>{
 const snapshot={patients:[{id:'p'}],episodes:[{id:'e',patient_id:'p'}],goals:[],programs:[{id:'hp',episode_id:'e',status:'active'}],recentCheckins:[{id:'c',patient_id:'p',created_at:now}],adherenceLogs:[],openDecisions:[]};
 assert(buildPatientSummaries(snapshot)[0].reviewReasons.includes('Patient feedback to review'));
 snapshot.openDecisions=[{id:'d',patient_id:'p',created_at:new Date(Date.now()+1000).toISOString()}];
 assert(!buildPatientSummaries(snapshot)[0].reviewReasons.includes('Patient feedback to review'));
});
test('service worker never intercepts clinical API requests for caching',()=>{
 const listeners={};const context={URL,self:{location:{origin:'https://example.test'},addEventListener:(name,fn)=>listeners[name]=fn}};
 vm.runInNewContext(fs.readFileSync('public/sw.js','utf8'),context);
 for(const [url,method] of [['https://example.test/api/patient-invitations/email','POST'],['https://example.test/api/patients','GET'],['https://db.supabase.co/rest/v1/patients','GET']]){
 let intercepted=false;listeners.fetch({request:{url,method,mode:'cors'},respondWith:()=>intercepted=true});assert.equal(intercepted,false);
 }
});

test('Today partitions alerts, review and on-track counts while excluding discharged cases',()=>{
 const s={patients:[],episodes:[],goals:[],programs:[],recentCheckins:[],adherenceLogs:[],openDecisions:[]};
 for(const [id,kind] of [['a','alert'],['r','review'],['o','on_track'],['d','discharged']]) {
  s.patients.push({id,status:kind==='discharged'?'discharged':'active'});
  s.episodes.push({id:'e'+id,patient_id:id,status:kind==='discharged'?'discharged':'active'});
  s.goals.push({id:'g'+id,episode_id:'e'+id,title:'Walk',current_value:'20',baseline_value:'10',target_value:'30'});
  s.programs.push({id:'h'+id,episode_id:'e'+id,status:'active'});
  s.recentCheckins.push({id:'c'+id,patient_id:id,episode_id:'e'+id,created_at:now,pain_score:kind==='alert'?8:2});
  if(kind==='on_track')s.openDecisions.push({id:'x',patient_id:id,episode_id:'e'+id,created_at:new Date(Date.now()+1000).toISOString()});
 }
 const result=buildPatientSummaries(s);assert.deepEqual(result.map(p=>p.queue),['alert','review','on_track','discharged']);assert.equal(result[3].needsReview,false);
 s.patients.push({id:'missing'});assert.equal(buildPatientSummaries(s).at(-1).queue,'review');
});
test('Today never mixes a previous episode goal or program into the active episode',()=>{
 const s={patients:[{id:'p'}],episodes:[{id:'old',patient_id:'p',status:'discharged',updated_at:now},{id:'new',patient_id:'p',status:'active',updated_at:'2020-01-01'}],goals:[{id:'g',episode_id:'old',title:'Old goal'}],programs:[{id:'h',episode_id:'old',status:'active'}],recentCheckins:[{id:'c',patient_id:'p',episode_id:'old',pain_score:9,created_at:now}],adherenceLogs:[],openDecisions:[]};
 const p=buildPatientSummaries(s)[0];assert.equal(p.episode.id,'new');assert.equal(p.latestGoal,null);assert.equal(p.latestCheckin,null);assert.equal(p.program,null);assert.equal(p.queue,'review');
});
