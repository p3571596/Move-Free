"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { getAppRoute } from "@/lib/app-url";
import { describeAuthError, normalizeAuthEmail, reportAuthError } from "@/lib/auth-errors";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const cooldownKey = "moveFreePasswordResetAvailableAt";
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    function updateCooldown() {
      const availableAt = Number(localStorage.getItem(cooldownKey) ?? 0);
      setCooldown(Math.max(0, Math.ceil((availableAt - Date.now()) / 1000)));
    }
    updateCooldown();
    const timer = window.setInterval(updateCooldown, 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (cooldown > 0) return;
    setSubmitting(true);
    setMessage("");
    const availableAt = Date.now() + 60_000;
    localStorage.setItem(cooldownKey, String(availableAt));
    setCooldown(60);

    const client = createSupabaseBrowserClient();
    const { error } = await client.auth.resetPasswordForEmail(normalizeAuthEmail(email), {
      redirectTo: getAppRoute("/auth/callback?next=/reset-password"),
    });

    if (error) {
      reportAuthError("password-recovery", error);
      setMessage(describeAuthError(error, "recovery").message);
      setSubmitting(false);
      return;
    }

    setMessage("If an account exists, a reset email was sent. Use only the newest email; each secure link works once.");
    setSubmitting(false);
  }

  return <main className="auth-page"><section className="auth-panel">
    <p className="eyebrow">Move Free account recovery</p>
    <h2>Reset your password</h2>
    <p className="muted">Use the same email address that received the patient invitation.</p>
    <form className="form" onSubmit={submit} style={{ marginTop: 18 }}>
      <label className="field"><span>Email</span><input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <button className="button" type="submit" disabled={submitting || cooldown > 0}>{submitting ? "Sending..." : cooldown > 0 ? `Try again in ${cooldown}s` : "Send reset link"}</button>
      {message ? <p className="muted" role="status">{message}</p> : null}
    </form>
    <Link className="secondary-button" href="/login" style={{ marginTop: 14 }}>Back to login</Link>
  </section></main>;
}
