"use client";

import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";

export default function ExerciseStudioPage() {
  return (
    <AppShell>
      <RequireAuth>
        <div className="topbar">
          <div>
            <p className="eyebrow">Exercise Studio</p>
            <h2>Exercise Studio</h2>
            <p className="muted">Start with a blank library and build this workspace later.</p>
          </div>
        </div>
        <div className="empty">
          <strong>No exercises yet.</strong>
          <p>Create the exercise library workflow when you are ready.</p>
        </div>
      </RequireAuth>
    </AppShell>
  );
}
