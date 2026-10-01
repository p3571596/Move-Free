"use client";
import {useEffect,useState} from "react";
import {createSupabaseBrowserClient} from "@/lib/supabase";
import type {ExerciseVideoAsset,HomeProgramExercise} from "@/lib/types";
import {ExerciseVideo} from "./ExerciseVideo";
import {PrivateVideoPlayer} from "./PrivateVideoPlayer";

export function AssignedExerciseVideo({item}:{item:HomeProgramExercise}) {
  const [asset,setAsset]=useState<ExerciseVideoAsset|null>(null);
  const [loaded,setLoaded]=useState(false);
  const [error,setError]=useState(false);
  useEffect(()=>{
    let active=true;
    const refresh=()=>{if(document.visibilityState==="hidden")return;
    createSupabaseBrowserClient().from("exercise_video_assets").select("*").eq("program_exercise_id",item.id).eq("kind","demonstration").eq("state","approved").maybeSingle().then(({data,error})=>{
      if(active){setAsset(data);setError(Boolean(error));setLoaded(true);}
    });};
    refresh();
    const timer=setInterval(refresh,15000);
    window.addEventListener("focus",refresh);
    document.addEventListener("visibilitychange",refresh);
    return()=>{active=false;clearInterval(timer);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh);};
  },[item.id]);
  if(!loaded)return <p role="status">Loading exercise demonstration…</p>;
  if(error)return <p role="alert">Your demonstration could not be loaded. Reconnect and reload this page before starting.</p>;
  if(asset)return <section className="form"><p className="eyebrow">Your therapist’s approved demonstration</p><h5>{asset.title}</h5><PrivateVideoPlayer key={asset.id} path={asset.object_path} title={asset.title}/><p style={{whiteSpace:"pre-wrap"}}>{asset.instructions}</p>{asset.cues?<p style={{whiteSpace:"pre-wrap"}}><strong>Key cues:</strong> {asset.cues}</p>:null}</section>;
  return <><ExerciseVideo url={item.exercise?.video_url} name={item.exercise?.name??"Exercise"}/>{item.exercise?.patient_instructions?<p>{item.exercise.patient_instructions}</p>:null}{item.notes?<p className="therapist-note"><strong>Key cues:</strong> {item.notes}</p>:null}</>;
}
