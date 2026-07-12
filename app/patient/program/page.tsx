"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, HeartPulse } from "lucide-react";
import { PatientShell } from "@/components/PatientShell";
import { RoleGate } from "@/components/RoleGate";
import { RequireAuth } from "@/components/RequireAuth";
import { loadCurrentPatientAppWorkspace, logExerciseCompletion } from "@/lib/data";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { HomeProgramExercise, PatientWorkspace } from "@/lib/types";

const categoryOrder = ["warm_up", "mobility", "strength", "balance", "conditioning", "cool_down", "education", "other"];

export default function TodayProgramPage() {
  const [workspace, setWorkspace] = useState<PatientWorkspace | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setError("The patient app is not configured yet.");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    loadCurrentPatientAppWorkspace(supabase)
      .then(setWorkspace)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load your program."));
  }, []);

  const groups = useMemo(() => groupExercises(workspace?.programExercises ?? []), [workspace?.programExercises]);

  function toggleExercise(id: string) {
    setCompletedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace?.patient || !workspace.program) {
      setError("Your clinician has not assigned an active program yet.");
      return;
    }
    if (!completedIds.size) {
      setError("Select at least one exercise you completed today.");
      return;
    }

    const form = event.currentTarget;
    const data = new FormData(form);
    const difficulty = String(data.get("difficulty") ?? "appropriate");
    const comments = String(data.get("comments") ?? "");
    const client = createSupabaseBrowserClient();
    setSaving(true);
    setError("");

    try {
      await Promise.all(workspace.programExercises.map((item) => logExerciseCompletion(
        client,
        workspace.patient!.id,
        workspace.program!.id,
        item.id,
        completedIds.has(item.id) ? "completed" : "skipped",
        difficulty,
        null,
        null,
        comments,
      )));
      setMessage("Today’s program was saved. Great work.");
      setCompletedIds(new Set());
      form.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save today’s program.");
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
          {workspace?.patient && !workspace.program ? (
            <div className="empty"><strong>No active program yet.</strong><p>Your clinician is still preparing your movement plan.</p></div>
          ) : null}
          {workspace?.program && !workspace.programExercises.length ? (
            <div className="empty"><strong>No exercises assigned yet.</strong><p>Your clinician can add exercises to this program.</p></div>
          ) : null}

          {workspace?.programExercises.length ? (
            <form className="program-session" onSubmit={submit}>
              {groups.map(([category, items]) => (
                <section className="patient-program-group" key={category}>
                  <div className="section-header">
                    <h3>{formatCategory(category)}</h3>
                    <span className="pill">{items.length} {items.length === 1 ? "exercise" : "exercises"}</span>
                  </div>
                  <div className="exercise-card-list">
                    {items.map((item) => {
                      const checked = completedIds.has(item.id);
                      return (
                        <button
                          className={`patient-exercise-card${checked ? " is-complete" : ""}`}
                          key={item.id}
                          type="button"
                          onClick={() => toggleExercise(item.id)}
                          aria-pressed={checked}
                        >
                          <span className="exercise-check" aria-hidden="true">{checked ? "✓" : ""}</span>
                          <span className="exercise-copy">
                            <strong>{item.exercise?.name ?? "Exercise"}</strong>
                            <span>{formatDosage(item)}</span>
                            {item.exercise?.patient_instructions ? <small>{item.exercise.patient_instructions}</small> : null}
                            {item.notes ? <small>PT note: {item.notes}</small> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}

              <section className="panel form session-finish-card">
                <div>
                  <p className="eyebrow">Finish session</p>
                  <h3>How did today&apos;s program feel?</h3>
                </div>
                <div className="field">
                  <label htmlFor="difficulty">Overall difficulty</label>
                  <select id="difficulty" name="difficulty" defaultValue="appropriate">
                    <option value="too_easy">Easy</option>
                    <option value="appropriate">Normal</option>
                    <option value="too_hard">Hard</option>
                    <option value="painful">Painful</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="comments">Anything you want your PT to know? (optional)</label>
                  <textarea id="comments" name="comments" placeholder="Share how the session went." />
                </div>
                <button className="button" type="submit" disabled={saving}>
                  <CheckCircle2 size={18} />
                  {saving ? "Saving…" : "Finish today’s program"}
                </button>
                {message ? <div className="success-banner" role="status"><strong>{message}</strong><Link href="/patient/pain-pattern"><HeartPulse size={17} /> Log a pain pattern</Link></div> : null}
                {error ? <p className="form-error" role="alert">{error}</p> : null}
              </section>
            </form>
          ) : null}
        </div>
      </RoleGate></RequireAuth>
    </PatientShell>
  );
}

function groupExercises(items: HomeProgramExercise[]) {
  const grouped = new Map<string, HomeProgramExercise[]>();
  for (const item of items) {
    const category = item.category ?? item.exercise?.category ?? "other";
    grouped.set(category, [...(grouped.get(category) ?? []), item]);
  }
  return [...grouped.entries()].sort(([left], [right]) => categoryOrder.indexOf(left) - categoryOrder.indexOf(right));
}

function formatCategory(category: string) {
  return category.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDosage(item: HomeProgramExercise) {
  const parts = [
    item.dosage_sets ? `${item.dosage_sets} sets` : null,
    item.dosage_reps ? `${item.dosage_reps} reps` : null,
    item.frequency,
  ].filter(Boolean);
  return parts.join(" · ") || "Follow your therapist’s instructions";
}

function PatientLinkEmptyState() {
  return <div className="empty"><strong>Your account still needs to be linked.</strong><p>Ask your clinician to resend the invitation, then open that link while signed in with this account.</p></div>;
}
