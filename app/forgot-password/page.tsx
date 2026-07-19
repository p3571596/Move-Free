"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { getAppRoute } from "@/lib/app-url";
import { describeAuthError, normalizeAuthEmail, reportAuthError } from "@/lib/auth-errors";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    const client = createSupabaseBrowserClient();
    const { error } = await client.auth.resetPasswordForEmail(normalizeAuthEmail(email), {
      redirectTo: getAppRoute("/reset-password"),
    });

    if (error) {
      reportAuthError("password-recovery", error);
      setMessage(describeAuthError(error, "recovery").message);
      setSubmitting(false);
      return;
    }

    setMessage("If an account exists for that email, a password reset link has been sent. Check the inbox and spam folder.");
    setSubmitting(false);
  }

  return <main className="auth-page"><section className="auth-panel">
    <p className="eyebrow">Move Free account recovery</p>
    <h2>Reset your password</h2>
    <p className="muted">Use the same email address that received the patient invitation.</p>
    <form className="form" onSubmit={submit} style={{ marginTop: 18 }}>
      <label className="field"><span>Email</span><input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <button className="button" type="submit" disabled={submitting}>{submitting ? "Sending..." : "Send reset link"}</button>
      {message ? <p className="muted" role="status">{message}</p> : null}
    </form>
    <Link className="secondary-button" href="/login" style={{ marginTop: 14 }}>Back to login</Link>
  </section></main>;
}
