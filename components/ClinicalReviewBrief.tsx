import type {PatientWorkspace} from "@/lib/types";
export function ClinicalReviewBrief({workspace}:{workspace:PatientWorkspace}){
  const cutoff=workspace.decision?.created_at??workspace.visitNote?.created_at??new Date(Date.now()-14*86400000).toISOString();
  const reports=workspace.checkins.filter(c=>(c.created_at??c.checkin_date??'')>cutoff);
  const logs=workspace.adherenceLogs.filter(l=>(l.performed_at??l.created_at??'')>cutoff);
  const goal=workspace.goals[0];
  const problems=logs.filter(l=>l.completion_status==='skipped'||l.completion_status==='partial'||l.difficulty==='too_hard'||l.difficulty==='painful');
  return <section className="panel" style={{marginBottom:20}}><p className="eyebrow">Review context</p><h3>Since {workspace.decision?.created_at?'your last review':workspace.visitNote?.created_at?'the last visit':'the last 14 days'}</h3>
    <p><strong>Goal:</strong> {goal?.title??workspace.patient?.goal??'Not recorded'}</p>
    <p><strong>Goal measure:</strong> {goal?.baseline_value??workspace.patient?.baseline_value??'Baseline not recorded'} → {goal?.current_value??workspace.patient?.current_value??'Current value not recorded'} {goal?.unit??''}</p>
    <p><strong>Latest symptoms in this window:</strong> {reports[0]?.symptom_direction??'No symptom update'}{reports[0]?.pain_score!=null?` · Pain ${reports[0].pain_score}/10`:''}</p>
    <p><strong>Exercise reports:</strong> {logs.filter(l=>l.completion_status==='completed').length} completed · {logs.filter(l=>l.completion_status==='partial').length} partial · {logs.filter(l=>l.completion_status==='skipped').length} skipped. Prescribed adherence and execution quality still require assessment.</p>
    {problems.length?<details><summary>{problems.length} exercise responses to inspect</summary><ul>{problems.map(l=><li key={l.id}>{workspace.programExercises.find(e=>e.id===l.home_program_exercise_id)?.exercise?.name??'Previously assigned exercise'}: {l.completion_status??'Status missing'} · {l.difficulty??'Difficulty not rated'}{l.notes?` — ${l.notes}`:''}</li>)}</ul></details>:<p>No exercise concerns were reported in this window; this is not a safety assessment.</p>}
    {reports.filter(r=>r.patient_comment).slice(0,3).map(r=><blockquote key={r.id}>{r.patient_comment}</blockquote>)}
  </section>;
}
