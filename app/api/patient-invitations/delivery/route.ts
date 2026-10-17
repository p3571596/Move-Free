import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getAppRoute } from "@/lib/app-url";

export async function POST(request: NextRequest) {
  const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  try {
    const bearer = request.headers.get("authorization");
    if (!bearer?.startsWith("Bearer ")) return reply({ error: "Authentication required." }, 401);
    const body = await request.json();
    const { patientId, method, action = "send" } = body;
    if (!/^[0-9a-f-]{36}$/i.test(patientId ?? "") || method !== "copy" || !["send", "replace"].includes(action)) return reply({ error: "Invalid invitation request." }, 400);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ error: "Enter the patient's email for identity verification." }, 400);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return reply({ error: "Invitation delivery is not configured." }, 503);
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    const client = createClient(url, key, { ...options, global: { headers: { Authorization: bearer } } });
    const { data: user, error } = await client.auth.getUser(bearer.slice(7));
    if (error || !user.user) return reply({ error: "Sign in again." }, 401);
    const { data: patient, error: patientError } = await client.from("patients").select("id,patient_profile_id").eq("id", patientId).eq("clinician_id", user.user.id).maybeSingle();
    if (patientError || !patient) return reply({ error: "Patient not found or access denied." }, 403);
    if (patient.patient_profile_id) return reply({ error: "This patient account is already active." }, 409);
    // Resolve canonical origin before issuing/replacing the token.
    const base = getAppRoute("/join");
    const { data: attempt, error: issueError } = await client.rpc("manage_patient_delivery", {
      p_patient_id: patientId, p_email: email, p_mobile: "", p_method: method, p_action: action, p_consent: false,
    });
    if (issueError || !attempt?.token) return reply({ error: "Invitation unavailable. Wait before resending, or correct the contact and replace the invitation." }, /Wait|being sent/i.test(issueError?.message ?? "") ? 429 : 409);
    const link = `${base}#token=${encodeURIComponent(attempt.token)}`;
    return reply({ status: "pending", link });
  } catch {
    return reply({ error: "Invitation failed. Refresh status before retrying." }, 503);
  }
}
