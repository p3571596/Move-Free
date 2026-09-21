"use client";
import {useState} from "react";
import {ExerciseVideo} from "./ExerciseVideo";
import {parseExerciseVideo} from "@/lib/exercise-media";
export function ExerciseVideoField({initialUrl="",name="Exercise"}:{initialUrl?:string|null;name?:string}){
  const [url,setUrl]=useState(initialUrl??"");const [previewed,setPreviewed]=useState(false);const [approved,setApproved]=useState(false);
  return <section className="form" aria-label="Exercise demonstration settings">
    <div className="field"><label htmlFor="video-url">Video URL (optional)</label><input id="video-url" name="video_url" type="url" value={url} placeholder="https://www.youtube.com/watch?v=…" onChange={e=>{setUrl(e.target.value);setPreviewed(false);setApproved(false);}}/><p className="muted">Choose a YouTube or Vimeo demonstration you have reviewed. Changes to this library exercise also affect programs that use it.</p></div>
    {url && !parseExerciseVideo(url)?<p role="alert" className="form-error">Enter an HTTPS YouTube or Vimeo link to one video.</p>:null}
    {url?<><ExerciseVideo key={url} url={url} name={name} onPreview={()=>setPreviewed(true)}/><label><input type="checkbox" checked={approved} disabled={!previewed} onChange={e=>setApproved(e.target.checked)}/> I previewed this demonstration and approve it for this exercise.</label><button type="button" className="secondary-button" onClick={()=>{setUrl("");setApproved(false);setPreviewed(false);}}>Remove video</button></>:<p className="muted">No video selected. Instructions remain available without a video.</p>}
    <input type="hidden" name="video_approved" value={approved?"yes":""}/>
  </section>;
}
