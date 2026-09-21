"use client";
import {useState} from "react";
import {parseExerciseVideo} from "@/lib/exercise-media";
export function ExerciseVideo({url,name="Exercise",onPreview}:{url?:string|null;name?:string;onPreview?:()=>void}){
  const [loadedUrl,setLoadedUrl]=useState<string|null>(null);
  if(!url?.trim())return null;
  const media=parseExerciseVideo(url);
  if(!media)return <p className="muted">This demonstration link cannot be played here. Ask your therapist to check it.</p>;
  return <div className="exercise-video">
    {loadedUrl===media.embedUrl?<iframe src={media.embedUrl} title={`${name} video demonstration`} allow="encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>:<button className="secondary-button video-load" type="button" onClick={()=>{setLoadedUrl(media.embedUrl);onPreview?.();}}>Load video demonstration</button>}
    <p className="muted">Video provided through {media.provider==='youtube'?'YouTube':'Vimeo'}. Follow your therapist’s prescription and cues below.</p>
    <a href={media.url} target="_blank" rel="noopener noreferrer">Video not playing? Open on {media.provider==='youtube'?'YouTube':'Vimeo'}</a>
  </div>;
}
