import twilio from "twilio";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getAppRoute } from "@/lib/app-url";

export async function POST(request: NextRequest) {
  const forbidden = () => new NextResponse(null, { status: 403 });
  try {
    const token = process.env.TWILIO_AUTH_TOKEN;
    const signature = request.headers.get("x-twilio-signature");
    if (!token || !signature || Number(request.headers.get("content-length") ?? 0) > 16384) return forbidden();
    const attempt = request.nextUrl.searchParams.get("attempt");
    if (!attempt || !/^[0-9a-f-]{36}$/i.test(attempt)) return forbidden();
    const raw = await request.text();
    if (raw.length > 16384) return forbidden();
    const params = Object.fromEntries(new URLSearchParams(raw));
    // Use the configured external URL, never forwarded Host headers.
    const callback = getAppRoute(`/api/patient-invitations/sms-status?attempt=${encodeURIComponent(attempt)}`);
    if (!twilio.validateRequest(token, signature, callback, params) || params.AccountSid !== process.env.TWILIO_ACCOUNT_SID || !/^SM[0-9a-f]{32}$/i.test(params.MessageSid ?? "")) return forbidden();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, secret = process.env.SUPABASE_SECRET_KEY;
    if (!url || !secret) return new NextResponse(null, { status: 503 });
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await admin.rpc("record_patient_sms", { p_attempt_id: attempt, p_sid: params.MessageSid, p_status: params.MessageStatus });
    return new NextResponse(null, { status: error ? 503 : 204 });
  } catch { return forbidden(); }
}
