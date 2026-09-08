"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { EmailOtpType, User } from "@supabase/supabase-js";
import { claimPatientInvite, getEffectiveRole } from "@/lib/data";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { describeAuthError, reportAuthError } from "@/lib/auth-errors";

type InviteMode = "invite" | "signin" | "access";
type InviteState = "loading" | "ready" | "verifying" | "needs-password" | "claiming" | "error";

const AUTH_WAIT_MS = 8_000;
const SAFE_INVITE_TYPES = new Set<EmailOtpType>(["invite", "magiclink"]);

function getAuthError() {
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = searchParams.get("error_code") ?? hashParams.get("error_code");
  const description = searchParams.get("error_description") ?? hashParams.get("error_description");

  if (!code && !description) return null;
  if (code === "otp_expired") return "This invitation has expired or was already used. Ask your clinician to send a new invitation.";
  return description?.replace(/\+/g, " ") ?? "The invitation could not be verified.";
}

function inviteErrorMessage(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "Could not accept this invitation.";
  if (/expired|invalid|already claimed|otp/i.test(message)) {
    return "This invitation has expired, is invalid, or was already used. Ask your clinician to send a new invitation.";
  }
  if (/not eligible|clinician|admin|another Move Free account/i.test(message)) {
    return "This invitation cannot be linked to the account currently signed in. Use the patient's own invitation email.";
  }
  if (/authentication|required|session|jwt/i.test(message)) {
    return "Your patient session could not be verified. Reopen the invitation or ask your clinician for a new one.";
  }
  return message;
}

function isInvitedPatient(user: User) {
  // Existing Auth users receive a server-controlled marker because Supabase
  // magic links do not copy inviteUserByEmail metadata. New invited users keep
  // the original user_metadata onboarding hint. Neither grants data access: the
  // one-time database claim validates and consumes the secure patient token.
  const hasPendingExistingUserInvite = typeof user.app_metadata?.pending_patient_invite_id === "string";
  const hasNewUserInvite = user.user_metadata?.role === "patient"
    && typeof user.user_metadata?.patient_id === "string";
  return hasPendingExistingUserInvite || hasNewUserInvite;
}

