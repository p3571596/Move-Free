import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
export async function pilotFeatureEnabled(
  db: SupabaseClient<Database>,
  feature: "personalized_exercises" | "ai_video_assistance",
) {
  const { data, error } = await db.rpc("pilot_feature_enabled", {
    p_feature: feature,
  });
  return !error && data === true;
}
