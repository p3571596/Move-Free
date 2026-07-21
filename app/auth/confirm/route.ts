import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeAuthRedirect } from "@/lib/auth-redirect";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const allowedTypes = new Set<EmailOtpType>(["email", "signup", "invite", "magiclink", "recovery", "email_change"]);

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const rawType = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const fallback = rawType === "recovery" ? "/reset-password" : "/dashboard";
  const next = safeAuthRedirect(request.nextUrl.searchParams.get("next"), fallback);

  if (!tokenHash || !rawType || !allowedTypes.has(rawType)) {
    return NextResponse.redirect(new URL("/auth/error?reason=incomplete_link", request.url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type: rawType, token_hash: tokenHash });
  if (error) {
    console.warn(JSON.stringify({ event: "auth_email_link_failed", type: rawType, code: error.code, status: error.status }));
    return NextResponse.redirect(new URL("/auth/error?reason=expired_or_used", request.url));
  }
  return NextResponse.redirect(new URL(next, request.url));
}
