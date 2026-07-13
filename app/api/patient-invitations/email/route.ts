import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

type InviteRequest = {
  patientId?: string;
  email?: string;
};

function authEmailError(message: string, status?: number) {
  const rateLimited = status === 429 || /rate limit/i.test(message);
  return NextResponse.json(
    { error: rateLimited
      ? "Supabase has temporarily reached its email limit. Wait before resending, or copy the patient login link and send it directly."
      : message },
    { status: rateLimited ? 429 : 400 },
  );
}

function getConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !publishableKey || !secretKey) {
    throw new Error("Patient email invitations are not configured.");
  }

  return { url, publishableKey, secretKey };
}

function getSiteUrl(request: NextRequest) {
  // Patient emails must use the public production alias. Requests can arrive
  // through a Vercel team alias that is protected by Vercel Authentication;
  // using that request origin would send patients to a Vercel login screen.
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");

  const requestOrigin = request.nextUrl.origin;
  if (requestOrigin.startsWith("http://localhost") || requestOrigin.startsWith("http://127.0.0.1")) {
    return requestOrigin.replace(/\/$/, "");
  }

  return "https://move-free.vercel.app";
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
    if (!accessToken) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const body = await request.json() as InviteRequest;
    const patientId = body.patientId?.trim();
    const email = body.email?.trim().toLowerCase();
    if (!patientId || !email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: "A valid patient and email are required." }, { status: 400 });
    }

    const { url, publishableKey, secretKey } = getConfig();
    const authenticatedClient = createClient(url, publishableKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: userData, error: userError } = await authenticatedClient.auth.getUser(accessToken);
    if (userError || !userData.user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });

    const { data: patient, error: patientError } = await authenticatedClient
      .from("patients")
      .select("id, patient_profile_id")
      .eq("id", patientId)
      .eq("clinician_id", userData.user.id)
      .maybeSingle();
    if (patientError || !patient) return NextResponse.json({ error: "Patient not found or access denied." }, { status: 403 });

    const adminClient = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const siteUrl = getSiteUrl(request);

    if (patient.patient_profile_id) {
      const { data: linkedUser, error: linkedUserError } = await adminClient.auth.admin.getUserById(patient.patient_profile_id);
      if (linkedUserError || !linkedUser.user?.email) {
        return NextResponse.json({ error: "The linked patient account could not be found." }, { status: 409 });
      }
      if (linkedUser.user.email.toLowerCase() !== email) {
        return NextResponse.json({ error: "Use the email already linked to this patient account." }, { status: 400 });
      }

      const signInClient = createClient(url, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { error: signInError } = await signInClient.auth.signInWithOtp({
        email,
        // Reuse the invitation callback that is already allow-listed in
        // Supabase. The callback verifies the authenticated patient and then
        // forwards them to /patient.
        options: { emailRedirectTo: `${siteUrl}/invite?mode=access`, shouldCreateUser: false },
      });
      if (signInError) {
        return authEmailError(signInError.message, signInError.status);
      }

      return NextResponse.json({ sent: true, mode: "resend" });
    }

    const { data: token, error: tokenError } = await authenticatedClient.rpc("create_patient_invite", { p_patient_id: patientId });
    if (tokenError || !token) {
      return NextResponse.json({ error: tokenError?.message ?? "Secure invitation could not be created." }, { status: 400 });
    }

    const inviteRedirect = `${siteUrl}/invite?token=${encodeURIComponent(String(token))}&mode=invite`;
    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: inviteRedirect,
      data: { role: "patient", patient_id: patientId },
    });

    if (!inviteError) return NextResponse.json({ sent: true, mode: "invite" });

    const signInClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const signInRedirect = `${siteUrl}/invite?token=${encodeURIComponent(String(token))}&mode=signin`;
    const { error: signInError } = await signInClient.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: signInRedirect, shouldCreateUser: false },
    });
    if (signInError) {
      return authEmailError(signInError.message || inviteError.message, signInError.status);
    }

    return NextResponse.json({ sent: true, mode: "signin" });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Invitation email could not be sent." },
      { status: 500 },
    );
  }
}
