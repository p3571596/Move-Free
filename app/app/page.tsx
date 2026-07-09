"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, HeartPulse, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GoalProgress } from "@/components/GoalProgress";
import { RequireAuth } from "@/components/RequireAuth";
import { loadCurrentPatientAppWorkspace } from "@/lib/data";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { PatientWorkspace } from "@/lib/types";

export default function PatientAppHomePage() {
  const [workspace, setWorkspace] = useState<PatientWorkspace | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setWorkspace(emptyPatientAppWorkspace());
      return;
    }

    const supabase = createSupabaseBrowserClient();
    loadCurrentPatientAppWorkspace(supabase)
      .then(setWorkspace)
      .catch(() => setWorkspace(emptyPatientAppWorkspace()));
  }, []);

  const patientName = workspace?.patient?.display_name ?? workspace?.patient?.full_name;

  return (
    <AppShell>
      <RequireAuth>
        <div className="mobile-frame">
          <div className="topbar">
            <div>
              <p className="eyebrow">Patient app</p>
              <h2>{patientName ? `Welcome, ${patientName}` : "No patient selected"}</h2>
              <p className="muted">{workspace?.program?.title ?? "No active program yet"}</p>
            </div>
          </div>
          {!workspace ? <div className="empty">Loading patient app...</div> : null}
          {workspace && !workspace.patient ? (
            <div className="empty">
              <strong>No patient found.</strong>
              <p>Add a patient from the dashboard to populate this app.</p>
            </div>
          ) : null}
          {workspace?.patient ? (
            <>
              <section className="grid">
                <Link className="card row-between" href="/app/program">
                  <span>
                    <strong>Start Today&apos;s Program</strong>
                    <p className="muted">{workspace.programExercises.length} exercises ready</p>
                  </span>
                  <Activity color="var(--accent)" />
                </Link>
                <Link className="card row-between" href="/app/pain-pattern">
                  <span>
                    <strong>Log Pain Pattern</strong>
                    <p className="muted">Capture symptoms and notes</p>
                  </span>
                  <HeartPulse color="var(--coral)" />
                </Link>
                <Link className="card row-between" href="/app/progress">
                  <span>
                    <strong>Progress</strong>
                    <p className="muted">Review goals and trends</p>
                  </span>
                  <TrendingUp color="var(--blue)" />
                </Link>
              </section>
              <div style={{ marginTop: 18 }}>
                <GoalProgress goals={workspace.goals} />
              </div>
            </>
          ) : null}
        </div>
      </RequireAuth>
    </AppShell>
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
  };
}
