import { formatExercisePrescription, formatPrescription } from '@/lib/prescription';
import { progressionInsights, templateExercises, weekStart } from '@/lib/progression';
import type { PatientWorkspace } from '@/lib/types';

/** Shared current-plan context: counts describe records, never inferred adherence. */
export function ProgressionPlanSummary({workspace,compact=false,review=false}:{workspace:PatientWorkspace;compact?:boolean;review?:boolean}){
 const plan=workspace.program?.progression_plan;
 if(!plan)return null;
 const week=plan.weeks[plan.activeWeek],phase=plan.phases.find(p=>p.id===week.phaseId);
 const records=workspace.adherenceLogs.filter(l=>l.activity_source==='individual_confirmation'&&l.progression_revision_id===workspace.program?.progression_revision_id);
 return <section className="panel form"><h3>Approved progression plan</h3>
  <p><strong>{week.name}{week.recovery?' · Recovery week':''}</strong> · Suggested week begins {weekStart(plan)}{phase?` · ${phase.name}`:''}</p>
  {week.notes?<p>{week.notes}</p>:null}
  {phase?.goal?<p>Phase goal: {phase.goal}</p>:null}
  <p>In available history: {records.length} exercises recorded for this approved version. Missing performance and actual doses remain unknown.</p>
  {!compact?week.templateIds.map(id=>{const day=plan.templates.find(t=>t.id===id)!;const actual=records.filter(l=>l.day_template_id===id);const sessions=new Set(actual.map(l=>l.session_id)).size;return <details key={id}><summary>{day.name}{day.weeklyTarget?` · ${formatPrescription({frequency:day.weeklyTarget})}`:''}</summary>
   <p>{day.notes}</p><p>{day.weekdays.length?`Suggested weekdays: ${day.weekdays.map(n=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][n]).join(', ')}`:'Flexible weekly schedule'}{day.scheduledOnly?' · Scheduled days only':''}{day.minRestHours?` · ${day.minRestHours} hours minimum recovery`:''}</p>
   <p>In available history: {sessions} sessions with records · {actual.length} exercises recorded. Session counts do not establish that a full template or dose was performed.</p>
   {templateExercises(plan,id,workspace.programExercises).map(item=><div key={item.id}><strong>{item.patient_name??item.exercise?.name}</strong><p>{formatExercisePrescription(item)}</p>{item.notes?<p>{item.notes}</p>:null}</div>)}
  </details>;}):null}
  {review?<><p className="muted">Use recorded symptom, difficulty and functional evidence where available. Movement quality is unknown unless separately assessed. Numerical records alone do not authorize progression.</p>{progressionInsights(workspace.adherenceLogs).map(i=><p key={i.assignmentId}>{workspace.programExercises.find(x=>x.id===i.assignmentId)?.exercise?.name}: {i.message}</p>)}</>:null}
 </section>;
}
