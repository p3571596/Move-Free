"use client";
import { useState } from 'react';
import { PatientProgramFlow } from '@/components/PatientProgramFlow';
import { PrescriptionFields } from '@/components/PrescriptionFields';
import { formatExercisePrescription, type Prescription } from '@/lib/prescription';
import { mapClinicalInputs, evaluateAutomaticReview } from '@/lib/automatic-clinical-review';
import type { PatientWorkspace, HomeProgramExercise } from '@/lib/types';
import type { ExerciseLogInput } from '@/lib/data';

const standard: Prescription = {sets:{value:2,unit:'sets'},reps:{value:8,unit:'reps'},frequency:{value:3,unit:'sessions/week'}};
const baseItems: HomeProgramExercise[] = ['Sit to stand', 'Standing heel raise'].map((name,i)=>({id:`synthetic-item-${i}`,exercise_id:`synthetic-exercise-${i}`,home_program_id:'synthetic-program',prescription:structuredClone(standard),notes:'Move slowly and use support if needed.',category:'strength',exercise:{id:`synthetic-exercise-${i}`,name,category:'strength',video_url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',patient_instructions:'Synthetic demonstration for workflow review only.'}}));
const baseline: PatientWorkspace = {patient:{id:'synthetic-patient',display_name:'Synthetic patient',status:'active'},episode:{id:'synthetic-episode',status:'active'},program:{id:'synthetic-program',title:'Synthetic movement plan',status:'active'},programExercises:baseItems,goals:[],checkins:[],progressMetrics:[],adherenceLogs:[],decision:null,visitNote:null,barriers:[]};
export function WorkflowPreview() {
  const [view,setView] = useState<'editor'|'patient'|'log'>('editor');
  const [workspace,setWorkspace] = useState<PatientWorkspace>(()=>structuredClone(baseline));
  const [revision,setRevision] = useState(0);
  const [draft,setDraft] = useState(()=>structuredClone(baseItems));
  const [history,setHistory] = useState<string[]>([]);
  function saveProgram() {
    setHistory(current=>[`${formatExercisePrescription(workspace.programExercises[0])} → ${formatExercisePrescription(draft[0])}`, ...current]);
    setWorkspace(current=>({...current,programExercises:structuredClone(draft)}));
    setRevision(r=>r+1);
  }
  function saveFeedback(entries: ExerciseLogInput[]) {
    const now=new Date().toISOString();
    setWorkspace(current=>({...current,adherenceLogs:entries.map((e,i)=>({id:`synthetic-log-${i}`,patient_id:'synthetic-patient',home_program_id:'synthetic-program',home_program_exercise_id:e.homeProgramExerciseId,performed_at:now,completion_status:e.completionStatus,difficulty:e.difficulty,difficulty_reason:e.difficultyReason,feedback_provenance:{source:'PATIENT_REPORTED',recorded_by:'synthetic-patient',recorded_at:now},difficulty_explanation:e.difficulty==='too_hard'&&e.difficultyReason==='other'?e.difficultyExplanation:null,notes:e.notes}))}));
  }
  const mapped=mapClinicalInputs(workspace), result=evaluateAutomaticReview(mapped);
  return <><section className="panel" style={{maxWidth:900,margin:'16px auto'}}>
    <h1>Workflow preview</h1><p>Synthetic data only. Changes stay in this browser session. No patient records or database writes.</p>
    <div className="segment-options">{(['editor','patient','log'] as const).map(v=><button type="button" className={view===v?'active':''} aria-pressed={view===v} key={v} onClick={()=>setView(v)}>{v==='editor'?'Clinician prescription':v==='patient'?'Patient exercise flow':'Patient Log & evidence'}</button>)}</div>
  </section>
  {view==='editor'?<section className="panel form" style={{maxWidth:900,margin:'16px auto'}}><h2>Patient-specific prescription</h2>
    <p>Shared library standard: {formatExercisePrescription(baseItems[0])}</p>
    {draft.map(item=><article className="form" key={item.id}><h3>{item.exercise?.name}</h3><PrescriptionFields id={item.id} value={item.prescription??{}} onChange={prescription=>setDraft(items=>items.map(x=>x.id===item.id?{...x,prescription}:x))}/><label>Key clinical cues for this patient<textarea value={item.notes??''} onChange={e=>setDraft(items=>items.map(x=>x.id===item.id?{...x,notes:e.target.value}:x))}/></label></article>)}
    <button type="button" className="button" onClick={saveProgram}>Save synthetic prescription</button><p>Current patient dose: {formatExercisePrescription(workspace.programExercises[0])}</p>
  </section>:null}
  {view==='patient'?<PatientProgramFlow key={revision} previewWorkspace={workspace} onPreviewSave={saveFeedback}/>:null}
  {view==='log'?<section className="panel form" style={{maxWidth:900,margin:'16px auto'}}><h2>Patient Log</h2>{workspace.adherenceLogs.map(log=><article key={log.id}><strong>{workspace.programExercises.find(e=>e.id===log.home_program_exercise_id)?.exercise?.name} · {log.completion_status}</strong><p>{log.difficulty} · {log.difficulty_reason}</p><p>{log.difficulty_explanation ? `Patient explanation: ${log.difficulty_explanation}` : log.notes}</p></article>)}
    <details open><summary>Decision engine evidence</summary>{mapped.context.feedbackEvidence.map(e=><p key={e.recordId}>{e.source} · {e.text} · {e.clinicalInterpretation}</p>)}<p>{result.decisionState} · {result.recommendation}</p><p>Missing symptom/function reports remain unknown.</p></details>
    <details open><summary>Prescription history</summary>{history.map((h,i)=><p key={i}>{h}</p>)}</details>
  </section>:null}</>;
}
