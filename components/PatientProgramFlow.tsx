"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExerciseVideo } from "@/components/ExerciseVideo";
import { AssignedExerciseVideo } from "@/components/AssignedExerciseVideo";
import { formatExercisePrescription, parameterSpecs, type ParameterKey, type Prescription, validatePrescription } from "@/lib/prescription";
import { templateExercises, weekStart, scheduleMessage, suggestedTemplateDate } from "@/lib/progression";
import { sessionExercises, prerequisiteMessage, includeRequiredExercises, type ExerciseSession } from "@/lib/exercise-session";
import { PatientShell } from "@/components/PatientShell";
import { RoleGate } from "@/components/RoleGate";
import { RequireAuth } from "@/components/RequireAuth";
import { loadCurrentPatientAppWorkspace, logPainPattern, type ExerciseLogInput } from "@/lib/data";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { HomeProgramExercise, PatientWorkspace } from "@/lib/types";

type EntryState = Omit<ExerciseLogInput, "homeProgramExerciseId"> & { statusChosen: boolean; actualDose?: Prescription };

export function PatientProgramFlow({previewWorkspace, onPreviewSave}: {previewWorkspace?: PatientWorkspace; onPreviewSave?: (entries: ExerciseLogInput[]) => void} = {}) {
 const [templateId,setTemplateId]=useState('');
 const [suggestedDate,setSuggestedDate]=useState('');
 const [workspace,setWorkspace]=useState<PatientWorkspace|null>(null);
 const [entries,setEntries]=useState<Record<string,EntryState>>({});
 const [session,setSession]=useState<ExerciseSession|null>(null);
 const [resumable,setResumable]=useState<ExerciseSession[]>([]);
 const [mode,setMode]=useState<ExerciseSession['selection_mode']>('full');
 const [selected,setSelected]=useState<string[]>([]);
 const [sections,setSections]=useState<string[]>([]);
 const [current,setCurrent]=useState<string|null>(null);
 const [confirmed,setConfirmed]=useState<string[]>([]);
 const [nonperformance,setNonperformance]=useState<string[]>([]);
 const [showList,setShowList]=useState(true);
 const [finishing,setFinishing]=useState(false);
 const [saving,setSaving]=useState(false);
 const busy=useRef(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [pain,setPain]=useState<number|null>(null);
 const [direction,setDirection]=useState<'improving'|'unchanged'|'worsening'|null>(null);
 const [comment,setComment]=useState('');
 const exerciseHeading=useRef<HTMLHeadingElement>(null);
 const startIntent=useRef<string|null>(null);
 useEffect(()=>{
  let cancelled=false;
  async function load(){
   try {
    if(!previewWorkspace&&!isSupabaseConfigured()) throw new Error('The patient app is not configured yet.');
    const data=previewWorkspace??await loadCurrentPatientAppWorkspace(createSupabaseBrowserClient());
    if(cancelled)return;
    setWorkspace(data);setEntries(Object.fromEntries(data.programExercises.map(x=>[x.id,emptyEntry()])));
    if(!previewWorkspace&&data.patient&&data.program){
     const result=await createSupabaseBrowserClient().from('patient_exercise_sessions').select('*').eq('patient_id',data.patient.id).eq('home_program_id',data.program.id).eq('state','active').order('created_at',{ascending:false});
     if(result.error)throw result.error;
     if(!cancelled)setResumable(result.data??[]);
    }
   }catch(e){if(!cancelled)setError(errorText(e));}
  }
  void load();return()=>{cancelled=true};
 },[previewWorkspace]);
 useEffect(()=>{
  if(showList||finishing||!current)return;
  const frame=requestAnimationFrame(()=>{exerciseHeading.current?.focus({preventScroll:true});exerciseHeading.current?.scrollIntoView({block:'start',behavior:'instant'});});
  return()=>cancelAnimationFrame(frame);
 },[current,showList,finishing]);
 const plan=workspace?.program?.progression_plan;
 const today=new Date().toLocaleDateString('en-CA');
 const activeWeek=plan?.weeks[plan.activeWeek];
 const availableDays=plan?.templates.filter(t=>activeWeek?.templateIds.includes(t.id))??[];
 const currentTemplateId=session?.day_template_id??(templateId||availableDays.find(t=>!t.weekdays.length||t.weekdays.includes(new Date().getDay()))?.id||availableDays[0]?.id);
 const day=availableDays.find(t=>t.id===currentTemplateId);
 const scheduledDate=session?.scheduled_date??(suggestedDate||(plan?suggestedTemplateDate(plan,day,today):today));
 const baseItems=workspace?.programExercises??[];
 const visibleItems=plan&&currentTemplateId?templateExercises(plan,currentTemplateId,baseItems):baseItems;
 const items=sessionExercises(visibleItems,visibleItems.map(x=>x.id));
 const lastDayActivity=workspace?.adherenceLogs.filter(l=>l.day_template_id===currentTemplateId&&l.activity_source==='individual_confirmation'&&l.session_id!==session?.id).sort((a,b)=>Date.parse(b.performed_at??'')-Date.parse(a.performed_at??''))[0];
 const restriction=day?scheduleMessage(day,scheduledDate,today,lastDayActivity?.performed_at??undefined):'';
 const groups=groupExercises(items);
 const chosen=session?sessionExercises(items,session.selected_ids):[];
 const item=chosen.find(x=>x.id===current);
 const recordCount=confirmed.length;
 function updateEntry(id:string,patch:Partial<EntryState>){setEntries(e=>({...e,[id]:{...e[id],...patch}}));}
 async function start(){
  if(busy.current||!workspace?.patient||!workspace.program)return;
  if(restriction){setError(restriction);return;}
  const selection=mode==='full'?items.map(x=>x.id):mode==='sections'?items.filter(x=>sections.includes(category(x))).map(x=>x.id):selected;
  const ids=includeRequiredExercises(items,selection,workspace.program.guided_order??false);
  if(!ids.length){setError('Choose at least one exercise or section.');return;}
  busy.current=true;setSaving(true);setError('');
  const next:ExerciseSession={id:startIntent.current??crypto.randomUUID(),patient_id:workspace.patient.id,home_program_id:workspace.program.id,program_version:workspace.program.updated_at??null,...(plan?{progression_revision_id:workspace.program.progression_revision_id,day_template_id:currentTemplateId,scheduled_date:scheduledDate,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone}:{}),selection_mode:mode,selected_ids:ids,current_exercise_id:ids[0],state:'active'};
  startIntent.current=next.id;
  try{
   if(!previewWorkspace){
    const client=createSupabaseBrowserClient();const result=await client.from('patient_exercise_sessions').insert(next);
    if(result.error){const existing=await client.from('patient_exercise_sessions').select('*').eq('id',next.id).maybeSingle();if(!existing.data)throw result.error;}
   }
   setSession(next);setConfirmed([]);setNonperformance([]);setCurrent(ids[0]);setShowList(mode!=='full');setMessage('');setFinishing(false);
  }catch(e){setError(errorText(e));}finally{busy.current=false;setSaving(false);}
 }
 async function resume(s:ExerciseSession){
  if(busy.current)return;busy.current=true;setSaving(true);setError('');
  try{
   let logs=workspace?.adherenceLogs.filter(l=>l.session_id===s.id)??[];
   if(!previewWorkspace){const result=await createSupabaseBrowserClient().from('exercise_adherence_logs').select('*').eq('patient_id',s.patient_id).eq('session_id',s.id);if(result.error)throw result.error;logs=result.data??[];}
   setSession(s);setConfirmed(logs.filter(l=>l.completion_status==='completed').map(l=>l.home_program_exercise_id!).filter(Boolean));
   setEntries(Object.fromEntries(baseItems.map(x=>{const l=logs.find(l=>l.home_program_exercise_id===x.id);return [x.id,l?{...emptyEntry(),statusChosen:true,actualDose:l.actual_dose??{},actualRepsBySet:l.actual_reps_by_set??undefined,difficulty:l.difficulty as EntryState['difficulty'],difficultyReason:l.difficulty_reason,difficultyExplanation:l.difficulty_explanation,painDuring:l.pain_during??null,symptomResponse:l.symptom_response,symptomRecovery:l.symptom_recovery,notes:l.notes??''}:emptyEntry()];})));
   setNonperformance(logs.filter(l=>l.activity_source==='explicit_nonperformance').map(l=>l.home_program_exercise_id!));
   setCurrent(s.current_exercise_id);setShowList(true);setMessage('');setFinishing(false);
  }catch(e){setError(errorText(e));}finally{busy.current=false;setSaving(false);}
 }
 async function openExercise(id:string){
  setCurrent(id);setShowList(false);setFinishing(false);
  if(!previewWorkspace&&session){const result=await createSupabaseBrowserClient().from('patient_exercise_sessions').update({current_exercise_id:id}).eq('id',session.id);if(result.error)setError('Your position could not be saved. Confirmed exercises are still recorded.');}
 }
 async function done(reportNonperformance=false){
  if(busy.current||!session||!item||confirmed.includes(item.id)||nonperformance.includes(item.id))return;
  if(!reportNonperformance&&needsExplanation(entries[item.id])){setError('Tell your therapist what made the exercise difficult.');return;}
  busy.current=true;setSaving(true);setError('');
  try{
   if(!reportNonperformance&&entries[item.id].actualRepsBySet?.some(n=>!Number.isInteger(n)||n<0||n>100000))throw new Error('Enter whole-number repetitions separated by commas.');
   if(!reportNonperformance){validatePrescription(entries[item.id].actualDose??{}, false);validatePain(entries[item.id].painDuring);}
   if(!previewWorkspace){
    const result=await createSupabaseBrowserClient().rpc('confirm_patient_exercise',{p_session:session.id,p_exercise:item.id,p_feedback:JSON.parse(JSON.stringify(reportNonperformance?{nonperformance:true,notes:entries[item.id].notes}:entries[item.id]))});
    if(result.error)throw result.error;
   }
   if(reportNonperformance){setNonperformance(a=>[...a,item.id]);updateEntry(item.id,{statusChosen:true,completionStatus:'skipped'});setMessage('Your report is saved. This exercise is not counted as recorded activity.');return;}
   const ids=[...confirmed,item.id];setConfirmed(ids);updateEntry(item.id,{statusChosen:true});
   setMessage(`${ids.length} exercise${ids.length===1?'':'s'} recorded. You can return later.`);
  }catch(e){setError(errorText(e));}finally{busy.current=false;setSaving(false);}
 }
 async function finish(){
  if(busy.current||!session)return;
  busy.current=true;setSaving(true);setError('');
  try{
   validatePain(pain);
   if(previewWorkspace)onPreviewSave?.([...confirmed,...nonperformance].map(id=>({homeProgramExerciseId:id,...entries[id]})));
   else {
    const client=createSupabaseBrowserClient();
    if(workspace?.patient&&workspace.episode&&(pain!==null||direction||comment.trim()))await logPainPattern(client,{patientId:workspace.patient.id,episodeId:workspace.episode.id,painScore:pain,painLocation:'',symptomBehavior:'',activityContext:'Exercise session',aggravatingFactors:'',easingFactors:'',confidenceScore:null,symptomDirection:direction,patientComment:comment,clientSubmissionId:session.id});
    const result=await client.from('patient_exercise_sessions').update({state:'closed'}).eq('id',session.id);if(result.error)throw result.error;
   }
   setSession(null);setResumable(r=>r.filter(s=>s.id!==session.id));setFinishing(false);setShowList(true);setCurrent(null);startIntent.current=null;
   setEntries(Object.fromEntries(items.map(x=>[x.id,emptyEntry()])));setPain(null);setDirection(null);setComment('');
   setMessage(previewWorkspace?'Synthetic feedback saved in this preview only.':`${recordCount} exercise${recordCount===1?'':'s'} recorded. Start another session whenever you choose.`);
  }catch(e){setError(errorText(e));}finally{busy.current=false;setSaving(false);}
 }
 return <PatientShell preview={!!previewWorkspace}><PatientFlowAccess preview={!!previewWorkspace}><div className="patient-screen">
  <header className="patient-page-heading"><p className="eyebrow">Program</p><h1>{workspace?.program?.title??workspace?.program?.name??'Your movement plan'}</h1><p>Choose what fits today. Confirm each exercise individually.</p></header>
  {!workspace&&!error?<div className="empty">Loading your program…</div>:null}
  {error?<p className="form-error" role="alert">{error}</p>:null}
  {message?<p className="success-banner" role="status">{message}</p>:null}
  {workspace&&!workspace.patient?<PatientLinkEmptyState/>:null}
  {workspace?.patient&&!workspace.program?<div className="empty">Your clinician is preparing your program.</div>:null}
  {workspace?.program&&!items.length?<div className="empty">No exercises assigned yet.</div>:null}
  {plan&&!session?<section className="panel form"><h2>{activeWeek?.name}{activeWeek?.recovery?' · Recovery week':''}</h2><p>{activeWeek?.notes}</p>
   {plan.phases.find(p=>p.id===activeWeek?.phaseId)?<p>{plan.phases.find(p=>p.id===activeWeek?.phaseId)?.name} · {plan.phases.find(p=>p.id===activeWeek?.phaseId)?.focus}</p>:null}
   <label>Suggested activity date<input type="date" min={weekStart(plan)} max={new Date(Date.parse(weekStart(plan,plan.activeWeek+1))-86400000).toISOString().slice(0,10)} value={scheduledDate} onChange={e=>{setSuggestedDate(e.target.value);startIntent.current=null;}}/></label>
   <p>Activity you record now is dated {today}. Choosing another suggested date does not move your schedule.</p>
   {['Suggested today','Other clinician-approved exercises available'].map((heading,index)=><div key={heading}><h3>{heading}</h3>{availableDays.filter(t=>(!t.weekdays.length||t.weekdays.includes(new Date().getDay()))===(index===0)).map(t=><button type="button" className="secondary-button" aria-pressed={currentTemplateId===t.id} key={t.id} onClick={()=>{setTemplateId(t.id);setSuggestedDate('');setSelected([]);setSections([]);startIntent.current=null;}}>{t.name}{t.weeklyTarget?` · ${formatExercisePrescription({id:'target',prescription:{frequency:t.weeklyTarget}})}`:''}</button>)}</div>)}
   <p>{day?.name}: {day?.notes}</p>{restriction?<p role="status">{restriction}</p>:null}
  </section>:null}
  {items.length&&!session?<section className="panel form">
   <h2>Where would you like to start?</h2>
   {resumable.map(s=><button className="secondary-button" type="button" key={s.id} disabled={saving} onClick={()=>void resume(s)}>Resume session{ s.created_at ? ` · ${new Date(s.created_at).toLocaleString()}`:''}</button>)}
   <div className="segment-options">{([['full','Follow Full Program'],['individual','Choose Individual Exercises'],['sections','Select Section(s)']] as const).map(([v,label])=><button type="button" key={v} aria-pressed={mode===v} className={mode===v?'active':''} onClick={()=>{setMode(v);startIntent.current=null;}}>{label}</button>)}</div>
   {mode==='individual'?items.map(x=><label key={x.id}><input type="checkbox" checked={selected.includes(x.id)} onChange={e=>{setSelected(a=>e.target.checked?[...a,x.id]:a.filter(id=>id!==x.id));startIntent.current=null;}}/> {x.exercise?.name??'Exercise'}</label>):null}
   {mode==='sections'?groups.map(([name,rows])=><label key={name}><input type="checkbox" checked={sections.includes(name)} onChange={e=>{setSections(a=>e.target.checked?[...a,name]:a.filter(v=>v!==name));startIntent.current=null;}}/> {formatCategory(name)} · {rows.length} exercises</label>):null}
   <p className="muted">Choosing exercises or sections only creates your session list. Required preparatory exercises are included when your therapist specifies them. Nothing is recorded until you tap Done for an exercise.</p>
   {workspace?.program?.guided_order?<p>Your therapist has set a required exercise order.</p>:null}
   <button type="button" className="button" disabled={saving||!!restriction} onClick={()=>void start()}>{saving?'Saving selection…':'Start session'}</button>
  </section>:null}
  {session?<>
   <p aria-live="polite">{recordCount} exercise{recordCount===1?'':'s'} recorded in this session</p>
   <div className="row-between"><button type="button" className="secondary-button" disabled={saving} onClick={()=>{setShowList(true);setFinishing(false);setError('');}}>Exercise list</button><button type="button" className="secondary-button" disabled={saving} onClick={()=>setFinishing(true)}>Finish for now</button></div>
   {finishing?<section className="panel form"><h2>Finish for now</h2><p>{recordCount} exercises recorded. Exercises without a confirmation stay unrecorded.</p>
    <NumberField label="Pain after (0–10, optional)" value={pain} max={10} onChange={setPain}/>
    <Choice label="Overall symptoms (optional)" value={direction} options={[["improving","Better"],["unchanged","Same"],["worsening","Worse"]]} onChange={v=>setDirection(v as typeof direction)}/>
    <label>Anything your therapist should know? (optional)<textarea maxLength={2000} value={comment} onChange={e=>setComment(e.target.value)}/></label>
    <p className="muted">Your therapist reviews updates during usual working hours. This is not monitored continuously.</p>
    <button type="button" className="button" disabled={saving} onClick={()=>void finish()}>{saving?'Saving…':'Close session'}</button>
    <button type="button" className="secondary-button" disabled={saving} onClick={()=>setFinishing(false)}>Continue session</button>
   </section>:showList?<section className="panel form"><h2>Your session list</h2>
    {groupExercises(chosen).map(([name,rows])=><section key={name}><h3>{formatCategory(name)} · {rows.filter(x=>confirmed.includes(x.id)).length} exercises recorded</h3>
     {rows.map(x=>{const why=prerequisiteMessage(x,items,confirmed,workspace?.program?.guided_order??false);return <div key={x.id} className="list-item"><button type="button" className="secondary-button" disabled={saving||!!why} onClick={()=>void openExercise(x.id)}>{x.exercise?.name??'Exercise'}{confirmed.includes(x.id)?' · Recorded':nonperformance.includes(x.id)?' · Reported not performed':''}</button>{why?<p>{why}</p>:null}</div>;})}
    </section>)}
    <p className="muted">Leave this page any time and resume from Program. Confirmed activity is saved individually.</p>
   </section>:item?<section className="patient-program-group">
    <fieldset disabled={saving||confirmed.includes(item.id)||nonperformance.includes(item.id)} style={{border:0,padding:0,minWidth:0}}><ExerciseEntryCard preview={!!previewWorkspace} key={item.id} item={item} value={entries[item.id]} headingRef={exerciseHeading} onChange={p=>updateEntry(item.id,p)}/></fieldset>
    {prerequisiteMessage(item,items,confirmed,workspace?.program?.guided_order??false)?<p>{prerequisiteMessage(item,items,confirmed,workspace?.program?.guided_order??false)}</p>:null}
    <button type="button" className="button" disabled={saving||confirmed.includes(item.id)||nonperformance.includes(item.id)||needsExplanation(entries[item.id])||!!prerequisiteMessage(item,items,confirmed,workspace?.program?.guided_order??false)} onClick={()=>void done()}>{saving?'Saving…':confirmed.includes(item.id)?'Recorded':nonperformance.includes(item.id)?'Reported not performed':'Done'}</button>
    {!confirmed.includes(item.id)&&!nonperformance.includes(item.id)?<details><summary>Something to tell my therapist</summary><p>Only send this if you want to explicitly report that you did not do this exercise. Leaving it unrecorded makes no assumption.</p><button type="button" className="secondary-button" disabled={saving} onClick={()=>void done(true)}>Send report: I did not do this exercise</button></details>:null}
    <div className="row-between" style={{marginTop:16}}><button type="button" className="secondary-button" disabled={saving||chosen.indexOf(item)===0} onClick={()=>void openExercise(chosen[chosen.indexOf(item)-1].id)}>Back</button><button type="button" className="secondary-button" disabled={saving||chosen.indexOf(item)===chosen.length-1} onClick={()=>void openExercise(chosen[chosen.indexOf(item)+1].id)}>Next exercise</button></div>
   </section>:<p>Return to the exercise list to choose an exercise.</p>}
  </>:null}
  <p className="muted">Records show what you confirmed, not everything you may have done. No record means performance is unknown.</p>
  <Link href="/patient">Return to Today</Link>
 </div></PatientFlowAccess></PatientShell>;
}
function validatePain(value:number|null){if(value!==null&&(!Number.isInteger(value)||value<0||value>10))throw new Error('Enter a whole-number pain rating from 0 to 10, or leave it blank.');}
function errorText(e:unknown){return e instanceof Error?e.message:typeof e==='object'&&e&&'message' in e?String(e.message):'Could not save. Please try again; retries will not duplicate your record.';}
function category(item:HomeProgramExercise){return item.category??item.exercise?.category??'other';}
function ActualDoseFields({id,value,onChange}:{id:string;value:Prescription;onChange:(value:Prescription)=>void}){
 return <div className="exercise-log-grid">{(['sets','reps','hold','rest','duration','intensity','load','distance'] as ParameterKey[]).map(key=>{const entry=value[key];const spec=parameterSpecs[key];return <div className="field" key={key}><label htmlFor={`${id}-actual-${key}`}>Actual {spec.label.toLowerCase()}</label><input id={`${id}-actual-${key}`} type="number" min={0} max={100000} step={'integer' in spec?1:'any'} value={entry?.value??''} onChange={e=>{const next={...value};if(e.target.value==='')delete next[key];else next[key]={value:Number(e.target.value),unit:entry?.unit??spec.units[0]};onChange(next);}}/><label className="sr-only" htmlFor={`${id}-unit-${key}`}>Actual {spec.label.toLowerCase()} unit</label><select id={`${id}-unit-${key}`} value={entry?.unit??spec.units[0]} onChange={e=>onChange({...value,[key]:{value:entry?.value??null,unit:e.target.value}})}>{spec.units.map(u=><option key={u}>{u}</option>)}</select></div>;})}</div>;
}
function ExerciseEntryCard({ item, value, onChange, headingRef, preview=false }: { preview?:boolean; headingRef: React.RefObject<HTMLHeadingElement | null>; item: HomeProgramExercise; value?: EntryState; onChange: (patch: Partial<EntryState>) => void }) {
  if (!value) return null;
  return (
    <article className={`patient-exercise-entry${value.statusChosen ? " has-status" : ""}`}>
      <div className="exercise-entry-heading">
        <div><h4 ref={headingRef} tabIndex={-1} className="exercise-step-heading">{item.exercise?.name ?? "Exercise"}</h4></div>
        <span className="pill">{formatCategory(item.category ?? item.exercise?.category ?? "other")}</span>
      </div>
      {preview ? <ExerciseVideo key={item.id} url={item.exercise?.video_url} name={item.exercise?.name??"Exercise"}/> : <AssignedExerciseVideo key={item.id} item={item}/>}
      <p><strong>{formatExercisePrescription(item)}</strong></p>
      {preview && item.exercise?.patient_instructions ? <p>{item.exercise.patient_instructions}</p> : null}

      {preview && item.notes ? <p className="therapist-note"><strong>Key cues:</strong> {item.notes}</p> : null}
      <details><summary>Adjust what I did (optional)</summary>
        <p className="muted">Record only values that differed. Your therapist’s prescription stays separate. Blank values remain unknown.</p>
        <label>Repetitions in each set (optional)<input aria-label="Repetitions in each set" placeholder="e.g. 10, 8, 8" pattern="[0-9]+(, *[0-9]+)*" defaultValue={value.actualRepsBySet?.join(', ')??''} onChange={e=>onChange({actualRepsBySet:e.target.value.trim()?e.target.value.split(',').map(n=>n.trim()?Number(n):NaN):undefined})}/></label>
        <ActualDoseFields id={item.id} value={value.actualDose??{}} onChange={actualDose=>onChange({actualDose})}/>
      </details><details><summary>How did it feel? (optional)</summary><div className="exercise-log-grid">
        <NumberField label="Pain during (0–10)" value={value.painDuring} max={10} onChange={painDuring=>onChange({painDuring})}/>
      </div>
      <div className="field"><label htmlFor={`difficulty-${item.id}`}>Difficulty</label><select id={`difficulty-${item.id}`} value={value.difficulty ?? ""} onChange={(event) => onChange({ difficulty: (event.target.value || null) as EntryState["difficulty"], difficultyReason: null, difficultyExplanation: "" })}><option value="">Not rated</option><option value="too_easy">Too easy</option><option value="appropriate">About right</option><option value="too_hard">Too hard</option></select></div>
      {value.difficulty==='too_hard' ? <Choice label="What made it difficult? (optional)" value={value.difficultyReason} options={[["symptoms","Symptoms"],["fatigue","Fatigue"],["movement","Movement was difficult"],["instructions","Instructions unclear"],["other","Other"]]} onChange={difficultyReason=>onChange({difficultyReason, difficultyExplanation: ""})}/> : null}
      {value.difficulty === 'too_hard' && value.difficultyReason === 'other' ? <div className="field"><label htmlFor={`other-${item.id}`}>Tell your therapist what made it difficult</label><textarea id={`other-${item.id}`} required maxLength={500} value={value.difficultyExplanation ?? ''} onChange={event => onChange({difficultyExplanation: event.target.value})}/><p className="muted">A short explanation helps your therapist understand your response.</p></div> : null}

      {<Choice label="Did this increase your symptoms? (optional)" value={value.symptomResponse} options={[["none","No"],["little","A little"],["lot","A lot"]]} onChange={symptomResponse=>onChange({symptomResponse,symptomRecovery:null})}/>}
      {['little','lot'].includes(value.symptomResponse??'') ? <Choice label="How are those symptoms now? (optional)" value={value.symptomRecovery} options={[["settled","Settled"],["improving","Improving"],["still_increased","Still increased"],["unsure","Not sure yet"]]} onChange={symptomRecovery=>onChange({symptomRecovery})}/> : null}
      <div className="field"><label htmlFor={`comment-${item.id}`}>Comment (optional)</label><textarea id={`comment-${item.id}`} maxLength={2000} value={value.notes} onChange={(event) => onChange({ notes: event.target.value })} placeholder="For example: this felt easier today, or pain started after rep 8." /></div>
      </details>
    </article>
  );
}

function NumberField({ label, value, max, onChange }: { label: string; value: number | null; max?: number; onChange: (value: number | null) => void }) {
  return <div className="field"><label>{label}<input type="number" min={0} max={max} value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} /></label></div>;
}

