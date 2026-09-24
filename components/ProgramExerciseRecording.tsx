"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {createSupabaseBrowserClient} from "@/lib/supabase";
import type {ExerciseVideoAsset,HomeProgramExercise} from "@/lib/types";
import {PrivateVideoPlayer} from "./PrivateVideoPlayer";

export function ProgramExerciseRecording({item,patientId}:{item:HomeProgramExercise;patientId:string}) {
  const [assets,setAssets]=useState<ExerciseVideoAsset[]>([]);
  const [error,setError]=useState(false);
  const [loaded,setLoaded]=useState(false);
  useEffect(()=>{
    let active=true;
    if(item.id.startsWith("draft-"))return;
    createSupabaseBrowserClient().from("exercise_video_assets").select("*").eq("program_exercise_id",item.id).eq("kind","demonstration").in("state",["ready","approved"]).order("created_at",{ascending:false}).then(({data,error})=>{
      if(active){setAssets(data??[]);setError(Boolean(error));setLoaded(true);}
    });
    return()=>{active=false;};
  },[item.id]);
  if(item.id.startsWith("draft-"))return <p className="muted">Save this exercise first, then record its personalized video.</p>;
  return <section className="form" aria-label="Personalized recording">
    <strong>Personalized recording</strong>
    {!loaded?<p>Loading recordings…</p>:error?<p role="alert">Recordings could not be loaded. Reload this page to try again.</p>:!assets.length?<p>No personalized recording yet.</p>:assets.map(a=><div className="form" key={a.id}>
      <p>{a.state==="approved"?"Approved · visible in the patient’s program":"Draft · awaiting your approval before the patient can see it"}</p>
      <PrivateVideoPlayer path={a.object_path} title={a.title||item.exercise?.name||"Recorded demonstration"}/>
      {a.state==="approved"?<><p style={{whiteSpace:"pre-wrap"}}>{a.instructions}</p>{a.cues?<p>Key cues: {a.cues}</p>:null}</>:null}
    </div>)}
    <Link href={`/patients/${patientId}/videos`} className="secondary-button">Record or review personalized video</Link>
  </section>;
}
