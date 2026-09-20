"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { publishPatientGuidance, recordClinicalReview } from "@/lib/data";
import type { PatientWorkspace } from "@/lib/types";

export function RecommendationEditor({ workspace }: { workspace: PatientWorkspace }) {
  const [text, setText] = useState(workspace.program?.patient_explanation ?? "");
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [version, setVersion] = useState(workspace.program?.updated_at ?? "");
  const [decisionType, setDecisionType] = useState("continue");
  const [rationale, setRationale] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [reviewId] = useState(() => crypto.randomUUID());
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!approved || !workspace.patient || !workspace.program) return;
    setBusy(true); setError(""); setMessage("");
    try {
      setVersion(await publishPatientGuidance(createSupabaseBrowserClient(), workspace.patient.id, workspace.program.id, text, version));
      setMessage("Approved guidance saved to the patient’s current program. They can see it in Today and Care when connected.");
      setApproved(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save guidance. Please retry."); }
    finally { setBusy(false); }
  }
  if (!workspace.patient) return null;
  return <section className="panel form" style={{ marginTop: 20 }}>
    <div><p className="eyebrow">Clinician review</p><h3>Recommendation for your patient</h3></div>
    <aside className="empty"><strong>Decision assistance · Preview</strong><p>No AI recommendation engine is connected. Review the patient’s symptoms, exercise responses, and comments, then use your clinical judgment. Nothing is sent automatically.</p></aside>
    <Link className="secondary-button" href={`/program-builder/${workspace.patient.id}`}>Review or update exercises and dosage</Link>
    {workspace.program ? <form onSubmit={submit} className="form">
      <p className="muted">This replaces the guidance shown with the current program. Exercise and dosage changes are saved in the program builder.</p>
      <div className="field"><label htmlFor="patient-guidance">Patient-facing guidance</label><textarea id="patient-guidance" required maxLength={4000} value={text} onChange={event => { setText(event.target.value); setApproved(false); setMessage(""); }} /></div>
      <label><input type="checkbox" checked={approved} onChange={event => setApproved(event.target.checked)} /> I reviewed this guidance and approve showing it to the patient.</label>
      <button className="button" disabled={busy || !approved || !text.trim()}>{busy ? "Saving…" : "Approve and publish guidance"}</button>
      {message ? <p role="status" className="success-banner">{message}</p> : null}
      {error ? <p role="alert" className="form-error">{error}</p> : null}
    </form> : <p>Assign a program before publishing guidance.</p>}
    <form className="form" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError("");
      try { await recordClinicalReview(createSupabaseBrowserClient(), workspace, decisionType, rationale, reviewId); setReviewed(true); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Review could not be saved."); }
      finally { setBusy(false); }
    }}>
      <h3>Record the clinical review</h3>
      <p className="muted">This records your decision and clears the new-feedback indicator. Clinical alerts may remain. It does not send patient guidance or change exercises.</p>
      <div className="field"><label htmlFor="review-decision">Decision</label><select id="review-decision" value={decisionType} onChange={event => setDecisionType(event.target.value)}>{["continue", "progress", "modify", "regress", "reassess", "refer_out", "discharge"].map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></div>
      <div className="field"><label htmlFor="review-rationale">Review rationale</label><textarea id="review-rationale" required maxLength={4000} value={rationale} onChange={event => setRationale(event.target.value)}/></div>
      <button className="secondary-button" disabled={busy || reviewed || !rationale.trim()}>{reviewed ? "Review recorded" : "Mark feedback reviewed"}</button>
      {reviewed ? <p role="status">Review recorded. Return to Today to see the updated inbox.</p> : null}
    </form>
  </section>;
}
