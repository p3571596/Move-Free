import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';
import vm from 'node:vm';
function load(file) { const mod = new Module(file); mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file); return mod.exports; }
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
