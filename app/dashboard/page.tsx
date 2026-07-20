"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, CheckCircle2, ChevronRight, Clock3, HeartPulse, RefreshCw, Target } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import {
  buildPatientSummaries,
  buildRecentActivity,
  getGoalTitle,
  getPatientDiagnosis,
  getPatientName,
  type PatientSummary,
  type ReviewCategory,
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

    const supabase = createSupabaseBrowserClient();
    loadClinicianSnapshot(supabase)
      .then(setSnapshot)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load today's priorities."))
      .finally(() => setLoading(false));
  }, []);

  const summaries = useMemo(() => buildPatientSummaries(snapshot), [snapshot]);
  const activities = useMemo(() => buildRecentActivity(snapshot), [snapshot]);
  const priorityGroups = useMemo(() => groupPriorities(summaries), [summaries]);
  const milestones = summaries.filter((summary) => summary.milestone).slice(0, 4);
  const reviewCount = summaries.filter((summary) => summary.needsReview).length;
  const painCount = summaries.filter((summary) => summary.painAlert).length;
  const adherenceCount = summaries.filter((summary) => summary.inactivityAlert || summary.skippedCount >= 2 || (summary.adherencePercent != null && summary.adherencePercent < 60)).length;

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
            <section className="priority-stat-grid" aria-label="Today's priority totals">
              <PriorityStat icon={AlertTriangle} label="Needs review" value={reviewCount} tone="review" />
              <PriorityStat icon={HeartPulse} label="Pain concerns" value={painCount} tone="pain" />
              <PriorityStat icon={Clock3} label="Adherence attention" value={adherenceCount} tone="adherence" />
              <PriorityStat icon={Target} label="Meaningful progress" value={milestones.length} tone="progress" />
            </section>

            {!summaries.length ? (
              <div className="empty dashboard-empty">
                <strong>No patient activity to review yet.</strong>
                <p>Your dashboard will become a daily priority feed after patients and programs are active.</p>
                <Link className="button" href="/patients">Open Patients</Link>
              </div>
            ) : (
              <div className="dashboard-priority-layout">
                <section className="dashboard-section priority-board">
                  <div className="section-header">
                    <div>
                      <p className="eyebrow">Attention queue</p>
                      <h3>Review before the next visit</h3>
                    </div>
                    <span className="pill">{reviewCount} total</span>
                  </div>

                  <div className="priority-lanes">
                    <PriorityLane
                      category="pain"
                      title="Pain changes"
                      description="High or rising pain, or two worsening reports in a row"
                      items={priorityGroups.pain}
                    />
                    <PriorityLane
                      category="adherence"
                      title="Adherence & inactivity"
                      description="Low participation, repeated skips, or no activity for 3+ days"
                      items={priorityGroups.adherence}
                    />
                    <PriorityLane
                      category="review"
                      title="Care setup & review"
                      description="Marked for review or missing an assigned program"
                      items={priorityGroups.review}
                    />
                  </div>
                </section>

                <aside className="dashboard-side-column">
                  <section className="panel dashboard-section compact-panel">
                    <div className="section-header">
                      <div>
                        <p className="eyebrow">Progress</p>
                        <h3>Meaningful milestones</h3>
                      </div>
                      <CheckCircle2 size={20} color="var(--accent)" />
                    </div>
                    {milestones.length ? (
                      <ul className="priority-list">
                        {milestones.map((summary) => (
                          <li key={summary.patient.id}>
                            <Link className="compact-activity-link" href={`/patients/${summary.patient.id}`}>
                              <span className="activity-icon progress-icon"><Target size={16} /></span>
                              <span>
                                <strong>{getPatientName(summary.patient)}</strong>
                                <small>{getGoalTitle(summary)} · {summary.goalProgress}%</small>
                              </span>
                              <ChevronRight size={16} />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="empty-inline">No goals have reached the milestone signal yet.</p>}
                  </section>

                  <section className="panel dashboard-section compact-panel">
                    <div className="section-header">
                      <div>
                        <p className="eyebrow">Live feed</p>
                        <h3>Recent patient activity</h3>
                      </div>
                      <Activity size={20} color="var(--blue)" />
                    </div>
                    {activities.length ? (
                      <ul className="priority-list">
                        {activities.map((event) => (
                          <li key={event.id}>
                            <Link className="compact-activity-link" href={`/patients/${event.patientId}`}>
                              <span className={`activity-icon ${event.kind}`}><Activity size={16} /></span>
                              <span>
                                <strong>{event.patientName}</strong>
                                <small>{event.label} · {event.detail}</small>
                                <small>{formatDate(event.occurredAt)}</small>
                              </span>
                              <ChevronRight size={16} />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="empty-inline">No check-ins or program activity yet.</p>}
                  </section>
                </aside>
              </div>
            )}
          </>
        ) : null}
      </RequireAuth>
    </AppShell>
  );
}

function PriorityStat({ icon: Icon, label, value, tone }: { icon: typeof AlertTriangle; label: string; value: number; tone: string }) {
  return (
    <article className={`priority-stat priority-stat-${tone}`}>
      <span className="priority-stat-icon"><Icon size={20} /></span>
      <span>
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
    </article>
  );
}

function PriorityLane({ category, title, description, items }: { category: ReviewCategory; title: string; description: string; items: PatientSummary[] }) {
  return (
    <div className={`priority-lane priority-${category}`}>
      <div className="priority-lane-heading">
        <span className="priority-dot" />
        <div>
          <h4>{title}</h4>
          <p>{description}</p>
        </div>
        <span className="lane-count">{items.length}</span>
      </div>
      {items.length ? (
        <ul className="priority-list">
          {items.map((summary) => <PriorityPatient key={summary.patient.id} summary={summary} />)}
        </ul>
      ) : <p className="empty-inline">Nothing needs attention here.</p>}
    </div>
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
          <small>{getPatientDiagnosis(summary)}</small>
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
      Building today's priority briefing…
    </div>
  );
}

function DashboardError({ message }: { message: string }) {
  return (
    <div className="panel dashboard-error" role="alert">
      <AlertTriangle size={22} />
      <div><strong>We could not load today's priorities.</strong><p>{message}</p></div>
      <button className="secondary-button" onClick={() => window.location.reload()}>Try again</button>
    </div>
  );
}

function groupPriorities(summaries: PatientSummary[]) {
  return summaries.reduce<Record<ReviewCategory, PatientSummary[]>>((groups, summary) => {
    if (summary.reviewCategory) groups[summary.reviewCategory].push(summary);
    return groups;
  }, { pain: [], adherence: [], review: [] });
}
