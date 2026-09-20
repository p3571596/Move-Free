"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RoleGate } from "@/components/RoleGate";
import { loadClinicianSnapshot } from "@/lib/data";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import type { ClinicianSnapshot } from "@/lib/types";

export function ClinicalConnections({ mode }: { mode: "messages" | "team" | "analytics" }) {
  const [data, setData] = useState<ClinicianSnapshot | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { loadClinicianSnapshot(createSupabaseBrowserClient()).then(setData).catch(() => setError("Could not load your authorized patients. Please try again.")); }, []);
  const title = mode === "messages" ? "Messages" : mode === "team" ? "Care Team" : "Analytics";
  return <AppShell><RequireAuth><RoleGate allowed={["clinician", "admin"]}>
    <header className="topbar"><div><p className="eyebrow">Your care relationships</p><h2>{title}</h2><p className="muted">{mode === "messages" ? "Review patient comments in context and publish guidance with their current program." : mode === "team" ? "Patients assigned to you as their treating clinician. Patient information requires an authorized care relationship." : "Clinical outcomes and progress for your own patients."}</p></div></header>
    {mode === "team" ? <div className="panel"><strong>Additional clinicians · Preview</strong><p>Adding, transferring, or revoking additional care-team members is not available yet. This pilot uses the existing treating-clinician assignment.</p></div> : null}
    {mode === "messages" ? <div className="panel"><strong>Program-linked communication</strong><p>Patient check-in comments and clinician-approved program guidance are available now. Open a conversation to view message history and storage availability. Delivery receipts and push notifications are not available yet.</p></div> : null}
    {mode === "analytics" && data?.profile?.role === "admin" ? <Link className="button" href="/analytics/pilot">Open founder pilot analytics</Link> : null}
    {error ? <p role="alert" className="form-error">{error}</p> : null}
    {!data && !error ? <p>Loading…</p> : null}
    <div className="grid" style={{ marginTop: 20 }}>{data?.patients.map(patient => {
      const checkin = data.recentCheckins.find(row => row.patient_id === patient.id && row.patient_comment?.trim());
      const log = data.adherenceLogs.find(row => row.patient_id === patient.id && row.notes?.trim());
      return <section className="panel" key={patient.id}><h3>{patient.display_name ?? patient.full_name ?? "Patient"}</h3>
        {mode === "team" ? <p>Treating clinician: {data.profile?.full_name ?? "You"} · {patient.patient_profile_id ? "Patient account linked" : "Invitation not yet linked"}</p> : null}
        {mode === "messages" ? <><p>{checkin?.patient_comment ?? log?.notes ?? "No patient comments yet."}</p><Link className="secondary-button" href={`/patients/${patient.id}`}>Review feedback</Link> <Link className="button" href={`/messages/${patient.id}`}>Open conversation</Link></> : <Link className="secondary-button" href={`/patients/${patient.id}${mode === "analytics" ? "/progress" : ""}`}>{mode === "analytics" ? "View clinical outcomes" : "Open patient workspace"}</Link>}
      </section>;
    })}</div>
    {data && !data.patients.length ? <p className="empty">No patients assigned to you yet.</p> : null}
  </RoleGate></RequireAuth></AppShell>;
}
