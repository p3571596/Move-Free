"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { claimPatientInvite } from "@/lib/data";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function InvitePage() {
  const router = useRouter();
  const [status, setStatus] = useState("Preparing your secure invitation...");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) { setStatus("This invitation link is incomplete."); return; }
    localStorage.setItem("moveFreePatientInvite", token);
    const client = createSupabaseBrowserClient();
    client.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setStatus("Sign in or create your patient account to continue."); return; }
      try { await claimPatientInvite(client, token); localStorage.removeItem("moveFreePatientInvite"); router.replace("/patient"); }
      catch (cause) { setStatus(cause instanceof Error ? cause.message : "Could not accept invitation."); }
    });
  }, [router]);

  return <main className="auth-page"><section className="auth-panel"><p className="eyebrow">Move Free patient invitation</p><h2>Join your movement program</h2><p className="muted">{status}</p><Link className="button" href="/login" style={{marginTop:18}}>Continue to sign in</Link></section></main>;
}
