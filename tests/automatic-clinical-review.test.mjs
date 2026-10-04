import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';
function compile(file, dependencies={}) { const m=new Module(file);m.require=name=>dependencies[name];m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports; }
const engine=compile('lib/clinical-engine.ts');
const {mapClinicalInputs:map,evaluateAutomaticReview:run}=compile('lib/automatic-clinical-review.ts',{'./clinical-engine':engine});
const now='2026-09-30T12:00:00Z', date='2026-09-30T10:00:00Z';
const workspace=()=>({patient:{id:'p'},episode:{id:'e'},program:{id:'h'},programExercises:[],checkins:[],adherenceLogs:[],goals:[],progressMetrics:[],barriers:[],decision:null,visitNote:null});
const log=(patch={})=>({id:'l',patient_id:'p',home_program_id:'h',home_program_exercise_id:'x',performed_at:date,completion_status:'completed',...patch});
test('patient reports automatically map equivalent inputs with source IDs',()=>{
 const w=workspace();w.checkins=[{id:'c',patient_id:'p',episode_id:'e',created_at:date,symptom_direction:'worsening',pain_score:8,patient_comment:'Harder today'}];w.adherenceLogs=[log({pain_during:6,difficulty:'too_hard'})];
 const m=map(w,{},now);assert.equal(m.inputs.painTrend,'worsening');assert.equal(m.inputs.exercisePain,6);assert.equal(m.provenance.exercisePain.state,'AUTO');assert.deepEqual(m.provenance.exercisePain.recordIds,['l']);assert.equal(m.context.checkins[0].patient_comment,'Harder today');assert.equal(run(m).ruleId,'v0.1.adverse_response');
});
test('missing data never becomes normal; daily pain and difficulty are not exercise pain/RPE',()=>{
 const w=workspace();w.checkins=[{id:'c',patient_id:'p',created_at:date,pain_score:8}];w.adherenceLogs=[log({difficulty:'too_hard'})];const m=map(w,{},now);
 for(const key of ['redFlag','newNeuro','swelling','recoveryHours','rpe','exercisePain','adherence','painIncrease']) {assert.equal(m.inputs[key],undefined);assert.equal(m.provenance[key].state,'UNKNOWN');}
 assert(!run(m).recommendation.startsWith('Progress'));assert(run(m).missing.includes('newNeuro'));
});
test('clinician supplements missing observations, cannot overwrite auto data, then recalculates safety',()=>{
 const w=workspace();w.adherenceLogs=[log({pain_during:6})];const m=map(w,{newNeuro:true,exercisePain:0,rpe:11},now);
 assert.equal(m.inputs.exercisePain,6);assert.equal(m.provenance.newNeuro.state,'CLINICIAN-ADDED');assert.equal(m.inputs.rpe,undefined);assert.equal(run(m).ruleId,'v0.1.safety');
});
test('partial/skipped exposure prompts adherence review, not treatment failure or fabricated adherence',()=>{
 const w=workspace();w.adherenceLogs=[log({id:'1',completion_status:'partial'}),log({id:'2',completion_status:'skipped'})];const m=map(w,{},now);assert.equal(m.context.completionRate,0);assert.equal(m.inputs.adherence,undefined);assert.equal(run(m).recommendation,'Review execution / improve adherence');assert(run(m).reasons.some(x=>x.includes('does not demonstrate treatment failure')));
});
test('mixed function/pain trend preserves both signals and prioritizes adverse response',()=>{
 const w=workspace();w.goals=[{id:'g',episode_id:'e',updated_at:date,baseline_value:'10',current_value:'20',target_value:'30'}];w.checkins=[{id:'c',patient_id:'p',created_at:date,symptom_direction:'worsening'}];w.adherenceLogs=[log({pain_during:7})];const m=map(w,{},now);assert.equal(m.inputs.function,'improving');assert.equal(run(m).ruleId,'v0.1.adverse_response');assert(run(m).reasons.some(x=>x.includes('Mixed signals')));
});
test('stale, future, foreign-patient, previous-program records excluded; session retries deduplicated',()=>{
 const w=workspace();w.decision={created_at:'2026-09-29T00:00:00Z'};w.adherenceLogs=[log({session_id:'s'}),log({session_id:'s'}),log({id:'old',performed_at:'2026-09-28T10:00:00Z'}),log({id:'other',patient_id:'other',pain_during:10}),log({id:'prev',home_program_id:'previous',pain_during:10}),log({id:'future',performed_at:'2026-10-01T00:00:00Z'})];const m=map(w,{},now);assert.equal(m.context.reportedExercises,1);assert.equal(m.inputs.exercisePain,undefined);
});
test('text/ambiguous/mixed goals do not fabricate function direction',()=>{
 const w=workspace();w.goals=[{id:'g',episode_id:'e',updated_at:date,baseline_value:'10 minutes',current_value:'20 minutes',target_value:'30 minutes'}];assert.equal(map(w,{},now).inputs.function,undefined);
 w.goals=[{id:'g',episode_id:'e',updated_at:date,baseline_value:'10',current_value:'5',target_value:'0'}];assert.equal(map(w,{},now).inputs.function,'improving');
});
test('same-exercise difficulty across distinct sessions is captured without converting it into RPE',()=>{
 const w=workspace();w.adherenceLogs=[log({id:'1',session_id:'s1',difficulty:'too_hard'}),log({id:'2',session_id:'s2',difficulty:'too_hard'})];const m=map(w,{},now);assert.equal(m.context.repeatedDifficulty[0].count,2);assert.equal(run(m).ruleId,'integration.response_review');assert.equal(m.inputs.rpe,undefined);
});

