"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { publishPatientGuidance, recordClinicalReview } from "@/lib/data";
import { ClinicalReviewBrief } from "./ClinicalReviewBrief";
import { EngineReviewHistory } from "./EngineReviewHistory";
import { ClinicalEngineReview, type EngineReviewDraft } from "./ClinicalEngineReview";
import { mapClinicalInputs, evaluateAutomaticReview } from "@/lib/automatic-clinical-review";
import type { PatientWorkspace } from "@/lib/types";

export function RecommendationEditor({ workspace }: { workspace: PatientWorkspace }) {
  const [evaluation, setEvaluation] = useState<EngineReviewDraft | null>(() => { const mapped=mapClinicalInputs(workspace); return {mapped,observations:{},result:evaluateAutomaticReview(mapped),disposition:"",disagreementReason:"",modification:""}; });
  const [storageReady, setStorageReady] = useState(false);
  useEffect(() => { let active=true; createSupabaseBrowserClient().from("clinical_engine_reviews").select("id").limit(0).then(({error})=>{if(active)setStorageReady(!error);}); return ()=>{active=false;}; }, []);
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
      setMessage("Approved guidance saved to the patient’s current program. They can see it in Today and Messages when connected.");
      setApproved(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save guidance. Please retry."); }
    finally { setBusy(false); }
  }
  if (!workspace.patient) return null;
  return <section className="panel form" style={{ marginTop: 20 }}>
    <div><p className="eyebrow">Clinician review</p><h3>Recommendation for your patient</h3></div>
    <ClinicalReviewBrief workspace={workspace}/>
    <ClinicalEngineReview workspace={workspace} value={evaluation} onChange={next=>{
      setEvaluation(next);
      if(next?.disposition==='accepted') {
        const actions:Record<string,string>={'v0.1.safety':'refer_out','v0.1.changed_pattern':'reassess','v0.1.adverse_response':'regress','v0.1.progress_repetitions':'progress','v0.1.maintain':'continue','v0.1.unexplained_plateau':'reassess','integration.review_missing':'reassess'};
        setDecisionType(actions[next.result.ruleId] ?? 'modify');
        setRationale(`${next.result.recommendation}: ${next.result.reasons.join(' ')}`);
      }
    }} storageReady={storageReady}/>

    <p className="muted">Record the review before saving program changes to associate the change with this decision.</p>
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
      try { await recordClinicalReview(createSupabaseBrowserClient(), workspace, decisionType, rationale, reviewId, evaluation ?? undefined); setReviewed(true); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Review could not be saved."); }
      finally { setBusy(false); }
    }}>
      <h3>Record the clinical review</h3>
      {evaluation && !storageReady ? <p>Engine evaluation cannot be saved until clinician-only storage is enabled. <button type="button" className="secondary-button" onClick={()=>setEvaluation(null)}>Clear evaluation and record a manual review</button></p> : null}
      <p className="muted">This records your decision and clears the new-feedback indicator. Clinical alerts may remain. It does not send patient guidance or change exercises.</p>
      <div className="field"><label htmlFor="review-decision">Decision</label><select id="review-decision" value={decisionType} onChange={event => setDecisionType(event.target.value)}>{["continue", "modify", "progress", "regress", "reassess", "contact", "other", "refer_out", "discharge"].map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></div>
      <div className="field"><label htmlFor="review-rationale">Review rationale</label><textarea id="review-rationale" required maxLength={4000} value={rationale} onChange={event => setRationale(event.target.value)}/></div>
      <button className="secondary-button" disabled={busy || reviewed || !rationale.trim() || !!(evaluation && (!storageReady || !evaluation.disposition))}>{reviewed ? "Review recorded" : "Mark feedback reviewed"}</button>
      {reviewed ? <p role="status">Review recorded. Return to Today to see the updated inbox.</p> : null}
    </form>
    {error ? <p role="alert" className="form-error">{error}</p> : null}
    <EngineReviewHistory workspace={workspace} refresh={reviewed}/>
  </section>;
}
