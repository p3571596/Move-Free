"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { PatientCaseHeader } from "@/components/PatientCaseHeader";
import { CaseLifecycle } from "@/components/CaseLifecycle";
import { RecommendationEditor } from "@/components/RecommendationEditor";
import { PilotTrendCharts } from "@/components/PilotTrendCharts";
import { ProgressBars } from "@/components/ProgressBars";
import {formatExercisePrescription, describePrescriptionChange} from "@/lib/prescription";
import { loadPatientWorkspace } from "@/lib/data";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import type { PatientWorkspace, CareMessage } from "@/lib/types";

export function PatientWorkspaceClient({patientId,section='summary'}:{patientId:string;section?:'summary'|'progress'|'logs'|'program'}) {
 const [workspace,setWorkspace]=useState<PatientWorkspace|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const params=useSearchParams();
 useEffect(()=>{let live=true;loadPatientWorkspace(createSupabaseBrowserClient(),patientId).then(w=>{if(live){setWorkspace(w);setError(w.patient?'':'Patient not found for the current clinician.');}}).catch(()=>{if(live)setError('Patient workspace could not be loaded.');});return()=>{live=false;};},[patientId,revision]);
 const discharged=workspace?.patient?.status==='discharged'||workspace?.episode?.status==='discharged';
 return <AppShell><RequireAuth>
  {error?<p className="panel" role="alert">{error}</p>:!workspace?<p>Loading patient workspace…</p>:workspace.patient?<>
   <PatientCaseHeader workspace={workspace} section={section}/>
   {params.get('programSaved')==='1'?<p role="status" className="success-banner">Program saved.</p>:null}
   {discharged?<p className="case-notice">Discharged case. Clinical history remains available. Reactivate the same case before changing treatment.</p>:null}
   {section==='summary'?<>{workspace.followupStates?.filter(f=>f.home_program_id===workspace.program?.id && f.state!=='INACTIVE' && f.state!=='RESPONSE_AVAILABLE').map(f=><section className="panel" key={f.home_program_id}><strong>{f.state==='NEEDS_CHECK_IN'?'Waiting for a short patient check-in':'Needs attention'}</strong><p>{f.reason}</p></section>)}<CaseLifecycle key={revision} workspace={workspace} onChanged={()=>setRevision(r=>r+1)}/>{discharged?<section className="panel"><h3>Last clinical decision</h3><p>{workspace.decision?.rationale??'No clinical review recorded.'}</p><p>Use Progress, Patient Log, and Program to inspect the preserved record.</p></section>:<RecommendationEditor key={`${patientId}-${revision}`} workspace={workspace}/>}</>:null}
   {section==='progress'?<div className="form"><section className="panel"><p className="eyebrow">Evaluation to current</p><h3>Goal and function progress</h3>{workspace.goals.length?workspace.goals.map(g=><article className="goal-trend" key={g.id}><strong>{g.title??'Goal'}</strong><p>{g.baseline_value??'Baseline not recorded'} → {g.current_value??'Current not recorded'} {g.unit??''}</p><small>Target: {g.target_value??'Not recorded'} · {g.status??'Status not recorded'}</small></article>):<p>No goals recorded.</p>}</section><details className="panel"><summary>Patient feedback and clinical measures</summary><PilotTrendCharts checkins={workspace.checkins} logs={workspace.adherenceLogs}/><ProgressBars metrics={workspace.progressMetrics}/></details></div>:null}
   {section==='logs'?<PatientLog workspace={workspace}/>:null}
   {section==='program'?<section className="panel"><div className="section-header"><div><p className="eyebrow">Prescription</p><h3>{workspace.program?.name??workspace.program?.title??'No program assigned'}</h3><p>{workspace.program?.status??''}</p></div>{!discharged?<Link className="button" href={`/program-builder/${patientId}`}>{workspace.program?'Modify Program':'Build Program'}</Link>:null}</div>{workspace.program?.patient_explanation?<p>{workspace.program.patient_explanation}</p>:null}<ul className="list">{workspace.programExercises.map(e=><li className="list-item" key={e.id}><strong>{e.exercise?.name??'Exercise'}</strong><p>{formatExercisePrescription(e)}</p>{e.notes?<p>{e.notes}</p>:null}</li>)}</ul></section>:null}
  </>:null}
 </RequireAuth></AppShell>;
}
export function PatientLog({workspace}:{workspace:PatientWorkspace}) {
 const [filter,setFilter]=useState('all'),[messages,setMessages]=useState<CareMessage[]>([]),[messageError,setMessageError]=useState('');
 useEffect(()=>{let live=true;createSupabaseBrowserClient().from('care_messages').select('*').eq('patient_id',workspace.patient!.id).order('created_at',{ascending:false}).limit(100).then(({data,error})=>{if(live){setMessages(data??[]);setMessageError(error?'Messages could not be loaded.':'');}});return()=>{live=false;};},[workspace.patient]);
 const entries=[
  ...(workspace.followups??[]).flatMap(f=>[{id:`fq-${f.id}`,kind:'followups',date:f.created_at,title:`Automatic ${f.kind==='inactivity'?'3-day':'response'} check-in · ${f.status}`,body:f.questions.map(q=>({barrier:'Would anything help you get back to your program?',symptoms:'How are your symptoms?',function:'How is your daily activity?'}[q]??q)).join(' · ')},...(f.answered_at?[{id:`fa-${f.id}`,kind:'followups',date:f.answered_at,title:'Patient check-in response',body:Object.entries(f.answers??{}).map(([k,v])=>`${k}: ${v.replaceAll('_',' ')}`).join(' · ')}]:[])]),
  ...workspace.checkins.map(c=>({id:`c-${c.id}`,kind:'symptoms',date:c.created_at??c.checkin_date??'',title:`Symptoms ${c.symptom_direction??'not reported'} · Pain ${c.pain_score??'not reported'}`,body:[c.activity_context,c.patient_comment??c.notes].filter(Boolean).join(' · ')})),
  ...workspace.adherenceLogs.map(l=>({id:`l-${l.id}`,kind:'exercise',date:l.performed_at??l.created_at??'',title:`${workspace.programExercises.find(e=>e.id===l.home_program_exercise_id)?.exercise?.name??'Previously assigned exercise'} · ${l.completion_status??(l.completed?'completed':'Status not recorded')}`,body:[l.difficulty_reason,l.difficulty_explanation?`Patient explanation: ${l.difficulty_explanation}`:null,l.completion_reason,l.symptom_response?`Symptom increase: ${l.symptom_response}`:null,l.symptom_recovery?`Recovery: ${l.symptom_recovery}`:null,l.difficulty?`Difficulty: ${l.difficulty.replaceAll('_',' ')}`:null,l.pain_during!=null?`Pain during: ${l.pain_during}/10`:null,l.notes].filter(Boolean).join(' · ')})),
  ...(workspace.prescriptionChanges??[]).filter(c=>c.entity==='home_program_exercises').map(c=>({id:`p-${c.id}`,kind:'prescriptions',date:c.created_at,title:'Clinician prescription change',body:describePrescriptionChange(c)})),
  ...workspace.progressMetrics.map(m=>({id:`m-${m.id}`,kind:'function',date:m.measured_at??m.recorded_at??'',title:m.metric_name??'Function measure',body:`${m.value??m.metric_value??m.metric_text_value??'Not recorded'} ${m.unit??''}`})),
  ...messages.map(m=>({id:`msg-${m.id}`,kind:'messages',date:m.created_at,title:m.kind.replaceAll('_',' '),body:m.body})),
 ].filter(e=>filter==='all'||e.kind===filter).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
 return <section className="panel"><div className="section-header"><h3>Patient Log</h3><div className="field"><label htmlFor="log-filter">Show</label><select id="log-filter" value={filter} onChange={e=>setFilter(e.target.value)}>{[['all','All entries'],['followups','Automatic check-ins'],['exercise','Exercise activity'],['symptoms','Symptoms and comments'],['function','Function'],['messages','Messages'],['prescriptions','Prescription changes']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div></div><p className="muted">Latest available records, newest first. Messages belong to the patient across their care history.</p>{messageError?<p role="alert">{messageError}</p>:null}<ul className="list">{entries.map(e=><li className="list-item" key={e.id}><small>{e.date?new Date(e.date).toLocaleString():'Date not recorded'}</small><p><strong>{e.title}</strong></p>{e.body?<p>{e.body}</p>:null}</li>)}</ul>{!entries.length?<p>No entries in this filter.</p>:null}</section>;
}
