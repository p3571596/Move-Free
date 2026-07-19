"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Activity, ArrowLeft, CheckCircle2, HeartPulse, Home, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GoalProgress } from "@/components/GoalProgress";
import { ProgressBars } from "@/components/ProgressBars";
import { RequireAuth } from "@/components/RequireAuth";
import { RoleGate } from "@/components/RoleGate";
import { emptyWorkspace, loadPatientWorkspace } from "@/lib/data";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { HomeProgramExercise, PatientWorkspace } from "@/lib/types";

type PreviewTab = "home" | "program" | "response" | "progress";

export default function PatientPreviewPage() {
  const params = useParams<{ id: string }>();
  const patientId = params.id;
  const [workspace, setWorkspace] = useState<PatientWorkspace | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<PreviewTab>("home");
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!patientId) return;
    if (!isSupabaseConfigured()) {
      setWorkspace(emptyWorkspace());
      return;
    }

    loadPatientWorkspace(createSupabaseBrowserClient(), patientId, "clinician")
      .then(setWorkspace)
      .catch((cause) => setError(errorMessage(cause, "Could not load the patient preview.")));
  }, [patientId]);

  const groups = useMemo(() => groupExercises(workspace?.programExercises ?? []), [workspace?.programExercises]);
  const patientName = workspace?.patient?.display_name ?? workspace?.patient?.name ?? "Patient";
  const goal = workspace?.goals[0];
  const goalTitle = goal?.title ?? workspace?.patient?.goal ?? "Your therapist is preparing your goal";
  const goalProgress = goal?.progress_percent ?? workspace?.patient?.progress_percent ?? 0;
  const completed = workspace?.adherenceLogs.filter((log) => log.completion_status === "completed").length ?? 0;

  return (
    <AppShell>
      <RequireAuth><RoleGate allowed={["clinician", "admin"]}>
        <div className="topbar patient-preview-heading">
          <div>
            <p className="eyebrow">Patient app preview</p>
            <h2>{patientName}</h2>
            <p className="muted">This preview uses the patient&apos;s real goal and assigned program but does not save responses.</p>
          </div>
          <div className="builder-actions">
            <Link className="secondary-button" href={patientId ? `/patients/${patientId}/edit` : "/patients"}>Edit Goal</Link>
            <Link className="secondary-button" href={patientId ? `/patients/${patientId}` : "/patients"}><ArrowLeft size={17} /> Back to Workspace</Link>
          </div>
        </div>

        {!workspace && !error ? <div className="empty">Loading the patient experience…</div> : null}
        {error ? <div className="empty form-error" role="alert">{error}</div> : null}
        {workspace && !workspace.patient ? <div className="empty">This patient is not available to the current therapist.</div> : null}

        {workspace?.patient ? (
          <section className="patient-preview-stage">
            <div className="patient-preview-device">
              <header className="patient-preview-appbar">
                <span className="brand-mark">MF</span>
                <span><strong>Move Free</strong><small>Patient view</small></span>
                <span className="pill">Preview</span>
              </header>

              <div className="patient-preview-content">
                {tab === "home" ? (
                  <>
                    <p className="eyebrow">Welcome back, {patientName}</p>
                    <section className="patient-goal-hero patient-goal-hero-compact">
                      <div><p className="eyebrow">Current goal</p><h1>{goalTitle}</h1><p className="muted">{workspace.patient.current_focus ?? "Keep moving toward what matters to you."}</p></div>
                      <div className="patient-goal-score"><strong>{goalProgress}%</strong><span>progress</span></div>
                    </section>
                    <div className="patient-action-stack">
                      <button className="card row-between" type="button" onClick={() => setTab("program")}><span><strong>Start Today&apos;s Program</strong><small>{workspace.programExercises.length} exercises ready</small></span><Activity color="var(--accent)" /></button>
                      <button className="card row-between" type="button" onClick={() => setTab("response")}><span><strong>Share Today&apos;s Response</strong><small>Pain, confidence, and a note for your PT</small></span><HeartPulse color="var(--coral)" /></button>
                      <button className="card row-between" type="button" onClick={() => setTab("progress")}><span><strong>View Goal Progress</strong><small>See what is changing over time</small></span><TrendingUp color="var(--blue)" /></button>
                    </div>
                    {workspace.program?.patient_explanation || workspace.episode?.clinical_summary ? <section className="panel patient-reminder"><p className="eyebrow">From your therapist</p><p>{workspace.program?.patient_explanation ?? workspace.episode?.clinical_summary}</p></section> : null}
                  </>
                ) : null}

                {tab === "program" ? (
                  <>
                    <PreviewSectionHeader eyebrow="Today’s program" title={workspace.program?.name ?? "Your movement plan"} onBack={() => setTab("home")} />
                    {!workspace.programExercises.length ? <div className="empty">No exercises are assigned yet.</div> : groups.map(([category, items]) => (
                      <section className="patient-program-group" key={category}>
                        <div className="section-header"><h3>{formatCategory(category)}</h3><span className="pill">{items.length}</span></div>
                        <div className="exercise-card-list">{items.map((item) => {
                          const checked = completedIds.has(item.id);
                          return <button className={`patient-exercise-card${checked ? " is-complete" : ""}`} type="button" key={item.id} onClick={() => toggleCompleted(item.id, setCompletedIds)}><span className="exercise-check">{checked ? "✓" : ""}</span><span className="exercise-copy"><strong>{item.exercise?.name ?? "Exercise"}</strong><span>{formatDosage(item)}</span>{item.exercise?.patient_instructions ? <small>{item.exercise.patient_instructions}</small> : null}{item.notes ? <small>PT note: {item.notes}</small> : null}</span></button>;
                        })}</div>
                      </section>
                    ))}
                    {workspace.programExercises.length ? <button className="button preview-save-button" type="button" onClick={() => setTab("response")}><CheckCircle2 size={18} /> Finish and share response</button> : null}
                  </>
                ) : null}

                {tab === "response" ? (
                  <>
                    <PreviewSectionHeader eyebrow="Today’s response" title="How are you doing today?" onBack={() => setTab("home")} />
                    <div className="panel form">
                      <label className="field"><span>Pain intensity (0–10)</span><input type="range" min={0} max={10} defaultValue={3} /></label>
                      <label className="field"><span>What were you doing?</span><select defaultValue=""><option value="">Choose an activity</option><option>Walking</option><option>Sitting</option><option>Exercising</option><option>Sleeping</option><option>Something else</option></select></label>
                      <label className="field"><span>Confidence in your progress (0–10)</span><input type="number" min={0} max={10} defaultValue={7} /></label>
                      <label className="field"><span>What would you like your PT to know?</span><textarea placeholder="Share what felt better, harder, or different today." /></label>
                      <button className="button" type="button">Save today&apos;s response</button>
                      <p className="preview-note">Preview only—nothing entered here is saved.</p>
                    </div>
                  </>
                ) : null}

                {tab === "progress" ? (
                  <>
                    <PreviewSectionHeader eyebrow="My progress" title="Your movement journey" onBack={() => setTab("home")} />
                    <GoalProgress goals={workspace.goals} />
                    <section className="panel" style={{ marginTop: 14 }}><p className="eyebrow">Progress trend</p>{workspace.progressMetrics.length ? <ProgressBars metrics={workspace.progressMetrics} /> : <p className="muted">Progress measurements will appear here after your therapist records them.</p>}</section>
                    <section className="panel" style={{ marginTop: 14 }}><p className="eyebrow">Exercise completion</p><h3>{completed} exercises completed</h3><p className="muted">Your completed sessions and streaks will build here over time.</p></section>
                  </>
                ) : null}
              </div>

              <nav className="patient-preview-tabs" aria-label="Patient preview navigation">
                <button className={tab === "home" ? "active" : ""} type="button" onClick={() => setTab("home")}><Home size={17} />Home</button>
                <button className={tab === "program" ? "active" : ""} type="button" onClick={() => setTab("program")}><Activity size={17} />Program</button>
                <button className={tab === "progress" ? "active" : ""} type="button" onClick={() => setTab("progress")}><TrendingUp size={17} />Progress</button>
              </nav>
            </div>
          </section>
        ) : null}
      </RoleGate></RequireAuth>
    </AppShell>
  );
}

function PreviewSectionHeader({ eyebrow, title, onBack }: { eyebrow: string; title: string; onBack: () => void }) {
  return <div className="patient-preview-section-header"><button className="icon-button" type="button" onClick={onBack} aria-label="Return to patient home"><ArrowLeft size={17} /></button><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div></div>;
}

function groupExercises(items: HomeProgramExercise[]) {
  const grouped = new Map<string, HomeProgramExercise[]>();
  for (const item of items) {
    const category = item.category ?? item.exercise?.category ?? "other";
    grouped.set(category, [...(grouped.get(category) ?? []), item]);
  }
  return [...grouped.entries()];
}

function formatCategory(category: string) {
  return category.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDosage(item: HomeProgramExercise) {
  return [item.dosage_sets ? `${item.dosage_sets} sets` : null, item.dosage_reps ? `${item.dosage_reps} reps` : null, item.frequency].filter(Boolean).join(" · ") || "Follow your therapist’s instructions";
}

function toggleCompleted(id: string, setCompleted: Dispatch<SetStateAction<Set<string>>>) {
  setCompleted((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
}

function errorMessage(cause: unknown, fallback: string) {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string") return cause.message;
  return fallback;
}
