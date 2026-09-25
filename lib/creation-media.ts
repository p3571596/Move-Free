"use client";
import { Upload } from "tus-js-client";
import { createSupabaseBrowserClient } from "./supabase";
export const CREATION_BUCKET = "exercise-creation-private";
export function creationFileError(file: Pick<File, "type" | "size">) {
  if (
    !["video/mp4", "video/webm", "video/quicktime"].includes(
      file.type.split(";")[0],
    )
  )
    return "Choose an MP4, WebM or MOV recording.";
  if (!file.size || file.size > 25000000)
    return "Use a short recording of up to 25 MB.";
  return null;
}
export async function uploadCreationMedia(
  file: File,
  id: string,
  onProgress: (n: number) => void,
  signal: AbortSignal,
) {
  const db = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await db.auth.getSession();
  if (!session) throw new Error("Sign in again.");
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: `${base}/storage/v1/upload/resumable`,
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      fingerprint: async () =>
        `move-free-${id}-${file.size}-${file.lastModified}`,
      headers: { authorization: `Bearer ${session.access_token}` },
      metadata: {
        bucketName: CREATION_BUCKET,
        objectName: `${id}/source`,
        contentType: file.type.split(";")[0],
        cacheControl: "0",
      },
      onBeforeRequest: async (req) => {
        const {
          data: { session: current },
        } = await db.auth.getSession();
        if (!current) throw new Error("Session expired");
        req.setHeader("authorization", `Bearer ${current.access_token}`);
      },
      onProgress: (sent, total) => onProgress(Math.round((sent / total) * 100)),
      onError: () => {
        cleanup();
        reject(
          new Error(
            "Upload paused after connection retries. Keep the original file selected and retry to resume.",
          ),
        );
      },
      onSuccess: () => {
        cleanup();
        resolve();
      },
    });
    const abort = () => {
      void upload.abort();
      cleanup();
      reject(new Error("Upload paused. Retry to resume."));
    };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    upload
      .findPreviousUploads()
      .then((previous) => {
        if (signal.aborted) return;
        if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      })
      .catch(() => {
        cleanup();
        reject(new Error("Upload could not start. Retry."));
      });
  });
}
export async function sampleVideoFrames(
  source: File | string,
): Promise<string[]> {
  const own = typeof source !== "string";
  const url = own ? URL.createObjectURL(source) : source;
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const wait = (event: string) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          done(
            new Error(
              "Video frames are unavailable in this browser. Use clinician context or a compatible MP4.",
            ),
          ),
        12000,
      );
      const good = () => done();
      const bad = () => done(new Error("Video cannot be decoded."));
      const done = (error?: Error) => {
        clearTimeout(timer);
        video.removeEventListener(event, good);
        video.removeEventListener("error", bad);
        if (error) reject(error);
        else resolve();
      };
      video.addEventListener(event, good, { once: true });
      video.addEventListener("error", bad, { once: true });
    });
  try {
    const loaded = wait("loadeddata");
    video.src = url;
    video.load();
    await loaded;
    if (!Number.isFinite(video.duration) || video.duration <= 0)
      throw new Error("Video duration unavailable.");
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = Math.max(
      1,
      Math.round((video.videoHeight / video.videoWidth) * 640),
    );
    if (canvas.height > 960) {
      canvas.width = Math.round((canvas.width * 960) / canvas.height);
      canvas.height = 960;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Video frames unavailable.");
    const frames: string[] = [];
    for (let i = 0; i < 8; i++) {
      const seek = wait("seeked");
      video.currentTime = Math.max(0.001, (video.duration * (i + 0.5)) / 8);
      await seek;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", 0.65));
    }
    return frames;
  } finally {
    video.removeAttribute("src");
    video.load();
    if (own) URL.revokeObjectURL(url);
  }
}
