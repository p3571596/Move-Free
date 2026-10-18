import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Opted-in pilot links support fresh accounts and password-proven incomplete signups.
// Never update an existing user's password or globally disable email confirmation.
export async function POST(request: NextRequest) {
  const reply = (body: object, status = 200) => NextResponse.json(body, {
    status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
  if (process.env.PATIENT_INVITE_LINK_ONLY_ENABLED !== "true") return reply({ error: "Pilot signup is unavailable. Ask your clinician for help." }, 503);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return reply({ error: "Pilot signup is not configured." }, 503);
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  let userId = randomUUID();
  const leaseId = randomUUID();
  let patientId: string | undefined;
  let created = false;
  let completed = false;
  try {
    if (Number(request.headers.get("content-length")) > 16384) return reply({ error: "Invalid signup request." }, 400);
    const raw = await request.text();
    if (raw.length > 16384) return reply({ error: "Invalid signup request." }, 400);
    const body = JSON.parse(raw);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[a-f0-9]{64}$/.test(body.token ?? "") || !email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || typeof body.password !== "string" || body.password.length < 1 || body.password.length > 128) return reply({ error: "Enter a valid email and password. New passwords must be 12–128 characters." }, 400);
    const { data: reservation, error: reserveError } = await admin.rpc("reserve_patient_pilot_signup", {
      p_token: body.token, p_user_id: userId, p_lease_id: leaseId, p_email: email,
    });
    if (reserveError || !reservation?.patientId) return reply({ error: "Invitation unavailable, expired, revoked, already used, or signup is in progress. Ask your clinician for a new link if needed." }, 409);
    patientId = reservation.patientId;
    if (reservation.resumeExisting === true) {
      userId = reservation.userId;
      const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      if (!publicKey) return reply({ error: "Pilot signup is not configured." }, 503);
      // Auth checks the password BEFORE returning email_not_confirmed. Never
      // interpret invalid_credentials, a network error, or a session as proof.
      const auth = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error: passwordError } = await auth.auth.signInWithPassword({ email, password: body.password });
      if (passwordError?.code !== "email_not_confirmed") return reply({ error: "This email already has a registration. Use the password from your first signup attempt, or use a different email to create a new account. No email code is required for this pilot link." }, 409);
      const { data, error } = await admin.auth.admin.updateUserById(userId, {
        email_confirm: true,
        app_metadata: { signup_assurance: "invitation_link_only", email_ownership_verified: false },
      });
      if (error || data.user?.id !== userId) return reply({ error: "Could not finish this registration. Please retry or ask your clinician for help." }, 409);
    } else {
      if (body.password.length < 12) return reply({ error: "Choose a password of at least 12 characters for your new account." }, 400);
      const { data, error } = await admin.auth.admin.createUser({
        id: userId, email, password: body.password, email_confirm: true,
        user_metadata: { role: "patient", patient_invite: true },
        // Auth confirmation enables password sign-in; it does NOT establish mailbox ownership.
        app_metadata: { signup_assurance: "invitation_link_only", email_ownership_verified: false },
      });
      if (error || data.user?.id !== userId) return reply({ error: "Could not create this account. Existing accounts must sign in; otherwise use an unused email or contact your clinician." }, 409);
      created = true;
    }
    const { data: accepted, error: acceptError } = await admin.rpc("complete_patient_pilot_signup", {
      p_token: body.token, p_user_id: userId, p_lease_id: leaseId,
    });
    if (acceptError || accepted !== patientId) return reply({ error: "Invitation could not be accepted. Ask your clinician to refresh its status before retrying." }, 409);
    completed = true;
    return reply({ created: true });
  } catch {
    // Do not log request bodies, passwords, invitation tokens or provider error details.
    return reply({ error: "Account creation could not be completed. If you already created an account, use the sign-in page; otherwise contact your clinician." }, 503);
  } finally {
    if (patientId && !completed) {
      // This RPC locks the patient before canceling the lease. An uncertain successful
      // acceptance returns false, so cleanup can never delete a linked account.
      try {
        const { data: safeToDelete, error } = await admin.rpc("cancel_patient_pilot_signup", {
          p_patient_id: patientId, p_user_id: userId, p_lease_id: leaseId,
        });
        if (created && !error && safeToDelete === true) await admin.auth.admin.deleteUser(userId);
      } catch { /* Fail closed; retain an unlinked account for support rather than risk a linked one. */ }
    }
  }
}
