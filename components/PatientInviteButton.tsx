"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check, Copy, Send, Share2, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { invitationMessage, textInvitationHref } from "@/lib/invitation-sharing";
import { getAppRoute } from "@/lib/app-url";

type Invitation = { status: string; email?: string; phone?: string; method?: string; retryAt?: string };
const labels: Record<string, string> = {
  none: "No invitation yet", sending: "Sending request in progress", pending: "Pending", sent: "Sent — awaiting acceptance",
  failed: "Invitation failed — resend required", accepted: "Patient account linked", expired: "Invitation expired", revoked: "Invitation revoked",
};

export function PatientInviteButton({ patientId, isLinked }: { patientId: string; isLinked: boolean }) {
  const [invitation, setInvitation] = useState<Invitation>({ status: isLinked ? "accepted" : "none" });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<"send" | "replace">("send");
  const [destination, setDestination] = useState("");
  const [method, setMethod] = useState<"email" | "copy">("copy");
  const [secureLink, setSecureLink] = useState("");
  const linked = isLinked || invitation.status === "accepted";

  async function refresh() {
    const client = createSupabaseBrowserClient();
    const { data, error } = await client.rpc("manage_patient_email_invitation", { p_patient_id: patientId, p_email: "", p_action: "status" });
    if (error || !data) throw new Error("Invitation status is unavailable. Refresh or contact the administrator.");
    setInvitation(data);
    if (data.status !== "pending") setSecureLink("");
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
    setSecureLink("");
    try {
      const client = createSupabaseBrowserClient();
      const { data } = await client.auth.getSession();
      if (!data.session?.access_token) throw new Error("Sign in again before inviting a patient.");
      const contactChanged = Boolean(invitation.email) && (destination.trim().toLowerCase() !== invitation.email || method !== (invitation.method ?? "email"));
      const effectiveAction = requestedAction === "send" && contactChanged ? "replace" : requestedAction;
      const response = await fetch(method === "email" || requestedAction === "revoke" ? "/api/patient-invitations/email" : "/api/patient-invitations/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ patientId, email: destination.trim(), method, action: effectiveAction }),
      });
      const result = await response.json() as { error?: string; status?: string; link?: string };
      await refresh();
      if (!response.ok) throw new Error(result.error ?? "Invitation could not be completed.");
      setSecureLink(result.link ?? "");
      setStatus(requestedAction === "revoke" ? "Old invitation revoked. Its link can no longer link this patient." : method === "copy" ? "Secure link ready. Share only with the intended patient; email verification is required." : "Email request accepted. Receipt is not verified; ask the patient to check their inbox and spam folder.");
      setOpen(false);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Invitation could not be completed.");
    } finally { setBusy(false); }
  }

  async function openDialog(nextAction: "send" | "replace") {
    try {
      const current = await refresh();
      setDestination(nextAction === "replace" ? "" : current.email ?? "");
      setMethod("copy");
      setSecureLink("");
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
      <button className="secondary-button" type="button" onClick={() => void openDialog("send")} disabled={busy}><Send size={17}/>{invitation.email ? "Regenerate Invitation" : "Invite Patient"}</button>
      {invitation.email ? <button className="secondary-button" type="button" onClick={() => void openDialog("replace")} disabled={busy}>Correct Contact / Replace Invitation</button> : null}
      {["pending", "sent", "sending"].includes(invitation.status) ? <button className="secondary-button" type="button" onClick={() => void submit("revoke")} disabled={busy}>Revoke Old Invitation</button> : null}
    </>}
    <button className="secondary-button" type="button" onClick={() => void refresh().catch(() => setStatus("Invitation status unavailable."))} disabled={busy}>Refresh status</button>
    {secureLink ? <div className="form">
      <label className="field"><span>Secure invitation link</span><input readOnly value={secureLink} onFocus={event => event.target.select()}/></label>
      <div className="button-row">
        <button className="secondary-button" type="button" onClick={async () => {
          try { await navigator.clipboard.writeText(secureLink); setStatus("Link copied."); }
          catch { setStatus("Select and copy the link above."); }
        }}><Copy size={17}/>Copy Link</button>
        <button className="secondary-button" type="button" onClick={async () => {
          if (!navigator.share) { setStatus("Sharing is unavailable here. Copy the link into your preferred app."); return; }
          try { await navigator.share({ text: invitationMessage(secureLink) }); setStatus("Share sheet closed. Delivery is not confirmed."); }
          catch { setStatus("Link ready. Sharing was canceled or unavailable; you can copy the link."); }
        }}><Share2 size={17}/>Share Link</button>
        <a className="secondary-button" href={textInvitationHref(secureLink)} onClick={() => setStatus("Send the message manually in your messaging app. Delivery is not confirmed.")}>Share via Text</a>
      </div>
      <small className="muted">Choose the intended recipient in your app. Sharing does not confirm delivery. Regenerating or revoking invalidates this link.</small>
    </div> : null}
    {status ? <small className="muted" role="status">{status}</small> : null}
    {open && !linked ? <div className="modal-backdrop" role="presentation" onMouseDown={() => { if (!busy) setOpen(false); }}>
      <section className="invite-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-title" onMouseDown={event => event.stopPropagation()} onKeyDown={event => { if (event.key === "Escape" && !busy) setOpen(false); }}>
        <div className="section-header">
          <div><p className="eyebrow">Patient access</p><h3 id="invite-title">{action === "replace" ? "Correct contact and replace invitation" : invitation.email ? "Regenerate invitation" : "Invite patient"}</h3></div>
          <button className="icon-button" type="button" onClick={() => setOpen(false)} disabled={busy} aria-label="Close invitation dialog"><X size={18}/></button>
        </div>
        <p className="muted">Only the patient’s verified email can activate this invitation, including links shared manually. Confirm this email with the patient before creating the link.</p>
        {action === "replace" ? <p className="invite-tip">Replacing revokes the previous invitation immediately, even if the new delivery fails. An already linked account cannot be replaced.</p> : invitation.email ? <p className="invite-tip">Regenerating replaces the previous link. Wait at least 60 seconds between attempts.</p> : <p className="invite-tip">Secure links expire in 7 days.</p>}
        <form className="form" onSubmit={(event: FormEvent) => { event.preventDefault(); void submit(action); }}>
          <label className="field"><span>Invitation method</span><select value={method} onChange={event => setMethod(event.target.value as "email" | "copy")}><option value="copy">Share secure link</option><option value="email">Email</option></select></label>
          <label className="field"><span>Patient email</span><input type="email" maxLength={254} value={destination} onChange={event => setDestination(event.target.value)} required /></label>
          <button className="button" type="submit" disabled={busy}>{busy ? "Preparing..." : action === "replace" ? "Revoke old invitation and create replacement" : method === "copy" ? "Generate secure link" : "Send email invitation"}</button>
        </form>
      </section>
    </div> : null}
  </div>;
}
