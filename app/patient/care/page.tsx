"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PatientShell } from "@/components/PatientShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RoleGate } from "@/components/RoleGate";
import { loadCurrentPatientAppWorkspace } from "@/lib/data";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import type { PatientWorkspace } from "@/lib/types";

export default function PatientCarePage() {
  const [workspace, setWorkspace] = useState<PatientWorkspace | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = () => { if (document.visibilityState !== "visible") return; loadCurrentPatientAppWorkspace(createSupabaseBrowserClient()).then(value => { if (active) { setWorkspace(value); setError(""); } }).catch(() => { if (active) setError("We could not refresh your care update. Please reconnect and try again."); }); };
    load(); const timer = setInterval(load, 30000);
    window.addEventListener("focus", load); document.addEventListener("visibilitychange", load);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", load); document.removeEventListener("visibilitychange", load); };
  }, []);
  return <PatientShell><RequireAuth><RoleGate allowed={["patient"]}><div className="patient-screen">
    <header className="patient-page-heading"><p className="eyebrow">Care</p><h1>Between visits, stay connected.</h1><p>Your therapist reviews updates during their usual working hours. This app is not monitored continuously.</p></header>
    {error ? <p role="alert" className="form-error">{error}</p> : null}
    <section className="panel"><h2>From your therapist</h2><p>{workspace?.program?.patient_explanation ?? "Your therapist’s guidance will appear here when they share it with your program."}</p>{workspace?.program?.updated_at ? <small>Program last updated {new Date(workspace.program.updated_at).toLocaleString()}</small> : null}<p><Link href="/patient/program">See your current program</Link></p></section>
    <section className="panel"><h2>Your care team</h2><p>{workspace?.patient?.clinician_id ? "Your assigned treating clinician is connected to your care." : "Your care relationship has not been linked yet."}</p><p>Additional care-team member details are not available in this pilot.</p></section>
    <section className="panel"><h2>Share an update</h2><p>Tell your therapist what is changing or what feels difficult.</p><Link className="button" href="/patient/pain-pattern">Send a check-in</Link><p>For time-sensitive concerns, contact your clinic directly. For an emergency, contact local emergency services.</p></section>
    <p className="muted">Appointments, live chat, video visits, and push notifications are future features.</p>
  </div></RoleGate></RequireAuth></PatientShell>;
}
