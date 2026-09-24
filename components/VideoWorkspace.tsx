"use client";
import {FormEvent,useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {loadCurrentPatientAppWorkspace,loadPatientWorkspace} from "@/lib/data";
import {createSupabaseBrowserClient} from "@/lib/supabase";
import {uploadPrivateVideo,videoFileError} from "@/lib/private-video";
import type {ExerciseVideoAsset,HomeProgramExercise,PatientWorkspace} from "@/lib/types";
import {PrivateVideoPlayer} from "./PrivateVideoPlayer";

export function VideoWorkspace({patientId}:{patientId?:string}) {
  const [workspace,setWorkspace]=useState<PatientWorkspace|null>(null);
  const [assets,setAssets]=useState<ExerciseVideoAsset[]>([]);
  const [exerciseId,setExerciseId]=useState("");const [file,setFile]=useState<File|null>(null);
  const [consent,setConsent]=useState(false);const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");const [notice,setNotice]=useState("");
  const camera=useRef<HTMLInputElement>(null),picker=useRef<HTMLInputElement>(null);
  const clinician=Boolean(patientId);
  const load=useCallback(async()=>{
    const db=createSupabaseBrowserClient();const w=patientId?await loadPatientWorkspace(db,patientId):await loadCurrentPatientAppWorkspace(db);
    if(!w.patient){setWorkspace(w);setAssets([]);return;}
    const {data,error}=await db.from("exercise_video_assets").select("*").eq("patient_id",w.patient.id).neq("state","withdrawn").order("created_at",{ascending:false}).limit(50);
    if(error)throw new Error("Private videos are unavailable. Reconnect and try again.");
    setWorkspace(w);setAssets(data??[]);setExerciseId(current=>w.programExercises.some(x=>x.id===current)?current:w.programExercises[0]?.id??"");
  },[patientId]);
  useEffect(()=>{let active=true;load().catch(()=>{if(active)setError("Private videos are unavailable. Reconnect and try again.");});return()=>{active=false;};},[load]);
  function choose(next:File|null){setNotice("");setConsent(false);if(!next)return;const invalid=videoFileError(next);setError(invalid??"");setFile(invalid?null:next);}
  async function upload(event:FormEvent){event.preventDefault();if(!file||!workspace?.patient)return;setBusy(true);setError("");setNotice("");
    try{await uploadPrivateVideo(file,workspace.patient.id,exerciseId,clinician?"demonstration":"performance",consent);setFile(null);setConsent(false);if(camera.current)camera.current.value="";if(picker.current)picker.current.value="";await load();setNotice(clinician?"Upload complete — not yet visible to your patient. Below, load and play the video, review the instructions, then select Approve for patient.":"Your video was shared with your treating clinician. It has not been automatically assessed.");}
    catch(cause){setError(cause instanceof Error?cause.message:"Video upload failed.");}finally{setBusy(false);}}
  async function withdraw(asset:ExerciseVideoAsset){setBusy(true);setError("");try{const {error}=await createSupabaseBrowserClient().rpc("withdraw_exercise_video",{p_id:asset.id});if(error)throw error;await load();setNotice("Video withdrawn. Previously opened playback links expire within one minute.");}catch{setError("Could not withdraw the video. Reconnect and try again.");}finally{setBusy(false);}}
  if(!workspace)return <div className="panel"><p>{error||"Loading private videos…"}</p><button className="secondary-button" onClick={()=>load().catch(()=>setError("Private videos are unavailable."))}>Retry</button></div>;
  if(!workspace.patient)return <p className="empty">No authorized care relationship is available.</p>;
  return <div className="form">
    <header className="patient-page-heading"><p className="eyebrow">Stage 2 · Video preview</p><h1>{clinician?"Personalized exercise videos":"Videos for your therapist"}</h1><p>{clinician?"Record a demonstration for this patient, or review a recording they chose to share.":"Sharing a recording is optional. Your treating clinician can review it during their usual working hours."}</p></header>
    <Link className="secondary-button" href={clinician?`/patients/${workspace.patient.id}`:"/patient/program"}>{clinician?"Back to patient":"Back to program"}</Link>
    {clinician?<Link className="secondary-button" href={`/program-builder/${workspace.patient.id}`}>View videos in program</Link>:null}
    <p className="muted">This preview does not automatically assess movement or change your care. {clinician?"Instructions are written and approved by you; AI drafting is not enabled yet.":"For time-sensitive concerns, contact your clinic directly."}</p>
    {workspace.programExercises.length?<form className="panel form" onSubmit={upload}>
      <h2>{clinician?"Add a demonstration":"Show my therapist"}</h2>
      <div className="field"><label htmlFor="video-exercise">Exercise</label><select id="video-exercise" value={exerciseId} onChange={e=>setExerciseId(e.target.value)} disabled={busy}>{workspace.programExercises.map(x=><option key={x.id} value={x.id}>{x.exercise?.name??"Assigned exercise"}</option>)}</select></div>
      <input ref={camera} hidden aria-label="Record video" type="file" accept="video/mp4,video/webm,video/quicktime" capture="environment" onChange={e=>choose(e.target.files?.[0]??null)}/>
      <input ref={picker} hidden aria-label="Choose video file" type="file" accept="video/mp4,video/webm,video/quicktime" onChange={e=>choose(e.target.files?.[0]??null)}/>
      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}><button type="button" className="secondary-button" disabled={busy} onClick={()=>camera.current?.click()}>Record a video</button><button type="button" className="secondary-button" disabled={busy} onClick={()=>picker.current?.click()}>Choose a video</button></div>
      <p className="muted">Short MP4, WebM or MOV clip, up to 25 MB. Your phone may open its camera or file picker. Keep this page open while uploading. MP4 is best for sharing across devices.</p>
      {file?<p role="status">Selected video · {(file.size/1024/1024).toFixed(1)} MB</p>:null}
      {!clinician?<label><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/> I choose to share this recording with my treating clinician. I have permission from anyone shown.</label>:null}
      <button className="button" disabled={busy||!file||!exerciseId||(!clinician&&!consent)}>{busy?"Uploading…":clinician?"Upload private draft":"Share video with my therapist"}</button>
    </form>:<p className="empty">An assigned exercise is needed before sharing a video.</p>}
    {error?<p role="alert" className="form-error">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
    <section className="form"><h2>{clinician?"Videos to review":"Your shared videos and demonstrations"}</h2>
      {!assets.length?<p>No videos yet.</p>:assets.map(a=><article className="panel form" key={a.id}>
        <p className="eyebrow">{a.kind==="performance"?"Patient recording":"Clinician demonstration"} · {a.state==="approved"?"Approved":a.state==="uploading"?"Incomplete upload":"Awaiting review"}</p>
        <h3>{a.title||workspace.programExercises.find(x=>x.id===a.program_exercise_id)?.exercise?.name||"Exercise video"}</h3>
        {a.state!=="uploading"?(clinician&&a.kind==="demonstration"&&a.state==="ready"?<DemonstrationApproval asset={a} exercise={workspace.programExercises.find(x=>x.id===a.program_exercise_id)} onSaved={async()=>{await load();setNotice("Approved — this video is now in the patient’s program. Use View videos in program to check it.");}}/>:<><PrivateVideoPlayer key={a.id} path={a.object_path} title={a.title||"Exercise recording"}/>{a.instructions?<p style={{whiteSpace:"pre-wrap"}}>{a.instructions}</p>:null}{a.cues?<p style={{whiteSpace:"pre-wrap"}}>Cues: {a.cues}</p>:null}</>):<p>Upload did not finish. Retry with the original file.</p>}
        {a.kind==="performance"?<p className="muted">No automated movement assessment. Your clinician must review the recording directly.</p>:null}
        {clinician||a.kind==="performance"?<button type="button" className="secondary-button" disabled={busy} onClick={()=>withdraw(a)}>Withdraw video</button>:null}
      </article>)}
    </section>
  </div>;
}
function DemonstrationApproval({asset,exercise,onSaved}:{asset:ExerciseVideoAsset;exercise?:HomeProgramExercise;onSaved:()=>Promise<void>}){
  const [title,setTitle]=useState(exercise?.exercise?.name??"");const [instructions,setInstructions]=useState(exercise?.exercise?.patient_instructions??"");const [cues,setCues]=useState(exercise?.notes??"");
  const [viewed,setViewed]=useState(false),[approved,setApproved]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function save(e:FormEvent){e.preventDefault();if(!viewed||!approved)return;setBusy(true);setError("");try{const {error}=await createSupabaseBrowserClient().rpc("approve_exercise_video",{p_id:asset.id,p_title:title,p_instructions:instructions,p_cues:cues});if(error)throw error;await onSaved();}catch{setError("Approval could not be saved. Check the fields, reload, and try again.");}finally{setBusy(false);}}
  return <form className="form" onSubmit={save}>
    <PrivateVideoPlayer key={asset.id} path={asset.object_path} title="Draft demonstration" onViewed={()=>setViewed(true)}/>
    <label className="field" htmlFor={`name-${asset.id}`}>Exercise name<input id={`name-${asset.id}`} required maxLength={200} value={title} onChange={e=>{setTitle(e.target.value);setApproved(false);}}/></label>
    <label className="field" htmlFor={`instructions-${asset.id}`}>Instructions<textarea aria-label="Instructions" id={`instructions-${asset.id}`} required maxLength={4000} value={instructions} onChange={e=>{setInstructions(e.target.value);setApproved(false);}}/></label>
    <label className="field" htmlFor={`cues-${asset.id}`}>Key cues<textarea aria-label="Key cues" id={`cues-${asset.id}`} maxLength={2000} value={cues} onChange={e=>{setCues(e.target.value);setApproved(false);}}/></label>
    <label><input type="checkbox" checked={approved} disabled={!viewed} onChange={e=>setApproved(e.target.checked)}/> I watched this video and approve these instructions for this patient.</label>
    <p className="muted">Approval replaces any previous personalized demonstration for this assigned exercise. It does not change prescribed dosage or the shared library.</p>
    <button className="button" disabled={busy||!viewed||!approved||!title.trim()||!instructions.trim()}>{busy?"Saving…":"Approve for patient"}</button>{error?<p role="alert">{error}</p>:null}
  </form>;
}
