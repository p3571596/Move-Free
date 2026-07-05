"use client";

import Link from "next/link";
import { Activity, HeartPulse, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GoalProgress } from "@/components/GoalProgress";
import { RequireAuth } from "@/components/RequireAuth";
import { sampleWorkspace } from "@/lib/sample-data";

export default function PatientAppHomePage() {
  return (
    <AppShell>
      <RequireAuth>
        <div className="mobile-frame">
          <div className="topbar">
            <div>
              <p className="eyebrow">Patient app</p>
              <h2>Welcome back</h2>
              <p className="muted">{sampleWorkspace.program?.title}</p>
            </div>
          </div>
          <section className="grid">
            <Link className="card row-between" href="/app/program">
              <span>
                <strong>Start Today&apos;s Program</strong>
                <p className="muted">{sampleWorkspace.programExercises.length} exercises ready</p>
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
            <GoalProgress goals={sampleWorkspace.goals} />
          </div>
        </div>
      </RequireAuth>
    </AppShell>
  );
}
