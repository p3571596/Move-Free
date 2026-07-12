"use client";

import { FormEvent, useEffect, useState } from "react";
import { Plus, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { TagInput } from "@/components/TagInput";
import { RequireAuth } from "@/components/RequireAuth";
import { emptyWorkspace, loadExerciseLibrary, loadPatientWorkspace, saveProgramDraft } from "@/lib/data";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { Exercise, HomeProgramExercise, PatientWorkspace } from "@/lib/types";

export function ProgramBuilderClient({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<PatientWorkspace | null>(null);
  const [library, setLibrary] = useState<Exercise[]>([]);
  const [draft, setDraft] = useState<HomeProgramExercise[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setStatus("Connect Supabase to load the program builder.");
      setWorkspace(emptyWorkspace());
      return;
    }

    const supabase = createSupabaseBrowserClient();
    Promise.all([loadPatientWorkspace(supabase, patientId), loadExerciseLibrary(supabase)])
      .then(([loadedWorkspace, loadedLibrary]) => {
        setWorkspace(loadedWorkspace);
        setDraft(loadedWorkspace.programExercises);
        setLibrary(loadedLibrary);
        setStatus(loadedWorkspace.patient ? "" : "Patient not found for the current clinician.");
      })
      .catch(() => {
        setWorkspace(emptyWorkspace());
        setDraft([]);
        setLibrary([]);
        setStatus("Program builder could not be loaded.");
      });
  }, [patientId]);

  function addExercise(exercise: Exercise) {
    setDraft((items) => {
      if (items.some((item) => item.exercise_id === exercise.id)) {
        return items;
      }

      return [
        ...items,
        {
          id: `draft-${exercise.id}-${Date.now()}`,
          exercise_id: exercise.id,
          home_program_id: workspace?.program?.id,
          sets: 2,
          reps: 10,
          frequency: "3x/week",
          notes: "",
          exercise,
        },
      ];
    });
  }

  function addBlankExercise() {
    const exerciseId = `custom-${Date.now()}`;

    setDraft((items) => [
      ...items,
      {
        id: `draft-${exerciseId}`,
        exercise_id: null,
        home_program_id: workspace?.program?.id,
        sets: 2,
        reps: 10,
        frequency: "3x/week",
        notes: "",
        exercise: {
          id: exerciseId,
          name: "New exercise",
          category: "Custom",
          difficulty: "Set level",
          description: "Add coaching notes below.",
          tags: [],
        },
      },
    ]);
    setStatus("Program draft started. Add exercises, dosage, and notes.");
  }

  function updateItem(id: string, patch: Partial<HomeProgramExercise>) {
    setDraft((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function updateExerciseName(id: string, name: string) {
    setDraft((items) =>
      items.map((item) =>
        item.id === id
          ? { ...item, exercise: { ...(item.exercise ?? { id: `custom-${Date.now()}` }), name } }
          : item,
      ),
    );
  }

  function updateExerciseTags(id: string, tags: string[]) {
    setDraft((items) => items.map((item) => item.id === id
      ? { ...item, exercise: { ...(item.exercise ?? { id: `custom-${Date.now()}` }), tags } }
      : item));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus("Saving program...");

    if (!isSupabaseConfigured() || !workspace?.patient) {
      setStatus("Connect Supabase and select a patient before saving.");
      return;
    }

    try {
      const supabase = createSupabaseBrowserClient();
      const saved = await saveProgramDraft(supabase, workspace.patient.id, draft);
      const loadedLibrary = await loadExerciseLibrary(supabase);
      setWorkspace((current) => current ? { ...current, ...saved } : current);
      setDraft(saved.programExercises);
      setLibrary(loadedLibrary);
      setStatus("Program saved.");
      router.push(`/patients/${workspace.patient.id}?programSaved=1&librarySaved=${saved.libraryExerciseCount}`);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Program could not be saved.");
    }
  }

  if (!workspace) {
    return (
      <AppShell>
        <RequireAuth>
          <div className="empty">Loading program builder...</div>
        </RequireAuth>
      </AppShell>
    );
  }

  if (!workspace.patient) {
    return (
      <AppShell>
        <RequireAuth>
          <div className="topbar">
            <div>
              <p className="eyebrow">Program Builder</p>
              <h2>Select a patient first</h2>
              <p className="muted">{status || "Open a real patient before building a program."}</p>
            </div>
            <Link className="button" href="/patients/new">Add Patient</Link>
          </div>
          <div className="empty">
            <strong>No patient selected.</strong>
            <p>Choose Build Program from a dashboard patient card to continue.</p>
            <Link className="secondary-button" href="/dashboard" style={{ marginTop: 14 }}>
              Back to Dashboard
            </Link>
          </div>
        </RequireAuth>
      </AppShell>
    );
  }

  const patientName = workspace.patient.display_name ?? workspace.patient.full_name ?? "Patient";

  return (
    <AppShell>
      <RequireAuth>
        <div className="topbar">
          <div>
            <p className="eyebrow">Program Builder</p>
            <h2>{workspace.program?.title ?? "Current program"}</h2>
            <p className="muted">Exercise-level dosage, frequency, and notes for {patientName}.</p>
          </div>
          <div className="builder-actions">
            <button className="button" type="button" onClick={addBlankExercise}>
              <Plus size={18} />
              Add Exercise
            </button>
          </div>
        </div>
        <section className="grid two">
          <form className="panel form" onSubmit={submit}>
            <div className="section-header">
              <div>
                <p className="eyebrow">Current Program</p>
                <h3>{patientName}</h3>
              </div>
              <button className="button" type="submit" disabled={!draft.length}>
                <Save size={18} />
                Save Program
              </button>
            </div>
            {draft.map((item) => (
              <div className="list-item" key={item.id}>
                <div className="field">
                  <label>Exercise</label>
                  <input value={item.exercise?.name ?? ""} onChange={(event) => updateExerciseName(item.id, event.target.value)} />
                </div>
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
                {item.exercise?.id.startsWith("custom-") ? (
                  <TagInput
                    label="Exercise tags"
                    inputId={`exercise-tags-${item.id}`}
                    value={item.exercise?.tags ?? []}
                    onChange={(tags) => updateExerciseTags(item.id, tags)}
                  />
                ) : (item.exercise?.tags ?? []).length ? (
                  <div className="tag-list" aria-label="Exercise tags">
                    {item.exercise?.tags?.map((tag) => <span className="tag-chip" key={tag}>{tag}</span>)}
                  </div>
                ) : null}
                <div className="field">
                  <label>Notes</label>
                  <textarea value={item.notes ?? ""} onChange={(event) => updateItem(item.id, { notes: event.target.value })} />
                </div>
              </div>
            ))}
            {!draft.length ? (
              <div className="empty">
                <strong>No exercises in this program yet.</strong>
                <p>Start a draft program by adding an exercise.</p>
              </div>
            ) : null}
            {status ? <p className="muted">{status}</p> : null}
          </form>
          <section className="panel">
            <div className="section-header">
              <div>
                <p className="eyebrow">Exercise Library</p>
                <h3>Add exercises</h3>
              </div>
            </div>
            <ul className="list" style={{ marginTop: 14 }}>
              {library.map((exercise) => (
                <li className="list-item" key={exercise.id}>
                  <div className="row-between">
                    <span>
                      <strong>{exercise.name ?? "Exercise"}</strong>
                      <p className="muted">{exercise.body_region ?? "Body region"} · {exercise.category ?? "Category"} · {exercise.difficulty ?? "Level"}</p>
                      {(exercise.tags ?? []).length ? <p className="muted">{exercise.tags?.join(" · ")}</p> : null}
                    </span>
                    <button className="secondary-button" type="button" onClick={() => addExercise(exercise)}>
                      <Plus size={18} />
                      Add
                    </button>
                  </div>
                  <p>{exercise.description ?? exercise.instructions ?? "No description available."}</p>
                </li>
              ))}
            </ul>
            {!library.length ? (
              <div className="empty" style={{ marginTop: 14 }}>
                <strong>No library exercises yet.</strong>
                <p>Use Add Exercise to create a custom program item.</p>
              </div>
            ) : null}
          </section>
        </section>
      </RequireAuth>
    </AppShell>
  );
}
