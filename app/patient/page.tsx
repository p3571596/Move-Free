"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, HeartPulse, TrendingUp } from "lucide-react";
import { PatientShell } from "@/components/PatientShell";
import { RoleGate } from "@/components/RoleGate";
import { GoalProgress } from "@/components/GoalProgress";
import { RequireAuth } from "@/components/RequireAuth";
import { loadCurrentPatientAppWorkspace } from "@/lib/data";
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

    const supabase = createSupabaseBrowserClient();
    loadCurrentPatientAppWorkspace(supabase)
      .then(setWorkspace)
      .catch((cause) => setLoadError(cause instanceof Error ? cause.message : "Could not load your patient app."));
  }, []);

  const patientName = workspace?.patient?.display_name ?? workspace?.patient?.full_name;
  const primaryGoal = workspace?.goals[0];
  const goalProgress = primaryGoal?.progress_percent ?? workspace?.patient?.progress_percent ?? 0;

  return (
    <PatientShell>
      <RequireAuth><RoleGate allowed={["patient"]}>
        <div className="mobile-frame">
          <div className="topbar">
            <div>
              <p className="eyebrow">Patient app</p>
              <h2>{patientName ? `Welcome, ${patientName}` : "No patient selected"}</h2>
              <p className="muted">{workspace?.program?.title ?? "Your movement journey"}</p>
            </div>
          </div>
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
              <section className="patient-goal-hero">
                <div>
                  <p className="eyebrow">Current goal</p>
                  <h1>{primaryGoal?.title ?? workspace.patient.goal ?? "Your clinician is preparing your goal"}</h1>
                  <p className="muted">{workspace.patient.current_focus ?? workspace.episode?.clinical_summary ?? "Keep moving toward what matters to you."}</p>
                </div>
                <div className="patient-goal-score" aria-label={`${goalProgress}% goal progress`}>
                  <strong>{goalProgress}%</strong>
                  <span>progress</span>
                </div>
              </section>
              <section className="grid">
                <Link className="card row-between" href="/patient/program">
                  <span>
                    <strong>Start Today&apos;s Program</strong>
                    <p className="muted">{workspace.programExercises.length} exercises ready</p>
                  </span>
                  <Activity color="var(--accent)" />
                </Link>
                <Link className="card row-between" href="/patient/pain-pattern">
                  <span>
                    <strong>Add Today&apos;s Check-in</strong>
                    <p className="muted">Record pain, symptom change, confidence, and a note</p>
                  </span>
                  <HeartPulse color="var(--coral)" />
                </Link>
                <Link className="card row-between" href="/patient/progress">
                  <span>
                    <strong>Progress</strong>
                    <p className="muted">Review goals and trends</p>
                  </span>
                  <TrendingUp color="var(--blue)" />
                </Link>
              </section>
              {workspace.program?.patient_explanation || workspace.episode?.clinical_summary ? (
                <section className="panel patient-reminder">
                  <p className="eyebrow">From your therapist</p>
                  <p>{workspace.program?.patient_explanation ?? workspace.episode?.clinical_summary}</p>
                </section>
              ) : null}
              <div style={{ marginTop: 18 }}>
                <GoalProgress goals={workspace.goals} />
              </div>
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
