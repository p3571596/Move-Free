"use client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {loadCurrentPatientAppWorkspace,loadPatientWorkspace} from "@/lib/data";
import {createSupabaseBrowserClient} from "@/lib/supabase";
import type {PatientWorkspace, CareMessage} from "@/lib/types";

export function CareConversation({patientId}: {patientId?: string}) {
  const [workspace,setWorkspace]=useState<PatientWorkspace|null>(null);
  const [messages,setMessages]=useState<CareMessage[]>([]);
  const [available,setAvailable]=useState(false);
  const [body,setBody]=useState("");const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      if(document.visibilityState!=="visible")return;
      try{
        const db=createSupabaseBrowserClient();const data=patientId?await loadPatientWorkspace(db,patientId):await loadCurrentPatientAppWorkspace(db);
        if(!active)return;setWorkspace(data);
        if(!data.patient)return;
        const result=await db.from("care_messages").select("*").eq("patient_id",data.patient.id).order("created_at",{ascending:false}).limit(100);
        if(active){setAvailable(!result.error);if(!result.error)setMessages(result.data??[]);setError("");}
      }catch{if(active)setError("Could not refresh messages. Reconnect and try again.");}
    };
    load();const timer=setInterval(load,15000);window.addEventListener("focus",load);document.addEventListener("visibilitychange",load);
    return()=>{active=false;clearInterval(timer);window.removeEventListener("focus",load);document.removeEventListener("visibilitychange",load);};
  },[patientId]);
  async function send(event:FormEvent){
    event.preventDefault();if(!workspace?.patient || !available || !body.trim())return;
    setBusy(true);setError("");setNotice("");
    try{
      const db=createSupabaseBrowserClient();const {data:{user}}=await db.auth.getUser();if(!user)throw new Error("Please sign in again.");
      const {data,error}=await db.from("care_messages").insert({id:crypto.randomUUID(),patient_id:workspace.patient.id,author_id:user.id,body:body.trim(),program_id:workspace.program?.id??null,kind:patientId?"clinician_message":"patient_message"}).select("*").single();
      if(error)throw new Error(error.message);setMessages(current=>[data,...current]);setBody("");setNotice("Message saved.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Message could not be sent.");}finally{setBusy(false);}
  }
  if(!workspace)return <p className="empty">{error||"Loading your conversation…"}</p>;
  if(!workspace.patient)return <p className="empty">No authorized care relationship is available for this account.</p>;
  const history=[...messages.map(m=>({id:m.id,text:m.body,time:m.created_at,label:m.kind==='patient_message'?'Patient message':m.kind==='approved_guidance'?'Therapist-approved guidance':'Therapist message'})),...workspace.checkins.filter(c=>c.patient_comment).map(c=>({id:c.id,text:c.patient_comment!,time:c.created_at??c.checkin_date??'',label:'Patient check-in'}))].sort((a,b)=>b.time.localeCompare(a.time));
  return <div className="form">
    <header className="patient-page-heading"><p className="eyebrow">Messages</p><h1>{patientId?workspace.patient.display_name:"Your conversation with your therapist"}</h1><p>Updates about your program and how you’re doing. Your therapist reviews messages during their usual working hours; this is not monitored continuously.</p></header>
    {workspace.program?<section className="panel"><p className="eyebrow">Current program · {workspace.program.title??workspace.program.name}</p>{workspace.program.patient_explanation?<p>{workspace.program.patient_explanation}</p>:<p>No current therapist guidance has been shared.</p>}<Link href={patientId?`/patients/${patientId}`:"/patient/program"}>{patientId?"Open clinical workspace":"See your program"}</Link></section>:null}
    {!available?<p className="empty">Conversation replies · Preview. Message storage is not enabled in this environment yet. Your saved check-in comments and current program guidance remain available below.</p>:<form className="panel form" onSubmit={send}>
      <div className="field"><label htmlFor="care-message">{patientId?"Write a message to your patient":"Share an update or question"}</label><textarea id="care-message" required maxLength={4000} value={body} onChange={e=>setBody(e.target.value)}/></div>
      {patientId?<p className="muted">Send only guidance you have reviewed and approved. Engine output is never inserted here automatically.</p>:null}
      <button className="button" disabled={busy||!body.trim()}>{busy?"Sending…":"Send message"}</button>
    </form>}
    {notice?<p role="status">{notice}</p>:null}{error?<p role="alert" className="form-error">{error}</p>:null}
    <section className="panel"><h2>Conversation history</h2>{history.length?history.map(item=><article key={item.id} style={{padding:"16px 0",borderBottom:"1px solid var(--line)"}}><strong>{item.label}</strong><p style={{whiteSpace:"pre-wrap"}}>{item.text}</p><small>{new Date(item.time).toLocaleString()}</small></article>):<p>No messages yet.</p>}<p className="muted">Showing up to 100 messages and the latest 30 check-ins. Earlier program guidance shared before message history was enabled is not available here.</p></section>
    <p className="muted">For time-sensitive concerns, contact your clinic directly. For an emergency, contact local emergency services.</p>
  </div>;
}
