"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, ChevronRight, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import {
  buildPatientSummaries,
  buildRecentActivity,
  getGoalTitle,
  getPatientName,
  type PatientSummary,
} from "@/lib/clinician-overview";
import { loadClinicianSnapshot } from "@/lib/data";
import { formatDate, initials } from "@/lib/format";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { ClinicianSnapshot } from "@/lib/types";

export default function DashboardPage() {
  const [snapshot, setSnapshot] = useState<ClinicianSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setError("Supabase is not configured for this deployment.");
      setLoading(false);
      return;
    }

    let active = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      loadClinicianSnapshot(createSupabaseBrowserClient())
        .then(value => { if (active) { setSnapshot(value); setError(""); } })
        .catch(() => { if (active) setError("Could not refresh today's priorities."); })
        .finally(() => { if (active) setLoading(false); });
    };
    load(); const timer = setInterval(load, 30000);
    window.addEventListener("focus", load); document.addEventListener("visibilitychange", load);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", load); document.removeEventListener("visibilitychange", load); };
  }, []);

  const summaries = useMemo(() => buildPatientSummaries(snapshot), [snapshot]);
  const activities = useMemo(() => buildRecentActivity(snapshot), [snapshot]);
  const milestones = summaries.filter((summary) => summary.milestone).slice(0, 4);
  const reviewCount = summaries.filter((summary) => summary.needsReview).length;

  return (
    <AppShell>
      <RequireAuth>
        <header className="dashboard-hero priority-hero">
          <div>
            <p className="eyebrow">Today</p>
            <h2>What needs your attention?</h2>
            <p className="muted">A focused briefing from patient activity, pain patterns, program completion, and goals.</p>
          </div>
          <Link className="secondary-button" href="/patients">
            View caseload
            <ChevronRight size={17} />
          </Link>
        </header>

        {loading ? <DashboardLoading /> : null}
        {!loading && error ? <DashboardError message={error} /> : null}

        {!loading && !error ? (
          <>
            <p className="muted">{reviewCount} need review · {milestones.length} recent goal milestones</p>

            {!summaries.length ? (
              <div className="empty dashboard-empty">
                <strong>No patient activity to review yet.</strong>
                <p>Your dashboard will become a daily priority feed after patients and programs are active.</p>
                <Link className="button" href="/patients">Open Patients</Link>
              </div>
            ) : (
              <div className="form">
                <section className="panel"><div className="section-header"><h3>Clinical inbox</h3><span className="pill">{reviewCount} to review</span></div>
                  {reviewCount ? <ul className="priority-list">{summaries.filter(s=>s.needsReview).map(summary=><PriorityPatient key={summary.patient.id} summary={summary}/>)}</ul> : <p>No new feedback needs review.</p>}
                </section>
                {milestones.length ? <section className="panel"><h3>Progress toward meaningful goals</h3><ul className="priority-list">{milestones.map(summary=><PriorityPatient key={summary.patient.id} summary={summary}/>)}</ul></section> : null}
                <details className="panel"><summary>Recent patient activity</summary><ul className="priority-list">{activities.slice(0,8).map(event=><li key={event.id}><Link className="compact-activity-link" href={`/patients/${event.patientId}`}><Activity size={16}/><span><strong>{event.patientName}</strong><small>{event.label} · {event.detail} · {formatDate(event.occurredAt)}</small></span><ChevronRight size={16}/></Link></li>)}</ul></details>
              </div>
            )}
          </>
        ) : null}
      </RequireAuth>
    </AppShell>
  );
}

function PriorityPatient({ summary }: { summary: PatientSummary }) {
  const name = getPatientName(summary.patient);
  return (
    <li>
      <Link className="priority-patient-link" href={`/patients/${summary.patient.id}`} aria-label={`Open workspace for ${name}`}>
        <span className="avatar small-avatar">{initials(name)}</span>
        <span className="priority-patient-copy">
          <strong>{name}</strong>
          <small>{getGoalTitle(summary)}</small>
          <small>{summary.latestCheckin?.symptom_direction ? `Symptoms: ${summary.latestCheckin.symptom_direction}` : "No symptom update"}{summary.latestCheckin?.pain_score != null ? ` · Pain ${summary.latestCheckin.pain_score}/10` : ""} · {summary.adherencePercent == null ? "Participation not recorded" : `${summary.adherencePercent}% of logged exercises completed or partial`}</small>
          {summary.latestCheckin?.patient_comment ? <small>“{summary.latestCheckin.patient_comment}”</small> : null}
          <span className="reason-chip-row">
            {summary.reviewReasons.slice(0, 2).map((reason) => <em key={reason}>{reason}</em>)}
          </span>
        </span>
        <ChevronRight size={18} />
      </Link>
    </li>
  );
}

function DashboardLoading() {
  return (
    <div className="dashboard-loading" aria-live="polite">
      <RefreshCw className="spin" size={20} />
      Building today&apos;s priority briefing…
    </div>
  );
}

function DashboardError({ message }: { message: string }) {
  return (
    <div className="panel dashboard-error" role="alert">
      <AlertTriangle size={22} />
      <div><strong>We could not load today&apos;s priorities.</strong><p>{message}</p></div>
      <button className="secondary-button" onClick={() => window.location.reload()}>Try again</button>
    </div>
  );
}
