"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { describeAuthError, reportAuthError } from "@/lib/auth-errors";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("Verifying your reset link...");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const client = createSupabaseBrowserClient();
    let active = true;

    void client.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error || !data.user) {
        setMessage("The recovery session is missing, expired, or already used. Request a new link and open only the newest email.");
        return;
      }
      setReady(true);
      setMessage("Choose a new password for this account.");
    });

    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setReady(true);
        setMessage("Choose a new password for this account.");
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmation) {
      setMessage("The passwords do not match.");
      return;
    }

    setSubmitting(true);
    const client = createSupabaseBrowserClient();
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      reportAuthError("password-update", error);
      setMessage(describeAuthError(error, "password-update").message);
      setSubmitting(false);
      return;
    }

    await client.auth.signOut({ scope: "local" });
    router.replace("/login?password=updated");
  }

  return <main className="auth-page"><section className="auth-panel">
    <p className="eyebrow">Move Free account recovery</p>
    <h2>Create a new password</h2>
    <p className="muted" role="status">{message}</p>
    {ready ? <form className="form" onSubmit={submit} style={{ marginTop: 18 }}>
      <label className="field"><span>New password</span><input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      <label className="field"><span>Confirm password</span><input type="password" autoComplete="new-password" minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label>
      <button className="button" type="submit" disabled={submitting}>{submitting ? "Updating..." : "Update password"}</button>
    </form> : <Link className="secondary-button" href="/forgot-password" style={{ marginTop: 18 }}>Request a new reset link</Link>}
  </section></main>;
}
