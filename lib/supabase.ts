"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createSupabaseBrowserClient() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }

  // A single client per browser is essential. Creating one client in every
  // component can make multiple refresh requests race and invalidate the same
  // rotating refresh token.
  browserClient ??= createBrowserClient<Database>(supabaseUrl, supabasePublishableKey);
  return browserClient;
}
