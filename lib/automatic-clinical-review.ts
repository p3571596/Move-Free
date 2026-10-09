import { engineFields, evaluateEngine, type EngineInputs, type EngineKey, type EngineResult } from './clinical-engine';
import type { PatientWorkspace } from './types';

export type InputSource = { state: 'AUTO' | 'UNKNOWN' | 'CLINICIAN-ADDED'; source: string; recordIds: string[] };
export type AutomaticReview = ReturnType<typeof mapClinicalInputs>;
const time = (value?: string | null) => value ? Date.parse(value) : NaN;
const score = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10;
const numeric = (value: unknown): number | null => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value)) ? Number(value) : null;

/** Map only equivalent clinical concepts. Raw context is retained separately, never coerced into examination findings. */
export function mapClinicalInputs(workspace: PatientWorkspace, observations: EngineInputs = {}, now = new Date().toISOString()) {
  const inputs: EngineInputs = {};
  const provenance = (Object.keys(engineFields) as EngineKey[]).reduce((all, key) => {
    all[key] = {state:'UNKNOWN',source:'Not collected or not assessed in this review window',recordIds:[]};
    return all;
  }, {} as Record<EngineKey, InputSource>);
  const cutoff = Math.max(time(now) - 14 * 86400000, time(workspace.decision?.created_at) || 0);
  const inWindow = (date?: string | null) => time(date) > cutoff && time(date) <= time(now);
  const checkins = workspace.checkins.filter(c => c.patient_id === workspace.patient?.id && (!c.episode_id || c.episode_id === workspace.episode?.id) && inWindow(c.created_at ?? c.checkin_date)).sort((a,b)=>time(b.created_at ?? b.checkin_date)-time(a.created_at ?? a.checkin_date));
  const logs = [...new Map(workspace.adherenceLogs.filter(l => l.patient_id === workspace.patient?.id && !!workspace.program && l.home_program_id === workspace.program.id && inWindow(l.performed_at ?? l.created_at)).map(l=>[l.session_id && l.home_program_exercise_id ? `${l.session_id}:${l.home_program_exercise_id}` : l.id,l])).values()];
  const auto = (key: EngineKey, value: string | number, source: string, recordIds: string[]) => {inputs[key]=value;provenance[key]={state:'AUTO',source,recordIds};};
  const responseCutoff = Math.max(time(now)-14*86400000, time(workspace.program?.assigned_at) || 0);
  const responseCheckins = workspace.checkins.filter(c=>c.patient_id===workspace.patient?.id && (!c.episode_id || c.episode_id===workspace.episode?.id) && time(c.created_at ?? c.checkin_date)>=responseCutoff && time(c.created_at ?? c.checkin_date)<=time(now)).sort((a,b)=>time(b.created_at ?? b.checkin_date)-time(a.created_at ?? a.checkin_date));
  const latest = responseCheckins.find(c=>!!c.symptom_direction);
  const functionReport = responseCheckins.find(c => c.function_direction && c.function_direction !== 'unsure');
  if (functionReport) auto('function', functionReport.function_direction!, 'Patient-reported daily activity/goal direction; not a clinician examination', [functionReport.id]);
  if (latest?.symptom_direction && ['improving','unchanged','worsening'].includes(latest.symptom_direction)) auto('painTrend',latest.symptom_direction === 'unchanged' ? 'stable' : latest.symptom_direction,'Latest patient-reported symptom direction',[latest.id]);
  else {
    const pain = responseCheckins.filter(c=>score(c.pain_score));
    if(pain.length>=2) auto('painTrend',pain[0].pain_score! > pain[1].pain_score! ? 'worsening' : pain[0].pain_score! < pain[1].pain_score! ? 'improving':'stable','Two latest daily pain ratings (not exercise pain)',pain.slice(0,2).map(c=>c.id));
  }
  const exercisePain=logs.filter(l=>l.completion_status !== 'skipped' && score(l.pain_during));
  if(exercisePain.length) auto('exercisePain',Math.max(...exercisePain.map(l=>l.pain_during!)),'Maximum reported pain during exercise in review window',exercisePain.map(l=>l.id));
  const paired=logs.filter(l=>l.completion_status !== 'skipped' && score(l.pain_before) && (score(l.pain_during)||score(l.pain_after)));
  if(paired.length) auto('painIncrease',Math.max(0,...paired.map(l=>Math.max(...[l.pain_during,l.pain_after].filter(score))-l.pain_before!)),'Maximum increase from paired before/during/after ratings in the same exercise record',paired.map(l=>l.id));
  // Goal direction is only comparable with an explicit numeric baseline and target.
  const goalTrends=workspace.goals.filter(g=>g.episode_id===workspace.episode?.id && time(g.updated_at)>=responseCutoff && time(g.updated_at)<=time(now)).flatMap(g=>{
    const baseline=numeric(g.baseline_value), current=numeric(g.current_value), target=numeric(g.target_value);
    if(baseline===null||current===null||target===null||target===baseline) return [];
    return [{id:g.id,trend:(current-baseline)*Math.sign(target-baseline)>0?'improving':current===baseline?'stable':'worsening'}];
  });
  if(!functionReport && goalTrends.length && new Set(goalTrends.map(g=>g.trend)).size===1) auto('function',goalTrends[0].trend,'Updated goal values versus baseline, oriented toward the explicit target; not change since last review',goalTrends.map(g=>g.id));
  const statuses=['completed','partial','skipped'];
  const reported=logs.filter(l=>statuses.includes(l.completion_status??''));
  const counts=Object.fromEntries(statuses.map(s=>[s,reported.filter(l=>l.completion_status===s).length])) as Record<string,number>;
  const completionRate=reported.length ? Math.round(100*counts.completed/reported.length):null;
  provenance.adherence.source='Prescribed adherence unknown: free-text frequency and logs do not establish all scheduled opportunities. Reported completion is shown separately.';
  const difficult = new Map<string, Set<string>>();
  for(const log of logs) if(['too_hard','painful'].includes(log.difficulty??'')) {const key=log.home_program_exercise_id??'unknown';const sessions=difficult.get(key)??new Set<string>();sessions.add(log.session_id??log.id);difficult.set(key,sessions);}
  const repeatedDifficulty=[...difficult].map(([exerciseId,sessions])=>({exerciseId,count:sessions.size})).filter(x=>x.count>=2);
  const middle=(cutoff+time(now))/2;
  const rate=(rows:typeof reported)=>rows.length?Math.round(100*rows.filter(l=>l.completion_status==='completed').length/rows.length):null;
  const recentRate=rate(reported.filter(l=>time(l.performed_at??l.created_at)>middle));
  const previousRate=rate(reported.filter(l=>time(l.performed_at??l.created_at)<=middle));
  for(const key of Object.keys(engineFields) as EngineKey[]) if(provenance[key].state!=='AUTO' && observations[key]!=null && observations[key]!=='' && observations[key]!=='unknown') {
    const candidate=evaluateEngine({[key]:observations[key]});
    if(!candidate.missing.includes(key)){inputs[key]=observations[key];provenance[key]={state:'CLINICIAN-ADDED',source:'Clinician observation for this review',recordIds:[]};}
  }
  return {inputs,provenance,followupStates:workspace.followupStates ?? [],followups:workspace.followups ?? [],window:{from:new Date(cutoff).toISOString(),to:now},context:{counts,completionRate,reportedExercises:reported.length,completionTrend:{recentRate,previousRate},repeatedDifficulty,checkins,logs,goals:workspace.goals,progressMetrics:workspace.progressMetrics,barriers:workspace.barriers,previousDecision:workspace.decision,program:workspace.program,exercises:workspace.programExercises,
    feedbackEvidence:logs.filter(l=>!!l.difficulty_explanation).map(l=>({recordId:l.id,reportedAt:l.performed_at??l.created_at,source:l.feedback_provenance?.source ?? 'SOURCE_NOT_RECORDED',field:'difficulty_explanation',text:l.difficulty_explanation,clinicalInterpretation:'Not inferred; clinician review required'})),
    prescriptionChanges:(workspace.prescriptionChanges??[]).filter(c=>c.entity==='home_program_exercises' && inWindow(c.created_at)),
    limitations:['At most 30 check-ins and 250 exercise records are loaded; summaries describe available reports only.','Daily pain is not exercise pain; difficulty is not RPE; comments are not automated red-flag assessments.','Prescribed adherence, recovery hours and examination findings remain unknown unless assessed.']}};
}

