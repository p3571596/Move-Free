import type { NextConfig } from "next";

// Public browser connection settings for this authorized pilot preview only.
// Production and other branches continue to require their configured env vars.
// No service-role key or mail credential is embedded in the preview.
const pilotPreview = process.env.VERCEL_ENV === "preview"
  && process.env.VERCEL_GIT_COMMIT_REF === "feature/pwa-feedback-pilot";

const nextConfig: NextConfig = {
  env: pilotPreview ? {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "https://tyhbfgdrvqwkpmenosta.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_4TQlsLZcs1uZrCaEQpmPKg_MNqPI2JF",
  } : undefined,
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/sw.js", headers: [
        { key: "Cache-Control", value: "no-store" },
        { key: "Service-Worker-Allowed", value: "/" },
        { key: "Content-Type", value: "application/javascript; charset=utf-8" },
      ] },
    ];
  },
};

export default nextConfig;
