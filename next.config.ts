import type { NextConfig } from "next";

// Public browser connection settings for this authorized pilot preview only.
// Production and other branches continue to require their configured env vars.
// No service-role key or mail credential is embedded in the preview.
const pilotPreview = process.env.VERCEL_ENV === "preview"
  && ["feature/pwa-feedback-pilot", "feature/stage1-video-pwa", "codex/stage1-concise-lifecycle", "fix/stage1-adaptive-followups"].includes(process.env.VERCEL_GIT_COMMIT_REF ?? "");

const syntheticPrivatePilot = process.env.VERCEL_ENV === "preview" && process.env.VERCEL_GIT_COMMIT_REF === "integration/stage2-private-pilot";

const smsPreview = process.env.VERCEL_ENV === "preview" && process.env.VERCEL_GIT_COMMIT_REF === "feat/sms-patient-invitations";

const nextConfig: NextConfig = {
  env: smsPreview ? { NEXT_PUBLIC_SUPABASE_URL: "https://xpfpnxlobjvtemoktjxg.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_QibnDW2MGdtNanoppGbqAg_qlDvq7z2", NEXT_PUBLIC_APP_URL: process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : "http://localhost:3000", PATIENT_SMS_ENABLED: "false", SUPABASE_SECRET_KEY: "" } : syntheticPrivatePilot ? {NEXT_PUBLIC_SUPABASE_URL:"",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:""} : pilotPreview ? {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "https://tyhbfgdrvqwkpmenosta.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_4TQlsLZcs1uZrCaEQpmPKg_MNqPI2JF",
  } : undefined,
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/:path(join|recover)", headers: [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Cache-Control", value: "no-store" },
        { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
      ] },
      { source: "/sw.js", headers: [
        { key: "Cache-Control", value: "no-store" },
        { key: "Service-Worker-Allowed", value: "/" },
        { key: "Content-Type", value: "application/javascript; charset=utf-8" },
      ] },
    ];
  },
};

export default nextConfig;
