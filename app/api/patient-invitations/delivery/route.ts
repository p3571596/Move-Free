import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getAppRoute } from "@/lib/app-url";
import { normalizeMobile, sendSms, smsConfiguration } from "@/lib/sms";

export async function POST(request: NextRequest) {
  const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  try {
    const bearer = request.headers.get("authorization");
    if (!bearer?.startsWith("Bearer ")) return reply({ error: "Authentication required." }, 401);
    const body = await request.json();
    const { patientId, method, action = "send" } = body;
    if (!/^[0-9a-f-]{36}$/i.test(patientId ?? "") || !["sms", "copy"].includes(method) || !["send", "replace"].includes(action)) return reply({ error: "Invalid invitation request." }, 400);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ error: "Enter the patient's email for identity verification." }, 400);
    let mobile = "";
    if (method === "sms") {
      try { mobile = normalizeMobile(typeof body.mobile === "string" ? body.mobile : ""); }
      catch { return reply({ error: "Enter a valid mobile number with its + country code." }, 400); }
      if (body.consent !== true) return reply({ error: "Record the patient's consent to receive this text." }, 400);
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key || (method === "sms" && !secret)) return reply({ error: "Invitation delivery is not configured." }, 503);
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    const client = createClient(url, key, { ...options, global: { headers: { Authorization: bearer } } });
    const { data: user, error } = await client.auth.getUser(bearer.slice(7));
    if (error || !user.user) return reply({ error: "Sign in again." }, 401);
    const { data: patient, error: patientError } = await client.from("patients").select("id,patient_profile_id").eq("id", patientId).eq("clinician_id", user.user.id).maybeSingle();
    if (patientError || !patient) return reply({ error: "Patient not found or access denied." }, 403);
    if (patient.patient_profile_id) return reply({ error: "This patient account is already active." }, 409);
    if (method === "sms" && (!smsConfiguration() || (process.env.PATIENT_SMS_REAL_DELIVERY_APPROVED !== "true" && !process.env.PATIENT_SMS_TEST_NUMBERS?.split(",").map(n => n.trim()).includes(mobile)))) return reply({ error: "SMS delivery is disabled or limited to approved synthetic test numbers." }, 503);
    // Resolve canonical origin before issuing/replacing the token.
    const base = getAppRoute("/join");
    const { data: attempt, error: issueError } = await client.rpc("manage_patient_delivery", {
      p_patient_id: patientId, p_email: email, p_mobile: mobile, p_method: method, p_action: action, p_consent: body.consent === true,
    });
    if (issueError || !attempt?.token) return reply({ error: "Invitation unavailable. Wait before resending, or correct the contact and replace the invitation." }, /Wait|being sent/i.test(issueError?.message ?? "") ? 429 : 409);
    const link = `${base}#token=${encodeURIComponent(attempt.token)}`;
    if (method === "copy") return reply({ status: "pending", link });
    const admin = createClient(url, secret!, options);
    let accepted = false;
    try {
      if (method === "sms") {
        const callback = getAppRoute(`/api/patient-invitations/sms-status?attempt=${encodeURIComponent(attempt.attemptId)}`);
        const message = await sendSms(mobile, link, callback);
        if (["failed", "undelivered", "canceled"].includes(message.status)) throw new Error("Delivery failed");
        const { error: recordError } = await admin.rpc("record_patient_sms", { p_attempt_id: attempt.attemptId, p_sid: message.sid, p_status: "queued" });
        if (recordError) throw new Error("Delivery status unavailable");
      }
      accepted = true;
    } finally {
      // A webhook may already have finalized this attempt. A false CAS must not resurrect it.
      const { error: finishError } = await admin.rpc("finish_patient_email_invitation", { p_patient_id: patientId, p_attempt_id: attempt.attemptId, p_success: accepted, p_error_code: accepted ? null : "sms_delivery_failed" });
      if (finishError) throw new Error("Finalization failed");
    }
    return reply(method === "copy" ? { status: "pending", link } : { status: "sent", accepted: true });
  } catch {
    return reply({ error: "Invitation failed. Refresh status before retrying." }, 503);
  }
}
