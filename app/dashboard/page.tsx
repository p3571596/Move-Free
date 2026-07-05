"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { RequireAuth } from "@/components/RequireAuth";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import { loadClinicianSnapshot } from "@/lib/data";
import { formatDate, initials } from "@/lib/format";
import type { ClinicianSnapshot } from "@/lib/types";

export default function DashboardPage() {
  const [snapshot, setSnapshot] = useState<ClinicianSnapshot | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    loadClinicianSnapshot(supabase).then(setSnapshot).catch(() => setSnapshot(null));
  }, []);

  return (
    <AppShell>
      <RequireAuth>
        <div className="topbar">
          <div>
            <p className="eyebrow">Clinician dashboard</p>
            <h2>Today&apos;s recovery cockpit</h2>
            <p className="muted">RLS-filtered patient and treatment activity from the authenticated clinician session.</p>
          </div>
          <Link className="button" href="/program-builder/demo-patient">Build program</Link>
        </div>
        <div className="grid three">
          <MetricCard label="Active patients" value={snapshot?.patients.length ?? 0} detail="Visible through current session policies" />
          <MetricCard label="Recent check-ins" value={snapshot?.recentCheckins.length ?? 0} detail="Pain, energy, and confidence signals" />
          <MetricCard label="Clinical decisions" value={snapshot?.openDecisions.length ?? 0} detail="Latest treatment rationale" />
        </div>
        <section className="panel" style={{ marginTop: 18 }}>
          <div className="section-header">
            <div>
              <p className="eyebrow">Patient panel</p>
              <h3>RLS-visible patients</h3>
            </div>
          </div>
          <ul className="list" style={{ marginTop: 14 }}>
            {(snapshot?.patients ?? []).map((patient) => (
              <li className="list-item" key={patient.id}>
                <Link className="row-between" href={`/patients/${patient.id}`}>
                  <span className="row-between" style={{ justifyContent: "flex-start" }}>
                    <span className="avatar">{initials(patient.full_name)}</span>
                    <span>
                      <strong>{patient.full_name ?? "Patient"}</strong>
                      <p className="muted">{patient.diagnosis ?? "Diagnosis pending"}</p>
                    </span>
                  </span>
                  <span className="pill">{patient.status ?? "Active"}</span>
                </Link>
              </li>
            ))}
          </ul>
          {!snapshot?.patients.length ? <div className="empty" style={{ marginTop: 14 }}>No patients returned for this authenticated user yet.</div> : null}
        </section>
        <section className="grid two" style={{ marginTop: 18 }}>
          <div className="panel">
            <p className="eyebrow">Since last visit</p>
            <ul className="list" style={{ marginTop: 12 }}>
              {(snapshot?.recentCheckins ?? []).map((checkin) => (
                <li className="list-item" key={checkin.id}>
                  <strong>Pain {checkin.pain_score ?? "n/a"}/10</strong>
                  <p className="muted">{checkin.notes ?? "No note"} · {formatDate(checkin.created_at)}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="panel">
            <p className="eyebrow">Decision queue</p>
            <ul className="list" style={{ marginTop: 12 }}>
              {(snapshot?.openDecisions ?? []).map((decision) => (
                <li className="list-item" key={decision.id}>
                  <strong>{decision.decision ?? "Treatment decision"}</strong>
                  <p className="muted">{decision.rationale ?? "No rationale recorded"}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </RequireAuth>
    </AppShell>
  );
}
