"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ChevronRight, MessageSquareText } from "lucide-react";
import { PatientShell } from "@/components/PatientShell";
import { RoleGate } from "@/components/RoleGate";
import { RequireAuth } from "@/components/RequireAuth";
import { loadCurrentPatientAppWorkspace } from "@/lib/data";
import { PatientGoalSummary } from "@/components/PatientGoalSummary";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { PatientWorkspace } from "@/lib/types";

export default function PatientAppHomePage() {
  const [workspace, setWorkspace] = useState<PatientWorkspace | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setWorkspace(emptyPatientAppWorkspace());
      return;
    }

    let active = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      loadCurrentPatientAppWorkspace(createSupabaseBrowserClient())
        .then(value => { if (active) { setWorkspace(value); setLoadError(""); } })
        .catch(() => { if (active) setLoadError("Could not refresh your plan. Reconnect to see the latest update."); });
    };
    load(); const timer = setInterval(load, 30000);
    window.addEventListener("focus", load); document.addEventListener("visibilitychange", load);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", load); document.removeEventListener("visibilitychange", load); };
  }, []);

  const patientName = workspace?.patient?.display_name ?? workspace?.patient?.full_name;
  const firstName = patientName?.trim().split(/\s+/)[0];

  return (
    <PatientShell>
      <RequireAuth><RoleGate allowed={["patient"]}>
        <div className="patient-screen">
          <header className="patient-page-heading">
            <p className="eyebrow">Today</p>
            <h1>{firstName ? `Hi, ${firstName}` : "Your movement plan"}</h1>
            <p>Here is what matters for you today.</p>
          </header>
          {!workspace && !loadError ? <div className="empty">Loading patient app...</div> : null}
          {loadError ? <div className="empty form-error" role="alert">{loadError}</div> : null}
          {workspace && !workspace.patient ? (
            <div className="empty">
              <strong>No patient found.</strong>
              <p>This login is not linked to a patient record. Ask your clinician to send or complete your patient invitation.</p>
            </div>
          ) : null}
          {workspace?.patient ? (
            <>
              {workspace.program?.patient_explanation ? <section className="patient-feedback-card"><MessageSquareText size={21}/><div><p className="eyebrow">From your therapist</p><p>{workspace.program.patient_explanation}</p><Link href="/patient/messages">View messages</Link></div></section> : null}
              <PatientGoalSummary workspace={workspace}/>
              <Link className="patient-primary-action" href="/patient/program">
                <span className="patient-action-icon"><Activity size={22}/></span>
                <span><small>Start Program</small><strong>{workspace.program?.title ?? "Your movement plan"}</strong><em>{workspace.programExercises.length} {workspace.programExercises.length === 1 ? "exercise" : "exercises"} ready</em></span>
                <ChevronRight size={22}/>
              </Link>


            </>
          ) : null}
        </div>
      </RoleGate></RequireAuth>
    </PatientShell>
  );
}

function emptyPatientAppWorkspace(): PatientWorkspace {
  return {
    patient: null,
    episode: null,
    goals: [],
    checkins: [],
    progressMetrics: [],
    decision: null,
    visitNote: null,
    barriers: [],
    program: null,
    programExercises: [],
    adherenceLogs: [],
  };
}
