"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import { claimPatientInvite, getEffectiveRole } from "@/lib/data";
import { describeAuthError, normalizeAuthEmail, reportAuthError } from "@/lib/auth-errors";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [errorCode, setErrorCode] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const configured = isSupabaseConfigured();

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
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
      : await supabase.auth.signUp({ email: normalizedEmail, password });

    if (result.error) {
      reportAuthError(mode, result.error);
      const failure = describeAuthError(result.error, mode);
      setMessage(failure.message);
      setErrorCode(failure.code);
      setSubmitting(false);
      return;
    }

    setMessage(mode === "signup" ? "Account created. Check email if confirmation is enabled." : "Signed in.");
    const user = result.data.user;
    if (!user) {
      setSubmitting(false);
      return;
    }
    if (!result.data.session) {
      setMessage("Account created. Confirm your email, then return here to log in and finish joining your program.");
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
            <h2>{mode === "login" ? "Log in" : "Sign up"}</h2>
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
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
            />
          </div>
          <button className="button" type="submit" disabled={submitting}>
            {submitting ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}
            <ArrowRight size={18} />
          </button>
          {mode === "login" ? <Link href="/forgot-password" className="muted" style={{ textAlign: "center" }}>Forgot password?</Link> : null}
          {message ? <div role={errorCode ? "alert" : "status"} className="muted">
            <p>{message}</p>
            {errorCode ? <p style={{ marginTop: 6, fontSize: 12 }}>Authentication code: {errorCode}</p> : null}
          </div> : null}
        </form>
        <button className="secondary-button" type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")} style={{ marginTop: 14, width: "100%" }}>
          {mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
        </button>
      </section>
    </main>
  );
}
