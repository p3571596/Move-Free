"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { loadCurrentPatientAppWorkspace, logExerciseCompletion } from "@/lib/data";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { HomeProgramExercise, PatientWorkspace } from "@/lib/types";

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

  async function submit(event: FormEvent<HTMLFormElement>, item: HomeProgramExercise) {
    event.preventDefault();

    if (!workspace?.patient) {
      setMessage("No patient is available.");
      return;
    }

    const data = new FormData(event.currentTarget);
    const painBefore = Number(data.get("painBefore"));
    const painAfter = Number(data.get("painAfter"));
    const notes = String(data.get("notes") ?? "");

    if (isSupabaseConfigured()) {
      const supabase = createSupabaseBrowserClient();
      await logExerciseCompletion(supabase, workspace.patient.id, item.id, painBefore, painAfter, notes);
    }

    setMessage(`${item.exercise?.name ?? "Exercise"} logged for today.`);
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
            <section className="exercise-card-list">
              {workspace.programExercises.map((item) => (
                <form className="panel form" key={item.id} onSubmit={(event) => submit(event, item)}>
                  <div className="section-header">
                    <div>
                      <p className="eyebrow">Exercise</p>
                      <h3>{item.exercise?.name ?? "Exercise"}</h3>
                    </div>
                    <span className="pill">{item.frequency ?? "Frequency not set"}</span>
                  </div>
                  <p className="muted">
                    {item.sets ?? 0} sets · {item.reps ?? 0} reps
                  </p>
                  {item.notes ? <p>{item.notes}</p> : null}
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
                </form>
              ))}
              {message ? <p className="muted">{message}</p> : null}
            </section>
          ) : null}
        </div>
      </RequireAuth>
    </AppShell>
  );
}
