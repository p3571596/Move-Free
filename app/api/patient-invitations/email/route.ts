import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

type InviteRequest = {
  patientId?: string;
  email?: string;
};

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
  // Build invitation links from the app handling this authenticated request.
  // This prevents an incorrect dashboard environment value from sending a
  // patient to vercel.com (or another unrelated fallback site).
  const requestOrigin = request.nextUrl.origin;
  if (requestOrigin.startsWith("http://") || requestOrigin.startsWith("https://")) {
    return requestOrigin.replace(/\/$/, "");
  }

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionHost) return `https://${productionHost.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;

  throw new Error("Move Free could not determine the application URL for this invitation.");
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
    if (patient.patient_profile_id) return NextResponse.json({ error: "This patient already has a linked account." }, { status: 409 });

    const { data: token, error: tokenError } = await authenticatedClient.rpc("create_patient_invite", { p_patient_id: patientId });
    if (tokenError || !token) {
      return NextResponse.json({ error: tokenError?.message ?? "Secure invitation could not be created." }, { status: 400 });
    }

    const adminClient = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const siteUrl = getSiteUrl(request);
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
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }

    return NextResponse.json({ sent: true, mode: "signin" });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Invitation email could not be sent." },
      { status: 500 },
    );
  }
}
