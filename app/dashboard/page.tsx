"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import {
  buildPatientSummaries,
  getGoalTitle,
  getPatientDiagnosis,
  getPatientName,
  type PatientSummary,
} from "@/lib/clinician-overview";
import { loadClinicianSnapshot } from "@/lib/data";
import { initials } from "@/lib/format";
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
  const alerts = summaries.filter(s => s.queue === "alert");
  const reviews = summaries.filter(s => s.queue === "review");
  const onTrack = summaries.filter(s => s.queue === "on_track").length;

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
            <div className="today-counts" aria-label="Today summary">
              <div><strong>{alerts.length}</strong><span>Alerts / Need Attention</span></div>
              <div><strong>{reviews.length}</strong><span>Review Recommendations</span></div>
              <div><strong>{onTrack}</strong><span>On Track</span></div>
            </div>
            <p className="muted">On Track means no outstanding review signal in available reports; it is not a safety clearance.</p>
            <div className="form">
              <section className="panel"><h3>Alerts / Needs Attention</h3>
                {alerts.length ? <ul className="priority-list">{alerts.map(summary => <PriorityPatient key={summary.patient.id} summary={summary}/>)}</ul> : <p className="muted">No alerts in available reports.</p>}
              </section>
              <section className="panel"><h3>Recommendations to Review</h3>
                {reviews.length ? <ul className="priority-list">{reviews.map(summary => <PriorityPatient key={summary.patient.id} summary={summary}/>)}</ul> : <p className="muted">No recommendations awaiting review.</p>}
              </section>
            </div>
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
      <Link className="priority-patient-link" href={`/patients/${summary.patient.id}`} aria-label={`Review ${name}`}>
        <span className="avatar small-avatar">{initials(name)}</span>
        <span className="priority-patient-copy">
          <strong>{name}</strong>
          <small>{getPatientDiagnosis(summary)}</small>
          <span>{summary.queue === "alert" ? summary.reviewReasons.filter(r => r !== "Patient feedback to review").slice(0, 2).join(" · ") || summary.recommendation : summary.recommendation}</span>
          <small>{summary.queue === "review" ? summary.reviewReasons.slice(0, 2).join(" · ") : getGoalTitle(summary)}</small>
        </span>
        <span className="review-action">Review <ChevronRight size={18} /></span>
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
