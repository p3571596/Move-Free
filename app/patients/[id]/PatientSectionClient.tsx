"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { GoalProgress } from "@/components/GoalProgress";
import { ProgressBars } from "@/components/ProgressBars";
import { PilotTrendCharts } from "@/components/PilotTrendCharts";
import { RequireAuth } from "@/components/RequireAuth";
import { emptyWorkspace, loadPatientWorkspace } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { PatientWorkspace } from "@/lib/types";

type Section = "progress" | "logs" | "decision";

export function PatientSectionClient({ patientId, section }: { patientId: string; section: Section }) {
  const [workspace, setWorkspace] = useState<PatientWorkspace | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setWorkspace(emptyWorkspace());
      setStatus("Connect Supabase to load this patient section.");
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
        setStatus("This patient section could not be loaded.");
      });
  }, [patientId]);

  if (!workspace) {
    return (
      <AppShell>
        <RequireAuth>
          <div className="empty">Loading patient section...</div>
        </RequireAuth>
      </AppShell>
    );
  }

  const patientName = workspace.patient?.display_name ?? workspace.patient?.full_name ?? "Patient";

  return (
    <AppShell>
      <RequireAuth>
        <div className="topbar">
          <div>
            <p className="eyebrow">Patient workspace</p>
            <h2>{sectionTitle(section)}</h2>
            <p className="muted">{workspace.patient ? patientName : status}</p>
          </div>
          <Link className="secondary-button" href={`/patients/${patientId}`} aria-label={`Back to ${patientName} workspace`}>
            Back to Workspace
          </Link>
        </div>
        {section === "progress" ? <ProgressSection workspace={workspace} /> : null}
        {section === "logs" ? <LogsSection workspace={workspace} /> : null}
        {section === "decision" ? <DecisionSection workspace={workspace} /> : null}
      </RequireAuth>
    </AppShell>
  );
}

function ProgressSection({ workspace }: { workspace: PatientWorkspace }) {
  return (
    <div className="grid">
      <section className="grid two"><GoalProgress goals={workspace.goals} /><div className="panel"><p className="eyebrow">Clinical measures</p><ProgressBars metrics={workspace.progressMetrics} /></div></section>
      <section className="panel"><p className="eyebrow">Patient feedback</p><h3>Pain, completion, and confidence</h3><PilotTrendCharts checkins={workspace.checkins} logs={workspace.adherenceLogs} /></section>
    </div>
  );
}

function LogsSection({ workspace }: { workspace: PatientWorkspace }) {
  return (
    <section className="panel">
      <p className="eyebrow">Patient Logs</p>
      <h3>Since Last Visit</h3>
      <ul className="list" style={{ marginTop: 14 }}>
        {workspace.checkins.map((checkin) => (
          <li className="list-item" key={checkin.id}>
            <strong>Pain {checkin.pain_score ?? "n/a"}/10 · Confidence {checkin.confidence_score ?? "n/a"}/10</strong>
            <p className="muted">{checkin.notes ?? "No patient comment"} · {formatDate(checkin.checkin_date ?? checkin.created_at)}</p>
          </li>
        ))}
      </ul>
      {!workspace.checkins.length ? <p className="muted" style={{ marginTop: 12 }}>No patient logs recorded yet.</p> : null}
      <div className="section-header" style={{ marginTop: 24 }}><div><p className="eyebrow">Exercise sessions</p><h3>Recent exercise responses</h3></div><span className="pill">{workspace.adherenceLogs.length} entries</span></div>
      <ul className="list" style={{ marginTop: 14 }}>
        {workspace.adherenceLogs.slice(0, 30).map((log) => (
          <li className="list-item" key={log.id}>
            <strong>{formatLogStatus(log.completion_status)} · {formatDifficulty(log.difficulty)} · Pain {log.pain_during ?? "n/a"}/10</strong>
            <p className="muted">{[log.actual_sets != null ? `${log.actual_sets} sets` : null, log.actual_reps != null ? `${log.actual_reps} reps` : null, log.actual_duration_minutes != null ? `${log.actual_duration_minutes} min` : null].filter(Boolean).join(" · ") || "Actual dosage not entered"}</p>
            {log.notes ? <p>{log.notes}</p> : null}
            <small className="muted">{formatDate(log.performed_at ?? log.created_at)}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatLogStatus(value?: string | null) { return value ? value.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase()) : "Activity"; }
function formatDifficulty(value?: string | null) { if (value === "too_easy") return "Easy"; if (value === "too_hard" || value === "painful") return "Hard"; return "About right"; }

function DecisionSection({ workspace }: { workspace: PatientWorkspace }) {
  return (
    <section className="panel">
      <p className="eyebrow">Today&apos;s Decision</p>
      <h3>{workspace.decision?.decision_type ?? workspace.decision?.decision ?? "No decision recorded yet"}</h3>
      <p className="muted">{workspace.decision?.rationale ?? workspace.decision?.action_items ?? "Review patient response before changing the plan."}</p>
    </section>
  );
}

function sectionTitle(section: Section) {
  if (section === "progress") return "Progress";
  if (section === "logs") return "Patient Logs";
  return "Decision";
}
