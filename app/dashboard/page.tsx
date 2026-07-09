"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { loadClinicianSnapshot } from "@/lib/data";
import { formatDate, initials } from "@/lib/format";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { ClinicianSnapshot, Episode, ExerciseAdherenceLog, Goal, HomeProgram, Patient } from "@/lib/types";

type PatientSummary = {
  patient: Patient;
  episode: Episode | null;
  latestGoal: Goal | null;
  program: HomeProgram | null;
  lastActivity: string | null;
  adherencePercent: number | null;
  needsReview: boolean;
  reviewReasons: string[];
};

export default function DashboardPage() {
  const [snapshot, setSnapshot] = useState<ClinicianSnapshot | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    loadClinicianSnapshot(supabase).then(setSnapshot).catch(() => setSnapshot(null));
  }, []);

  const summaries = useMemo(() => buildPatientSummaries(snapshot), [snapshot]);
  const needsReview = summaries.filter((summary) => summary.needsReview);
  const activePatients = summaries.filter((summary) => !summary.needsReview);

  return (
    <AppShell>
      <RequireAuth>
        <div className="dashboard-hero">
          <div>
            <p className="eyebrow">Move Free</p>
            <h2>Which patient needs attention today?</h2>
            <p className="muted">Review between-visit activity, program status, goals, and adherence from Supabase.</p>
          </div>
          <Link className="button" href="/patients/new">
            <Plus size={18} />
            Add Patient
          </Link>
        </div>

        {!summaries.length ? (
          <div className="empty dashboard-empty">
            <strong>No patients yet.</strong>
            <p>No patients yet. Create your first patient to start tracking between-visit progress.</p>
            <Link className="button" href="/patients/new">
              <Plus size={18} />
              Add Patient
            </Link>
          </div>
        ) : (
          <>
            <section className="dashboard-section">
              <div className="section-header">
                <div>
                  <p className="eyebrow">Needs Review</p>
                  <h3>{needsReview.length} patient{needsReview.length === 1 ? "" : "s"}</h3>
                </div>
                <span className="review-count-badge">
                  <AlertCircle size={16} />
                  Attention queue
                </span>
              </div>
              {needsReview.length ? (
                <ul className="patient-card-grid" style={{ marginTop: 14 }}>
                  {needsReview.map((summary) => (
                    <PatientCard key={summary.patient.id} summary={summary} tone="review" />
                  ))}
                </ul>
              ) : (
                <div className="empty" style={{ marginTop: 14 }}>No patients need review right now.</div>
              )}
            </section>

            <section className="dashboard-section" id="patients">
              <div className="section-header">
                <div>
                  <p className="eyebrow">Active Patients</p>
                  <h3>{activePatients.length} patient{activePatients.length === 1 ? "" : "s"}</h3>
                </div>
              </div>
              {activePatients.length ? (
                <ul className="patient-card-grid" style={{ marginTop: 14 }}>
                  {activePatients.map((summary) => (
                    <PatientCard key={summary.patient.id} summary={summary} />
                  ))}
                </ul>
              ) : (
                <div className="empty" style={{ marginTop: 14 }}>Every active patient is currently in the review queue.</div>
              )}
            </section>
          </>
        )}
      </RequireAuth>
    </AppShell>
  );
}

function PatientCard({ summary, tone }: { summary: PatientSummary; tone?: "review" }) {
  const patientName = summary.patient.display_name ?? summary.patient.name ?? summary.patient.full_name ?? "Patient";
  const diagnosis = summary.patient.diagnosis ?? summary.patient.primary_complaint ?? "Clinical focus pending";
  const focus = summary.patient.current_focus ?? "Current focus not set";

  return (
    <li className={`patient-dashboard-card ${tone === "review" ? "needs-review-card" : ""}`}>
      <div className="row-between patient-card-heading">
        <span className="row-between" style={{ justifyContent: "flex-start" }}>
          <span className="avatar">{initials(patientName)}</span>
          <span>
            <strong>{patientName}</strong>
            <p className="muted">{diagnosis}</p>
          </span>
        </span>
        <span className="pill">{summary.patient.status ?? "active"}</span>
      </div>

      <div className="patient-focus-block">
        <p className="eyebrow">Current focus</p>
        <p>{focus}</p>
      </div>

      <div className="patient-signal-grid">
        <Signal label="Goal" value={formatGoal(summary.latestGoal)} />
        <Signal label="Last activity" value={summary.lastActivity ? formatDate(summary.lastActivity) : "No activity yet"} />
        <Signal label="Program" value={summary.program ? (summary.program.name ?? summary.program.title ?? "Assigned") : "No program"} />
        <Signal label="Adherence" value={formatAdherence(summary)} />
      </div>

      {summary.reviewReasons.length ? (
        <div className="review-reasons">
          {summary.reviewReasons.map((reason) => (
            <span className="subtle-badge" key={reason}>{reason}</span>
          ))}
        </div>
      ) : null}

      <div className="patient-card-actions">
        <Link className="button" href={`/patients/${summary.patient.id}`}>Open Workspace</Link>
        <Link className="secondary-button" href={`/program-builder/${summary.patient.id}`}>Build Program</Link>
      </div>
    </li>
  );
}

