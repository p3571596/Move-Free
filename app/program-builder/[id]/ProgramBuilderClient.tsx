"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { ProgramExerciseRecording } from "@/components/ProgramExerciseRecording";
import {
  PrescriptionFields,
  PrescriptionSummary,
} from "@/components/PrescriptionFields";
import { PersonalizedExerciseCreator } from "@/components/PersonalizedExerciseCreator";
import { ExerciseVideo } from "@/components/ExerciseVideo";
import {
  emptyWorkspace,
  loadExerciseLibrary,
  loadPatientWorkspace,
  saveProgramDraft,
} from "@/lib/data";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { emptyPrescription, prescriptionFromItem } from "@/lib/prescription";
import type {
  Exercise,
  HomeProgramExercise,
  PatientWorkspace,
} from "@/lib/types";
export function ProgramBuilderClient({ patientId }: { patientId: string }) {
  const [workspace, setWorkspace] = useState<PatientWorkspace | null>(null),
    [library, setLibrary] = useState<Exercise[]>([]),
    [items, setItems] = useState<HomeProgramExercise[]>([]);
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [review, setReview] = useState(false),
    [preview, setPreview] = useState(false);
  const load = useCallback(async () => {
    if (!isSupabaseConfigured())
      throw new Error("Connect the Stage 2 database.");
    const db = createSupabaseBrowserClient();
    const [w, l] = await Promise.all([
      loadPatientWorkspace(db, patientId),
      loadExerciseLibrary(db),
    ]);
    setWorkspace(w);
    setItems(w.programExercises);
    setLibrary(l);
    setDirty(false);
    setReview(false);
    setPreview(false);
  }, [patientId]);
  useEffect(() => {
    load().catch(() => {
      setWorkspace(emptyWorkspace());
      setStatus("Program could not be loaded.");
    });
  }, [load]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function add(exercise: Exercise) {
    if (items.some((x) => x.exercise_id === exercise.id)) {
      setStatus(
        "This standard exercise is already in the program. Edit its patient card.",
      );
      return;
    }
    setItems((current) => [
      {
        id: `draft-${crypto.randomUUID()}`,
        exercise_id: exercise.id,
        exercise,
        prescription: {
          ...emptyPrescription(),
          name: exercise.name ?? "",
          instructions:
            exercise.patient_instructions ?? exercise.description ?? "",
          category: exercise.category ?? "",
          type: exercise.category ?? "",
          equipment: exercise.equipment ?? "",
        },
      },
      ...current,
    ]);
    setDirty(true);
    setReview(false);
    setPreview(false);
  }
  async function save() {
    setBusy(true);
    setStatus("");
    try {
      await saveProgramDraft(createSupabaseBrowserClient(), patientId, items);
      await load();
      setStatus("Patient prescriptions saved. Standard library unchanged.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not save program.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppShell>
      <RequireAuth>
        <header className="topbar">
          <div>
            <p className="eyebrow">Program Builder · Stage 2</p>
            <h2>
              {workspace?.patient?.display_name ??
                workspace?.patient?.full_name ??
                "Patient program"}
            </h2>
            <p>
              Standard exercises are templates. Edit instructions, cues and FITT
              for this patient.
            </p>
          </div>
          <Link className="secondary-button" href={`/patients/${patientId}`}>
            Back to patient
          </Link>
        </header>
        {!workspace ? (
          <p>Loading program…</p>
        ) : !workspace.patient ? (
          <p>{status || "Patient unavailable."}</p>
        ) : (
          <>
            <section className="grid two">
              <div className="panel form">
                <h3>Patient prescriptions</h3>
                <fieldset
                  disabled={busy}
                  className="form"
                  style={{ border: 0, padding: 0, minWidth: 0 }}
                >
                  {items.map((item) => (
                    <article key={item.id} className="list-item form">
                      <PrescriptionFields
                        prefix={item.id}
                        value={prescriptionFromItem(item)}
                        onChange={(value) => {
                          setItems((current) =>
                            current.map((x) =>
                              x.id === item.id
                                ? { ...x, prescription: value }
                                : x,
                            ),
                          );
                          setDirty(true);
                          setReview(false);
                          setPreview(false);
                        }}
                      />
                      {!item.id.startsWith("draft-") ? (
                        <ProgramExerciseRecording
                          item={item}
                          patientId={patientId}
                        />
                      ) : (
                        <p>
                          Template copied into this patient’s draft. Save after
                          review.
                        </p>
                      )}
                    </article>
                  ))}
                  {!items.length ? (
                    <p>
                      Add a standard exercise or create a personalized one
                      below.
                    </p>
                  ) : null}
                  {dirty ? (
                    <>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setPreview(true)}
                      >
                        Preview patient prescriptions
                      </button>
                      {preview ? (
                        <section className="form">
                          {items.map((item) => (
                            <PrescriptionSummary
                              key={item.id}
                              value={prescriptionFromItem(item)}
                            />
                          ))}
                        </section>
                      ) : null}
                      <label>
                        <input
                          type="checkbox"
                          disabled={!preview}
                          checked={review}
                          onChange={(e) => setReview(e.target.checked)}
                        />{" "}
                        I reviewed and approve these patient-specific
                        prescriptions.
                      </label>
                      <button
                        type="button"
                        className="button"
                        disabled={!review}
                        onClick={save}
                      >
                        Approve & Save Program
                      </button>
                    </>
                  ) : null}
                </fieldset>
                {status ? <p role="status">{status}</p> : null}
              </div>
              <section className="panel form">
                <h3>Standard Exercise Library</h3>
                <p>
                  Reusable identity, demonstration, description and equipment.
                  Set dosage and individual cues in the patient card.
                </p>
                {library.map((exercise) => (
                  <article className="list-item" key={exercise.id}>
                    <h4>{exercise.name}</h4>
                    <p>
                      {exercise.category} · {exercise.tags?.join(" · ")}
                    </p>
                    <ExerciseVideo
                      url={exercise.video_url}
                      name={exercise.name ?? "Exercise"}
                    />
                    <p>{exercise.clinical_purpose ?? exercise.description}</p>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => add(exercise)}
                    >
                      Add standard exercise
                    </button>
                  </article>
                ))}
              </section>
            </section>
            <PersonalizedExerciseCreator
              items={items}
              patientId={patientId}
              disabled={dirty || busy}
              onApproved={load}
            />
          </>
        )}
      </RequireAuth>
    </AppShell>
  );
}
