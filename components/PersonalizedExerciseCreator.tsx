"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { ensureStage2Program } from "@/lib/data";
import {
  emptyPrescription,
  prescriptionFromItem,
  type Prescription,
} from "@/lib/prescription";
import {
  CREATION_BUCKET,
  creationFileError,
  sampleVideoFrames,
  uploadCreationMedia,
} from "@/lib/creation-media";
import type {
  CreationDraft,
  CreationMedia,
  HomeProgramExercise,
  Json,
} from "@/lib/types";
import { PrescriptionFields, PrescriptionSummary } from "./PrescriptionFields";
import { PrivateVideoPlayer } from "./PrivateVideoPlayer";

export function PersonalizedExerciseCreator({
  patientId,
  disabled,
  onApproved,
  items,
}: {
  patientId: string;
  disabled: boolean;
  items: HomeProgramExercise[];
  onApproved: () => Promise<void>;
}) {
  const [replaceId, setReplaceId] = useState("");
  const [drafts, setDrafts] = useState<CreationDraft[]>([]),
    [draft, setDraft] = useState<CreationDraft | null>(null),
    [media, setMedia] = useState<CreationMedia | null>(null);
  const [value, setValue] = useState<Prescription>(emptyPrescription),
    [context, setContext] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [localUrl, setLocalUrl] = useState("");
  const [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [progress, setProgress] = useState(0),
    [limitations, setLimitations] = useState<string[]>([]);
  const [review, setReview] = useState(false),
    [preview, setPreview] = useState(false),
    [viewed, setViewed] = useState(false);
  const camera = useRef<HTMLInputElement>(null),
    picker = useRef<HTMLInputElement>(null),
    abort = useRef<AbortController | null>(null);
  const loadDrafts = useCallback(async () => {
    const { data, error } = await createSupabaseBrowserClient()
      .from("exercise_creation_drafts")
      .select("*")
      .eq("patient_id", patientId)
      .eq("state", "draft")
      .order("created_at", { ascending: false });
    if (error)
      throw new Error(
        "Personalized creation needs the Stage 2 preview database.",
      );
    setDrafts(data ?? []);
  }, [patientId]);
  useEffect(() => {
    loadDrafts().catch((e) => setMessage(e.message));
    return () => abort.current?.abort();
  }, [loadDrafts]);
  useEffect(() => {
    if (!file) {
      setLocalUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function perform(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Could not complete this step. Retry.",
      );
    } finally {
      setBusy("");
    }
  }
  async function open(d: CreationDraft) {
    setDraft(d);
    setValue({ ...emptyPrescription(), ...d.content });
    setReview(false);
    setPreview(false);
    setViewed(false);
    setFile(null);
    setContext("");
    setLimitations([]);
    const db = createSupabaseBrowserClient();
    const r = await db
      .from("exercise_creation_media")
      .select("*")
      .eq("draft_id", d.id)
      .neq("state", "withdrawn")
      .maybeSingle();
    if (r.error) throw r.error;
    setMedia(r.data);
    const ai = await db
      .from("exercise_ai_runs")
      .select("*")
      .eq("draft_id", d.id)
      .eq("status", "success")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ai.data) {
      setLimitations(ai.data.limitations ?? []);
      if (!d.content?.name)
        setValue({ ...emptyPrescription(), ...ai.data.original_draft });
    }
  }
  async function create() {
    await perform("Creating draft…", async () => {
      const db = createSupabaseBrowserClient();
      const program = await ensureStage2Program(db, patientId);
      const id = crypto.randomUUID();
      const r = await db.rpc("stage2_draft", {
        p_action: "create",
        p_id: id,
        p_patient: patientId,
        p_program: program.id,
        p_content: replaceId ? { assignment_id: replaceId } : {},
      });
      if (r.error) throw r.error;
      const fresh = await db
        .from("exercise_creation_drafts")
        .select("*")
        .eq("id", id)
        .single();
      if (fresh.error) throw fresh.error;
      await loadDrafts();
      await open(fresh.data);
      if (replaceId) {
        const item = items.find((x) => x.id === replaceId);
        if (item) setValue(prescriptionFromItem(item));
      }
    });
  }
  function choose(next: File | null) {
    if (!next) return;
    const invalid = creationFileError(next);
    if (invalid) {
      setMessage(invalid);
      return;
    }
    setFile(next);
    setReview(false);
    setViewed(false);
    setPreview(false);
    setMessage("");
  }
  async function upload() {
    if (!draft || !file) return;
    await perform("Uploading recording…", async () => {
      const db = createSupabaseBrowserClient();
      let current = media;
      if (!current) {
        const id = crypto.randomUUID();
        const r = await db.rpc("stage2_media", {
          p_action: "create",
          p_id: id,
          p_draft: draft.id,
          p_size: file.size,
          p_mime: file.type.split(";")[0],
        });
        if (r.error) throw r.error;
        current = {
          id,
          draft_id: draft.id,
          object_path: `${id}/source`,
          mime_type: file.type.split(";")[0],
          byte_size: file.size,
          state: "uploading",
          created_at: new Date().toISOString(),
        };
        setMedia(current);
      }
      abort.current = new AbortController();
      await uploadCreationMedia(
        file,
        current.id,
        setProgress,
        abort.current.signal,
      );
      const finish = await db.rpc("stage2_media", {
        p_action: "finish",
        p_id: current.id,
        p_draft: draft.id,
      });
      if (finish.error) throw finish.error;
      setMedia({ ...current, state: "ready" });
      setMessage(
        "Private recording saved. Analyze it or complete the exercise manually.",
      );
    });
  }
  async function removeVideo() {
    if (!draft || !media) return;
    await perform("Deleting recording…", async () => {
      const db = createSupabaseBrowserClient();
      const r = await db.rpc("stage2_media", {
        p_action: "withdraw",
        p_id: media.id,
        p_draft: draft.id,
      });
      if (r.error) throw r.error;
      const removed = await db.storage
        .from(CREATION_BUCKET)
        .remove([media.object_path]);
      if (removed.error)
        throw new Error(
          "Playback access removed. File deletion failed; retry Delete to remove stored bytes.",
        );
      setMedia(null);
      setFile(null);
      setValue(emptyPrescription());
      setLimitations([]);
      setViewed(false);
      setReview(false);
      setPreview(false);
      setMessage("Recording deleted. Record again or choose another file.");
    });
  }
  async function saveDraft() {
    if (!draft) return;
    const db = createSupabaseBrowserClient();
    const r = await db.rpc("stage2_draft", {
      p_action: "save",
      p_id: draft.id,
      p_patient: patientId,
      p_program: draft.program_id,
      p_content: value as unknown as Json,
      p_revision: draft.revision,
    });
    if (r.error) throw new Error(r.error.message);
    const next = { ...draft, content: value, revision: draft.revision + 1 };
    setDraft(next);
    await loadDrafts();
    return next;
  }
  async function analyze() {
    if (!draft) return;
    await perform("Analyzing available video and audio…", async () => {
      let frames: string[] = [];
      const warnings: string[] = [];
      if (media?.state === "ready") {
        try {
          let source: File | string = file!;
          if (!source) {
            const signed = await createSupabaseBrowserClient()
              .storage.from(CREATION_BUCKET)
              .createSignedUrl(media.object_path, 60);
            if (signed.error) throw signed.error;
            source = signed.data.signedUrl;
          }
          frames = await sampleVideoFrames(source);
        } catch {
          warnings.push(
            "Visual frames could not be decoded. Analysis used available audio and clinician context only.",
          );
        }
      }
      const {
        data: { session },
      } = await createSupabaseBrowserClient().auth.getSession();
      if (!session) throw new Error("Sign in again.");
      const r = await fetch("/api/exercise-draft", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          draftId: draft.id,
          mediaId: media?.state === "ready" ? media.id : null,
          context,
          frames,
        }),
        signal: AbortSignal.timeout(115000),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error ?? "AI unavailable.");
      setValue(result.content);
      setLimitations([...warnings, ...result.limitations]);
      setReview(false);
      setPreview(false);
      setMessage(
        "AI draft ready. Review every field. Blank means missing or uncertain; demonstrated repetitions are not dosage.",
      );
    });
  }
  async function approve() {
    if (!draft || !review || !preview || (media && !viewed)) return;
    await perform("Approving and assigning…", async () => {
      const db = createSupabaseBrowserClient();
      const r = await db.rpc("stage2_draft", {
        p_action: "approve",
        p_id: draft.id,
        p_patient: patientId,
        p_program: draft.program_id,
        p_content: value as unknown as Json,
        p_revision: draft.revision,
      });
      if (r.error) throw new Error(r.error.message);
      setDraft(null);
      setMedia(null);
      setFile(null);
      await loadDrafts();
      await onApproved();
      setMessage("Approved and assigned only to this patient’s program.");
    });
  }
  async function discard() {
    if (!draft) return;
    await perform("Deleting draft…", async () => {
      const db = createSupabaseBrowserClient();
      const r = await db.rpc("stage2_draft", {
        p_action: "discard",
        p_id: draft.id,
        p_patient: patientId,
        p_program: draft.program_id,
        p_revision: draft.revision,
      });
      if (r.error) throw r.error;
      const all = await db
        .from("exercise_creation_media")
        .select("*")
        .eq("draft_id", draft.id);
      if (all.error) throw all.error;
      const paths = all.data.map((m) => m.object_path);
      if (paths.length) {
        const removed = await db.storage.from(CREATION_BUCKET).remove(paths);
        if (removed.error)
          setMessage("Draft withdrawn; stored file cleanup still needs retry.");
      }
      setDraft(null);
      setMedia(null);
      setFile(null);
      await loadDrafts();
    });
  }
  return (
    <section className="panel form">
      <h3>Create personalized exercise</h3>
      <p>
        Record → AI draft → edit → preview → approve. Drafts are visible only to
        the treating clinician.
      </p>
      {disabled ? (
        <p>
          Save your current program edits before opening a personalized draft.
        </p>
      ) : null}
      {!draft ? (
        <>
          <label className="field">
            Create or replace
            <select
              value={replaceId}
              onChange={(e) => setReplaceId(e.target.value)}
              disabled={disabled || !!busy}
            >
              <option value="">New personalized exercise</option>
              {items
                .filter((x) => !x.id.startsWith("draft-"))
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    Replace recording: {x.exercise?.name ?? "Exercise"}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            className="button"
            disabled={disabled || !!busy}
            onClick={create}
          >
            Create Personalized Exercise
          </button>
          {drafts.map((d) => (
            <button
              key={d.id}
              type="button"
              className="secondary-button"
              disabled={disabled || !!busy}
              onClick={() => perform("Opening draft…", () => open(d))}
            >
              Continue draft: {d.content?.name || "Untitled exercise"}
            </button>
          ))}
        </>
      ) : (
        <>
          <fieldset
            disabled={!!busy || disabled}
            style={{ border: 0, padding: 0, minWidth: 0 }}
            className="form"
          >
            <p className="eyebrow">Private draft · not assigned</p>
            <input
              ref={camera}
              type="file"
              hidden
              capture="environment"
              accept="video/mp4,video/webm,video/quicktime"
              onChange={(e) => choose(e.target.files?.[0] ?? null)}
            />
            <input
              ref={picker}
              type="file"
              hidden
              accept="video/mp4,video/webm,video/quicktime"
              onChange={(e) => choose(e.target.files?.[0] ?? null)}
            />
            {!media ? (
              <div className="row-between">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => camera.current?.click()}
                >
                  Record video
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => picker.current?.click()}
                >
                  Upload video
                </button>
              </div>
            ) : null}
            <p className="muted">
              MP4, WebM or MOV · up to 25 MB. MP4 works best across phones. Keep
              this page open during upload; retries resume interrupted uploads.
            </p>
            {localUrl ? (
              <video
                src={localUrl}
                aria-label="Recording preview"
                controls
                playsInline
                style={{ width: "100%", maxHeight: 360 }}
              />
            ) : null}
            {file && media?.state !== "ready" ? (
              <button type="button" className="button" onClick={upload}>
                {media ? "Retry / resume upload" : "Save private recording"}
              </button>
            ) : null}
            {media?.state === "uploading" && !file ? (
              <p>
                Choose the original recording to resume, or delete this
                incomplete upload.
                <input
                  type="file"
                  accept="video/*"
                  aria-label="Resume with original file"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && f.size === media.byte_size) choose(f);
                    else
                      setMessage(
                        "Select the original file with the same size.",
                      );
                  }}
                />
              </p>
            ) : null}
            {media?.state === "ready" ? (
              <PrivateVideoPlayer
                bucket={CREATION_BUCKET}
                path={media.object_path}
                title="Private draft recording"
                onViewed={() => setViewed(true)}
              />
            ) : null}
            {media ? (
              <button
                type="button"
                className="secondary-button"
                onClick={removeVideo}
              >
                Delete recording / replace or re-record
              </button>
            ) : null}
            <label className="field">
              Clinician context / intended spoken prescription
              <textarea
                maxLength={6000}
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="For example: twice a day, two sets of eight, hold five seconds. Do not include names or other identifiers."
              />
            </label>
            <p className="muted">
              AI receives sampled demonstration frames, available audio, and
              this context. Review the draft before assigning it.
            </p>
            <button
              type="button"
              className="secondary-button"
              disabled={
                media?.state === "uploading" || (!context.trim() && !media)
              }
              onClick={analyze}
            >
              Generate editable AI draft
            </button>
            {limitations.length ? (
              <div role="status">
                <strong>Analysis limitations</strong>
                <ul>
                  {limitations.map((text, i) => (
                    <li key={i}>{text}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <PrescriptionFields
              prefix={`draft-${draft.id}`}
              value={value}
              onChange={(v) => {
                setValue(v);
                setReview(false);
                setPreview(false);
              }}
            />
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                perform("Saving draft…", async () => {
                  await saveDraft();
                  setMessage("Private draft saved.");
                })
              }
            >
              Save private draft
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setPreview(true);
                setReview(false);
              }}
            >
              Preview patient card
            </button>
            {preview ? (
              <section className="panel">
                <PrescriptionSummary value={value} />
                {media ? (
                  <p>Includes the private recording shown above.</p>
                ) : null}
              </section>
            ) : null}
            <label>
              <input
                type="checkbox"
                checked={review}
                disabled={!preview || (!!media && !viewed)}
                onChange={(e) => setReview(e.target.checked)}
              />{" "}
              I reviewed the instructions and FITT, watched any attached
              recording, and approve this exercise for this patient.
            </label>
            <button
              type="button"
              className="button"
              disabled={
                !review ||
                !value.name.trim() ||
                !value.instructions.trim() ||
                media?.state === "uploading"
              }
              onClick={approve}
            >
              Approve & assign to patient
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={discard}
            >
              Delete private draft
            </button>
          </fieldset>
        </>
      )}
      {busy ? (
        <p role="status">
          {busy}
          {busy.startsWith("Uploading") ? ` ${progress}%` : ""}
        </p>
      ) : null}
      {busy.startsWith("Uploading") ? (
        <>
          <progress
            value={progress}
            max={100}
            aria-label="Video upload progress"
          />
          <button type="button" onClick={() => abort.current?.abort()}>
            Pause upload
          </button>
        </>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