function Signal({ label, value }: { label: string; value: string }) {
  return (
    <div className="patient-signal">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function buildPatientSummaries(snapshot: ClinicianSnapshot | null): PatientSummary[] {
  if (!snapshot) {
    return [];
  }

  return snapshot.patients.map((patient) => {
    const patientEpisodes = snapshot.episodes
      .filter((episode) => episode.patient_id === patient.id)
      .sort((a, b) => timestamp(b.updated_at ?? b.start_date) - timestamp(a.updated_at ?? a.start_date));
    const episode = patientEpisodes[0] ?? null;
    const episodeIds = patientEpisodes.map((item) => item.id);
    const goals = snapshot.goals.filter((goal) => goal.episode_id && episodeIds.includes(goal.episode_id));
    const latestGoal = goals.sort((a, b) => goalProgress(b) - goalProgress(a))[0] ?? null;
    const programs = snapshot.programs.filter((program) => program.episode_id && episodeIds.includes(program.episode_id));
    const program = programs.sort((a, b) => timestamp(b.updated_at ?? b.assigned_at) - timestamp(a.updated_at ?? a.assigned_at))[0] ?? null;
    const checkins = snapshot.recentCheckins.filter((checkin) => checkin.patient_id === patient.id);
    const adherenceLogs = snapshot.adherenceLogs.filter((log) => log.patient_id === patient.id);
    const lastActivity = latestActivity(checkins, adherenceLogs);
    const adherencePercent = calculateAdherence(adherenceLogs);
    const reviewReasons = reviewReasonsFor({ lastActivity, program, adherencePercent });

    return {
      patient,
      episode,
      latestGoal,
      program,
      lastActivity,
      adherencePercent,
      needsReview: reviewReasons.length > 0,
      reviewReasons,
    };
  });
}

function reviewReasonsFor({
  lastActivity,
  program,
  adherencePercent,
}: {
  lastActivity: string | null;
  program: HomeProgram | null;
  adherencePercent: number | null;
}) {
  const reasons: string[] = [];

  if (!program) {
    reasons.push("No program assigned");
  }

  if (!lastActivity || daysSince(lastActivity) >= 3) {
    reasons.push("No activity in 3+ days");
  }

  if (adherencePercent != null && adherencePercent < 70) {
    reasons.push("Low adherence");
  }

  return reasons;
}

function latestActivity(checkins: Array<{ created_at?: string | null; checkin_date?: string | null }>, logs: ExerciseAdherenceLog[]) {
  const values = [
    ...checkins.map((checkin) => checkin.created_at ?? checkin.checkin_date ?? null),
    ...logs.map((log) => log.performed_at ?? log.created_at ?? null),
  ].filter(Boolean) as string[];

  return values.sort((a, b) => timestamp(b) - timestamp(a))[0] ?? null;
}

function calculateAdherence(logs: ExerciseAdherenceLog[]) {
  if (!logs.length) {
    return null;
  }

  const recentLogs = logs.filter((log) => {
    const value = log.performed_at ?? log.created_at;
    return value ? daysSince(value) <= 7 : false;
  });
  const scopedLogs = recentLogs.length ? recentLogs : logs;
  const completed = scopedLogs.filter((log) => log.completed || log.completion_status === "completed").length;

  return Math.round((completed / scopedLogs.length) * 100);
}

function formatGoal(goal: Goal | null) {
  if (!goal) {
    return "No goal recorded";
  }

  const progress = goalProgress(goal);
  return `${goal.title ?? "Goal"} · ${progress}%`;
}

function formatAdherence(summary: PatientSummary) {
  if (!summary.program) {
    return "Needs program";
  }

  return summary.adherencePercent == null ? "No logs yet" : `${summary.adherencePercent}%`;
}

function goalProgress(goal: Goal | null) {
  if (!goal) {
    return 0;
  }

  if (typeof goal.progress_percent === "number") {
    return goal.progress_percent;
  }

  const current = Number(goal.current_value);
  const target = Number(goal.target_value);

  if (!target || Number.isNaN(current) || Number.isNaN(target)) {
    return 0;
  }

  return Math.min(100, Math.round((current / target) * 100));
}

function daysSince(value: string) {
  return Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
}

function timestamp(value?: string | null) {
  return value ? new Date(value).getTime() : 0;
}
