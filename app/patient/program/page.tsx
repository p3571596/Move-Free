"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, HeartPulse, Play } from "lucide-react";
import { PatientShell } from "@/components/PatientShell";
import { RoleGate } from "@/components/RoleGate";
import { RequireAuth } from "@/components/RequireAuth";
import { loadCurrentPatientAppWorkspace, logExerciseSession, type ExerciseLogInput } from "@/lib/data";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { HomeProgramExercise, PatientWorkspace } from "@/lib/types";

const categoryOrder = ["warm_up", "mobility", "strength", "balance", "conditioning", "cool_down", "education", "other"];

type EntryState = Omit<ExerciseLogInput, "homeProgramExerciseId"> & { statusChosen: boolean };

export default function TodayProgramPage() {
  const [workspace, setWorkspace] = useState<PatientWorkspace | null>(null);
  const [entries, setEntries] = useState<Record<string, EntryState>>({});
  const [started, setStarted] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setError("The patient app is not configured yet.");
      return;
    }
    loadCurrentPatientAppWorkspace(createSupabaseBrowserClient())
      .then((data) => {
        setWorkspace(data);
        setEntries(Object.fromEntries(data.programExercises.map((item) => [item.id, emptyEntry(item)])));
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load your program."));
  }, []);

  const groups = useMemo(() => groupExercises(workspace?.programExercises ?? []), [workspace?.programExercises]);

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

    setSaving(true);
    setError("");
    try {
      await logExerciseSession(
        createSupabaseBrowserClient(),
        workspace.patient.id,
        workspace.program.id,
        workspace.programExercises.map((item) => ({ homeProgramExerciseId: item.id, ...entries[item.id] })),
        sessionId,
      );
      setMessage("Today’s program was saved. Your therapist can now review it.");
      setSessionId(crypto.randomUUID());
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
        <div className="mobile-frame">
          <div className="topbar">
            <div>
              <p className="eyebrow">Today&apos;s program</p>
              <h2>{workspace?.program?.title ?? "Your movement plan"}</h2>
              {workspace?.program?.patient_explanation ? <p className="muted">{workspace.program.patient_explanation}</p> : null}
            </div>
          </div>

          {!workspace && !error ? <div className="empty">Loading today&apos;s program…</div> : null}
          {error && !workspace ? <div className="empty form-error" role="alert">{error}</div> : null}
          {workspace && !workspace.patient ? <PatientLinkEmptyState /> : null}
          {workspace?.patient && !workspace.program ? <div className="empty"><strong>No active program yet.</strong><p>Your clinician is still preparing your movement plan.</p></div> : null}
          {workspace?.program && !workspace.programExercises.length ? <div className="empty"><strong>No exercises assigned yet.</strong><p>Your clinician can add exercises to this program.</p></div> : null}

          {workspace?.programExercises.length && !started ? (
            <section className="panel patient-start-card">
              <p className="eyebrow">Ready when you are</p>
              <h3>{workspace.programExercises.length} exercises in today&apos;s plan</h3>
              <p className="muted">Record what you actually completed. You can also note pain, difficulty, or anything your therapist should know.</p>
              <button className="button" type="button" onClick={() => setStarted(true)}><Play size={18} /> Start today&apos;s program</button>
            </section>
          ) : null}

          {workspace?.programExercises.length && started ? (
            <form className="program-session" onSubmit={submit}>
              {groups.map(([category, items]) => (
                <section className="patient-program-group" key={category}>
                  <div className="section-header"><h3>{formatCategory(category)}</h3><span className="pill">{items.length} {items.length === 1 ? "exercise" : "exercises"}</span></div>
                  <div className="exercise-card-list">
                    {items.map((item) => <ExerciseEntryCard key={item.id} item={item} value={entries[item.id]} onChange={(patch) => updateEntry(item.id, patch)} />)}
                  </div>
                </section>
              ))}

              <section className="panel form session-finish-card">
                <div><p className="eyebrow">Finish session</p><h3>Send today&apos;s results to your therapist</h3></div>
                <button className="button" type="submit" disabled={saving || Boolean(message)}><CheckCircle2 size={18} />{saving ? "Saving…" : message ? "Program saved" : "Finish today’s program"}</button>
                {message ? <div className="success-banner" role="status"><strong>{message}</strong><Link href="/patient/pain-pattern"><HeartPulse size={17} /> Add today&apos;s check-in</Link></div> : null}
                {error ? <p className="form-error" role="alert">{error}</p> : null}
              </section>
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
      {item.notes ? <p className="therapist-note"><strong>Therapist note:</strong> {item.notes}</p> : null}
      <fieldset className="segmented-field">
        <legend>What did you complete?</legend>
        <div className="segment-options">
          {(["completed", "partial", "skipped"] as const).map((status) => (
            <button key={status} className={value.statusChosen && value.completionStatus === status ? "active" : ""} type="button" onClick={() => onChange({ completionStatus: status, statusChosen: true })}>{status === "partial" ? "Partially completed" : titleCase(status)}</button>
          ))}
        </div>
      </fieldset>
      <div className="exercise-log-grid">
        <NumberField label="Actual sets" value={value.actualSets} onChange={(actualSets) => onChange({ actualSets })} />
        <NumberField label="Actual reps" value={value.actualReps} onChange={(actualReps) => onChange({ actualReps })} />
        <NumberField label="Minutes" value={value.actualDurationMinutes} onChange={(actualDurationMinutes) => onChange({ actualDurationMinutes })} />
        <NumberField label="Pain during (0–10)" value={value.painDuring} max={10} onChange={(painDuring) => onChange({ painDuring })} />
      </div>
      <div className="field"><label htmlFor={`difficulty-${item.id}`}>Difficulty</label><select id={`difficulty-${item.id}`} value={value.difficulty} onChange={(event) => onChange({ difficulty: event.target.value as EntryState["difficulty"] })}><option value="too_easy">Easy</option><option value="appropriate">About right</option><option value="too_hard">Hard</option></select></div>
      <div className="field"><label htmlFor={`comment-${item.id}`}>Comment (optional)</label><textarea id={`comment-${item.id}`} value={value.notes} onChange={(event) => onChange({ notes: event.target.value })} placeholder="For example: this felt easier today, or pain started after rep 8." /></div>
    </article>
  );
}

function NumberField({ label, value, max, onChange }: { label: string; value: number | null; max?: number; onChange: (value: number | null) => void }) {
  return <div className="field"><label>{label}<input type="number" min={0} max={max} value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} /></label></div>;
}

