"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";

export default function ProgramBuilderIndexPage() {
  return (
    <AppShell>
      <RequireAuth>
        <div className="topbar">
          <div>
            <p className="eyebrow">Program Builder</p>
            <h2>Select a patient first</h2>
            <p className="muted">Programs are built from a real patient workspace, not a default patient.</p>
          </div>
          <Link className="button" href="/patients/new">Add Patient</Link>
        </div>
        <div className="empty">
          <strong>Open a patient to build a program.</strong>
          <p>Use the dashboard patient cards to choose an existing patient, then select Build Program.</p>
          <Link className="secondary-button" href="/dashboard" style={{ marginTop: 14 }}>
            Back to Dashboard
          </Link>
        </div>
      </RequireAuth>
    </AppShell>
  );
}
