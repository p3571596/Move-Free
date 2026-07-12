"use client";

import { useEffect, useState } from "react";
import { PatientShell } from "@/components/PatientShell";
import { RoleGate } from "@/components/RoleGate";
import { GoalProgress } from "@/components/GoalProgress";
import { ProgressBars } from "@/components/ProgressBars";
import { RequireAuth } from "@/components/RequireAuth";
import { loadCurrentPatientAppWorkspace } from "@/lib/data";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { PatientWorkspace } from "@/lib/types";

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

  const completed = workspace?.adherenceLogs.filter((log) => log.completion_status === "completed").length ?? 0;
  const total = workspace?.adherenceLogs.length ?? 0;

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
              <section className="panel" style={{ marginTop: 18 }}>
                <p className="eyebrow">Trend</p>
                {workspace.progressMetrics.length ? <ProgressBars metrics={workspace.progressMetrics} /> : <p className="muted">Your therapist has not recorded progress measurements yet.</p>}
              </section>
              <section className="panel" style={{ marginTop: 18 }}>
                <p className="eyebrow">Exercise completion</p>
                <h3>{completed} completed</h3>
                <p className="muted">Across {total} exercise logs submitted so far.</p>
              </section>
            </>
          ) : null}
        </div>
      </RoleGate></RequireAuth>
    </PatientShell>
  );
}