function emptyEntry(item: HomeProgramExercise): EntryState {
  return { completionStatus: "completed", statusChosen: false, difficulty: "appropriate", painDuring: null, actualSets: numberOrNull(item.dosage_sets), actualReps: numberOrNull(item.dosage_reps), actualDurationMinutes: null, notes: "" };
}

function numberOrNull(value?: string | null) { const parsed = Number(value); return value && Number.isFinite(parsed) ? parsed : null; }
function groupExercises(items: HomeProgramExercise[]) { const grouped = new Map<string, HomeProgramExercise[]>(); for (const item of items) { const category = item.category ?? item.exercise?.category ?? "other"; grouped.set(category, [...(grouped.get(category) ?? []), item]); } return [...grouped.entries()].sort(([left], [right]) => categoryOrder.indexOf(left) - categoryOrder.indexOf(right)); }
function formatCategory(category: string) { return category.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDosage(item: HomeProgramExercise) { return [item.dosage_sets ? `${item.dosage_sets} sets` : null, item.dosage_reps ? `${item.dosage_reps} reps` : null, item.frequency].filter(Boolean).join(" · ") || "Follow your therapist’s instructions"; }
function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function PatientLinkEmptyState() { return <div className="empty"><strong>Your account still needs to be linked.</strong><p>Ask your clinician to resend the invitation, then open that link while signed in with this account.</p></div>; }
