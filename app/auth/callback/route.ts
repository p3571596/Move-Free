import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { safeAuthRedirect } from "@/lib/auth-redirect";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeAuthRedirect(request.nextUrl.searchParams.get("next"), "/dashboard");
  if (!code) return NextResponse.redirect(new URL("/auth/error?reason=missing_code", request.url));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.warn(JSON.stringify({ event: "auth_callback_failed", code: error.code, status: error.status }));
    return NextResponse.redirect(new URL("/auth/error?reason=expired_or_used", request.url));
  }
  return NextResponse.redirect(new URL(next, request.url));
}
