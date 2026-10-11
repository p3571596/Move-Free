import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getAppRoute } from "@/lib/app-url";

type InviteRequest = {
  patientId?: string;
  email?: string;
  action?: "send" | "replace" | "revoke";
};

function deliveryError(message: string, status?: number) {
  if (status === 429 || /rate limit|too many|after.*seconds/i.test(message)) {
    return { code: "email_rate_limited", status: 429, error: "Email rate limit reached. Wait at least 60 seconds before resending." };
  }
  if (/535|smtp|sending.*email|send.*email/i.test(message)) {
    return { code: "smtp_delivery_failed", status: 503, error: "Email could not be sent. The administrator must check Supabase SMTP credentials and the sender domain, then resend. This invitation cannot be claimed." };
  }
  return { code: "email_delivery_failed", status: 503, error: "Email was not accepted. Check the email address or contact the administrator, then resend. This invitation cannot be claimed." };
}

function getConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Patient email invitations are not configured.");
  }

  return { url, publishableKey };
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
    if (!accessToken) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const body = await request.json() as InviteRequest;
    const patientId = body.patientId?.trim();
    const email = body.email?.trim().toLowerCase();
    const action = body.action ?? "send";
    if (!patientId || !["send", "replace", "revoke"].includes(action) || (action !== "revoke" && (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))) {
      return NextResponse.json({ error: "A valid patient and email are required." }, { status: 400 });
    }

    const { url, publishableKey } = getConfig();
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

    if (action === "revoke") {
      const { error } = await authenticatedClient.rpc("manage_patient_email_invitation", { p_patient_id: patientId, p_email: "", p_action: "revoke" });
      return NextResponse.json(error ? { error: "Invitation could not be revoked. Refresh and try again." } : { status: "revoked" }, { status: error ? 409 : 200 });
    }
    if (!email) return NextResponse.json({ error: "Email required." }, { status: 400 });

    // Authorization must not depend on whether email delivery is configured.
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (!secretKey) return NextResponse.json(
      { error: "Patient email invitations are not configured in this environment. Contact the administrator to configure delivery." },
      { status: 503 },
    );
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

    const { data: attempt, error: tokenError } = await authenticatedClient.rpc("manage_patient_email_invitation", {
      p_patient_id: patientId, p_email: email, p_action: action,
    });
    if (tokenError || !attempt?.token || !attempt?.attemptId) {
      const cooldown = /Wait|being sent/i.test(tokenError?.message ?? "");
      return NextResponse.json({ error: cooldown ? "An invitation was recently attempted. Wait before resending." : "Refresh invitation status. Use Correct Email / Replace Invitation to change recipients, or contact the administrator.", code: cooldown ? "invite_cooldown" : "invite_unavailable" }, { status: cooldown ? 429 : 409 });
    }
    const token = attempt.token;
    let accepted = false;
    let failureCode = "invitation_failed";
    try {
      const authEmailError = (message: string, status?: number) => {
        const failure = deliveryError(message, status);
        failureCode = failure.code;
        console.warn(JSON.stringify({ event: "patient_invitation_email_failed", code: failure.code, status: failure.status }));
        return NextResponse.json({ error: failure.error, code: failure.code, status: "failed" }, { status: failure.status });
      };
      const inviteRedirect = getAppRoute(`/invite?token=${encodeURIComponent(String(token))}&mode=invite`);
      const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: inviteRedirect,
        data: { role: "patient", patient_invite: true },
      });

      if (!inviteError) {
        console.info(JSON.stringify({
          event: "patient_invitation_email_accepted",
          mode: "invite",
          redirectPath: "/invite?token=[redacted]&mode=invite",
        }));
        accepted = true;
        return NextResponse.json({ accepted: true, status: "pending", mode: "invite" });
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
            pending_patient_invite: true,
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
        event: "patient_invitation_email_accepted",
        mode: "resume",
        redirectPath: "/invite?token=[redacted]&mode=invite",
      }));
      accepted = true;
      return NextResponse.json({ accepted: true, status: "pending", mode: "resume" });
    } finally {
      const { data: finalized, error: finishError } = await adminClient.rpc("finish_patient_email_invitation", {
        p_patient_id: patientId, p_attempt_id: attempt.attemptId, p_success: accepted, p_error_code: failureCode,
      });
      if (finishError || !finalized) throw new Error("Invitation finalization failed");
    }
  } catch (cause) {
    console.error(JSON.stringify({
      event: "patient_invitation_failed",
      code: cause instanceof Error ? cause.name : "unknown",
    }));
    return NextResponse.json(
      { error: "Invitation could not be completed. Refresh status before retrying; contact the administrator if this persists." },
      { status: 500 },
    );
  }
}