/** Keep the recovered v0.1 evaluator intact. Partial evidence permits conservative review routing only. */
export function evaluateAutomaticReview(mapped: AutomaticReview): EngineResult {
  const base=evaluateEngine(mapped.inputs);
  const patientQuestions = [!mapped.inputs.painTrend ? 'symptoms' : null, !mapped.inputs.function ? 'function' : null].filter((x): x is string => !!x);
  const state = mapped.followupStates.find(s=>s.home_program_id===mapped.context.program?.id);
  if (state?.state==='SAFETY_REVIEW' && base.ruleId!=='v0.1.safety') return {...base,status:'missing_information',decisionState:'CLINICIAN_REVIEW',recommendation:'Review unresolved safety finding',bottleneck:state.reason,reasons:[state.reason],urgency:'danger',ruleId:'integration.safety_review',patientQuestions:[]};
  if(base.ruleId!=='v0.1.safety' && mapped.context.logs.some(l=>l.symptom_response==='lot'||l.symptom_recovery==='still_increased')) return {...base,status:'missing_information',decisionState:'CLINICIAN_REVIEW',patientQuestions:[],assessmentScope:'partial_evidence',ruleId:'integration.response_review',recommendation:'Review symptom response',bottleneck:'New reported symptoms need clinician assessment',reasons:['Patient reports a large increase or symptoms that remain increased. Review before any treatment change.'],urgency:'warn'};
  if(base.status==='evaluated') {
    if(base.ruleId==='v0.1.progress_repetitions' && typeof mapped.inputs.adherence==='number' && mapped.inputs.adherence<90) return {...base,version:'0.1-integration.2',ruleId:'integration.execution_before_progression',recommendation:'Review execution / improve adherence',bottleneck:'Verify exposure before progression',reasons:[`Assessed adherence is ${mapped.inputs.adherence}%, below the v0.1 90% exposure target.`, 'Improving outcomes do not establish that the prescribed exposure was tested.'],flags:['Review barriers and actual exposure before approving progression.'],urgency:'warn'};
    if(mapped.inputs.function==='improving' && mapped.inputs.painTrend==='worsening') base.reasons=[...base.reasons,'Mixed signals: function is improving versus goal baseline while symptoms worsen; do not infer whole-program failure.'];
    return {...base,version:"0.1-integration.2",assessmentScope:base.missing.length?"partial_evidence":"complete"};
  }
  const i=mapped.inputs;
  const reasons:string[]=[];
  let ruleId='integration.review_missing', recommendation='Review missing clinical information', bottleneck='Assessment is incomplete';
  if(i.patternChange===true && (i.painTrend==='worsening'||i.function==='worsening'||i.function==='stable'||i.objective==='stable'||i.objective==='worsening'||i.expected==='no'||i.expected==='slower')) {
    ruleId='v0.1.changed_pattern';recommendation='Reassess diagnosis';bottleneck='Changed symptom pattern with unexpected response';reasons.push('A clinician identified a changed symptom pattern alongside worsening or slower-than-expected progress.');
  } else if((typeof i.exercisePain==='number'&&i.exercisePain>5)||(typeof i.painIncrease==='number'&&i.painIncrease>2)||(typeof i.recoveryHours==='number'&&i.recoveryHours>=48)||i.swelling===true||i.fatigue===true||i.otherAdverse===true) {
    ruleId='v0.1.adverse_response';recommendation='Regress or reduce load';bottleneck='Reported load tolerance / recovery concern';
    if(typeof i.exercisePain==='number'&&i.exercisePain>5)reasons.push(`Reported exercise pain reached ${i.exercisePain}/10, above the v0.1 5/10 threshold.`);
    if(typeof i.painIncrease==='number'&&i.painIncrease>2)reasons.push(`Paired pain increased ${i.painIncrease}/10, above the v0.1 2/10 threshold.`);
    if(typeof i.recoveryHours==='number'&&i.recoveryHours>=48)reasons.push('Reported recovery reached the v0.1 48-hour threshold.');
    for(const key of ['swelling','fatigue','otherAdverse'] as const)if(i[key]===true)reasons.push(engineFields[key].label+'.');
  } else if((typeof i.adherence==='number'&&i.adherence<90)||mapped.context.counts.skipped>0||mapped.context.counts.partial>0||i.technique==='incorrect') {
    ruleId='integration.execution_review';recommendation='Review execution / improve adherence';bottleneck='Exposure and barriers need review before judging effectiveness';reasons.push('Incomplete reported exercises or assessed execution/adherence concerns mean the plan may not have been fully tested.','Low exposure does not demonstrate treatment failure.');
  } else if(mapped.context.repeatedDifficulty.length || i.painTrend==='worsening') {
    ruleId='integration.response_review';recommendation='Review load and exercise response';bottleneck='Symptoms or repeated difficulty warrant clinician review';reasons.push('Worsening symptoms or repeated difficult exercise reports warrant review of dosage, recovery and execution before progression.');
  } else reasons.push('Available reports do not establish the full v0.1 pathway. Add missing observations relevant to the review.');
  const responseConcern = mapped.context.logs.some(l=>l.symptom_response==='lot'||l.symptom_recovery==='still_increased');
  if(responseConcern) {ruleId='integration.response_review'; recommendation='Review symptom response'; reasons.unshift('Patient reports increased or unresolved symptoms.');}
  if(ruleId==='v0.1.adverse_response') recommendation='Review reported load tolerance / recovery concern';
  if(i.function==='improving'&&i.painTrend==='worsening') reasons.push('Mixed signals: function is improving versus goal baseline while symptoms worsen. This is not proof the whole program failed.');
  return {...base,assessmentScope:'partial_evidence',version:'0.1-integration.2',status:'missing_information',decisionState:patientQuestions.length && ruleId==='integration.review_missing' && state?.state!=='CLINICIAN_REVIEW' ? 'NEEDS_CHECK_IN':'CLINICIAN_REVIEW',patientQuestions:ruleId==='integration.review_missing' ? patientQuestions : [],ruleId,recommendation,bottleneck,reasons,urgency:'warn',flags:['Provisional clinician review routing from available evidence; the complete v0.1 pathway has not been established.','Safety findings remain not assessed where unknown. Assess safety before any treatment action.','No automatic progression or patient-facing treatment change.']};
}
