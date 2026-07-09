"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { loadCurrentPatientAppWorkspace, logExerciseCompletion } from "@/lib/data";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { PatientWorkspace } from "@/lib/types";

export default function TodayProgramPage() {
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
    const exerciseId = String(data.get("exerciseId"));
    const painBefore = Number(data.get("painBefore"));
    const painAfter = Number(data.get("painAfter"));
    const notes = String(data.get("notes") ?? "");

    if (isSupabaseConfigured()) {
      const supabase = createSupabaseBrowserClient();
      await logExerciseCompletion(supabase, workspace.patient.id, exerciseId, painBefore, painAfter, notes);
    }

    setMessage("Completion logged for today.");
    event.currentTarget.reset();
  }

  return (
    <AppShell>
      <RequireAuth>
        <div className="mobile-frame">
          <div className="topbar">
            <div>
              <p className="eyebrow">Start Today&apos;s Program</p>
              <h2>{workspace?.program?.title ?? "No active program"}</h2>
            </div>
          </div>
          {!workspace ? <div className="empty">Loading program...</div> : null}
          {workspace && !workspace.programExercises.length ? (
            <div className="empty">
              <strong>No exercises assigned.</strong>
              <p>Build and save a program from the clinician workspace first.</p>
            </div>
          ) : null}
          {workspace?.programExercises.length ? (
            <form className="panel form" onSubmit={submit}>
              <div className="field">
                <label>Exercise</label>
                <select name="exerciseId">
                  {workspace.programExercises.map((item) => (
                    <option key={item.id} value={item.id}>{item.exercise?.name ?? "Exercise"}</option>
                  ))}
                </select>
              </div>
              <div className="grid two">
                <div className="field">
                  <label>Pain before</label>
                  <input name="painBefore" type="number" min={0} max={10} defaultValue={2} />
                </div>
                <div className="field">
                  <label>Pain after</label>
                  <input name="painAfter" type="number" min={0} max={10} defaultValue={3} />
                </div>
              </div>
              <div className="field">
                <label>Notes</label>
                <textarea name="notes" placeholder="How did the movement feel?" />
              </div>
              <button className="button" type="submit">
                <CheckCircle2 size={18} />
                Log completion
              </button>
              {message ? <p className="muted">{message}</p> : null}
            </form>
          ) : null}
        </div>
      </RequireAuth>
    </AppShell>
  );
}
