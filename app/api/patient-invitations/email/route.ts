import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getAppRoute } from "@/lib/app-url";

type InviteRequest = {
  patientId?: string;
  email?: string;
};

function authEmailError(message: string, status?: number) {
  const rateLimited = status === 429 || /rate limit/i.test(message);
  console.warn(JSON.stringify({
    event: "patient_invitation_email_failed",
    code: rateLimited ? "email_rate_limited" : "email_delivery_failed",
    status: status ?? 400,
  }));
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
    if (patient.patient_profile_id) {
      const { data: linkedUser, error: linkedUserError } = await adminClient.auth.admin.getUserById(patient.patient_profile_id);
      if (linkedUserError || !linkedUser.user?.email) {
        return NextResponse.json({ error: "The linked patient account could not be found." }, { status: 409 });
      }
      if (linkedUser.user.email.toLowerCase() !== email) {
        return NextResponse.json({ error: "Use the email already linked to this patient account." }, { status: 400 });
      }

      return NextResponse.json({
        error: "This patient account is already active. Returning patients should use the normal sign-in page and reset their password there if needed.",
        code: "patient_account_active",
      }, { status: 409 });
    }

    const { data: token, error: tokenError } = await authenticatedClient.rpc("create_patient_invite", { p_patient_id: patientId });
    if (tokenError || !token) {
      return NextResponse.json({ error: tokenError?.message ?? "Secure invitation could not be created." }, { status: 400 });
    }

    const inviteRedirect = getAppRoute(`/invite?token=${encodeURIComponent(String(token))}&mode=invite`);
    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: inviteRedirect,
      data: { role: "patient", patient_id: patientId },
    });

    if (!inviteError) {
      console.info(JSON.stringify({
        event: "patient_invitation_email_sent",
        mode: "invite",
        redirectPath: "/invite?token=[redacted]&mode=invite",
      }));
      return NextResponse.json({ sent: true, mode: "invite" });
    }

    // Only switch an existing Auth user to a sign-in link. Retrying every
    // delivery/rate-limit failure with a second email call compounds provider
    // limits and can invalidate a link the patient has already received.
    const existingUser = inviteError.code === "email_exists"
      || inviteError.code === "user_already_exists"
      || /already.*(?:registered|exists)|been registered/i.test(inviteError.message);
    if (!existingUser) return authEmailError(inviteError.message, inviteError.status);

    let existingAuthUser = null;
    for (let page = 1; page <= 10 && !existingAuthUser; page += 1) {
      const { data: usersPage, error: usersError } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
      if (usersError) throw usersError;
      existingAuthUser = usersPage.users.find((user) => user.email?.toLowerCase() === email) ?? null;
      if (usersPage.users.length < 1000) break;
    }
    if (!existingAuthUser) {
      return NextResponse.json({ error: "The existing account could not be verified." }, { status: 409 });
    }

    const [existingProfileResult, linkedPatientResult, clinicianPatientResult] = await Promise.all([
      adminClient.from("profiles").select("role").eq("id", existingAuthUser.id).maybeSingle(),
      adminClient.from("patients").select("id").eq("patient_profile_id", existingAuthUser.id).maybeSingle(),
      adminClient.from("patients").select("id").eq("clinician_id", existingAuthUser.id).limit(1).maybeSingle(),
    ]);
    if (existingProfileResult.error) throw existingProfileResult.error;
    if (linkedPatientResult.error) throw linkedPatientResult.error;
    if (clinicianPatientResult.error) throw clinicianPatientResult.error;

    const belongsToAnotherRole = existingProfileResult.data?.role === "clinician"
      || existingProfileResult.data?.role === "admin"
      || Boolean(clinicianPatientResult.data);
    const belongsToAnotherPatient = Boolean(
      linkedPatientResult.data && linkedPatientResult.data.id !== patientId,
    );
    if (belongsToAnotherRole || belongsToAnotherPatient) {
      return NextResponse.json({
        error: "This email already belongs to another Move Free account. Use the patient's own email address; clinician accounts cannot accept patient invitations.",
        code: "email_belongs_to_another_account",
      }, { status: 409 });
    }

    // Magic links for pre-existing Auth users do not inherit the metadata from
    // inviteUserByEmail. Add a server-controlled pending-invite marker so the
    // fresh browser session can continue to password setup. The claim token and
    // database function remain the authorization boundary.
    const { error: inviteMarkerError } = await adminClient.auth.admin.updateUserById(
      existingAuthUser.id,
      {
        app_metadata: {
          ...existingAuthUser.app_metadata,
          pending_patient_invite_id: patientId,
        },
      },
    );
    if (inviteMarkerError) {
      console.error(JSON.stringify({
        event: "patient_invitation_marker_failed",
        code: inviteMarkerError.code ?? "unknown",
        status: inviteMarkerError.status ?? 500,
      }));
      return NextResponse.json({
        error: "The existing patient account could not be prepared for this invitation. Please try again.",
      }, { status: 500 });
    }

    const signInClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const signInRedirect = getAppRoute(`/invite?token=${encodeURIComponent(String(token))}&mode=invite`);
    const { error: signInError } = await signInClient.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: signInRedirect, shouldCreateUser: false },
    });
    if (signInError) {
      return authEmailError(signInError.message || inviteError.message, signInError.status);
    }

    console.info(JSON.stringify({
      event: "patient_invitation_email_sent",
      mode: "resume",
      redirectPath: "/invite?token=[redacted]&mode=invite",
    }));
    return NextResponse.json({ sent: true, mode: "resume" });
  } catch (cause) {
    console.error(JSON.stringify({
      event: "patient_invitation_failed",
      code: cause instanceof Error ? cause.name : "unknown",
    }));
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Invitation email could not be sent." },
      { status: 500 },
    );
  }
}
