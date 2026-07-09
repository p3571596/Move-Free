"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { loadClinicianSnapshot } from "@/lib/data";
import { initials } from "@/lib/format";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { ClinicianSnapshot } from "@/lib/types";

export default function ProgramBuilderIndexPage() {
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
            <p className="eyebrow">Program Builder</p>
            <h2>Select a patient</h2>
            <p className="muted">Choose a patient before building or editing a home program.</p>
          </div>
          <Link className="button" href="/patients/new">
            <Plus size={18} />
            Add Patient
          </Link>
        </div>
        <ul className="patient-card-grid">
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
                  <Link className="button" href={`/program-builder/${patient.id}`}>Build Program</Link>
                  <Link className="secondary-button" href={`/patients/${patient.id}`}>Open Workspace</Link>
                </div>
              </li>
            );
          })}
        </ul>
        {!patients.length ? (
          <div className="empty" style={{ marginTop: 14 }}>
            <strong>No patients yet.</strong>
            <p>Add a patient before building a program.</p>
          </div>
        ) : null}
      </RequireAuth>
    </AppShell>
  );
}
