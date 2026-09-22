"use client";

import { useState } from "react";
import { engineFields, evaluateEngine, type EngineInputs, type EngineKey, type EngineResult } from "@/lib/clinical-engine";
import type { PatientWorkspace } from "@/lib/types";

export type EngineReviewDraft = {
  result: EngineResult;
  disposition: "accepted" | "modified" | "rejected" | "not_evaluated" | "";
  disagreementReason: string;
  modification: string;
};

export function ClinicalEngineReview({ workspace, value, onChange, storageReady }: {
  workspace: PatientWorkspace; value: EngineReviewDraft | null;
  onChange: (value: EngineReviewDraft | null) => void; storageReady: boolean;
}) {
  // This report is the only directly equivalent field currently collected by the patient flow.
  // Participation != prescribed adherence; difficulty != RPE; daily pain != exercise pain.
  const report = workspace.checkins[0];
  const reportedTrend = report?.symptom_direction;
  const [inputs, setInputs] = useState<EngineInputs>(() => reportedTrend ? {painTrend: reportedTrend === "unchanged" ? "stable" : reportedTrend} : {});
  const [changed, setChanged] = useState(false);
  const result = value?.result;
  const update = (key: EngineKey, next: string | number | boolean | null) => {
    setInputs(current => ({...current,[key]:next})); setChanged(true); onChange(null);
  };
  return <section className="form" aria-label="Clinical Decision Engine v0.1">
    <div><p className="eyebrow">Recovered rule-based prototype · v0.1</p><h3>Clinical decision support</h3>
      <p className="muted">Unvalidated pilot rules. Review the evidence and make your own decision. Nothing here is sent to the patient.</p></div>
    {!storageReady ? <p className="empty" role="status">Evaluation storage · Preview. The new clinician-only database storage is not available here yet. You can inspect the rules, but engine comparisons cannot be saved in this environment.</p> : null}
    <p className="muted">{reportedTrend ? `Pain trend starts from the patient’s report on ${new Date(report.created_at ?? report.checkin_date ?? "").toLocaleDateString()}.` : "No patient-reported symptom trend is available."} Other fields require your assessment. Missing findings are never treated as normal. {changed ? "Inputs edited by clinician." : ""}</p>
    <details><summary>Assess inputs and inspect missing information</summary>
      <div className="form-grid" style={{marginTop:16}}>{(Object.keys(engineFields) as EngineKey[]).map(key => {
        const field = engineFields[key];const v=inputs[key];
        return <div className="field" key={key}><label htmlFor={`engine-${key}`}>{field.label}</label>
          {field.kind === "number" ? <input id={`engine-${key}`} type="number" min={field.min} max={field.max} step="0.5" placeholder="Not assessed" value={typeof v === "number" ? v : ""} onChange={e=>update(key,e.target.value === "" ? null : Number(e.target.value))}/> :
            <select id={`engine-${key}`} value={v == null ? "" : String(v)} onChange={e=>update(key,e.target.value === "" ? null : field.kind === "boolean" ? e.target.value === "true" : e.target.value)}>
              <option value="">Not assessed</option>
              {field.kind === "boolean" ? <><option value="false">Assessed — absent</option><option value="true">Present</option></> : Object.entries(field.options).map(([option,label])=><option key={option} value={option}>{label}</option>)}
            </select>}
        </div>;
      })}</div>
    </details>
    <button type="button" className="secondary-button" onClick={()=>{const next=evaluateEngine(inputs);onChange({result:next,disposition:next.status === "missing_information" ? "not_evaluated" : "", disagreementReason:"",modification:""});}}>Evaluate with v0.1 rules</button>
    {result ? <div className="panel form" aria-live="polite">
      <strong>{result.recommendation}</strong><p>{result.bottleneck}</p>
      <p className="eyebrow">Why · {result.ruleId}</p><ul>{result.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>
      {result.missing.length && result.status === "evaluated" ? <p>Still unassessed: {result.missing.map(key=>engineFields[key].label).join("; ")}. The safety finding takes priority.</p> : null}
      <ul>{result.flags.map(flag=><li key={flag}>{flag}</li>)}</ul>
      {result.status === "evaluated" ? <>
        <div className="field"><label htmlFor="engine-agreement">Your assessment of this suggestion</label><select id="engine-agreement" value={value.disposition} onChange={e=>onChange({...value,disposition:e.target.value as EngineReviewDraft["disposition"]})}><option value="">Choose after your review</option><option value="accepted">Accept</option><option value="modified">Modify</option><option value="rejected">Reject</option></select></div>
        {value.disposition === "modified" ? <div className="field"><label htmlFor="engine-modification">Your modification</label><textarea id="engine-modification" maxLength={4000} value={value.modification} onChange={e=>onChange({...value,modification:e.target.value})}/></div> : null}
        {value.disposition === "modified" || value.disposition === "rejected" ? <div className="field"><label htmlFor="engine-disagreement">Reason for disagreement (optional)</label><textarea id="engine-disagreement" maxLength={4000} value={value.disagreementReason} onChange={e=>onChange({...value,disagreementReason:e.target.value})}/></div> : null}
      </> : <p>No agreement score will be assigned to an unevaluated case.</p>}
      <p className="muted">Record your final decision below. Publishing patient guidance is a separate clinician approval.</p>
    </div> : null}
  </section>;
}
