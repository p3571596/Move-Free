"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import { claimPatientInvite, getEffectiveRole } from "@/lib/data";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const configured = isSupabaseConfigured();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    if (!configured) {
      setMessage("Add Supabase values to .env.local to enable authentication.");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const result =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    setMessage(mode === "signup" ? "Account created. Check email if confirmation is enabled." : "Signed in.");
    const user = result.data.user;
    if (!user) return;
    if (!result.data.session) {
      setMessage("Account created. Confirm your email, then return here to log in and finish joining your program.");
      return;
    }

    const pendingInvite = localStorage.getItem("moveFreePatientInvite");
    if (pendingInvite) {
      try {
        await claimPatientInvite(supabase, pendingInvite);
        localStorage.removeItem("moveFreePatientInvite");
      } catch (cause) {
        setMessage(cause instanceof Error ? cause.message : "Could not accept the patient invitation.");
        return;
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
            <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} />
          </div>
          <button className="button" type="submit">
            {mode === "login" ? "Log in" : "Create account"}
            <ArrowRight size={18} />
          </button>
          {message ? <p className="muted">{message}</p> : null}
        </form>
        <button className="secondary-button" type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")} style={{ marginTop: 14, width: "100%" }}>
          {mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
        </button>
      </section>
    </main>
  );
}
