"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { PatientShell } from "@/components/PatientShell";
import { RoleGate } from "@/components/RoleGate";
import { RequireAuth } from "@/components/RequireAuth";
import { loadCurrentPatientAppWorkspace, logExerciseCompletion } from "@/lib/data";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { HomeProgramExercise, PatientWorkspace } from "@/lib/types";

export default function TodayProgramPage() {
  const [workspace, setWorkspace] = useState<PatientWorkspace | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setWorkspace(null);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    loadCurrentPatientAppWorkspace(supabase).then(setWorkspace).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load your program."));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>, item: HomeProgramExercise) {
    event.preventDefault();

    if (!workspace?.patient) {
      setMessage("No patient is available.");
      return;
    }

    const data = new FormData(event.currentTarget);
    const painDuringRaw = String(data.get("painDuring") ?? "");
    const painAfterRaw = String(data.get("painAfter") ?? "");
    const difficulty = String(data.get("difficulty") ?? "appropriate");
    const completionStatus = String(data.get("completionStatus") ?? "completed");
    const notes = String(data.get("notes") ?? "");

    if (isSupabaseConfigured()) {
      const supabase = createSupabaseBrowserClient();
      try {
        await logExerciseCompletion(supabase, workspace.patient.id, workspace.program!.id, item.id, completionStatus, difficulty, painDuringRaw ? Number(painDuringRaw) : null, painAfterRaw ? Number(painAfterRaw) : 0, notes);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save completion.");
        return;
      }
    }

    setMessage(`${item.exercise?.name ?? "Exercise"} logged for today.`);
    event.currentTarget.reset();
  }

  return (
    <PatientShell>
      <RequireAuth><RoleGate allowed={["patient"]}>
        <div className="mobile-frame">
          <div className="topbar">
            <div>
              <p className="eyebrow">Start Today&apos;s Program</p>
              <h2>{workspace?.program?.title ?? "No active program"}</h2>
            </div>
          </div>
          {!workspace && !error ? <div className="empty">Loading program...</div> : null}
          {error && !workspace ? <div className="empty form-error" role="alert">{error}</div> : null}
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
                      <label>Completion</label>
                      <select name="completionStatus"><option value="completed">Completed</option><option value="partial">Partially completed</option><option value="skipped">Skipped</option></select>
                    </div>
                    <div className="field">
                      <label>Difficulty</label>
                      <select name="difficulty"><option value="easy">Easy</option><option value="appropriate">Appropriate</option><option value="hard">Hard</option></select>
                    </div>
                  </div>
                  <div className="grid two"><div className="field"><label>Pain during (optional)</label><input name="painDuring" type="number" min={0} max={10}/></div><div className="field"><label>Pain after (optional)</label><input name="painAfter" type="number" min={0} max={10}/></div></div>
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
              {error ? <p className="form-error" role="alert">{error}</p> : null}
            </section>
          ) : null}
        </div>
      </RoleGate></RequireAuth>
    </PatientShell>
  );
}
