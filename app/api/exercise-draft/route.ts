import { createClient } from "@supabase/supabase-js";
import { pilotFeatureEnabled } from "@/lib/pilot-flags";
import { generateExerciseDraft } from "@/lib/exercise-ai";
import type { Database, Json } from "@/lib/types";
export const runtime = "nodejs";
export const maxDuration = 120;
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function POST(request: Request) {
  const bearer = request.headers.get("authorization");
  if (!bearer?.startsWith("Bearer ") || bearer.length > 5000)
    return reply({ error: "Sign in required." }, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !pub) return reply({ error: "AI drafting unavailable." }, 503);
  const db = createClient<Database>(url, pub, {
    global: { headers: { Authorization: bearer } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser(bearer.slice(7));
  if (authError || !user) return reply({ error: "Sign in required." }, 401);
  if (!(await pilotFeatureEnabled(db, "ai_video_assistance")))
    return reply({ error: "Access denied." }, 403);
  const key = process.env.OPENAI_API_KEY,
    secret = process.env.SUPABASE_SECRET_KEY;
  if (!key || !secret)
    return reply({ error: "AI service is not configured." }, 503);
  let runId: string | null = null;
  const admin = createClient<Database>(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const reader = request.body?.getReader();
    if (!reader)
      return reply({ error: "A self-demonstration video is required." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4000000) {
        await reader.cancel();
        return reply(
          { error: "Use a shorter recording (video under 2.5 MB)." },
          413,
        );
      }
      chunks.push(value);
    }
    const limited = new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
      body: Buffer.concat(chunks),
    });
    const form = await limited.formData();
    // Never accept chart context, patient/media IDs, arbitrary URLs or comparison input.
    if (
      [...form.keys()].some(
        (k) => !["video", "frames", "selfDemonstration"].includes(k),
      ) ||
      form.getAll("video").length !== 1 ||
      form.getAll("frames").length !== 1 ||
      form.getAll("selfDemonstration").length !== 1
    )
      return reply(
        { error: "Only a clinician self-demonstration is supported." },
        400,
      );
    const file = form.get("video"),
      frames = JSON.parse(String(form.get("frames") ?? "[]"));
    if (
      form.get("selfDemonstration") !== "true" ||
      !(file instanceof File) ||
      !["video/mp4", "video/webm", "video/quicktime"].includes(file.type) ||
      file.size < 1 ||
      file.size > 2500000 ||
      !Array.isArray(frames) ||
      frames.length < 1 ||
      frames.length > 4 ||
      frames.some(
        (f) =>
          typeof f !== "string" ||
          f.length > 200000 ||
          !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(f),
      )
    )
      return reply(
        {
          error:
            "Confirm a self-demonstration with no patient information and choose a short supported video.",
        },
        400,
      );
    const begin = await db.rpc("begin_clinician_ai_draft", {
      p_self_demonstration: true,
    });
    if (begin.error)
      return reply(
        {
          error:
            "AI drafting is unavailable or its usage limit was reached. Try later.",
        },
        429,
      );
    runId = begin.data;
    let transcript = "";
    const limitations: string[] = [
      "Sampled stills do not establish movement quality or clinical findings.",
    ];
    if (file.type !== "video/quicktime") {
      const audioForm = new FormData();
      audioForm.set("model", "gpt-4o-mini-transcribe");
      audioForm.set(
        "file",
        file,
        file.type === "video/mp4"
          ? "self-demonstration.mp4"
          : "self-demonstration.webm",
      );
      const audio = await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: audioForm,
          signal: AbortSignal.timeout(45000),
        },
      );
      if (audio.ok) {
        const a = await audio.json();
        transcript = typeof a.text === "string" ? a.text.slice(0, 12000) : "";
      } else {
        await audio.body?.cancel();
        limitations.push(
          "Audio could not be transcribed. All unsupported dosage remains blank.",
        );
      }
    } else
      limitations.push(
        "MOV audio is not transcribed. Use MP4/WebM to extract spoken dosage.",
      );
    const result = await generateExerciseDraft({ key, transcript, frames });
    if (!(await pilotFeatureEnabled(db, "ai_video_assistance")))
      throw new Error("ACCESS_CHANGED");
    const saved = await admin
      .from("clinician_ai_exercise_drafts")
      .update({
        status: "success",
        original_content: result.content as unknown as Json,
        model: result.model,
        limitations: [...limitations, ...result.limitations],
      })
      .eq("id", runId!)
      .eq("owner_id", user.id)
      .eq("status", "pending")
      .select("id")
      .single();
    if (saved.error) throw new Error("AUDIT_FAILED");
    return reply({
      runId,
      content: result.content,
      limitations: [...limitations, ...result.limitations],
    });
  } catch {
    if (runId)
      await admin
        .from("clinician_ai_exercise_drafts")
        .update({ status: "failed", error_code: "DRAFT_FAILED" })
        .eq("id", runId)
        .eq("owner_id", user.id)
        .eq("status", "pending");
    return reply(
      {
        error:
          "AI could not create a draft. Your program has not changed. Retry or edit manually.",
      },
      502,
    );
  }
}
