"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { GoalProgress } from "@/components/GoalProgress";
import { MetricCard } from "@/components/MetricCard";
import { ProgressBars } from "@/components/ProgressBars";
import { RequireAuth } from "@/components/RequireAuth";
import { loadPatientWorkspace } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { sampleWorkspace } from "@/lib/sample-data";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { PatientWorkspace } from "@/lib/types";

export function PatientWorkspaceClient({ patientId }: { patientId: string }) {
  const [workspace, setWorkspace] = useState<PatientWorkspace>(sampleWorkspace);

  useEffect(() => {
    if (!isSupabaseConfigured() || patientId === "demo-patient") {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    loadPatientWorkspace(supabase, patientId).then(setWorkspace).catch(() => setWorkspace(sampleWorkspace));
  }, [patientId]);

  const latestCheckin = workspace.checkins[0];
  const latestMetric = workspace.progressMetrics.at(-1);

  return (
    <AppShell>
      <RequireAuth>
        <div className="topbar">
          <div>
            <p className="eyebrow">Patient workspace</p>
            <h2>{workspace.patient?.full_name ?? "Patient context"}</h2>
            <p className="muted">{workspace.episode?.diagnosis ?? workspace.patient?.diagnosis ?? "Episode context"} · {workspace.episode?.stage ?? "Active care"}</p>
          </div>
          <Link className="button" href={`/program-builder/${workspace.patient?.id ?? patientId}`}>Update program</Link>
        </div>
        <div className="grid three">
          <MetricCard label="Pain today" value={latestCheckin?.pain_score ?? "n/a"} detail={latestCheckin?.notes ?? "No daily check-in note"} />
          <MetricCard label="Progress signal" value={latestMetric?.value ?? "n/a"} detail={`${latestMetric?.metric_name ?? "No metric"} ${latestMetric?.unit ?? ""}`} />
          <MetricCard label="Program items" value={workspace.programExercises.length} detail={workspace.program?.title ?? "No active program"} />
        </div>
        <section className="grid two" style={{ marginTop: 18 }}>
          <div className="panel">
            <p className="eyebrow">Since Last Visit</p>
            <ul className="list" style={{ marginTop: 12 }}>
              {workspace.checkins.map((checkin) => (
                <li className="list-item" key={checkin.id}>
                  <strong>Pain {checkin.pain_score ?? "n/a"}/10 · Confidence {checkin.confidence_score ?? "n/a"}/10</strong>
                  <p className="muted">{checkin.notes ?? "No notes"} · {formatDate(checkin.created_at)}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="panel">
            <p className="eyebrow">Clinical Summary</p>
            <h3>{workspace.visitNote?.summary ?? "No visit summary recorded"}</h3>
            <p className="muted">{workspace.visitNote?.plan ?? "Add a visit note to summarize the plan."}</p>
            <div style={{ marginTop: 16 }}>
              <p className="eyebrow">Barriers</p>
              <ul className="list" style={{ marginTop: 10 }}>
                {workspace.barriers.map((barrier) => (
                  <li className="list-item" key={barrier.id}>
                    <strong>{barrier.type ?? "Barrier"}</strong>
                    <p className="muted">{barrier.description ?? "No description"} · {barrier.status ?? "Open"}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
        <section className="grid two" style={{ marginTop: 18 }}>
          <div className="panel">
            <p className="eyebrow">Today&apos;s Decision</p>
            <h3>{workspace.decision?.decision ?? "Review patient response before changing the plan"}</h3>
            <p className="muted">{workspace.decision?.rationale ?? "No decision rationale recorded."}</p>
          </div>
          <GoalProgress goals={workspace.goals} />
        </section>
        <section className="grid two" style={{ marginTop: 18 }}>
          <div className="panel">
            <p className="eyebrow">Progress trend</p>
            <ProgressBars metrics={workspace.progressMetrics} />
          </div>
          <div className="panel">
            <p className="eyebrow">Current Program</p>
            <h3>{workspace.program?.title ?? "No active program"}</h3>
            <ul className="list" style={{ marginTop: 12 }}>
              {workspace.programExercises.map((item) => (
                <li className="list-item" key={item.id}>
                  <strong>{item.exercise?.name ?? "Exercise"}</strong>
                  <p className="muted">{item.sets ?? 0} sets · {item.reps ?? 0} reps · {item.frequency ?? "Frequency not set"}</p>
                  <p>{item.notes ?? "No notes"}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </RequireAuth>
    </AppShell>
  );
}
