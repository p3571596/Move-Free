"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";

export default function RecoverPage() {
  const initialized=useRef(false);
  const [token,setToken]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [confirmation,setConfirmation]=useState("");
  const [status,setStatus]=useState("");
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  useEffect(()=>{
    if(initialized.current)return;
    initialized.current=true;
    const value=new URLSearchParams(window.location.hash.slice(1)).get("token")??"";
    setToken(value);window.history.replaceState(null,"",window.location.pathname);
    if(!/^[a-f0-9]{64}$/.test(value))setStatus("This reset link is incomplete. Ask your clinician for a new link.");
  },[]);
  async function submit(event:FormEvent) {
    event.preventDefault();if(busy || done)return;
    if(password!==confirmation){setStatus("The passwords do not match.");return;}
    setBusy(true);setStatus("");
    try {
      const response=await fetch("/api/patient-invitations/password-reset",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"reset",token,email:email.trim(),password})});
      const data=await response.json();
      if(!response.ok || !data.updated)throw new Error(data.error??"Password reset unavailable.");
      setDone(true);setToken("");setPassword("");setConfirmation("");
      setStatus("Password updated. If you have a patient invitation, reopen it and continue with this email and your new password. Otherwise, go to sign in.");
    }catch(cause){setStatus(cause instanceof Error?cause.message:"Reset unavailable. Ask your clinician for help.");}
    finally{setBusy(false);}
  }
  return <main className="auth-page"><section className="auth-panel">
    <p className="eyebrow">Move Free account recovery</p><h2>Choose a new password</h2>
    <p className="muted">This private-pilot link was issued by your clinician. No email code or old password is needed. Keep it private; it expires after 30 minutes and works once.</p>
    {!done?<form className="form" onSubmit={submit}>
      <label className="field"><span>Account email</span><input type="email" autoComplete="email" autoCapitalize="none" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <label className="field"><span>New password</span><input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>
      <label className="field"><span>Confirm password</span><input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>
      <button className="button" disabled={busy || token.length!==64}>{busy?"Updating...":"Update password"}</button>
    </form>:null}
    {status?<p role="status" className="muted">{status}</p>:null}
    <Link href="/login">Go to sign in</Link>
  </section></main>;
}
