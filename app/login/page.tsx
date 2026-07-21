"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import { claimPatientInvite, getEffectiveRole } from "@/lib/data";
import { describeAuthError, normalizeAuthEmail, reportAuthError } from "@/lib/auth-errors";

export default function LoginPage() {
  const router = useRouter();
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [errorCode, setErrorCode] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    setPasswordUpdated(new URLSearchParams(window.location.search).get("password") === "updated");
  }, []);

  function inviteClaimMessage(cause: unknown) {
    if (cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string") {
      return cause.message;
    }
    return "Could not accept the patient invitation.";
  }

  function isStaleInvite(cause: unknown) {
    return /expired|invalid|already claimed/i.test(inviteClaimMessage(cause));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setErrorCode(undefined);

    if (!configured) {
      setMessage("Add Supabase values to .env.local to enable authentication.");
      return;
    }

    setSubmitting(true);
    const supabase = createSupabaseBrowserClient();
    const normalizedEmail = normalizeAuthEmail(email);
    const result = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });

    if (result.error) {
      reportAuthError("login", result.error);
      const failure = describeAuthError(result.error, "login");
      setMessage(failure.message);
      setErrorCode(failure.code);
      setSubmitting(false);
      return;
    }

    setMessage("Signed in.");
    const user = result.data.user;
    if (!user) {
      setSubmitting(false);
      return;
    }
    const initialRole = await getEffectiveRole(supabase, user);
    const pendingInvite = localStorage.getItem("moveFreePatientInvite");
    if (pendingInvite) {
      // A clinician can have an old patient invite left in this browser after
      // testing the patient flow. It must never block a valid clinician login.
      if (initialRole !== "patient" && user.user_metadata?.role !== "patient") {
        localStorage.removeItem("moveFreePatientInvite");
        router.replace("/dashboard");
        return;
      }

      try {
        await claimPatientInvite(supabase, pendingInvite);
        localStorage.removeItem("moveFreePatientInvite");
      } catch (cause) {
        // Expired, invalid, or already-used invite links are browser state,
        // not authentication failures. Clear them and continue normal routing.
        if (isStaleInvite(cause)) {
          localStorage.removeItem("moveFreePatientInvite");
        } else {
          setMessage(inviteClaimMessage(cause));
          setSubmitting(false);
          return;
        }
      }
    }

    const role = await getEffectiveRole(supabase, user);
    router.replace(role === "patient" ? "/patient" : "/dashboard");
  }

  return (
    <main className="auth-page">
      <section className="hero">
        <div className="brand">
          <span className="brand-mark">MF</span>
          <span>
            <h1>Move Free</h1>
            <p>Pilot workspace</p>
          </span>
        </div>
        <div>
          <p className="eyebrow">MVP v1.0</p>
          <h2>Home programs that clinicians can actually steer between visits.</h2>
          <p>Sign in to review patient context, progress goals, treatment decisions, exercise adherence, and pilot feedback.</p>
        </div>
      </section>
      <section className="auth-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Secure access</p>
            <h2>Log in</h2>
          </div>
          <ShieldCheck color="var(--accent)" />
        </div>
        <form className="form" onSubmit={submit} style={{ marginTop: 22 }}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
            />
          </div>
          <button className="button" type="submit" disabled={submitting}>
            {submitting ? "Please wait..." : "Log in"}
            <ArrowRight size={18} />
          </button>
          <Link href="/forgot-password" className="muted" style={{ textAlign: "center" }}>Forgot password?</Link>
          {passwordUpdated ? <p role="status" className="muted">Password updated. Log in with your new password.</p> : null}
          {message ? <div role={errorCode ? "alert" : "status"} className="muted">
            <p>{message}</p>
            {errorCode ? <p style={{ marginTop: 6, fontSize: 12 }}>Authentication code: {errorCode}</p> : null}
          </div> : null}
        </form>
        <Link className="secondary-button" href="/signup" style={{ marginTop: 14, width: "100%" }}>Create a clinician account</Link>
        <p className="muted" style={{ marginTop: 12 }}>Patients should accept their clinician invitation once, then return here for future logins.</p>
      </section>
    </main>
  );
}
