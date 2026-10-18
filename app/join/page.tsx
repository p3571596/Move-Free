"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { describeAuthError } from "@/lib/auth-errors";
import { claimPatientInvite } from "@/lib/data";

export default function JoinPage() {
  const router = useRouter();
  const initialized = useRef(false);
  const [token, setToken] = useState("");
  const [pilot, setPilot] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"account" | "verify">("account");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    setToken(value);
    setPilot(new URLSearchParams(window.location.hash.slice(1)).get("mode") === "pilot");
    window.history.replaceState(null, "", window.location.pathname);
    if (!/^[a-f0-9]{64}$/.test(value)) setStatus("This invitation is incomplete. Ask your clinician for a new link.");
  }, []);

  async function submit(event: FormEvent, existing = false) {
    event.preventDefault();
    if (busy || !/^[a-f0-9]{64}$/.test(token)) return;
    setBusy(true);
    setStatus("");
    try {
      const client = createSupabaseBrowserClient();
      const { error: signOutError } = await client.auth.signOut({ scope: "local" });
      if (signOutError) throw signOutError;
      if (stage === "verify") {
        const { error } = await client.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
        if (error) {setStatus(describeAuthError(error,"signup").message);return;}
      } else if (existing && !pilot) {
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {setStatus(describeAuthError(error,"login").message);return;}
      } else if (pilot) {
        {
          const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
          if (!error) {
            if (!accountCreated) await claimPatientInvite(client, token);
            router.replace("/patient");
            router.refresh();
            return;
          }
          if (error.code !== "email_not_confirmed" && error.code !== "invalid_credentials") {setStatus(describeAuthError(error,"login").message);return;}
          // Let the server distinguish a new or incomplete registration using
          // the invitation. It never changes an existing password.
        }
        const response = await fetch("/api/patient-invitations/pilot-signup", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, email: email.trim(), password }),
        });
        const result = await response.json() as { created?: boolean; error?: string };
        if (!response.ok || !result.created) throw new Error(result.error ?? "Account creation unavailable.");
        setAccountCreated(true);
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new Error("Your account was created. Use the sign-in page to continue.");
        router.replace("/patient");
        router.refresh();
        return;
      } else {
        const { data, error } = await client.auth.signUp({ email: email.trim(), password, options: { data: { role: "patient", patient_invite: true } } });
        if (error) {setStatus(describeAuthError(error,"signup").message);return;}
        if (!data.session) {
          setStage("verify");
          setStatus("Enter the verification code sent to your email. If an account already exists, use Sign in instead. Keep this page open.");
          return;
        }
      }
      // Database validates confirmed email, recipient, role, expiry and single use.
      await claimPatientInvite(client, token);
      router.replace("/patient");
      router.refresh();
    } catch (cause) {
      if (cause instanceof TypeError) {setStatus("Could not connect to Move Free. Check your connection and try again. If a reset link was already submitted, ask your clinician to check its status.");return;}
      if (pilot && cause instanceof Error) { setStatus(cause.message); return; }
      setStatus(stage === "verify" ? "Could not verify or accept. Check the code and invited email, or ask your clinician for a new invitation." : "Could not accept. Use the email recorded by your clinician. Existing patients can sign in below; otherwise ask your clinician for help.");
    } finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-panel">
    <p className="eyebrow">Secure invitation</p><h2>{pilot ? "Create your patient account" : "Verify your identity"}</h2>
    <p className="muted">{pilot ? "Private pilot: this invitation lets you create an account without an email code. Use an email and password you can remember for future sign-in. New passwords need at least 12 characters. If you already registered, use your existing password. If you forgot it and cannot receive email, ask your clinician for a password reset link. Do not forward the link." : "Use the patient email your clinician recorded. This link alone does not provide account access."}</p>
    <form className="form" onSubmit={event => void submit(event)}>
      <label className="field"><span>Patient email</span><input type="email" required maxLength={254} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} readOnly={stage === "verify"}/></label>
      {stage === "account" ? <label className="field"><span>Password</span><input type="password" required minLength={pilot ? 1 : 8} maxLength={pilot ? 128 : undefined} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}/></label> : <label className="field"><span>Email verification code</span><input required autoComplete="one-time-code" inputMode="numeric" value={code} onChange={e => setCode(e.target.value)}/></label>}
      <button className="button" disabled={busy || accountCreated || token.length !== 64}>{busy ? (pilot ? "Setting up..." : "Verifying...") : stage === "verify" ? "Verify and accept invitation" : pilot ? "Continue" : "Create patient account"}</button>
      {stage === "account" ? <button type="button" className="secondary-button" disabled={busy} onClick={event => void submit(event, true)}>{accountCreated ? "Sign in to your account" : "Already registered? Sign in"}</button> : <button type="button" className="secondary-button" disabled={busy} onClick={() => setStage("account")}>Return to sign in</button>}
    </form>
    <Link href="/login">Go to sign in</Link>
    <Link href="/forgot-password">Forgot password?</Link>
    {status ? <p role="status" className="muted">{status}</p> : null}
  </section></main>;
}
