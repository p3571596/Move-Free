import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';
const load=(file,deps={})=>{const m=new Module(file);m.require=k=>deps[k];m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports;};
const p=load('lib/prescription.ts');
const d=load('lib/data.ts',{'./prescription':p,'./exercise-media':load('lib/exercise-media.ts')});
test('legacy counts and explicit frequency convert, ranges and time retain original without guessing hold/duration',()=>{
 assert.deepEqual(p.prescriptionFromLegacy({dosage_sets:'2',dosage_reps:'8',frequency:'3x/week'}),{sets:{value:2,unit:'sets'},reps:{value:8,unit:'reps'},frequency:{value:3,unit:'sessions/week'}});
 for(const text of ['8–10','30 seconds','2 x 8','as tolerated',''])assert.deepEqual(p.prescriptionFromLegacy({dosage_reps:text}),{});
 assert.deepEqual(p.prescriptionFromLegacy({frequency:'8 days/week'}),{});
 assert(p.formatExercisePrescription({dosage_sets:'2',dosage_reps:'30 seconds'}).includes('Original instructions: 2 sets · 30 seconds'));
 assert.deepEqual(p.prescriptionFor({prescription:{},dosage_reps:'8'}),{},'explicit removal does not reintroduce original values');
});
test('applicability permits empty and blank fields; rejects units, invented strings, fractional counts and invalid ranges',()=>{
 for(const valid of [{},{hold:{value:null,unit:'sec'}},{load:{value:2.5,unit:'kg'}},{frequency:{value:2,unit:'sessions/day'}}])p.validatePrescription(valid);
 for(const invalid of [{reps:{value:'8',unit:'reps'}},{sets:{value:1.5,unit:'sets'}},{load:{value:5,unit:'stones'}},{frequency:{value:8,unit:'days/week'}},{intensity:{value:11,unit:'RPE/10'}},{distance:{value:-1,unit:'m'}},{hold:{value:NaN,unit:'sec'}},{other:{value:1,unit:'sec'}}])assert.throws(()=>p.validatePrescription(invalid));
});
test('Other explanation required before any write; unrelated explanations are excluded from payload',async()=>{
 let payload;
 const client={from:table=>{return {insert:async rows=>{if(table==='exercise_adherence_logs')payload=rows;return {error:null}}}},auth:{getUser:async()=>({data:{user:null}})}};
 const entry={homeProgramExerciseId:'x',completionStatus:'completed',difficulty:'too_hard',difficultyReason:'other',difficultyExplanation:' ',notes:''};
 await assert.rejects(d.logExerciseSession(client,'p','h',[entry],'s'),/what made/);assert.equal(payload,undefined);
 await d.logExerciseSession(client,'p','h',[{...entry,difficultyExplanation:'  Band irritated my hand.  '}],'s');assert.equal(payload[0].difficulty_explanation,'Band irritated my hand.');
 await d.logExerciseSession(client,'p','h',[{...entry,difficulty:'appropriate',difficultyExplanation:'Stale'}],'s');assert.equal(payload[0].difficulty_explanation,null);
});
test('patient explanation and prescription history retained as context, never infer examination or tolerance',()=>{
 const engine=load('lib/clinical-engine.ts'), map=load('lib/automatic-clinical-review.ts',{'./clinical-engine':engine}).mapClinicalInputs;
 const now='2026-10-09T12:00:00Z';const w={patient:{id:'p'},episode:{id:'e'},program:{id:'h'},programExercises:[{id:'x',prescription:{sets:{value:2,unit:'sets'}}}],checkins:[],goals:[],progressMetrics:[],barriers:[],adherenceLogs:[{id:'l',patient_id:'p',home_program_id:'h',performed_at:now,feedback_provenance:{source:'PATIENT_REPORTED'},difficulty_explanation:'My grip hurts',difficulty:'too_hard',difficulty_reason:'other'}],prescriptionChanges:[{id:'c',entity:'home_program_exercises',created_at:now,after_value:{prescription:{sets:{value:3,unit:'sets'}}}}]};
 const m=map(w,{},now);assert.equal(m.context.feedbackEvidence[0].source,'PATIENT_REPORTED');assert.equal(m.context.feedbackEvidence[0].recordId,'l');assert.equal(m.context.prescriptionChanges[0].id,'c');
 for(const key of ['rpe','newNeuro','adherence','exercisePain'])assert.equal(m.inputs[key],undefined);
});
test('data layer saves a typed assignment through atomic RPC with version and no library writes',async()=>{
 let args;const calls=[];
 const row={id:'assignment',exercise_id:'exercise',prescription:{reps:{value:12,unit:'reps'}},patient_name:'Patient variation',video_overridden:true,patient_video_url:null};
 const client={auth:{getUser:async()=>({data:{user:{id:'clinician'}},error:null})},rpc:async(name,value)=>{assert.equal(name,'save_structured_program');args=value;return {data:'program',error:null}},from:table=>{
   calls.push(table);
   if(table==='analytics_events')return {insert:async()=>({error:null})};
   const query={select(){return this},eq(){return this},single:async()=>({data:{id:'program',status:'active'},error:null}),order:async()=>({data:[row],error:null})};return query;
 }};
 const result=await d.saveProgramDraft(client,'patient',[row],undefined,{}, {id:'program',status:'active',updated_at:'2026-10-09T12:00:00Z'});
 assert.equal(args.p_expected,'2026-10-09T12:00:00Z');assert.equal(args.p_items[0].id,'assignment');assert.equal(args.p_items[0].patient_name,'Patient variation');assert.deepEqual(args.p_items[0].prescription,row.prescription);assert.equal(args.p_items[0].patient_video_url,null);assert.equal(args.p_items[0].video_overridden,true);
 assert(!calls.includes('exercises'));assert.equal(result.programExercises[0].reps,12);
 args=undefined;await assert.rejects(d.saveProgramDraft(client,'patient',[{...row,prescription:{reps:{value:1.5,unit:'reps'}}}]),/valid number/);assert.equal(args,undefined);
});
