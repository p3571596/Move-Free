"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
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

  const patients = snapshot?.patients ?? [];

  return (
    <AppShell>
      <RequireAuth>
        <div className="topbar">
          <div>
            <p className="eyebrow">Move Free</p>
            <h2>Patient dashboard</h2>
            <p className="muted">Choose a patient workspace before building or updating a program.</p>
          </div>
          <Link className="button" href="/patients/new">
            <Plus size={18} />
            Add Patient
          </Link>
        </div>
        <div className="grid three">
          <MetricCard label="Active patients" value={patients.length} detail="Assigned to the current clinician" />
          <MetricCard label="Recent check-ins" value={snapshot?.recentCheckins.length ?? 0} detail="Pain, energy, and confidence signals" />
          <MetricCard label="Clinical decisions" value={snapshot?.openDecisions.length ?? 0} detail="Latest treatment rationale" />
        </div>
        <section className="panel" style={{ marginTop: 18 }}>
          <div className="section-header">
            <div>
              <p className="eyebrow">Patient list</p>
              <h3>Patients</h3>
            </div>
          </div>
          <ul className="patient-card-grid" style={{ marginTop: 14 }}>
            {patients.map((patient) => {
              const patientName = patient.display_name ?? patient.full_name ?? "Patient";

              return (
                <li className="list-item" key={patient.id}>
                  <div className="row-between patient-card-heading">
                    <span className="row-between" style={{ justifyContent: "flex-start" }}>
                      <span className="avatar">{initials(patientName)}</span>
                      <span>
                        <strong>{patientName}</strong>
                        <p className="muted">{patient.diagnosis ?? "Diagnosis pending"}</p>
                      </span>
                    </span>
                    <span className="pill">{patient.status ?? "Active"}</span>
                  </div>
                  <div className="patient-card-actions">
                    <Link className="secondary-button" href={`/patients/${patient.id}`}>Open Workspace</Link>
                    <Link className="button" href={`/program-builder/${patient.id}`}>Build Program</Link>
                  </div>
                </li>
              );
            })}
          </ul>
          {!patients.length ? <div className="empty" style={{ marginTop: 14 }}>No patients yet. Add a patient to open a workspace or build a program.</div> : null}
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
