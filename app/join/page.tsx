"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { claimPatientInvite } from "@/lib/data";

export default function JoinPage() {
  const router = useRouter();
  const initialized = useRef(false);
  const [token, setToken] = useState("");
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
        if (error) throw error;
      } else if (existing) {
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await client.auth.signUp({ email: email.trim(), password, options: { data: { role: "patient", patient_invite: true } } });
        if (error) throw error;
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
    } catch {
      setStatus(stage === "verify" ? "Could not verify or accept. Check the code and invited email, or ask your clinician for a new invitation." : "Could not accept. Use the email recorded by your clinician. Existing patients can sign in below; otherwise ask your clinician for help.");
    } finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-panel">
    <p className="eyebrow">Secure invitation</p><h2>Verify your identity</h2>
    <p className="muted">Use the patient email your clinician recorded. This link alone does not provide account access.</p>
    <form className="form" onSubmit={event => void submit(event)}>
      <label className="field"><span>Patient email</span><input type="email" required maxLength={254} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} readOnly={stage === "verify"}/></label>
      {stage === "account" ? <label className="field"><span>Password</span><input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}/></label> : <label className="field"><span>Email verification code</span><input required autoComplete="one-time-code" inputMode="numeric" value={code} onChange={e => setCode(e.target.value)}/></label>}
      <button className="button" disabled={busy || token.length !== 64}>{busy ? "Verifying..." : stage === "verify" ? "Verify and accept invitation" : "Create patient account"}</button>
      {stage === "account" ? <button type="button" className="secondary-button" disabled={busy} onClick={event => void submit(event, true)}>Sign in and accept invitation</button> : <button type="button" className="secondary-button" disabled={busy} onClick={() => setStage("account")}>Return to sign in</button>}
    </form>
    {status ? <p role="status" className="muted">{status}</p> : null}
  </section></main>;
}
