"use client";

import { FormEvent, useEffect, useState } from "react";
import { HeartPulse } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { loadCurrentPatientAppWorkspace, logPainPattern } from "@/lib/data";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { PatientWorkspace } from "@/lib/types";

export default function PainPatternPage() {
  const [workspace, setWorkspace] = useState<PatientWorkspace | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setWorkspace(null);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    loadCurrentPatientAppWorkspace(supabase).then(setWorkspace).catch(() => setWorkspace(null));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!workspace?.patient) {
      setMessage("No patient is available.");
      return;
    }

    const data = new FormData(event.currentTarget);
    const painScore = Number(data.get("painScore"));
    const notes = String(data.get("notes") ?? "");

    if (isSupabaseConfigured()) {
      const supabase = createSupabaseBrowserClient();
      await logPainPattern(supabase, workspace.patient.id, painScore, notes);
    }

    setMessage("Pain pattern saved.");
    event.currentTarget.reset();
  }

  return (
    <AppShell>
      <RequireAuth>
        <div className="mobile-frame">
          <div className="topbar">
            <div>
              <p className="eyebrow">Log Pain Pattern</p>
              <h2>How are symptoms behaving?</h2>
            </div>
          </div>
          {!workspace ? <div className="empty">Loading patient...</div> : null}
          {workspace && !workspace.patient ? (
            <div className="empty">
              <strong>No patient found.</strong>
              <p>Add a patient from the dashboard before logging pain.</p>
            </div>
          ) : null}
          {workspace?.patient ? (
            <form className="panel form" onSubmit={submit}>
              <div className="field">
                <label>Pain score</label>
                <input name="painScore" type="range" min={0} max={10} defaultValue={3} />
              </div>
              <div className="field">
                <label>Pattern notes</label>
                <textarea name="notes" placeholder="Where did you feel it, and what changed it?" />
              </div>
              <button className="button" type="submit">
                <HeartPulse size={18} />
                Save pain log
              </button>
              {message ? <p className="muted">{message}</p> : null}
            </form>
          ) : null}
        </div>
      </RequireAuth>
    </AppShell>
  );
}
