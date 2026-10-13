"use client";
import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import {
  uploadPrivateVideo,
  videoFileError,
  VIDEO_BUCKET,
} from "@/lib/private-video";
import type { ExerciseVideoAsset, HomeProgramExercise } from "@/lib/types";
import { PrivateVideoPlayer } from "./PrivateVideoPlayer";

export function ProgramExerciseRecording({
  item,
  patientId,
  onChanged,
  demonstrationOnly = false,
}: {
  demonstrationOnly?: boolean;
  item: HomeProgramExercise;
  patientId: string;
  onChanged: () => void;
}) {
  const [assets, setAssets] = useState<ExerciseVideoAsset[]>([]),
    [file, setFile] = useState<File | null>(null),
    [localUrl, setLocalUrl] = useState(""),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [recording, setRecording] = useState(false);
  const [title, setTitle] = useState(item.exercise?.name ?? ""),
    [instructions, setInstructions] = useState(
      item.exercise?.patient_instructions ?? item.exercise?.description ?? "",
    ),
    [cues, setCues] = useState(item.notes ?? ""),
    [viewed, setViewed] = useState(""),
    [approved, setApproved] = useState(false);
  const camera = useRef<HTMLInputElement>(null),
    picker = useRef<HTMLInputElement>(null),
    recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    liveVideo = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const url = file ? URL.createObjectURL(file) : "";
    setLocalUrl(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);
  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  useEffect(() => {
    if (demonstrationOnly) return;
    let active = true;
    createSupabaseBrowserClient()
      .from("exercise_video_assets")
      .select("*")
      .eq("program_exercise_id", item.id)
      .eq("kind", "demonstration")
      .in("state", ["uploading", "ready", "approved", "withdrawn"])
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (active) {
          setAssets(data ?? []);
          if (error) setError("Recordings could not be loaded.");
        }
      });
    return () => {
      active = false;
    };
  }, [item.id, revision, demonstrationOnly]);
  function choose(next: File | null) {
    if (!next) return;
    const invalid = videoFileError(next);
    setError(invalid ?? "");
    setFile(invalid ? null : next);
  }
  async function start() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      stream.current = s;
      const r = new MediaRecorder(s);
      recorder.current = r;
      const chunks: Blob[] = [];
      let bytes = 0;
      r.ondataavailable = (e) => {
        if (e.data.size) {
          chunks.push(e.data);
          bytes += e.data.size;
          if (bytes > 25 * 1024 * 1024 && r.state === "recording") r.stop();
        }
      };
      r.onstop = () => {
        const blob = new Blob(chunks, { type: r.mimeType.split(";")[0] });
        choose(new File([blob], "demonstration", { type: blob.type }));
        s.getTracks().forEach((t) => t.stop());
        setRecording(false);
      };
      setRecording(true);
      r.start(1000);
      requestAnimationFrame(() => {
        if (liveVideo.current) {
          liveVideo.current.srcObject = s;
          void liveVideo.current.play();
        }
      });
    } catch {
      stream.current?.getTracks().forEach((t) => t.stop());
      setError(
        "Camera unavailable. Use your phone camera or upload a recording.",
      );
    }
  }
  async function upload() {
    if (demonstrationOnly || !file) return;
    setBusy(true);
    setError("");
    try {
      await uploadPrivateVideo(
        file,
        patientId,
        item.id,
        "demonstration",
        false,
      );
      setFile(null);
      setRevision((r) => r + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(a: ExerciseVideoAsset) {
    setBusy(true);
    setError("");
    try {
      const db = createSupabaseBrowserClient();
      const withdrawal = await db.rpc("withdraw_exercise_video", {
        p_id: a.id,
      });
      if (withdrawal.error) throw withdrawal.error;
      setRevision((r) => r + 1);
      const deletion = await db.storage
        .from(VIDEO_BUCKET)
        .remove([a.object_path]);
      if (deletion.error)
        throw new Error(
          "Access withdrawn, but file deletion failed. Retry deletion.",
        );
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deletion failed.");
    } finally {
      setBusy(false);
    }
  }
  async function publish(a: ExerciseVideoAsset) {
    setBusy(true);
    setError("");
    try {
      const { error } = await createSupabaseBrowserClient().rpc(
        "approve_exercise_video",
        {
          p_id: a.id,
          p_title: title,
          p_instructions: instructions,
          p_cues: cues,
        },
      );
      if (error) throw error;
      setApproved(false);
      setRevision((r) => r + 1);
      onChanged();
    } catch {
      setError("Approval failed. Reload and check your access and fields.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="form" aria-label="Personalized demonstration">
      <strong>Personalized demonstration</strong>
      <input
        ref={camera}
        hidden
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        capture="user"
        onChange={(e) => choose(e.target.files?.[0] ?? null)}
      />
      <input
        ref={picker}
        hidden
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        onChange={(e) => choose(e.target.files?.[0] ?? null)}
      />
      {recording ? (
        <>
          <video
            ref={liveVideo}
            muted
            playsInline
            style={{ width: "100%", maxHeight: 300 }}
          />
          <button
            type="button"
            className="secondary-button"
            onClick={() => recorder.current?.stop()}
          >
            Stop recording
          </button>
        </>
      ) : (
        <div className="row-between">
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => {
              if (
                typeof MediaRecorder !== "undefined" &&
                navigator.mediaDevices
              )
                void start();
              else camera.current?.click();
            }}
          >
            Record demonstration
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => picker.current?.click()}
          >
            Upload video
          </button>
        </div>
      )}
      <p className="muted">
        Record yourself demonstrating the exercise. MP4, WebM or MOV, up to 25
        MB. AI assistance is pending validation.
      </p>
      {localUrl ? (
        <>
          <video
            src={localUrl}
            controls
            playsInline
            style={{ width: "100%", maxHeight: 300 }}
          />
          <button
            type="button"
            className="button"
            disabled={busy || demonstrationOnly}
            onClick={upload}
          >
            {demonstrationOnly
              ? "Synthetic preview — upload disabled"
              : busy
                ? "Uploading…"
                : "Save private video draft"}
          </button>
          <button type="button" disabled={busy} onClick={() => setFile(null)}>
            Discard selected recording
          </button>
        </>
      ) : null}
      {assets.map((a) => (
        <article className="form" key={a.id}>
          <p>
            {a.state === "approved"
              ? "Approved for this patient"
              : a.state === "uploading"
                ? "Incomplete upload"
                : a.state === "withdrawn"
                  ? "Withdrawn — delete remaining file"
                  : "Private draft — review before assigning"}
          </p>
          {a.state !== "uploading" && a.state !== "withdrawn" ? (
            <PrivateVideoPlayer
              path={a.object_path}
              title={a.title || title}
              onViewed={() => setViewed(a.id)}
            />
          ) : null}
          {a.state === "ready" ? (
            <>
              <label className="field">
                Exercise name
                <input
                  value={title}
                  maxLength={200}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setApproved(false);
                  }}
                />
              </label>
              <label className="field">
                Patient instructions
                <textarea
                  value={instructions}
                  maxLength={4000}
                  onChange={(e) => {
                    setInstructions(e.target.value);
                    setApproved(false);
                  }}
                />
              </label>
              <label className="field">
                Movement cues
                <textarea
                  value={cues}
                  maxLength={2000}
                  onChange={(e) => {
                    setCues(e.target.value);
                    setApproved(false);
                  }}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={approved && viewed === a.id}
                  disabled={viewed !== a.id}
                  onChange={(e) => setApproved(e.target.checked)}
                />{" "}
                I reviewed the video and approve these instructions.
              </label>
              <button
                type="button"
                className="button"
                disabled={
                  busy ||
                  viewed !== a.id ||
                  !approved ||
                  !title.trim() ||
                  !instructions.trim()
                }
                onClick={() => publish(a)}
              >
                Approve and assign video
              </button>
            </>
          ) : null}
          {a.state === "approved" ? (
            <>
              <p>{a.instructions}</p>
              <p>{a.cues}</p>
            </>
          ) : null}
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => remove(a)}
          >
            Withdraw and delete video
          </button>
        </article>
      ))}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