test('assessed low adherence cannot bypass exposure review even when outcomes improve',()=>{
 const i={redFlag:false,newNeuro:false,fracture:false,systemic:false,patternChange:false,adherence:50,sleep:'good',dailyLoad:'neutral',technique:'yes',exercisePain:3,painIncrease:1,recoveryHours:24,swelling:false,fatigue:false,otherAdverse:false,rpe:6,movement:'good',objective:'improving',function:'improving',painTrend:'improving',expected:'yes',psych:false};
 assert.equal(run(map(workspace(),i,now)).ruleId,'integration.execution_before_progression');
});

test('F: sufficient v0.1 inputs give an explainable recommendation',()=>{
 const i={redFlag:false,newNeuro:false,fracture:false,systemic:false,patternChange:false,adherence:95,sleep:'good',dailyLoad:'neutral',technique:'yes',exercisePain:3,painIncrease:1,recoveryHours:24,swelling:false,fatigue:false,otherAdverse:false,rpe:6,movement:'good',objective:'improving',function:'improving',painTrend:'improving',expected:'yes',psych:false};
 const r=run(map(workspace(),i,now));assert.equal(r.status,'evaluated');assert.equal(r.ruleId,'v0.1.progress_repetitions');assert(r.reasons.length>0);
});
test('G: high adherence alone is explicitly insufficient and requests minimal patient response',()=>{
 const r=run(map(workspace(),{adherence:100},now));assert.equal(r.status,'missing_information');assert.equal(r.decisionState,'NEEDS_CHECK_IN');assert.deepEqual(r.patientQuestions,['symptoms','function']);
});
test('H/I: structured patient response maps provenance but never supplies clinician examination',()=>{
 const w=workspace();w.checkins=[{id:'answer',patient_id:'p',episode_id:'e',created_at:date,symptom_direction:'improving',function_direction:'improving'}];
 const m=map(w,{},now),r=run(m);assert.equal(m.inputs.function,'improving');assert.equal(m.provenance.function.recordIds[0],'answer');assert.equal(r.status,'missing_information');assert.equal(r.decisionState,'CLINICIAN_REVIEW');assert.deepEqual(r.patientQuestions,[]);assert.equal(m.inputs.newNeuro,undefined);assert.equal(m.inputs.movement,undefined);
});
test('J: structured unresolved symptoms never generate a treatment suggestion from insufficient data',()=>{
 const w=workspace();w.adherenceLogs=[log({symptom_response:'lot',symptom_recovery:'still_increased'})];const r=run(map(w,{},now));assert.equal(r.status,'missing_information');assert.equal(r.decisionState,'CLINICIAN_REVIEW');assert.deepEqual(r.patientQuestions,[]);
});
