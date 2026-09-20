"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Play } from "lucide-react";
import { PatientShell } from "@/components/PatientShell";
import { RoleGate } from "@/components/RoleGate";
import { RequireAuth } from "@/components/RequireAuth";
import { loadCurrentPatientAppWorkspace, logExerciseSession, logPainPattern, type ExerciseLogInput } from "@/lib/data";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { HomeProgramExercise, PatientWorkspace } from "@/lib/types";

const categoryOrder = ["warm_up", "mobility", "strength", "balance", "conditioning", "cool_down", "education", "other"];

type EntryState = Omit<ExerciseLogInput, "homeProgramExerciseId"> & { statusChosen: boolean };

export default function TodayProgramPage() {
  const [workspace, setWorkspace] = useState<PatientWorkspace | null>(null);
  const [entries, setEntries] = useState<Record<string, EntryState>>({});
  const [step, setStep] = useState(0);
  const [started, setStarted] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [direction, setDirection] = useState<"improving" | "unchanged" | "worsening">("unchanged");
  const [directionChosen, setDirectionChosen] = useState(false);
  const [pain, setPain] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [logsSaved, setLogsSaved] = useState(false);
  const workflowStartedAt = useRef(Date.now());

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setError("The patient app is not configured yet.");
      return;
    }
    loadCurrentPatientAppWorkspace(createSupabaseBrowserClient())
      .then((data) => {
        setWorkspace(data);
        setEntries(Object.fromEntries(data.programExercises.map((item) => [item.id, emptyEntry()])));
        workflowStartedAt.current = Date.now();
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load your program."));
  }, []);

  const groups = useMemo(() => groupExercises(workspace?.programExercises ?? []), [workspace?.programExercises]);

  const orderedExercises = groups.flatMap(([,items])=>items);

  function updateEntry(id: string, patch: Partial<EntryState>) {
    setEntries((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace?.patient || !workspace.program) {
      setError("Your clinician has not assigned an active program yet.");
      return;
    }
    const unanswered = workspace.programExercises.filter((item) => !entries[item.id]?.statusChosen);
    if (unanswered.length) {
      setError(`Choose Completed, Partially completed, or Skipped for ${unanswered.length} exercise${unanswered.length === 1 ? "" : "s"}.`);
      return;
    }

    if (!directionChosen) { setError("Choose Better, Same, or Worse before sending your feedback."); return; }
    setSaving(true);
    setError("");
    try {
      if (!logsSaved) await logExerciseSession(
        createSupabaseBrowserClient(),
        workspace.patient.id,
        workspace.program.id,
        workspace.programExercises.map((item) => ({ homeProgramExerciseId: item.id, ...entries[item.id] })),
        sessionId,
        Date.now() - workflowStartedAt.current,
      );
      setLogsSaved(true);
      await logPainPattern(createSupabaseBrowserClient(), {
        patientId: workspace.patient.id, episodeId: workspace.episode!.id,
        painScore: pain, painLocation: "", symptomBehavior: "", activityContext: "Exercise session",
        aggravatingFactors: "", easingFactors: "", confidenceScore: null,
        symptomDirection: direction, patientComment: comment, clientSubmissionId: sessionId,
        durationMs: Date.now() - workflowStartedAt.current,
      });
      setMessage("Your session and feedback are saved. Your therapist can review them during their usual working hours.");
      workflowStartedAt.current = Date.now();
    } catch (cause) {
      const duplicate = cause instanceof Error && cause.message.includes("duplicate key");
      setError(duplicate ? "This session was already saved. Your therapist can see it." : cause instanceof Error ? cause.message : "Could not save today’s program.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PatientShell>
      <RequireAuth><RoleGate allowed={["patient"]}>
        <div className="patient-screen">
          <header className="patient-page-heading">
            <p className="eyebrow">Program</p>
            <h1>{workspace?.program?.title ?? "Today&apos;s plan"}</h1>
            <p>{workspace?.programExercises.length ?? 0} exercises assigned by your therapist.</p>
          </header>

          {!workspace && !error ? <div className="empty">Loading today&apos;s program…</div> : null}
          {error && !workspace ? <div className="empty form-error" role="alert">{error}</div> : null}
          {workspace && !workspace.patient ? <PatientLinkEmptyState /> : null}
          {workspace?.patient && !workspace.program ? <div className="empty"><strong>No active program yet.</strong><p>Your clinician is still preparing your movement plan.</p></div> : null}
          {workspace?.program && !workspace.programExercises.length ? <div className="empty"><strong>No exercises assigned yet.</strong><p>Your clinician can add exercises to this program.</p></div> : null}

          {workspace?.programExercises.length && !started ? (
            <section className="panel patient-start-card">
              <p className="eyebrow">Ready when you are</p>
              <h3>{workspace.programExercises.length} exercises in today&apos;s plan</h3>
              <p className="muted">Record what you complete. Add pain, difficulty, or a note only when it helps your therapist understand the session.</p>
              <button className="button" type="button" onClick={() => setStarted(true)}><Play size={18} /> Start today&apos;s program</button>
            </section>
          ) : null}

          {workspace?.programExercises.length && started ? (
            <form className="program-session" onSubmit={submit}>
              <fieldset disabled={saving || Boolean(message) || logsSaved} style={{ border: 0, padding: 0, minWidth: 0 }}>
              {step < orderedExercises.length ? <section className="patient-program-group">
                <p className="eyebrow">Exercise {step + 1} of {orderedExercises.length}</p>
                <ExerciseEntryCard item={orderedExercises[step]} value={entries[orderedExercises[step].id]} onChange={patch=>updateEntry(orderedExercises[step].id,patch)}/>
                <div className="row-between" style={{marginTop:16}}><button type="button" className="secondary-button" disabled={step===0} onClick={()=>setStep(step-1)}>Back</button><button type="button" className="button" disabled={!entries[orderedExercises[step].id]?.statusChosen} onClick={()=>setStep(step+1)}>{step===orderedExercises.length-1 ? "Finish and share feedback" : "Next exercise"}</button></div>
              </section> : <button type="button" className="secondary-button" onClick={()=>setStep(0)}>Review exercise responses</button>}

              </fieldset>
              {step === orderedExercises.length ? <section className="panel form session-finish-card">
                <fieldset disabled={saving || Boolean(message)} className="segmented-field">
                  <legend>How did today feel overall?</legend>
                  <div className="segment-options">{([["improving", "Better"], ["unchanged", "Same"], ["worsening", "Worse"]] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={directionChosen && direction === value} className={directionChosen && direction === value ? "active" : ""} onClick={() => { setDirection(value); setDirectionChosen(true); }}>{label}</button>)}</div>
                  <NumberField label="Pain after (0–10, optional)" value={pain} max={10} onChange={setPain}/>
                  <div className="field"><label htmlFor="session-comment">Anything your therapist should know? (optional)</label><textarea id="session-comment" maxLength={2000} value={comment} onChange={event => setComment(event.target.value)}/></div>
                </fieldset>
                <p className="muted">Your therapist reviews updates during their usual working hours. This is not monitored continuously.</p>
                <div><p className="eyebrow">Finish session</p><h3>Send today&apos;s results to your therapist</h3></div>
                <button className="button" type="submit" disabled={saving || Boolean(message)}><CheckCircle2 size={18} />{saving ? "Saving…" : message ? "Program saved" : "Finish today’s program"}</button>
                {message ? <div className="success-banner" role="status"><strong>{message}</strong><Link href="/patient">Return to Today</Link></div> : null}
                {error ? <p className="form-error" role="alert">{error}</p> : null}
              </section> : null}
            </form>
          ) : null}
        </div>
      </RoleGate></RequireAuth>
    </PatientShell>
  );
}

function ExerciseEntryCard({ item, value, onChange }: { item: HomeProgramExercise; value?: EntryState; onChange: (patch: Partial<EntryState>) => void }) {
  if (!value) return null;
  return (
    <article className={`patient-exercise-entry${value.statusChosen ? " has-status" : ""}`}>
      <div className="exercise-entry-heading">
        <div><h4>{item.exercise?.name ?? "Exercise"}</h4><strong>{formatDosage(item)}</strong></div>
        <span className="pill">{formatCategory(item.category ?? item.exercise?.category ?? "other")}</span>
      </div>
      {item.exercise?.patient_instructions ? <p>{item.exercise.patient_instructions}</p> : null}
      {item.exercise?.video_url?.startsWith("https://") ? <a className="secondary-button" href={item.exercise.video_url} target="_blank" rel="noopener noreferrer">Watch exercise video</a> : null}
      {item.notes ? <p className="therapist-note"><strong>Therapist note:</strong> {item.notes}</p> : null}
      <fieldset className="segmented-field">
        <legend>What did you complete?</legend>
        <div className="segment-options">
          {(["completed", "partial", "skipped"] as const).map((status) => (
            <button key={status} className={value.statusChosen && value.completionStatus === status ? "active" : ""} type="button" onClick={() => onChange({ completionStatus: status, statusChosen: true })}>{status === "partial" ? "Partially completed" : titleCase(status)}</button>
          ))}
        </div>
      </fieldset>
      <details><summary>Optional exercise details</summary><div className="exercise-log-grid">
        <NumberField label="Actual sets" value={value.actualSets} onChange={(actualSets) => onChange({ actualSets })} />
        <NumberField label="Actual reps" value={value.actualReps} onChange={(actualReps) => onChange({ actualReps })} />
        <NumberField label="Minutes" value={value.actualDurationMinutes} onChange={(actualDurationMinutes) => onChange({ actualDurationMinutes })} />
        <NumberField label="Pain during (0–10)" value={value.painDuring} max={10} onChange={(painDuring) => onChange({ painDuring })} />
      </div>
      </details><div className="field"><label htmlFor={`difficulty-${item.id}`}>Difficulty</label><select id={`difficulty-${item.id}`} value={value.difficulty ?? ""} onChange={(event) => onChange({ difficulty: (event.target.value || null) as EntryState["difficulty"] })}><option value="">Not rated</option><option value="too_easy">Too easy</option><option value="appropriate">About right</option><option value="too_hard">Too hard</option></select></div>
      <div className="field"><label htmlFor={`comment-${item.id}`}>Comment (optional)</label><textarea id={`comment-${item.id}`} value={value.notes} onChange={(event) => onChange({ notes: event.target.value })} placeholder="For example: this felt easier today, or pain started after rep 8." /></div>
    </article>
  );
}

function NumberField({ label, value, max, onChange }: { label: string; value: number | null; max?: number; onChange: (value: number | null) => void }) {
  return <div className="field"><label>{label}<input type="number" min={0} max={max} value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} /></label></div>;
}

function emptyEntry(): EntryState {
  return { completionStatus: "completed", statusChosen: false, difficulty: null, painDuring: null, actualSets: null, actualReps: null, actualDurationMinutes: null, notes: "" };
}

function groupExercises(items: HomeProgramExercise[]) { const grouped = new Map<string, HomeProgramExercise[]>(); for (const item of items) { const category = item.category ?? item.exercise?.category ?? "other"; grouped.set(category, [...(grouped.get(category) ?? []), item]); } return [...grouped.entries()].sort(([left], [right]) => categoryOrder.indexOf(left) - categoryOrder.indexOf(right)); }
function formatCategory(category: string) { return category.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDosage(item: HomeProgramExercise) { return [item.dosage_sets ? `${item.dosage_sets} sets` : null, item.dosage_reps ? `${item.dosage_reps} reps` : null, item.frequency].filter(Boolean).join(" · ") || "Follow your therapist’s instructions"; }
function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function PatientLinkEmptyState() { return <div className="empty"><strong>Your account still needs to be linked.</strong><p>Ask your clinician to resend the invitation, then open that link while signed in with this account.</p></div>; }