function removeAuthTokenFromAddress() {
  const url = new URL(window.location.href);
  url.searchParams.delete("token_hash");
  url.searchParams.delete("type");
  url.hash = "";
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

export default function InvitePage() {
  const router = useRouter();
  const clientRef = useRef<ReturnType<typeof createSupabaseBrowserClient> | null>(null);
  const [inviteState, setInviteState] = useState<InviteState>("loading");
  const [status, setStatus] = useState("Preparing your secure invitation...");
  const [token, setToken] = useState("");
  const [tokenHash, setTokenHash] = useState("");
  const [tokenType, setTokenType] = useState<EmailOtpType | null>(null);
  const [mode, setMode] = useState<InviteMode>("invite");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const client = createSupabaseBrowserClient();
    clientRef.current = client;
    let active = true;
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const params = new URLSearchParams(window.location.search);
    const invitationToken = params.get("token")?.trim() ?? "";
    const authTokenHash = params.get("token_hash")?.trim() ?? "";
    const rawTokenType = params.get("type") as EmailOtpType | null;
    const safeTokenType = rawTokenType && SAFE_INVITE_TYPES.has(rawTokenType) ? rawTokenType : null;
    const modeParam = params.get("mode");
    const invitationMode: InviteMode = modeParam === "access" ? "access" : modeParam === "signin" ? "signin" : "invite";
    const authError = getAuthError();

    setMode(invitationMode);
    setToken(invitationToken);
    setTokenHash(authTokenHash);
    setTokenType(safeTokenType);

    if (authError) {
      setInviteState("error");
      setStatus(authError);
      return;
    }

    if (!invitationToken && invitationMode !== "access") {
      setInviteState("error");
      setStatus("This invitation link is incomplete. Ask your clinician to send a new invitation.");
      return;
    }

    if (authTokenHash && !safeTokenType) {
      setInviteState("error");
      setStatus("This invitation uses an unsupported verification type. Ask your clinician to send a new invitation.");
      return;
    }

    if (invitationToken) localStorage.setItem("moveFreePatientInvite", invitationToken);

    async function prepareForUser(user: User) {
      if (!active || settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);

      const effectiveRole = await getEffectiveRole(client, user);
      if (effectiveRole !== "patient" && !isInvitedPatient(user)) {
        setInviteState(authTokenHash ? "ready" : "error");
        setStatus(authTokenHash
          ? "This browser is signed in to a therapist account. Continuing will securely switch to the invited patient account."
          : "This browser is signed in to a therapist account. Sign out and reopen the patient invitation.");
        return;
      }

      if (authTokenHash) removeAuthTokenFromAddress();

      if (invitationMode === "access") {
        localStorage.removeItem("moveFreePatientInvite");
        setStatus("Opening your program...");
        router.replace("/patient");
        router.refresh();
        return;
      }

      if (!user.email) {
        setInviteState("error");
        setStatus("The authenticated patient account does not have an email address.");
        return;
      }

      if (invitationMode === "invite") {
        setInviteState("needs-password");
        setStatus("Create a password to finish setting up your patient account.");
        return;
      }

      setInviteState("claiming");
      setStatus("Linking your program...");
      try {
        await claimPatientInvite(client, invitationToken);
        localStorage.removeItem("moveFreePatientInvite");
        router.replace("/patient");
        router.refresh();
      } catch (cause) {
        setInviteState("error");
        setStatus(inviteErrorMessage(cause));
      }
    }

    void client.auth.getUser().then(({ data }) => {
      if (!active) return;
      if (data.user && (isInvitedPatient(data.user) || !authTokenHash)) {
        void prepareForUser(data.user);
        return;
      }

      if (authTokenHash) {
        settled = true;
        setInviteState("ready");
        setStatus(data.user
          ? "This browser is signed in to another account. Continuing will securely switch to the invited patient account."
          : "Your secure invitation is ready. Continue to verify your email and create your password.");
        return;
      }

      timeoutId = setTimeout(() => {
        if (!active || settled) return;
        settled = true;
        setInviteState("error");
        setStatus("Your patient session could not be established. The link may be expired or already used. Ask your clinician to send a new invitation.");
      }, AUTH_WAIT_MS);
    });

    const { data: authListener } = client.auth.onAuthStateChange((_event, session) => {
      if (session?.user) queueMicrotask(() => void prepareForUser(session.user));
    });

    return () => {
      active = false;
      if (timeoutId) clearTimeout(timeoutId);
      authListener.subscription.unsubscribe();
      clientRef.current = null;
    };
  }, [router]);

  async function verifyInvitation() {
    if (!tokenHash || !tokenType || submitting) return;
    setSubmitting(true);
    setInviteState("verifying");
    setStatus("Verifying your secure invitation...");
    const client = clientRef.current ?? createSupabaseBrowserClient();

    const { data: current } = await client.auth.getUser();
    if (current.user && !isInvitedPatient(current.user)) {
      const { error: signOutError } = await client.auth.signOut({ scope: "local" });
      if (signOutError) {
        setInviteState("error");
        setStatus("The existing browser session could not be cleared. Sign out, then reopen this invitation.");
        setSubmitting(false);
        return;
      }
    }

    const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: tokenType });
    if (error || !data.user) {
      if (error) reportAuthError("invite-verification", error);
      setInviteState("error");
      setStatus(error ? inviteErrorMessage(error) : "The invitation could not establish a patient session.");
      setSubmitting(false);
      return;
    }

    if (!isInvitedPatient(data.user)) {
      await client.auth.signOut({ scope: "local" });
      setInviteState("error");
      setStatus("This email is not attached to the invited patient account. Ask your clinician to send a new invitation.");
      setSubmitting(false);
      return;
    }

    removeAuthTokenFromAddress();
    setInviteState("needs-password");
    setStatus("Create a password to finish setting up your patient account.");
    setSubmitting(false);
  }

  async function finishInvite(event: FormEvent) {
    event.preventDefault();
    if (!token || submitting) return;
    setSubmitting(true);
    setInviteState("claiming");
    setStatus("Linking your program...");
    const client = clientRef.current ?? createSupabaseBrowserClient();
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user) {
      setInviteState("error");
      setStatus("Your patient session could not be verified. Reopen the invitation or ask your clinician for a new one.");
      setSubmitting(false);
      return;
    }
    if (!isInvitedPatient(userData.user)) {
      setInviteState("error");
      setStatus("This invitation is not attached to the patient account currently signed in. Sign out, then open the invitation with the invited email address.");
      setSubmitting(false);
      return;
    }
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      reportAuthError("invite-password", error);
      const failure = describeAuthError(error, "password-update");
      setInviteState("needs-password");
      setStatus(failure.message);
      setSubmitting(false);
      return;
    }
    try {
      await claimPatientInvite(client, token);
      localStorage.removeItem("moveFreePatientInvite");
      router.replace("/patient");
      router.refresh();
    } catch (cause) {
      setInviteState("error");
      setStatus(inviteErrorMessage(cause));
      setSubmitting(false);
    }
  }

  return <main className="auth-page"><section className="auth-panel"><p className="eyebrow">Move Free patient invitation</p><h2>Join your movement program</h2><p className="muted">{status}</p>
    {inviteState === "ready" ? <button className="button" type="button" onClick={verifyInvitation} disabled={submitting} style={{ marginTop: 18 }}>{submitting ? "Verifying..." : "Continue secure setup"}</button> : null}
    {inviteState === "needs-password" && mode === "invite" ? <form className="form" onSubmit={finishInvite} style={{ marginTop: 18 }}>
      <label className="field"><span>Create password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
      <button className="button" type="submit" disabled={submitting}>{submitting ? "Opening..." : "Open my program"}</button>
    </form> : inviteState === "error" ? <div style={{ marginTop: 18 }}>
      <Link className="secondary-button" href="/login">Return to patient sign in</Link>
    </div> : null}
  </section></main>;
}
