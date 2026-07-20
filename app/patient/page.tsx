"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ChevronRight, HeartPulse, MessageSquareText, TrendingUp } from "lucide-react";
import { PatientShell } from "@/components/PatientShell";
import { RoleGate } from "@/components/RoleGate";
import { RequireAuth } from "@/components/RequireAuth";
import { loadCurrentPatientAppWorkspace } from "@/lib/data";
import { summarizePatientActivity } from "@/lib/pilot-insights";
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
  const summary = workspace ? summarizePatientActivity(workspace.checkins, workspace.adherenceLogs) : null;
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
              <section className="patient-goal-hero">
                <div>
                  <p className="eyebrow">Current goal</p>
                  <h1>{primaryGoal?.title ?? workspace.patient.goal ?? "Your clinician is preparing your goal"}</h1>
                  <p className="muted">{workspace.patient.current_focus ?? "Keep moving toward what matters to you."}</p>
                </div>
                <div className="patient-goal-score" aria-label={`${goalProgress}% goal progress`}>
                  <strong>{goalProgress}%</strong>
                  <span>progress</span>
                </div>
              </section>
              <Link className="patient-primary-action" href="/patient/program">
                <span className="patient-action-icon"><Activity size={22}/></span>
                <span><small>Today&apos;s program</small><strong>{workspace.program?.title ?? "Your movement plan"}</strong><em>{workspace.programExercises.length} {workspace.programExercises.length === 1 ? "exercise" : "exercises"} ready</em></span>
                <ChevronRight size={22}/>
              </Link>

              {workspace.programExercises.length ? (
                <section className="patient-section">
                  <div className="patient-section-heading"><div><p className="eyebrow">Your exercises</p><h2>Today&apos;s plan</h2></div><Link href="/patient/program">View all</Link></div>
                  <div className="patient-exercise-preview-list">
                    {workspace.programExercises.slice(0, 3).map((item, index) => (
                      <Link href="/patient/program" className="patient-exercise-preview" key={item.id}>
                        <span>{index + 1}</span>
                        <span><strong>{item.exercise?.name ?? "Exercise"}</strong><small>{formatDosage(item)}</small></span>
                        <ChevronRight size={18}/>
                      </Link>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="patient-quick-actions" aria-label="Patient actions">
                <Link href="/patient/pain-pattern"><HeartPulse size={21}/><span><strong>Daily check-in</strong><small>Share pain and a note</small></span><ChevronRight size={18}/></Link>
                <Link href="/patient/progress"><TrendingUp size={21}/><span><strong>My progress</strong><small>{summary?.completedSessions ?? 0} recent sessions</small></span><ChevronRight size={18}/></Link>
              </section>
              {workspace.program?.patient_explanation ? (
                <section className="patient-feedback-card">
                  <span className="patient-action-icon"><MessageSquareText size={21}/></span>
                  <div><p className="eyebrow">From your therapist</p>
                  <p>{workspace.program.patient_explanation}</p>
                  </div>
                </section>
              ) : null}
              {summary?.comments.length ? <section className="patient-section"><div className="patient-section-heading"><div><p className="eyebrow">Your notes</p><h2>Recently shared</h2></div></div><div className="patient-recent-note"><p>“{summary.comments[0].text}”</p><small>Your therapist can see this note.</small></div></section> : null}
            </>
          ) : null}
        </div>
      </RoleGate></RequireAuth>
    </PatientShell>
  );
}

function formatDosage(item: PatientWorkspace["programExercises"][number]) {
  return [item.dosage_sets ? `${item.dosage_sets} sets` : null, item.dosage_reps ? `${item.dosage_reps} reps` : null, item.frequency].filter(Boolean).join(" · ") || "Follow your therapist’s instructions";
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
