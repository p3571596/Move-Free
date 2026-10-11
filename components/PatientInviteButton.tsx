"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check, Copy, Send, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { getAppRoute } from "@/lib/app-url";

type Invitation = { status: string; email?: string; retryAt?: string };
const labels: Record<string, string> = {
  none: "No invitation yet", sending: "Sending request in progress", pending: "Pending acceptance — email request accepted; inbox delivery unverified",
  failed: "Invitation failed — resend required", accepted: "Patient account linked", expired: "Invitation expired", revoked: "Invitation revoked",
};

export function PatientInviteButton({ patientId, isLinked }: { patientId: string; isLinked: boolean }) {
  const [invitation, setInvitation] = useState<Invitation>({ status: isLinked ? "accepted" : "none" });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<"send" | "replace">("send");
  const [destination, setDestination] = useState("");
  const linked = isLinked || invitation.status === "accepted";

  async function refresh() {
    const client = createSupabaseBrowserClient();
    const { data, error } = await client.rpc("manage_patient_email_invitation", { p_patient_id: patientId, p_email: "", p_action: "status" });
    if (error || !data) throw new Error("Invitation status is unavailable. Refresh or contact the administrator.");
    setInvitation(data);
    return data;
  }

  useEffect(() => {
    let active = true;
    const client = createSupabaseBrowserClient();
    void client.rpc("manage_patient_email_invitation", { p_patient_id: patientId, p_email: "", p_action: "status" }).then(({ data, error }) => {
      if (!active) return;
      if (error || !data) setStatus("Invitation status is unavailable. Refresh or contact the administrator.");
      else setInvitation(data);
    });
    return () => { active = false; };
  }, [patientId]);

  async function submit(requestedAction: "send" | "replace" | "revoke") {
    if (busy) return;
    setBusy(true);
    setStatus("");
    try {
      const client = createSupabaseBrowserClient();
      const { data } = await client.auth.getSession();
      if (!data.session?.access_token) throw new Error("Sign in again before inviting a patient.");
      const response = await fetch("/api/patient-invitations/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ patientId, email: destination.trim(), action: requestedAction }),
      });
      const result = await response.json() as { error?: string; status?: string };
      await refresh();
      if (!response.ok) throw new Error(result.error ?? "Invitation could not be completed.");
      setStatus(requestedAction === "revoke" ? "Old invitation revoked. Its link can no longer link this patient." : "Email request accepted. Receipt is not verified; ask the patient to check their inbox and spam folder.");
      setOpen(false);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Invitation could not be completed.");
    } finally { setBusy(false); }
  }

  async function openDialog(nextAction: "send" | "replace") {
    try {
      const current = await refresh();
      setDestination(nextAction === "replace" ? "" : current.email ?? "");
      setAction(nextAction);
      setOpen(true);
    } catch (cause) { setStatus(cause instanceof Error ? cause.message : "Status unavailable."); }
  }

  return <div className="invite-control">
    <span className="pill">{linked ? <Check size={15}/> : null}{labels[linked ? "accepted" : invitation.status] ?? "Status unavailable"}</span>
    {linked ? <button className="secondary-button" type="button" onClick={async () => {
      try { await navigator.clipboard.writeText(getAppRoute("/login")); setStatus("Patient sign-in page copied."); }
      catch { setStatus("Could not copy. Direct the patient to the sign-in page."); }
    }}><Copy size={17}/>Copy Patient Sign-in</button> : <>
      <button className="secondary-button" type="button" onClick={() => void openDialog("send")} disabled={busy}><Send size={17}/>{invitation.email ? "Resend Invitation" : "Invite Patient"}</button>
      {invitation.email ? <button className="secondary-button" type="button" onClick={() => void openDialog("replace")} disabled={busy}>Correct Email / Replace Invitation</button> : null}
      {invitation.status === "pending" || invitation.status === "sending" ? <button className="secondary-button" type="button" onClick={() => void submit("revoke")} disabled={busy}>Revoke Old Invitation</button> : null}
    </>}
    <button className="secondary-button" type="button" onClick={() => void refresh().catch(() => setStatus("Invitation status unavailable."))} disabled={busy}>Refresh status</button>
    {status ? <small className="muted" role="status">{status}</small> : null}
    {open && !linked ? <div className="modal-backdrop" role="presentation" onMouseDown={() => { if (!busy) setOpen(false); }}>
      <section className="invite-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-title" onMouseDown={event => event.stopPropagation()}>
        <div className="section-header">
          <div><p className="eyebrow">Patient access</p><h3 id="invite-title">{action === "replace" ? "Correct email and replace invitation" : invitation.email ? "Resend invitation" : "Invite patient"}</h3></div>
          <button className="icon-button" type="button" onClick={() => setOpen(false)} disabled={busy} aria-label="Close invitation dialog"><X size={18}/></button>
        </div>
        <p className="muted">One recipient per patient. Only an account with this verified email can accept.</p>
        {action === "replace" ? <p className="invite-tip">Replacing revokes the previous invitation immediately, even if the new email fails. An already linked account cannot be replaced.</p> : <p className="invite-tip">Resending replaces the previous link. Wait at least 60 seconds between attempts.</p>}
        <form className="form" onSubmit={(event: FormEvent) => { event.preventDefault(); void submit(action); }}>
          <label className="field"><span>Patient email</span><input type="email" maxLength={254} value={destination} onChange={event => setDestination(event.target.value)} required readOnly={action === "send" && Boolean(invitation.email)} /></label>
          <button className="button" type="submit" disabled={busy}>{busy ? "Sending..." : action === "replace" ? "Revoke old invitation and send replacement" : "Send email invitation"}</button>
        </form>
      </section>
    </div> : null}
  </div>;
}
