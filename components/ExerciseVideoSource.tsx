"use client";
import {useState} from 'react';
import {ExerciseVideoField} from './ExerciseVideoField';
import {ProgramExerciseRecording} from './ProgramExerciseRecording';
import {GeneratedExerciseVideo} from './GeneratedExerciseVideo';
import type {HomeProgramExercise} from '@/lib/types';
import type {AIExerciseContent} from '@/lib/ai-exercise-content';
export function ExerciseVideoSource({item,patientId,personalizedEnabled,generationEnabled,onDraftApplied,onChanged}:{item:HomeProgramExercise;patientId:string;personalizedEnabled:boolean;generationEnabled:boolean;onDraftApplied:(draft:AIExerciseContent,replacePrescription?:boolean)=>void;onChanged:()=>void}) {
 const [source,setSource]=useState('existing');
 return <section className="form" aria-label="Choose Video Source">
  {personalizedEnabled||generationEnabled?<label className="field">Choose Video Source<select value={source} onChange={e=>setSource(e.target.value)}><option value="existing">Select an existing exercise video</option>{personalizedEnabled?<option value="own">Record or upload my own demonstration</option>:null}{generationEnabled?<option value="ai">Generate an exercise demonstration using AI</option>:null}</select></label>:null}
  <div hidden={source!=='existing'}><ExerciseVideoField initialUrl={item.exercise?.video_url} name={item.exercise?.name??'Exercise'} inputId={`video-url-${item.id}`} scope="patient" fieldName={`video-${item.id}`} approvalName={`video-approved-${item.id}`}/></div>
  {personalizedEnabled?<div hidden={source!=='own'}><ProgramExerciseRecording item={item} patientId={patientId} onDraftApplied={onDraftApplied} onChanged={onChanged}/></div>:null}
  {generationEnabled&&source==='ai'?<GeneratedExerciseVideo item={item} patientId={patientId} onApply={content=>onDraftApplied(content,true)} onChanged={onChanged}/>:null}
 </section>;
}
