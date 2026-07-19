"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { GoalProgress } from "@/components/GoalProgress";
import { MetricCard } from "@/components/MetricCard";
import { ProgressBars } from "@/components/ProgressBars";
import { RequireAuth } from "@/components/RequireAuth";
import { PatientInviteButton } from "@/components/PatientInviteButton";
import { emptyWorkspace, loadPatientWorkspace } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { PatientWorkspace } from "@/lib/types";

export function PatientWorkspaceClient({ patientId }: { patientId: string }) {
  const searchParams = useSearchParams();
  const [workspace, setWorkspace] = useState<PatientWorkspace | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setStatus("Connect Supabase to load patient workspaces.");
      setWorkspace(emptyWorkspace());
      return;
    }

    const supabase = createSupabaseBrowserClient();
    loadPatientWorkspace(supabase, patientId)
      .then((loadedWorkspace) => {
        setWorkspace(loadedWorkspace);
        setStatus(loadedWorkspace.patient ? "" : "Patient not found for the current clinician.");
      })
      .catch(() => {
        setWorkspace(emptyWorkspace());
        setStatus("Patient workspace could not be loaded.");
      });
  }, [patientId]);

  if (!workspace) {
    return (
      <AppShell>
        <RequireAuth>
          <div className="empty">Loading patient workspace...</div>
        </RequireAuth>
      </AppShell>
    );
  }

  if (!workspace.patient) {
    return (
      <AppShell>
        <RequireAuth>
          <div className="topbar">
            <div>
              <p className="eyebrow">Patient workspace</p>
              <h2>Select a patient first</h2>
              <p className="muted">{status || "Open a real patient before reviewing the workspace."}</p>
            </div>
            <Link className="button" href="/patients/new">Add Patient</Link>
          </div>
          <div className="empty">
            <strong>No patient workspace is open.</strong>
            <p>Return to the dashboard and choose a patient card, or create a new patient.</p>
            <Link className="secondary-button" href="/dashboard" style={{ marginTop: 14 }}>
              Back to Dashboard
            </Link>
          </div>
        </RequireAuth>
      </AppShell>
    );
  }

  const patientName = workspace.patient.display_name ?? workspace.patient.full_name ?? "Patient context";
  const latestCheckin = workspace.checkins[0];
  const latestMetric = workspace.progressMetrics.at(-1);
  const episodeLabel = [
    workspace.episode?.title,
    workspace.episode?.body_region,
    workspace.episode?.status,
  ].filter(Boolean).join(" · ") || workspace.patient.primary_complaint || "Active care";
  const programTitle = workspace.program?.name ?? workspace.program?.title ?? "Current program";
  const assignedDate = workspace.program?.assigned_at ?? workspace.program?.start_date;

  return (
    <AppShell>
      <RequireAuth>
        {searchParams.get("programSaved") === "1" ? (
          <div className="success-banner" role="status">
            Program saved. {searchParams.get("librarySaved") ?? "All"} exercise{searchParams.get("librarySaved") === "1" ? "" : "s"} saved in Exercise Studio.
          </div>
        ) : null}
        <div className="topbar">
          <div>
            <p className="eyebrow">Patient workspace</p>
            <h2>{patientName}</h2>
            <p className="muted">{episodeLabel}</p>
          </div>
          <div className="builder-actions">
            <PatientInviteButton patientId={workspace.patient.id} isLinked={Boolean(workspace.patient.patient_profile_id)} />
            <Link className="secondary-button" href={`/patients/${workspace.patient.id}/preview`} aria-label={`Preview the patient app for ${patientName}`}>Preview Patient App</Link>
            <Link className="secondary-button" href={`/patients/${workspace.patient.id}/edit`} aria-label={`Edit profile for ${patientName}`}>Edit Profile</Link>
            <Link className="button" href={`/program-builder/${workspace.patient.id}`} aria-label={`Update program for ${patientName}`}>Update Program</Link>
          </div>
        </div>
        <div className="grid three">
          <Link className="workspace-link-card" href={`/patients/${workspace.patient.id}/logs`} aria-label={`Open logs for ${patientName}`}>
            <MetricCard label="Pain today" value={latestCheckin?.pain_score ?? "n/a"} detail={latestCheckin?.notes ?? "No daily check-in note"} />
          </Link>
          <Link className="workspace-link-card" href={`/patients/${workspace.patient.id}/progress`} aria-label={`Open progress for ${patientName}`}>
            <MetricCard label="Progress signal" value={latestMetric?.value ?? "n/a"} detail={`${latestMetric?.metric_name ?? "No metric"} ${latestMetric?.unit ?? ""}`} />
          </Link>
          <Link className="workspace-link-card" href={`/program-builder/${workspace.patient.id}`} aria-label={`Open current program for ${patientName}`}>
            <MetricCard label="Program items" value={workspace.programExercises.length} detail={workspace.program ? programTitle : "No program assigned yet"} />
          </Link>
        </div>
        <section className="grid two" style={{ marginTop: 18 }}>
          <Link className="panel workspace-link-panel" href={`/patients/${workspace.patient.id}/logs`} aria-label={`Open patient logs for ${patientName}`}>
            <p className="eyebrow">Patient Logs</p>
            <h3>Since Last Visit</h3>
            <ul className="list" style={{ marginTop: 12 }}>
              {workspace.checkins.map((checkin) => (
                <li className="list-item" key={checkin.id}>
                  <strong>Pain {checkin.pain_score ?? "n/a"}/10 · Confidence {checkin.confidence_score ?? "n/a"}/10</strong>
                  <p className="muted">{checkin.notes ?? "No notes"} · {formatDate(checkin.created_at)}</p>
                </li>
              ))}
            </ul>
            {!workspace.checkins.length ? <p className="muted">No patient logs recorded yet.</p> : null}
          </Link>
          <div className="panel">
            <p className="eyebrow">Clinical Summary</p>
            <h3>{workspace.episode?.clinical_summary ?? workspace.visitNote?.summary ?? "No visit summary recorded"}</h3>
            <p className="muted">{workspace.visitNote?.plan ?? workspace.patient.current_focus ?? "Add a visit note to summarize the plan."}</p>
            <div style={{ marginTop: 16 }}>
              <p className="eyebrow">Barriers</p>
              <ul className="list" style={{ marginTop: 10 }}>
                {workspace.barriers.map((barrier) => (
                  <li className="list-item" key={barrier.id}>
                    <strong>{barrier.type ?? "Barrier"}</strong>
                    <p className="muted">{barrier.description ?? "No description"} · {barrier.status ?? "Open"}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
        <section className="grid two" style={{ marginTop: 18 }}>
          <Link className="panel workspace-link-panel" href={`/patients/${workspace.patient.id}/decision`} aria-label={`Open decision support for ${patientName}`}>
            <p className="eyebrow">Today&apos;s Decision</p>
            <h3>{workspace.decision?.decision_type ?? workspace.decision?.decision ?? "Review patient response before changing the plan"}</h3>
            <p className="muted">{workspace.decision?.rationale ?? workspace.decision?.action_items ?? "No decision rationale recorded."}</p>
          </Link>
          <Link className="workspace-link-panel" href={`/patients/${workspace.patient.id}/progress`} aria-label={`Open goal progress for ${patientName}`}>
            <GoalProgress goals={workspace.goals} />
          </Link>
        </section>
        <section className="grid two" style={{ marginTop: 18 }}>
          <Link className="panel workspace-link-panel" href={`/patients/${workspace.patient.id}/progress`} aria-label={`Open progress trend for ${patientName}`}>
            <p className="eyebrow">Progress trend</p>
            <ProgressBars metrics={workspace.progressMetrics} />
          </Link>
          {workspace.program ? (
            <Link className="panel workspace-link-panel" href={`/program-builder/${workspace.patient.id}`} aria-label={`Open current program for ${patientName}`}>
              <div className="section-header">
                <div>
                  <p className="eyebrow">Current Program</p>
                  <h3>{programTitle}</h3>
                </div>
                <span className="pill">{workspace.program.status ?? "draft"}</span>
              </div>
              <p className="muted" style={{ marginTop: 8 }}>Assigned {formatDate(assignedDate)}</p>
              <ul className="list" style={{ marginTop: 12 }}>
                {workspace.programExercises.map((item) => (
                  <li className="list-item" key={item.id}>
                    <strong>{item.exercise?.name ?? "Exercise"}</strong>
                    <p className="muted">{item.exercise?.category ?? item.category ?? "Category not set"}</p>
                    <p className="muted">
                      {item.dosage_sets ?? item.sets ?? 0} sets · {item.dosage_reps ?? item.reps ?? 0} reps · {item.frequency ?? "Frequency not set"}
                    </p>
                    <p>{item.notes ?? "No notes"}</p>
                  </li>
                ))}
              </ul>
              {!workspace.programExercises.length ? <p className="muted" style={{ marginTop: 12 }}>No exercises are linked to this program yet.</p> : null}
            </Link>
          ) : (
            <div className="panel">
              <p className="eyebrow">Current Program</p>
              <h3>No program assigned yet.</h3>
              <p className="muted">Create a home program for this patient.</p>
              <Link className="button" href={`/program-builder/${workspace.patient.id}`} style={{ marginTop: 14 }} aria-label={`Build program for ${patientName}`}>
                Build Program
              </Link>
            </div>
          )}
        </section>
      </RequireAuth>
    </AppShell>
  );
}
