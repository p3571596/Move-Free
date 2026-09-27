import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/types";
import { createClient } from "@supabase/supabase-js";
import { generateExerciseDraft } from "@/lib/exercise-ai";
export const runtime = "nodejs";
export const maxDuration = 120;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  const bearer = request.headers.get("authorization");
  if (!bearer?.startsWith("Bearer "))
    return reply({ error: "Sign in before using AI." }, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !pub) return reply({ error: "Preview is not configured." }, 503);
  const db = createClient(url, pub, {
    global: { headers: { Authorization: bearer } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser(bearer.slice(7));
  if (authError || !user) return reply({ error: "Sign in again." }, 401);
  let runId: string | null = null;
  const secret = process.env.SUPABASE_SECRET_KEY,
    key = process.env.OPENAI_API_KEY;
  let admin: SupabaseClient<Database> | null = null;
  const started = Date.now();
  try {
    // Bound the body even when the caller omits or lies about Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "Draft input required." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 3000000) {
        await reader.cancel();
        return reply({ error: "Video frames are too large." }, 413);
      }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const { draftId, mediaId, context = "", frames = [] } = body;
    if (
      typeof draftId !== "string" ||
      !uuid.test(draftId) ||
      (mediaId != null &&
        (typeof mediaId !== "string" || !uuid.test(mediaId))) ||
      typeof context !== "string" ||
      context.length > 6000 ||
      !Array.isArray(frames) ||
      frames.length > 8 ||
      frames.some(
        (x) =>
          typeof x !== "string" ||
          x.length > 350000 ||
          !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(x),
      )
    )
      return reply({ error: "Invalid exercise input." }, 400);
    const { data: draft, error } = await db
      .from("exercise_creation_drafts")
      .select("id,state,revision")
      .eq("id", draftId)
      .single();
    if (error || draft?.state !== "draft")
      return reply({ error: "Draft unavailable or access denied." }, 403);
    if (!key || !secret)
      return reply(
        {
          error:
            "AI drafting is not configured for this preview. You can complete and approve the draft manually.",
        },
        503,
      );
    let media = null;
    if (mediaId) {
      const result = await db
        .from("exercise_creation_media")
        .select("*")
        .eq("id", mediaId)
        .eq("draft_id", draftId)
        .eq("state", "ready")
        .single();
      if (result.error) return reply({ error: "Video unavailable." }, 403);
      media = result.data;
    }
    if (frames.length && !media)
      return reply(
        { error: "Upload the recording before analyzing frames." },
        400,
      );
    if (!context.trim() && !media)
      return reply({ error: "Add a recording or clinician context." }, 400);
    const begin = await db.rpc("stage2_begin_ai", {
      p_draft: draftId,
      p_media: mediaId ?? null,
    });
    if (begin.error) return reply({ error: begin.error.message }, 429);
    runId = begin.data;
    admin = createClient<Database>(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let transcript = "";
    const limitations: string[] = [];
    if (media && ["video/mp4", "video/webm"].includes(media.mime_type)) {
      const download = await db.storage
        .from("exercise-creation-private")
        .download(media.object_path);
      if (download.error || !download.data)
        throw new Error("MEDIA_UNAVAILABLE");
      const form = new FormData();
      form.set("model", "gpt-4o-mini-transcribe");
      form.set(
        "file",
        download.data,
        media.mime_type === "video/mp4"
          ? "demonstration.mp4"
          : "demonstration.webm",
      );
      const audio = await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: form,
          signal: AbortSignal.timeout(45000),
        },
      );
      if (audio.ok) {
        const data = await audio.json();
        transcript =
          typeof data.text === "string" ? data.text.slice(0, 12000) : "";
      } else
        limitations.push(
          "Audio could not be transcribed. Spoken dosage was not extracted.",
        );
    } else if (media)
      limitations.push(
        "MOV audio transcription is unavailable; use an MP4 or type the spoken prescription.",
      );
    if (!frames.length) limitations.push("No visual frames were analyzed.");
    if (!context.trim() && !transcript.trim() && !frames.length)
      throw new Error("NO_USABLE_INPUT");
    const result = await generateExerciseDraft({
      key,
      context,
      transcript,
      frames,
    });
    // Recheck relationship/state after the external call; service access is only for immutable audit storage.
    const current = await db
      .from("exercise_creation_drafts")
      .select("revision,state")
      .eq("id", draftId)
      .single();
    if (
      current.error ||
      current.data.state !== "draft" ||
      current.data.revision !== draft.revision
    )
      throw new Error("DRAFT_CHANGED");
    if (mediaId) {
      const still = await db
        .from("exercise_creation_media")
        .select("state")
        .eq("id", mediaId)
        .eq("state", "ready")
        .maybeSingle();
      if (still.error || !still.data) throw new Error("MEDIA_UNAVAILABLE");
    }
    const saved = await admin
      .from("exercise_ai_runs")
      .update({
        status: "success",
        original_draft: result.content,
        raw_draft: result.raw as Json,
        evidence: result.evidence as unknown as Json,
        limitations: [...limitations, ...result.limitations],
        model: result.model,
        populated_fields: Object.keys(result.content).filter(
          (k) => result.content[k as keyof typeof result.content],
        ),
        duration_ms: Date.now() - started,
      })
      .eq("id", runId!)
      .eq("status", "pending");
    if (saved.error) throw new Error("AUDIT_UNAVAILABLE");
    return reply({
      runId,
      content: result.content,
      evidence: result.evidence,
      limitations: [...limitations, ...result.limitations],
    });
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z_]+$/.test(error.message)
        ? error.message
        : "AI_FAILED";
    if (admin && runId)
      await admin
        .from("exercise_ai_runs")
        .update({
          status: "failed",
          error_code: code,
          duration_ms: Date.now() - started,
        })
        .eq("id", runId!)
        .eq("status", "pending");
    return reply(
      {
        error:
          code === "AI_BILLING"
            ? "AI billing is not active for this preview. Complete the draft manually or contact the administrator."
            : code === "AI_LIMIT"
              ? "AI usage limit reached. Try later or edit manually."
              : code === "DRAFT_CHANGED"
                ? "Draft changed during analysis. Reload and try again."
                : "AI could not draft this exercise. Your video is safe; retry or complete the fields manually.",
        code,
      },
      502,
    );
  }
}
