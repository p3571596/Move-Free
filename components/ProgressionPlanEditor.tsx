'use client';
import { useState } from 'react';
import type { HomeProgram, HomeProgramExercise, ExerciseAdherenceLog, Json } from '@/lib/types';
import { newProgressionPlan, validateProgressionPlan, progressionInsights, weekStart, type ProgressionPlan, type DayTemplate } from '@/lib/progression';
import { formatPrescription, prescriptionFor } from '@/lib/prescription';
import { PrescriptionFields } from './PrescriptionFields';
import { createSupabaseBrowserClient } from '@/lib/supabase';

export function ProgressionPlanEditor({program,items,logs=[],disabled=false,onSaved,onPreviewSave}:{program:HomeProgram;items:HomeProgramExercise[];logs?:ExerciseAdherenceLog[];disabled?:boolean;onSaved?:()=>Promise<void>;onPreviewSave?:(plan:ProgressionPlan|null,approved:boolean)=>void}){
 const [plan,setPlan]=useState<ProgressionPlan>(()=>structuredClone(program.progression_plan??newProgressionPlan(items)));
 const [view,setView]=useState('Exercises'),[week,setWeek]=useState(0),[dayIndex,setDayIndex]=useState(0);
 const [reviewed,setReviewed]=useState(false),[status,setStatus]=useState(''),[saving,setSaving]=useState(false);
 const [history,setHistory]=useState<{id:string;approved:boolean;created_at:string;document:ProgressionPlan|null}[]>([]);
 const edit=(next:ProgressionPlan)=>{setPlan(next);setReviewed(false);};
 const day=plan.templates[dayIndex],w=plan.weeks[week];
 function patchDay(patch:Partial<DayTemplate>){edit({...plan,templates:plan.templates.map((d,i)=>i===dayIndex?{...d,...patch}:d)});}
 async function save(approved:boolean,disable=false){
  if(saving||disabled||approved&&!reviewed)return;
  setSaving(true);setStatus('');
  try{
   if(!disable)validateProgressionPlan(plan,items);
   if(onPreviewSave)onPreviewSave(disable?null:plan,approved);
   else {const result=await createSupabaseBrowserClient().rpc('save_progression_plan',{p_program:program.id,p_expected:program.updated_at??null,p_plan:(disable?null:plan) as unknown as Json,p_approve:approved});if(result.error)throw result.error;await onSaved?.();}
   setReviewed(false);setStatus(approved?disable?'Simple program restored; history retained.':`Week ${plan.activeWeek+1} approved. Other weeks remain planned until you review and activate them.`:'Draft saved. Patient plan unchanged.');
  }catch(e){setStatus(e instanceof Error?e.message:typeof e==='object'&&e&&'message' in e?String(e.message):'Could not save plan.');}finally{setSaving(false);}
 }
 return <details className="panel"><summary>Progression Plan (optional){program.progression_plan?' · Active':''}</summary>
  <p className="muted">Keep the simple exercise program, or reuse day templates across weeks. Only the week you explicitly approve becomes available. No automatic progression rules.</p>
  <fieldset disabled={disabled||saving} style={{border:0,padding:0,minWidth:0}}>
   {program.guided_order?<p>Full guided order is enabled: every day must include all exercises in the assigned order. Use day prerequisites for clinically required preparation in smaller templates.</p>:null}
   {disabled?<p>Save exercise edits before editing this plan.</p>:null}
   <div className="segment-options" role="group" aria-label="Progression views">{['Exercises','Weekly','Daily'].map(v=><button className={view===v?'active':''} type="button" aria-pressed={view===v} key={v} onClick={()=>setView(v)}>{v}</button>)}</div>
   {view==='Exercises'?<><p>{items.length} patient-specific exercises. Different day doses keep the same underlying exercise and private video.</p>{items.map(x=><p key={x.id}><strong>{x.patient_name??x.exercise?.name}</strong> · {formatPrescription(prescriptionFor(x))}</p>)}</>:null}
   {view==='Weekly'?<div className="form">
    <label>Plan start date<input type="date" value={plan.startDate} onChange={e=>edit({...plan,startDate:e.target.value})}/></label>
    <details><summary>Phases (optional)</summary>{plan.phases.map((p,i)=><fieldset key={p.id}><legend>Phase {i+1}</legend>{(['name','focus','goal','criteria','notes'] as const).map(key=><label key={key}>{key==='criteria'?'Advancement criteria':key}<input value={p[key]} onChange={e=>edit({...plan,phases:plan.phases.map((x,j)=>j===i?{...x,[key]:e.target.value}:x)})}/></label>)}<label>Phase start date (optional)<input type="date" value={p.startDate??''} onChange={e=>edit({...plan,phases:plan.phases.map((x,j)=>j===i?{...x,startDate:e.target.value}:x)})}/></label><label>Duration in weeks (optional)<input type="number" min={1} max={104} value={p.durationWeeks??''} onChange={e=>edit({...plan,phases:plan.phases.map((x,j)=>j===i?{...x,durationWeeks:e.target.value?Number(e.target.value):undefined}:x)})}/></label></fieldset>)}<button type="button" className="secondary-button" onClick={()=>edit({...plan,phases:[...plan.phases,{id:crypto.randomUUID(),name:`Phase ${plan.phases.length+1}`,focus:'',goal:'',criteria:'',notes:''}]})}>Add phase</button></details>
    <label>Week to edit<select value={week} onChange={e=>setWeek(Number(e.target.value))}>{plan.weeks.map((x,i)=><option value={i} key={i}>{x.name}{i===plan.activeWeek?' · chosen for approval':''}</option>)}</select></label>
    <p>Suggested dates start {weekStart(plan,week)}. Phase advancement requires clinician review of any stated criteria.</p>
    <label>Week name<input value={w.name} onChange={e=>edit({...plan,weeks:plan.weeks.map((x,i)=>i===week?{...x,name:e.target.value}:x)})}/></label>
    <label>Phase<select value={w.phaseId??''} onChange={e=>edit({...plan,weeks:plan.weeks.map((x,i)=>i===week?{...x,phaseId:e.target.value||undefined}:x)})}><option value="">No phase</option>{plan.phases.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label><input type="checkbox" checked={w.recovery} onChange={e=>edit({...plan,weeks:plan.weeks.map((x,i)=>i===week?{...x,recovery:e.target.checked}:x)})}/> Lower-load / recovery week</label><p className="muted">This label does not reduce doses. Review and enter the numerical changes below.</p>
    <label>Weekly focus / notes<textarea value={w.notes} onChange={e=>edit({...plan,weeks:plan.weeks.map((x,i)=>i===week?{...x,notes:e.target.value}:x)})}/></label>
    {plan.templates.map(d=><div key={d.id}><label><input type="checkbox" checked={w.templateIds.includes(d.id)} onChange={e=>edit({...plan,weeks:plan.weeks.map((x,i)=>i===week?{...x,templateIds:e.target.checked?[...x.templateIds,d.id]:x.templateIds.filter(id=>id!==d.id),overrides:Object.fromEntries(Object.entries(x.overrides).filter(([id])=>id!==d.id))}:x)})}/> {d.name}</label>{w.templateIds.includes(d.id)?<details><summary>Review weekly doses · {d.name}</summary>{d.exercises.map(x=><div key={x.assignmentId}><h4>{items.find(i=>i.id===x.assignmentId)?.exercise?.name}</h4><p>Template: {formatPrescription(x.prescription)||'Unspecified'}</p><PrescriptionFields id={`week-${week}-${d.id}-${x.assignmentId}`} value={w.overrides[d.id]?.[x.assignmentId]??x.prescription} onChange={prescription=>edit({...plan,weeks:plan.weeks.map((v,i)=>i===week?{...v,overrides:{...v.overrides,[d.id]:{...v.overrides[d.id],[x.assignmentId]:prescription}}}:v)})}/></div>)}</details>:null}</div>)}
    <button type="button" className="secondary-button" onClick={()=>{edit({...plan,weeks:[...plan.weeks,{...structuredClone(w),name:`Week ${plan.weeks.length+1}`}]});setWeek(plan.weeks.length);}}>Copy this week</button>
    <button type="button" className="secondary-button" onClick={()=>edit({...plan,activeWeek:week})}>Choose this week for clinician approval</button>
   </div>:null}
   {view==='Daily'?<div className="form">
    <label>Reusable day template<select value={dayIndex} onChange={e=>setDayIndex(Number(e.target.value))}>{plan.templates.map((d,i)=><option key={d.id} value={i}>{d.name}</option>)}</select></label>
    <label>Day name<input value={day.name} onChange={e=>patchDay({name:e.target.value})}/></label>
    <label>Day restrictions / cues<textarea value={day.notes} onChange={e=>patchDay({notes:e.target.value})}/></label>
    <fieldset><legend>Fixed weekdays (leave clear for a flexible weekly target)</legend>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((name,i)=><label key={name}><input type="checkbox" checked={day.weekdays.includes(i)} onChange={e=>patchDay({weekdays:e.target.checked?[...day.weekdays,i]:day.weekdays.filter(n=>n!==i)})}/>{name}</label>)}</fieldset>
    <PrescriptionFields id={`target-${day.id}`} value={day.weeklyTarget?{frequency:day.weeklyTarget}:{}} keys={['frequency']} onChange={p=>patchDay({weeklyTarget:p.frequency})}/>
    <label><input type="checkbox" checked={day.scheduledOnly} onChange={e=>patchDay({scheduledOnly:e.target.checked})}/> Limit to scheduled days</label>
    <label>Minimum recovery spacing (hours)<input type="number" min={0} max={720} value={day.minRestHours} onChange={e=>patchDay({minRestHours:Number(e.target.value)})}/></label>
    {items.map(x=>{const entry=day.exercises.find(e=>e.assignmentId===x.id);return <div key={x.id}><label><input type="checkbox" checked={!!entry} onChange={e=>patchDay({exercises:e.target.checked?[...day.exercises,{assignmentId:x.id,prescription:structuredClone(prescriptionFor(x)),notes:x.notes??'',prerequisiteIds:[]}]:day.exercises.filter(v=>v.assignmentId!==x.id)})}/>{x.patient_name??x.exercise?.name}</label>{entry?<details><summary>Day dose and prerequisites · {formatPrescription(entry.prescription)||'Unspecified'}</summary><PrescriptionFields id={`day-${day.id}-${x.id}`} value={entry.prescription} onChange={prescription=>patchDay({exercises:day.exercises.map(v=>v.assignmentId===x.id?{...v,prescription}:v)})}/><label>Day-specific cues<textarea value={entry.notes} onChange={e=>patchDay({exercises:day.exercises.map(v=>v.assignmentId===x.id?{...v,notes:e.target.value}:v)})}/></label>{day.exercises.slice(0,day.exercises.indexOf(entry)).map(previous=><label key={previous.assignmentId}><input type="checkbox" checked={entry.prerequisiteIds.includes(previous.assignmentId)} onChange={e=>patchDay({exercises:day.exercises.map(v=>v.assignmentId===x.id?{...v,prerequisiteIds:e.target.checked?[...v.prerequisiteIds,previous.assignmentId]:v.prerequisiteIds.filter(id=>id!==previous.assignmentId)}:v)})}/>First confirm {items.find(i=>i.id===previous.assignmentId)?.exercise?.name}</label>)}</details>:null}</div>;})}
    <button type="button" className="secondary-button" onClick={()=>{edit({...plan,templates:[...plan.templates,{...structuredClone(day),id:crypto.randomUUID(),name:`${day.name} copy`}]});setDayIndex(plan.templates.length);}}>Copy day template</button>
   </div>:null}
   <hr/><p>Week chosen for approval: <strong>{plan.weeks[plan.activeWeek].name}</strong>. Patient availability changes only after approval.</p>
   <label><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> I reviewed the numerical FITT, restrictions and phase criteria for this week. Missing symptoms, difficulty, functional and movement evidence remain unknown.</label>
   <div className="row-between"><button type="button" className="secondary-button" onClick={()=>void save(false)}>Save draft</button><button type="button" className="button" disabled={!reviewed} onClick={()=>void save(true)}>Approve chosen week</button></div>
   {program.progression_plan?<button type="button" className="secondary-button" disabled={!reviewed} onClick={()=>void save(true,true)}>Approve return to simple program</button>:null}
   {!onPreviewSave?<details><summary onClick={()=>{void createSupabaseBrowserClient().from('program_progression_revisions').select('*').eq('home_program_id',program.id).order('created_at',{ascending:false}).limit(30).then(r=>{if(r.error)setStatus(r.error.message);else setHistory(r.data??[]);});}}>Saved plans and approval history</summary>{history.map(r=><p key={r.id}>{r.approved?'Approved':'Draft'} · {new Date(r.created_at).toLocaleString()} {r.document?<button type="button" className="secondary-button" onClick={()=>{edit(structuredClone(r.document!));setWeek(0);setDayIndex(0);}}>Load for review</button>:'Simple program'}</p>)}</details>:null}
  </fieldset><p role="status">{status}</p>
  {progressionInsights(logs).map(i=><p key={i.assignmentId}>{items.find(x=>x.id===i.assignmentId)?.exercise?.name}: {i.message} ({i.count} records)</p>)}
 </details>;
}
