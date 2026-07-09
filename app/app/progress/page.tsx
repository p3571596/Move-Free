"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { GoalProgress } from "@/components/GoalProgress";
import { ProgressBars } from "@/components/ProgressBars";
import { RequireAuth } from "@/components/RequireAuth";
import { loadCurrentPatientAppWorkspace } from "@/lib/data";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { PatientWorkspace } from "@/lib/types";

export default function PatientProgressPage() {
  const [workspace, setWorkspace] = useState<PatientWorkspace | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setWorkspace(null);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    loadCurrentPatientAppWorkspace(supabase).then(setWorkspace).catch(() => setWorkspace(null));
  }, []);

  return (
    <AppShell>
      <RequireAuth>
        <div className="mobile-frame">
          <div className="topbar">
            <div>
              <p className="eyebrow">Progress</p>
              <h2>Recovery signals</h2>
            </div>
          </div>
          {!workspace ? <div className="empty">Loading progress...</div> : null}
          {workspace && !workspace.patient ? (
            <div className="empty">
              <strong>No patient found.</strong>
              <p>Add a patient from the dashboard to populate progress.</p>
            </div>
          ) : null}
          {workspace?.patient ? (
            <>
              <GoalProgress goals={workspace.goals} />
              <section className="panel" style={{ marginTop: 18 }}>
                <p className="eyebrow">Trend</p>
                <ProgressBars metrics={workspace.progressMetrics} />
              </section>
            </>
          ) : null}
        </div>
      </RequireAuth>
    </AppShell>
  );
}
