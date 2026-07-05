"use client";

import { FormEvent, useEffect, useState } from "react";
import { Plus, Save } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { loadExerciseLibrary, loadPatientWorkspace } from "@/lib/data";
import { sampleExercises, sampleWorkspace } from "@/lib/sample-data";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { Exercise, HomeProgramExercise, PatientWorkspace } from "@/lib/types";

export function ProgramBuilderClient({ patientId }: { patientId: string }) {
  const [workspace, setWorkspace] = useState<PatientWorkspace>(sampleWorkspace);
  const [library, setLibrary] = useState<Exercise[]>(sampleExercises);
  const [draft, setDraft] = useState<HomeProgramExercise[]>(sampleWorkspace.programExercises);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured() || patientId === "demo-patient") {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    Promise.all([loadPatientWorkspace(supabase, patientId), loadExerciseLibrary(supabase)])
      .then(([loadedWorkspace, loadedLibrary]) => {
        setWorkspace(loadedWorkspace);
        setDraft(loadedWorkspace.programExercises);
        setLibrary(loadedLibrary);
      })
      .catch(() => setStatus("Using demo program until Supabase data is available."));
  }, [patientId]);

  function addExercise(exercise: Exercise) {
    setDraft((items) => [
      ...items,
      {
        id: `draft-${exercise.id}-${Date.now()}`,
        exercise_id: exercise.id,
        home_program_id: workspace.program?.id,
        sets: 2,
        reps: 10,
        frequency: "3x/week",
        notes: "",
        exercise,
      },
    ]);
  }

  function updateItem(id: string, patch: Partial<HomeProgramExercise>) {
    setDraft((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setStatus("Program draft ready. Persisting requires update/insert policies for home_program_exercises.");
  }

  return (
    <AppShell>
      <RequireAuth>
        <div className="topbar">
          <div>
            <p className="eyebrow">Program Builder</p>
            <h2>{workspace.program?.title ?? "Current program"}</h2>
            <p className="muted">Exercise-level dosage, frequency, and notes mapped to `home_program_exercises`.</p>
          </div>
        </div>
        <section className="grid two">
          <form className="panel form" onSubmit={submit}>
            <div className="section-header">
              <div>
                <p className="eyebrow">Current Program</p>
                <h3>{workspace.patient?.full_name ?? "Patient"}</h3>
              </div>
              <button className="button" type="submit">
                <Save size={18} />
                Save draft
              </button>
            </div>
            {draft.map((item) => (
              <div className="list-item" key={item.id}>
                <strong>{item.exercise?.name ?? "Exercise"}</strong>
                <div className="grid three">
                  <div className="field">
                    <label>Sets</label>
                    <input type="number" min={0} value={item.sets ?? 0} onChange={(event) => updateItem(item.id, { sets: Number(event.target.value) })} />
                  </div>
                  <div className="field">
                    <label>Reps</label>
                    <input type="number" min={0} value={item.reps ?? 0} onChange={(event) => updateItem(item.id, { reps: Number(event.target.value) })} />
                  </div>
                  <div className="field">
                    <label>Frequency</label>
                    <input value={item.frequency ?? ""} onChange={(event) => updateItem(item.id, { frequency: event.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label>Notes</label>
                  <textarea value={item.notes ?? ""} onChange={(event) => updateItem(item.id, { notes: event.target.value })} />
                </div>
              </div>
            ))}
            {status ? <p className="muted">{status}</p> : null}
          </form>
          <section className="panel">
            <p className="eyebrow">Exercise Library</p>
            <ul className="list" style={{ marginTop: 14 }}>
              {library.map((exercise) => (
                <li className="list-item" key={exercise.id}>
                  <div className="row-between">
                    <span>
                      <strong>{exercise.name ?? "Exercise"}</strong>
                      <p className="muted">{exercise.body_region ?? "Body region"} · {exercise.category ?? "Category"} · {exercise.difficulty ?? "Level"}</p>
                    </span>
                    <button className="icon-button" type="button" onClick={() => addExercise(exercise)} title="Add exercise">
                      <Plus size={18} />
                    </button>
                  </div>
                  <p>{exercise.description ?? exercise.instructions ?? "No description available."}</p>
                </li>
              ))}
            </ul>
          </section>
        </section>
      </RequireAuth>
    </AppShell>
  );
}
