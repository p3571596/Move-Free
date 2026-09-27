"use client";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { VIDEO_BUCKET } from "@/lib/private-video";
export function PrivateVideoPlayer({
  path,
  title,
  onViewed,
  bucket = VIDEO_BUCKET,
}: {
  path: string;
  title: string;
  onViewed?: () => void;
  bucket?: string;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const { data, error } = await createSupabaseBrowserClient()
        .storage.from(bucket)
        .createSignedUrl(path, 60);
      if (error || !data) throw new Error();
      setUrl(data.signedUrl);
    } catch {
      setUrl("");
      setError(
        "This video is unavailable or access has changed. Try again or contact your clinician.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form">
      {url ? (
        <video
          key={url}
          aria-label={title}
          src={url}
          controls
          playsInline
          preload="metadata"
          style={{
            width: "100%",
            maxHeight: 360,
            borderRadius: 12,
            background: "#142c24",
          }}
          onPlaying={onViewed}
          onError={() =>
            setError(
              "Playback is unavailable or the link expired. Reload the video. If this format is unsupported, ask for an MP4 version.",
            )
          }
        />
      ) : null}
      <button
        type="button"
        className="secondary-button"
        onClick={load}
        disabled={busy}
      >
        {busy
          ? "Loading…"
          : url
            ? "Reload private video"
            : "Load private video"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
