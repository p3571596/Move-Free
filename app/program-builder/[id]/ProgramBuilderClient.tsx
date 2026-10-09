"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, Plus, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ExerciseVideoField } from "@/components/ExerciseVideoField";
import { approvedVideoFromForm } from "@/lib/exercise-media";
import { ExerciseVideo } from "@/components/ExerciseVideo";
import { PrescriptionFields } from "@/components/PrescriptionFields";
import { prescriptionFor } from "@/lib/prescription";
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
  const workflowStartedAt = useRef(Date.now());

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
        workflowStartedAt.current = Date.now();
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
        {
          id: `draft-${exercise.id}-${Date.now()}`,
          exercise_id: exercise.id,
          home_program_id: workspace?.program?.id,
          prescription: structuredClone(exercise.default_prescription ?? {}),
          legacy_prescription: exercise.default_dosage ? {dosage_reps: exercise.default_dosage, review_required: true, reviewed: false} : {},
          notes: "",
          exercise,
        },
        ...items,
      ];
    });
  }

  function addBlankExercise() {
    const exerciseId = `custom-${Date.now()}`;

    setDraft((items) => [
      {
        id: `draft-${exerciseId}`,
        exercise_id: null,
        home_program_id: workspace?.program?.id,
        prescription: {},
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
      ...items,
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
          ? { ...item, patient_name: name, exercise: { ...(item.exercise ?? { id: `custom-${Date.now()}` }), name } }
          : item,
      ),
    );
  }

  function updateExerciseTags(id: string, tags: string[]) {
    setDraft((items) => items.map((item) => item.id === id
      ? { ...item, exercise: { ...(item.exercise ?? { id: `custom-${Date.now()}` }), tags } }
      : item));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus("Saving program...");

    if (!isSupabaseConfigured() || !workspace?.patient) {
      setStatus("Connect Supabase and select a patient before saving.");
      return;
    }

    try {
      const videoUpdates: Record<string, string | null> = {};
      for (const item of draft) {
        const raw = String(form.get(`video-${item.id}`) ?? "");
        if (raw !== (item.exercise?.video_url ?? "")) {
          const videoForm = new FormData();
          videoForm.set("video_url", raw);
          videoForm.set("video_approved", String(form.get(`video-approved-${item.id}`) ?? ""));
          videoUpdates[item.id] = approvedVideoFromForm(videoForm);
        }
      }
      const supabase = createSupabaseBrowserClient();
      const saved = await saveProgramDraft(supabase, workspace.patient.id, draft, {
        eventName: workspace.program ? "program_updated" : "program_created",
        durationMs: Date.now() - workflowStartedAt.current,
      }, videoUpdates, workspace.program);
      const loadedLibrary = await loadExerciseLibrary(supabase);
      setWorkspace((current) => current ? { ...current, ...saved } : current);
      setDraft(saved.programExercises);
      setLibrary(loadedLibrary);
      setStatus("Program saved.");
      workflowStartedAt.current = Date.now();
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
          <Link className="secondary-button" href={`/patients/${workspace.patient.id}`}>
            <ArrowLeft size={18} />
            Back to Patient
          </Link>
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
            <button className="secondary-button add-exercise-inline" type="button" onClick={addBlankExercise}>
              <Plus size={18} />
              Add a personalized exercise
            </button>
            {draft.map((item) => (
              <div className="list-item" key={item.id}>
                <div className="field">
                  <label htmlFor={`exercise-${item.id}`}>Exercise</label>
                  <input id={`exercise-${item.id}`} value={item.exercise?.name ?? ""} onChange={(event) => updateExerciseName(item.id, event.target.value)} />
                </div>
                <ExerciseVideoField initialUrl={item.exercise?.video_url} name={item.exercise?.name ?? "Exercise"} inputId={`video-url-${item.id}`} scope="patient" fieldName={`video-${item.id}`} approvalName={`video-approved-${item.id}`} />
                <PrescriptionFields id={item.id} value={prescriptionFor(item)} onChange={prescription => updateItem(item.id, {prescription})}/>
                {item.legacy_prescription?.review_required && !item.legacy_prescription.reviewed ? <div className="field"><p>Original prescription: {[item.legacy_prescription.dosage_sets, item.legacy_prescription.dosage_reps, item.legacy_prescription.frequency].filter(Boolean).join(' · ')}</p><p className="muted">Confirm the numeric prescription and retain any remaining instructions in key cues. Original text stays in the record.</p><label><input type="checkbox" onChange={event => updateItem(item.id, {legacy_prescription: {...item.legacy_prescription, reviewed: event.target.checked}})}/> I reviewed the original instructions</label></div> : null}
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
                  <label htmlFor={`notes-${item.id}`}>Key clinical cues for this patient</label>
                  <textarea id={`notes-${item.id}`} value={item.notes ?? ""} onChange={(event) => updateItem(item.id, { notes: event.target.value })} />
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
                  <ExerciseVideo url={exercise.video_url} name={exercise.name??"Exercise"}/>
                  <Link href={`/exercise-studio/${exercise.id}/edit`} target="_blank" rel="noopener noreferrer">Edit instructions or video in library</Link>
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
