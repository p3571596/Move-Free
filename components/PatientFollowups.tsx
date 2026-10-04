"use client";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import type { PatientFollowup } from "@/lib/types";

const questions: Record<string,{label:string; options:[string,string][]}> = {
 barrier:{label:"Would anything help you get back to your program?",options:[["time","Finding time"],["symptoms","Symptoms are getting in the way"],["instructions","Clearer instructions"],["help","I would like my therapist’s help"],["offline","I have been exercising without logging"],["other","Something else"]]},
 symptoms:{label:"Compared with your last check-in, how are your symptoms?",options:[["improving","Better"],["unchanged","About the same"],["worsening","Worse"],["unsure","Not sure"]]},
 function:{label:"How is the daily activity you are working toward?",options:[["improving","Getting easier"],["stable","About the same"],["worsening","Getting harder"],["unsure","Not sure / have not tried"]]},
};
export function PatientFollowups({items,onAnswered}:{items:PatientFollowup[];onAnswered:()=>void}) {
 return <>{items.filter(f=>f.status==='pending').slice(0,1).map(f=><Followup key={f.id} item={f} onAnswered={onAnswered}/>)}</>;
}
function Followup({item,onAnswered}:{item:PatientFollowup;onAnswered:()=>void}) {
 const [answers,setAnswers]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 if(saved) return <p role="status" className="success-banner">Your check-in is saved. Thank you.</p>;
 return <section className="panel form"><p className="eyebrow">A quick check-in</p><h3>{item.kind==='inactivity'?'Ready when you are':'Help us understand how you are doing'}</h3>
 <p>{item.kind==='inactivity'?'We have not seen a program update for a few days. It is okay if life got in the way.':'A little feedback can help your therapist review your plan.'}</p>
 <form className="form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try {const {error}=await createSupabaseBrowserClient().rpc('answer_patient_followup',{p_id:item.id,p_answers:answers});if(error)throw error;setSaved(true);onAnswered();}catch{setError('Could not save your check-in. Please reconnect and try again.');}finally{setBusy(false);}}}>
 <fieldset disabled={busy} style={{border:0,padding:0}}>{item.questions.map(key=>questions[key]?<div className="field" key={key}><label htmlFor={`${item.id}-${key}`}>{questions[key].label}</label><select required id={`${item.id}-${key}`} value={answers[key]??''} onChange={e=>setAnswers({...answers,[key]:e.target.value})}><option value="">Choose an answer</option>{questions[key].options.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>:null)}
 <div className="field"><label htmlFor={`${item.id}-comment`}>Anything else? (optional)</label><textarea id={`${item.id}-comment`} maxLength={2000} value={answers.comment??''} onChange={e=>setAnswers({...answers,comment:e.target.value})}/></div><button className="button" disabled={busy}>{busy?'Saving…':'Save check-in'}</button></fieldset>
 <p className="muted">Your therapist reviews updates during their usual working hours. This is not monitored continuously.</p>{error?<p role="alert">{error}</p>:null}</form></section>;
}
