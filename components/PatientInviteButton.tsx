"use client";

import { useState } from "react";
import { Check, Copy, Send } from "lucide-react";
import { createPatientInvite } from "@/lib/data";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export function PatientInviteButton({ patientId, isLinked }: { patientId: string; isLinked: boolean }) {
  const [inviteUrl, setInviteUrl] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function createInvite() {
    setBusy(true); setStatus("");
    try {
      const token = await createPatientInvite(createSupabaseBrowserClient(), patientId);
      const url = `${window.location.origin}/invite?token=${encodeURIComponent(token)}`;
      setInviteUrl(url);
      await navigator.clipboard.writeText(url);
      setStatus("Invitation link copied. It expires in 7 days.");
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Could not create invitation.");
    } finally { setBusy(false); }
  }

  async function copy() {
    await navigator.clipboard.writeText(inviteUrl);
    setStatus("Invitation link copied.");
  }

  if (isLinked) return <span className="pill"><Check size={15}/>Patient login linked</span>;

  return <div className="invite-control">
    <button className="secondary-button" type="button" onClick={createInvite} disabled={busy}><Send size={17}/>{busy ? "Creating..." : "Invite Patient"}</button>
    {inviteUrl ? <button className="icon-button" type="button" onClick={copy} aria-label="Copy patient invitation link"><Copy size={17}/></button> : null}
    {status ? <small className="muted" role="status">{status}</small> : null}
  </div>;
}
