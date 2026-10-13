import { createSupabaseServerClient } from "@/lib/supabase-server";
import { pilotFeatureEnabled } from "@/lib/pilot-flags";
export async function POST() {
  try {
    const db = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await db.auth.getUser();
    if (error || !user)
      return Response.json({ error: "Sign in required." }, { status: 401 });
    if (!(await pilotFeatureEnabled(db, "ai_video_assistance")))
      return Response.json({ error: "Access denied." }, { status: 403 });
    return Response.json(
      {
        error:
          "AI assistance is disabled pending draft integration and privacy validation.",
      },
      { status: 503 },
    );
  } catch {
    return Response.json(
      { error: "AI assistance unavailable." },
      { status: 503 },
    );
  }
}
