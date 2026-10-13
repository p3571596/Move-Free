"use client";
import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import { GENERATION_BUCKET, movements, type Movement, type GeneratedVideoJob } from '@/lib/generated-video';
import { blankAIExercise, type AIExerciseContent } from '@/lib/ai-exercise-content';
import { prescriptionFor } from '@/lib/prescription';
import type { HomeProgramExercise, Json } from '@/lib/types';
import { PrivateVideoPlayer } from './PrivateVideoPlayer';
import { PrescriptionFields } from './PrescriptionFields';
export function GeneratedExerciseVideo({item,patientId,onApply,onChanged}:{item:HomeProgramExercise;patientId:string;onApply:(content:AIExerciseContent)=>void;onChanged:()=>void}) {
 const [movement,setMovement]=useState<Movement>('squat'),[job,setJob]=useState<GeneratedVideoJob|null>(null),[jobs,setJobs]=useState<GeneratedVideoJob[]>([]),[content,setContent]=useState<AIExerciseContent>({...blankAIExercise(),prescription:prescriptionFor(item)}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[accepted,setAccepted]=useState(false),[checks,setChecks]=useState({viewed:false,movement:false,instructions:false,fitt:false}),[applied,setApplied]=useState(false);
 const [requestId,setRequestId]=useState(''),[assetId,setAssetId]=useState('');
 async function call(method:string,body?:unknown,id?:string) {
  const {data:{session}}=await createSupabaseBrowserClient().auth.getSession();
  if(!session)throw new Error('Sign in again.');
  const response=await fetch(`/api/generated-video${id?`?id=${encodeURIComponent(id)}`:''}`,{method,headers:{Authorization:`Bearer ${session.access_token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Request unavailable.');return data;
 }
 useEffect(()=>{let active=true;void call('GET').then(data=>{if(active)setJobs(data.jobs??[]);}).catch(()=>{if(active)setError('Saved generation drafts could not be loaded. Retry by choosing this source again.');});return()=>{active=false;};},[]);
 function select(next:GeneratedVideoJob) {
  setJob(next);setMovement(next.movement);setContent(next.reviewed_content??{...blankAIExercise(),name:movements[next.movement].name,instructions:movements[next.movement].instructions,prescription:prescriptionFor(item)});setChecks({viewed:false,movement:false,instructions:false,fitt:false});setApplied(false);setAssetId(next.asset_id??'');setRequestId(next.id);setError('');
 }
 async function status() {if(!job)return;setBusy(true);setError('');try{const data=await call('GET',undefined,job.id);setJob(data.job);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function generate() {
  setBusy(true);setError('');const id=requestId||crypto.randomUUID();setRequestId(id);
  try{const data=await call('POST',{id,movement,costAccepted:accepted});if(data.job)select(data.job);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 function edit(next:AIExerciseContent){setContent(next);setChecks(v=>({...v,movement:false,instructions:false,fitt:false}));setApplied(false);}
 async function review() {
  if(!job)return;setBusy(true);setError('');try{const result=await createSupabaseBrowserClient().rpc('review_generated_video',{p_id:job.id,p_content:content as unknown as Json,p_checks:checks});if(result.error)throw new Error('Review could not be saved. Check fields and access.');onApply(content);setApplied(true);setJob({...job,status:'reviewed',reviewed_content:content});}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function assign() {
  if(!job)return;setBusy(true);setError('');const id=assetId||crypto.randomUUID();setAssetId(id);
  try{const data=await call('POST',{action:'assign',id:job.id,assetId:id,patientId,exerciseId:item.id});setJob({...job,...data.job});onChanged();}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const complete=Object.values(checks).every(Boolean)&&!!content.name.trim()&&!!content.instructions.trim();
 return <section className="form" aria-label="Generate exercise demonstration">
  <strong>Generate exercise demonstration using AI</strong>
  <p>Veo 3.1 Fast · silent four-second clip · estimated $0.40 per attempt · $5/day UTC cap. Generation is a beta service; credits and account access are required.</p>
  <p className="muted">A fictional adult performs a preset movement. No patient information, chart text, photos or FITT values are sent. The movement may be inaccurate: reject it if unsuitable. This pilot supports four movements; use your own recording for others.</p>
  {jobs.length>0?<label className="field">Resume a private draft<select value={job?.id??''} disabled={busy} onChange={e=>{const next=jobs.find(j=>j.id===e.target.value);if(next)select(next);}}><option value="">Choose draft</option>{jobs.map(j=><option key={j.id} value={j.id}>{movements[j.movement].name} · {j.status} · {new Date(j.created_at).toLocaleString()}</option>)}</select></label>:null}
  {!job?<>
   <label className="field">Movement<select value={movement} disabled={busy} onChange={e=>{setMovement(e.target.value as Movement);setRequestId('');}}>{Object.entries(movements).map(([key,value])=><option key={key} value={key}>{value.name}</option>)}</select></label>
   <label><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/> I accept the $0.40 estimate for this attempt. Failed or uncertain attempts count toward the pilot cap.</label>
   <button type="button" className="button" disabled={busy||!accepted} onClick={generate}>{busy?'Starting generation…':'Generate private draft'}</button>
  </>:<>
   <p role="status">Generation status: {job.status}</p>
   {['starting','generating'].includes(job.status)?<><p>You can leave and resume this draft. Check status without starting another paid job.</p><button type="button" disabled={busy} onClick={status}>{busy?'Checking…':'Check generation status'}</button></>:null}
   {job.status==='failed'?<p role="alert">Generation failed or its start was uncertain. A new attempt has a new $0.40 estimate. Your program has not been changed.</p>:null}
   {job.object_path&&['ready','reviewed'].includes(job.status)?<>
    <PrivateVideoPlayer bucket={GENERATION_BUCKET} path={job.object_path} title={`Unverified AI draft: ${content.name}`} onViewed={()=>setChecks(v=>({...v,viewed:true}))}/>
    <p>Preview → edit → clinician review. Do not approve clinically inaccurate movement.</p>
    {(['name','instructions','cues','exercise_type','equipment'] as const).map(key=><label className="field" key={key}>{({name:'Exercise name',instructions:'Exercise instructions',cues:'Notes / movement cues',exercise_type:'Exercise type',equipment:'Equipment'})[key]}<textarea value={content[key]} maxLength={key==='instructions'?4000:key==='cues'?1400:200} onChange={e=>edit({...content,[key]:e.target.value})}/></label>)}
    <PrescriptionFields id={`generated-${job.id}`} value={content.prescription} onChange={prescription=>edit({...content,prescription})}/>
    {(['movement','instructions','fitt'] as const).map(key=><label key={key}><input type="checkbox" disabled={!checks.viewed||busy} checked={checks[key]} onChange={e=>setChecks(v=>({...v,[key]:e.target.checked}))}/> I reviewed {key==='movement'?'movement accuracy':key==='instructions'?'exercise instructions and cues':'numerical FITT; missing values remain unprescribed'}.</label>)}
    <button type="button" className="secondary-button" disabled={busy||!complete} onClick={review}>{busy?'Saving review…':'Approve draft and apply edits to Program'}</button>
    <p className="muted">Applying edits does not assign the video. Save Program, then explicitly assign this reviewed video.</p>
    <button type="button" className="button" disabled={busy||!applied||!complete||item.id.startsWith('draft-')} onClick={assign}>{item.id.startsWith('draft-')?'Save Program before assigning':'Publish and assign reviewed video'}</button>
   </>:null}
   {job.status==='approved'?<p>Approved and assigned to the saved patient exercise. Use the recording controls to withdraw it.</p>:null}
   {!['starting','generating'].includes(job.status)?<button type="button" className="secondary-button" disabled={busy} onClick={()=>{setJob(null);setAccepted(false);setRequestId('');setAssetId('');setApplied(false);}}>Choose another movement / retry with a new estimate</button>:null}
  </>}
  {error?<p role="alert">{error}</p>:null}
 </section>;
}
