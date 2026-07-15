"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { claimPatientInvite } from "@/lib/data";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type InviteMode = "invite" | "signin" | "access";
type InviteState = "loading" | "needs-password" | "claiming" | "error";

const AUTH_WAIT_MS = 8_000;

function getAuthError() {
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = searchParams.get("error_code") ?? hashParams.get("error_code");
  const description = searchParams.get("error_description") ?? hashParams.get("error_description");

  if (!code && !description) return null;
  if (code === "otp_expired") return "This invitation has expired. Ask your clinician to send a new invitation.";
  return description?.replace(/\+/g, " ") ?? "The invitation could not be verified.";
}

function inviteErrorMessage(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "Could not accept this invitation.";
  if (/expired|invalid|already claimed/i.test(message)) {
    return "This invitation is expired, invalid, or has already been used. Ask your clinician to send a new invitation.";
  }
  if (/not eligible|clinician|admin/i.test(message)) {
    return "This invitation cannot be linked to the account currently signed in. Sign out and open it with the patient's account.";
  }
  if (/authentication|required|session|jwt/i.test(message)) {
    return "Your patient session could not be verified. Reopen the invitation or ask your clinician for a new one.";
  }
  return message;
}

export default function InvitePage() {
  const router = useRouter();
  const clientRef = useRef<ReturnType<typeof createSupabaseBrowserClient> | null>(null);
  const [inviteState, setInviteState] = useState<InviteState>("loading");
  const [status, setStatus] = useState("Preparing your secure invitation...");
  const [token, setToken] = useState("");
  const [mode, setMode] = useState<InviteMode>("invite");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const client = createSupabaseBrowserClient();
    clientRef.current = client;
    let active = true;
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const params = new URLSearchParams(window.location.search);
    const invitationToken = params.get("token")?.trim() ?? "";
    const modeParam = params.get("mode");
    const invitationMode: InviteMode = modeParam === "access" ? "access" : modeParam === "signin" ? "signin" : "invite";
    const authError = getAuthError();

    setMode(invitationMode);
    setToken(invitationToken);

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

    if (invitationToken) localStorage.setItem("moveFreePatientInvite", invitationToken);

    async function completeForUser(user: User) {
      if (!active || settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);

      if (invitationMode === "access") {
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

    const { data: authListener } = client.auth.onAuthStateChange((_event, session) => {
      if (session?.user) queueMicrotask(() => void completeForUser(session.user));
    });

    void client.auth.getUser().then(({ data, error }) => {
      if (data.user) return completeForUser(data.user);
      if (error && active) setStatus("Waiting for the secure patient session...");
    });

    timeoutId = setTimeout(() => {
      if (!active || settled) return;
      settled = true;
      setInviteState("error");
      setStatus("Your patient session could not be established. The link may be expired or already used. Ask your clinician to send a new invitation.");
    }, AUTH_WAIT_MS);

    return () => {
      active = false;
      if (timeoutId) clearTimeout(timeoutId);
      authListener.subscription.unsubscribe();
      clientRef.current = null;
    };
  }, [router]);

  async function finishInvite(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setInviteState("claiming");
    setStatus("Linking your program...");
    const client = clientRef.current ?? createSupabaseBrowserClient();
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user) {
      setInviteState("error");
      setStatus("Your patient session could not be verified. Reopen the invitation or ask your clinician for a new one.");
      return;
    }
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      setInviteState("needs-password");
      setStatus(error.message);
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
    }
  }

  return <main className="auth-page"><section className="auth-panel"><p className="eyebrow">Move Free patient invitation</p><h2>Join your movement program</h2><p className="muted">{status}</p>
    {inviteState === "needs-password" && mode === "invite" ? <form className="form" onSubmit={finishInvite} style={{ marginTop: 18 }}>
      <label className="field"><span>Create password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label>
      <button className="button" type="submit">Open my program</button>
    </form> : inviteState === "error" ? <div style={{ marginTop: 18 }}>
      <Link className="secondary-button" href="/login">Sign in with a different patient account</Link>
    </div> : null}
  </section></main>;
}