function emptyEntry(): EntryState {
  return { completionStatus: "completed", statusChosen: false, difficulty: null, difficultyExplanation: "", painDuring: null, actualSets: null, actualReps: null, actualDurationMinutes: null, notes: "" };
}

function groupExercises(items: HomeProgramExercise[]) { const grouped = new Map<string, HomeProgramExercise[]>(); for (const item of items) { const category = item.category ?? item.exercise?.category ?? "other"; grouped.set(category, [...(grouped.get(category) ?? []), item]); } return [...grouped.entries()]; }
function formatCategory(category: string) { return category.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function PatientLinkEmptyState() { return <div className="empty"><strong>Your account still needs to be linked.</strong><p>Ask your clinician to resend the invitation, then open that link while signed in with this account.</p></div>; }

function Choice({label,value,options,onChange}:{label:string;value?:string|null;options:string[][];onChange:(value:string|null)=>void}) {return <div className="field"><label>{label}<select value={value??''} onChange={e=>onChange(e.target.value||null)}><option value="">Not answered</option>{options.map(([key,text])=><option key={key} value={key}>{text}</option>)}</select></label></div>;}

function needsExplanation(value?: EntryState) { return value?.difficulty === "too_hard" && value.difficultyReason === "other" && !value.difficultyExplanation?.trim(); }

function PatientFlowAccess({preview, children}: {preview: boolean; children: React.ReactNode}) {
  return preview ? <>{children}</> : <RequireAuth><RoleGate allowed={["patient"]}>{children}</RoleGate></RequireAuth>;
}
