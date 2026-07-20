"use client";

import { useEffect, useState } from "react";
import { PatientShell } from "@/components/PatientShell";
import { RoleGate } from "@/components/RoleGate";
import { GoalProgress } from "@/components/GoalProgress";
import { ProgressBars } from "@/components/ProgressBars";
import { PilotTrendCharts } from "@/components/PilotTrendCharts";
import { RequireAuth } from "@/components/RequireAuth";
import { loadCurrentPatientAppWorkspace } from "@/lib/data";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { PatientWorkspace } from "@/lib/types";
import { summarizePatientActivity } from "@/lib/pilot-insights";

export default function PatientProgressPage() {
  const [workspace, setWorkspace] = useState<PatientWorkspace | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setWorkspace(null);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    loadCurrentPatientAppWorkspace(supabase).then(setWorkspace).catch((cause) => setLoadError(cause instanceof Error ? cause.message : "Could not load progress."));
  }, []);

  const summary = workspace ? summarizePatientActivity(workspace.checkins, workspace.adherenceLogs) : null;
  const weekSummary = workspace ? summarizePatientActivity(workspace.checkins, workspace.adherenceLogs, new Date(Date.now() - 7 * 86_400_000).toISOString()) : null;

  return (
    <PatientShell>
      <RequireAuth><RoleGate allowed={["patient"]}>
        <div className="mobile-frame">
          <div className="topbar">
            <div>
              <p className="eyebrow">Progress</p>
              <h2>Recovery signals</h2>
            </div>
          </div>
          {!workspace && !loadError ? <div className="empty">Loading progress...</div> : null}
          {loadError ? <div className="empty form-error" role="alert">{loadError}</div> : null}
          {workspace && !workspace.patient ? (
            <div className="empty">
              <strong>No patient found.</strong>
              <p>This login is not linked to a patient record. Ask your clinician to complete your patient invitation.</p>
            </div>
          ) : null}
          {workspace?.patient ? (
            <>
              <GoalProgress goals={workspace.goals} />
              <section className="patient-progress-summary" aria-label="This week's progress">
                <article className="card"><p className="eyebrow">Sessions this week</p><strong className="stat">{weekSummary?.completedSessions ?? 0}</strong></article>
                <article className="card"><p className="eyebrow">Exercise participation</p><strong className="stat">{weekSummary?.completionRate == null ? "—" : `${weekSummary.completionRate}%`}</strong></article>
                <article className="card"><p className="eyebrow">Movement streak</p><strong className="stat">{summary?.streakDays ?? 0} days</strong></article>
              </section>
              <section className="panel" style={{ marginTop: 18 }}>
                <p className="eyebrow">Your last 14 days</p>
                <h3>Progress is more than one number</h3>
                <PilotTrendCharts checkins={workspace.checkins} logs={workspace.adherenceLogs} />
              </section>
              <section className="panel" style={{ marginTop: 18 }}>
                <p className="eyebrow">Therapist measurements</p>
                {workspace.progressMetrics.length ? <ProgressBars metrics={workspace.progressMetrics} /> : <p className="muted">Your therapist has not recorded additional progress measurements yet.</p>}
              </section>
            </>
          ) : null}
        </div>
      </RoleGate></RequireAuth>
    </PatientShell>
  );
}
