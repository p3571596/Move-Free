"use client";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import type { PatientWorkspace, CaseLifecycleEvent, Json } from "@/lib/types";
const reasons=['Goals met','Independent program','Referred elsewhere','Lost to follow-up','Patient request','Other'];
export function CaseLifecycle({workspace,onChanged}:{workspace:PatientWorkspace;onChanged:()=>void}) {
 const [events,setEvents]=useState<CaseLifecycleEvent[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
 const [reason,setReason]=useState('Goals met'),[note,setNote]=useState(''),[plan,setPlan]=useState('ended');
 const date=new Date().toLocaleDateString('en-CA'); const [effective,setEffective]=useState(date);
 const patient=workspace.patient!,episode=workspace.episode; const discharged=patient.status==='discharged'||episode?.status==='discharged';
 useEffect(()=>{let live=true;createSupabaseBrowserClient().from('case_lifecycle_events').select('*').eq('patient_id',patient.id).order('created_at',{ascending:false}).then(({data,error})=>{if(live){setReady(!error);setEvents(data??[]);if(error)setError('Case history could not be loaded. Refresh before changing case status.');}});return()=>{live=false;};},[patient.id]);
 return <section className="panel case-lifecycle"><details><summary>{discharged?'Discharged case · Reactivate Case':'Case management · Discharge'}</summary>
  <p>{discharged?'History is preserved. Reactivate Case reopens this same clinical problem; review the program before resuming care.':'Discharge removes this case from Today and retains the clinical record.'}</p>
  {!episode?<p>A recorded episode is required before discharge.</p>:<form className="form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const {error}=await createSupabaseBrowserClient().rpc('transition_case',{p_patient_id:patient.id,p_episode_id:episode.id,p_action:discharged?'reactivate':'discharge',p_reason:discharged?note:reason,p_date:effective,p_program_plan:discharged?'review_required':plan,p_note:note});if(error)throw error;onChanged();}catch(c){setError(c instanceof Error?c.message:'Case update failed. Refresh and try again.');}finally{setBusy(false);}}}>
   {!discharged?<><div className="field"><label htmlFor="discharge-reason">Discharge reason</label><select id="discharge-reason" value={reason} onChange={e=>setReason(e.target.value)}>{reasons.map(r=><option key={r}>{r}</option>)}</select></div><div className="field"><label htmlFor="program-plan">Final program status</label><select id="program-plan" value={plan} onChange={e=>setPlan(e.target.value)}><option value="ended">End current program</option><option value="independent">Continue as independent program</option></select></div><p className="muted">Independent programs remain available to the patient. Ending archives the prescription; reactivation does not automatically restart it.</p></>:null}
   <label className="field">{discharged?'Reactivation date':'Discharge date'}<input type="date" required min={episode.start_date??undefined} max={date} value={effective} onChange={e=>setEffective(e.target.value)}/></label>
   <label className="field">{discharged?'Reason for reopening the same case':'Discharge note / outcomes'}<textarea required={discharged||reason==='Other'} maxLength={discharged?500:2000} value={note} onChange={e=>setNote(e.target.value)}/></label>
   <p className="muted">The current goal and prescription will be captured with this change.</p><button className="secondary-button" disabled={busy||!ready}>{busy?'Saving…':discharged?'Reactivate Case':'Discharge Case'}</button>
  </form>}
  {error?<p role="alert">{error}</p>:null}
  {discharged?<div className="empty"><strong>Start New Episode</strong><p>Not available in this release. A different or new problem needs its own episode. Do not use Reactivate Case for a new problem: legacy patient-wide records must be separated first.</p></div>:null}
  <details><summary>Case history ({events.length})</summary>{events.map(event=><article className="list-item" key={event.id}><strong>{event.action==='discharge'?'Discharged':'Reactivated'} · {event.effective_date}</strong><p>{event.reason} · {event.program_plan.replaceAll('_',' ')}</p>{event.note?<p>{event.note}</p>:null}<details><summary>Recorded goal and program snapshot</summary><Snapshot value={event.snapshot}/></details></article>)}</details>
 </details></section>;
}

function Snapshot({value}:{value:Json}) {
 const data=value as {goals?:Array<{id:string;title?:string;baseline_value?:string;current_value?:string;target_value?:string}>; patient_goal?:{title?:string;baseline?:string;current?:string;target?:string};programs?:Array<{id:string;name?:string;status?:string;patient_explanation?:string;exercises?:Array<{id:string;dosage_sets?:string;dosage_reps?:string;frequency?:string;notes?:string}>}>};
 const goals=data.goals?.length?data.goals:[{id:'legacy',title:data.patient_goal?.title,baseline_value:data.patient_goal?.baseline,current_value:data.patient_goal?.current,target_value:data.patient_goal?.target}];
 return <div>{goals.map(g=><p key={g.id}><strong>{g.title??'Goal not recorded'}</strong><br/>{g.baseline_value??'Baseline not recorded'} → {g.current_value??'Current not recorded'} · Target {g.target_value??'not recorded'}</p>)}{data.programs?.map(p=><div key={p.id}><strong>{p.name??'Program'} · {p.status}</strong><p>{p.patient_explanation}</p><p>{p.exercises?.length??0} prescribed exercises retained in the discharge record.</p></div>)}</div>;
}
