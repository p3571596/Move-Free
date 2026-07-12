"use client";

import { FormEvent, useState } from "react";
import { Check, Copy, Mail, MessageSquareText, Send, X } from "lucide-react";
import { createPatientInvite } from "@/lib/data";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export function PatientInviteButton({ patientId, isLinked }: { patientId: string; isLinked: boolean }) {
  const [inviteUrl, setInviteUrl] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<"email" | "text">("email");
  const [destination, setDestination] = useState("");

  async function copy() {
    await navigator.clipboard.writeText(inviteUrl);
    setStatus("Invitation link copied.");
  }

  async function sendInvite(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sign in again before inviting a patient.");

      if (channel === "email") {
        const response = await fetch("/api/patient-invitations/email", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ patientId, email: destination.trim() }),
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Invitation email could not be sent.");
        setStatus(`Invitation sent to ${destination.trim()}.`);
        setOpen(false);
      } else {
        const token = await createPatientInvite(supabase, patientId);
        const url = `${window.location.origin}/invite?token=${encodeURIComponent(token)}&mode=signin`;
        setInviteUrl(url);
        await navigator.clipboard.writeText(url);
        setStatus(`SMS delivery is not configured yet. Secure invitation link copied for ${destination.trim()}.`);
        setOpen(false);
      }
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Could not create invitation.");
    } finally {
      setBusy(false);
    }
  }

  if (isLinked) return <span className="pill"><Check size={15}/>Patient login linked</span>;

  return <div className="invite-control">
    <button className="secondary-button" type="button" onClick={() => setOpen(true)} disabled={busy}><Send size={17}/>Invite Patient</button>
    {inviteUrl ? <button className="icon-button" type="button" onClick={copy} aria-label="Copy patient invitation link"><Copy size={17}/></button> : null}
    {status ? <small className="muted" role="status">{status}</small> : null}
    {open ? <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <section className="invite-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="section-header">
          <div><p className="eyebrow">Patient access</p><h3 id="invite-title">Invite patient</h3></div>
          <button className="icon-button" type="button" onClick={() => setOpen(false)} aria-label="Close invitation dialog"><X size={18}/></button>
        </div>
        <p className="muted">The patient will securely link their account and see the assigned program immediately.</p>
        <div className="invite-channel-picker" role="group" aria-label="Invitation method">
          <button className={channel === "email" ? "channel-option active" : "channel-option"} type="button" onClick={() => { setChannel("email"); setDestination(""); }}><Mail size={18}/>Email</button>
          <button className={channel === "text" ? "channel-option active" : "channel-option"} type="button" onClick={() => { setChannel("text"); setDestination(""); }}><MessageSquareText size={18}/>Text</button>
        </div>
        <form className="form" onSubmit={sendInvite}>
          <label className="field">
            <span>{channel === "email" ? "Patient email" : "Patient mobile number"}</span>
            <input
              type={channel === "email" ? "email" : "tel"}
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder={channel === "email" ? "patient@example.com" : "+1 555 555 0123"}
              required
            />
          </label>
          {channel === "text" ? <p className="muted">SMS delivery is coming later. For now, Move Free will copy the secure link so you can send it manually.</p> : null}
          <button className="button" type="submit" disabled={busy}>{busy ? "Sending..." : channel === "email" ? "Send email invitation" : "Create text invitation"}</button>
        </form>
      </section>
    </div> : null}
  </div>;
}
