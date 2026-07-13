"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { claimPatientInvite } from "@/lib/data";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function InvitePage() {
  const router = useRouter();
  const [status, setStatus] = useState("Preparing your secure invitation...");
  const [token, setToken] = useState("");
  const [mode, setMode] = useState<"invite" | "signin" | "access">("invite");
  const [signedIn, setSignedIn] = useState(false);
  const [password, setPassword] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invitationToken = params.get("token");
    const modeParam = params.get("mode");
    const invitationMode = modeParam === "access" ? "access" : modeParam === "signin" ? "signin" : "invite";
    if (!invitationToken && invitationMode !== "access") { setStatus("This invitation link is incomplete."); return; }
    if (invitationMode === "access") {
      setMode("access");
      const client = createSupabaseBrowserClient();
      client.auth.getUser().then(({ data }) => {
        if (data.user) router.replace("/patient");
        else setStatus("This access link has expired. Ask your clinician to send a new one.");
      });
      return;
    }
    setToken(invitationToken!);
    setMode(invitationMode);
    localStorage.setItem("moveFreePatientInvite", invitationToken!);
    const client = createSupabaseBrowserClient();
    client.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setStatus("Sign in or create your patient account to continue."); return; }
      setSignedIn(true);
      if (invitationMode === "signin") {
        try { await claimPatientInvite(client, invitationToken!); localStorage.removeItem("moveFreePatientInvite"); router.replace("/patient"); }
        catch (cause) { setStatus(cause instanceof Error ? cause.message : "Could not accept invitation."); }
      } else {
        setStatus("Create a password to finish setting up your patient account.");
      }
    });
  }, [router]);

  async function finishInvite(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setStatus("Linking your program...");
    const client = createSupabaseBrowserClient();
    const { error } = await client.auth.updateUser({ password });
    if (error) { setStatus(error.message); return; }
    try {
      await claimPatientInvite(client, token);
      localStorage.removeItem("moveFreePatientInvite");
      router.replace("/patient");
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Could not accept invitation.");
    }
  }

  return <main className="auth-page"><section className="auth-panel"><p className="eyebrow">Move Free patient invitation</p><h2>Join your movement program</h2><p className="muted">{status}</p>
    {signedIn && mode === "invite" ? <form className="form" onSubmit={finishInvite} style={{ marginTop: 18 }}>
      <label className="field"><span>Create password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label>
      <button className="button" type="submit">Open my program</button>
    </form> : !signedIn ? <Link className="button" href="/login" style={{marginTop:18}}>Continue to sign in</Link> : null}
  </section></main>;
}
