"use client";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { pilotFeatureEnabled } from "@/lib/pilot-flags";
import { sampleVideoFrames } from "@/lib/sample-video-frames";
import {
  blankAIExercise,
  validateAIExercise,
  contentFields,
  type AIExerciseContent,
} from "@/lib/ai-exercise-content";
import { PrescriptionFields } from "./PrescriptionFields";
import type { Json } from "@/lib/types";
export function AIExerciseDraftReview({
  file,
  onApply,
}: {
  file: File;
  onApply: (draft: AIExerciseContent, runId: string) => void;
}) {
  const [enabled, setEnabled] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [runId, setRunId] = useState(""),
    [content, setContent] = useState<AIExerciseContent>(blankAIExercise),
    [limitations, setLimitations] = useState<string[]>([]),
    [reviewed, setReviewed] = useState(false);
  useEffect(() => {
    let active = true;
    void pilotFeatureEnabled(
      createSupabaseBrowserClient(),
      "ai_video_assistance",
    ).then((v) => {
      if (active) setEnabled(v);
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    setConfirmed(false);
    setRunId("");
    setContent(blankAIExercise());
    setReviewed(false);
    setError("");
  }, [file]);
  async function generate() {
    if (!confirmed || busy) return;
    setBusy(true);
    setError("");
    setRunId("");
    setReviewed(false);
    try {
      if (file.size > 2500000)
        throw new Error(
          "Use a short self-demonstration under 2.5 MB for AI. Larger recordings can still be saved manually.",
        );
      const frames = await sampleVideoFrames(file);
      const db = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await db.auth.getSession();
      if (!session) throw new Error("Sign in again.");
      const body = new FormData();
      body.set("video", file);
      body.set("frames", JSON.stringify(frames));
      body.set("selfDemonstration", "true");
      const response = await fetch("/api/exercise-draft", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body,
        signal: AbortSignal.timeout(120000),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "AI drafting unavailable.");
      setContent(validateAIExercise(data.content));
      setRunId(data.runId);
      setLimitations(data.limitations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI drafting failed.");
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!runId || !reviewed) return;
    setBusy(true);
    setError("");
    try {
      const final = validateAIExercise(content);
      if (!final.name || !final.instructions)
        throw new Error("Review the exercise name and patient instructions.");
      const { error } = await createSupabaseBrowserClient().rpc(
        "review_clinician_ai_draft",
        { p_id: runId, p_content: final as unknown as Json },
      );
      if (error)
        throw new Error(
          "Draft review could not be saved. Check your access and retry.",
        );
      onApply(final, runId);
      setRunId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review failed.");
    } finally {
      setBusy(false);
    }
  }
  if (!enabled) return null;
  const labels = {
    name: "Exercise name",
    exercise_type: "Exercise type",
    instructions: "Patient instructions",
    cues: "Movement cues",
    equipment: "Equipment",
  };
  return (
    <section className="form" aria-label="AI exercise draft">
      <h4>Optional AI assistance</h4>
      <p>
        Use only your own demonstration with no patient information. AI drafts
        instructions and spoken dosage for your review. It does not compare
        videos or assess patient movement.
      </p>
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy}
          onChange={(e) => setConfirmed(e.target.checked)}
        />{" "}
        This video shows only me and contains no patient images, names, voices
        or clinical information. I consent to sending it to OpenAI for drafting.
      </label>
      <button
        type="button"
        className="secondary-button"
        disabled={!confirmed || busy}
        onClick={generate}
      >
        {busy ? "Preparing draft…" : "Generate editable AI draft"}
      </button>
      {runId ? (
        <>
          <p className="eyebrow">Private draft — not assigned</p>
          {contentFields.map((k) => (
            <label className="field" key={k}>
              {labels[k]}
              <textarea
                value={content[k]}
                maxLength={
                  k === "instructions" ? 4000 : k === "cues" ? 1400 : 200
                }
                onChange={(e) => {
                  setContent((c) => ({ ...c, [k]: e.target.value }));
                  setReviewed(false);
                }}
              />
            </label>
          ))}
          <PrescriptionFields
            id={runId}
            value={content.prescription}
            onChange={(prescription) => {
              setContent((c) => ({ ...c, prescription }));
              setReviewed(false);
            }}
          />
          {limitations.map((v, i) => (
            <p className="muted" key={i}>
              {v}
            </p>
          ))}
          <label>
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />{" "}
            I reviewed every field and approve applying this draft.
          </label>
          <button
            type="button"
            className="button"
            disabled={busy || !reviewed}
            onClick={apply}
          >
            Apply reviewed draft
          </button>
          <p>
            Applying changes only your editable program draft. Unspecified dosage retains the current prescription and existing clinical notes are preserved. Save the program
            and approve its demonstration separately before patient publication.
          </p>
        </>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
