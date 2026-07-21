"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { describeAuthError, normalizeAuthEmail, reportAuthError } from "@/lib/auth-errors";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const { data, error } = await createSupabaseBrowserClient().auth.signUp({
      email: normalizeAuthEmail(email),
      password,
      options: { data: { role: "clinician" } },
    });
    if (error) {
      reportAuthError("clinician-signup", error);
      setMessage(describeAuthError(error, "signup").message);
    } else if (!data.session) {
      setMessage("Check your inbox to confirm the clinician account. If this email already has an account, return to login or reset its password.");
    } else {
      window.location.assign("/dashboard");
    }
    setSubmitting(false);
  }

  return <main className="auth-page"><section className="auth-panel">
    <p className="eyebrow">Move Free clinician access</p>
    <h2>Create a clinician account</h2>
    <p className="muted">Patient accounts are created only through clinician invitations.</p>
    <form className="form" onSubmit={submit} style={{ marginTop: 18 }}>
      <label className="field"><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label className="field"><span>Password</span><input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      <button className="button" type="submit" disabled={submitting}>{submitting ? "Creating..." : "Create clinician account"}</button>
      {message ? <p className="muted" role="status">{message}</p> : null}
    </form>
    <Link className="secondary-button" href="/login" style={{ marginTop: 14 }}>Back to login</Link>
  </section></main>;
}
