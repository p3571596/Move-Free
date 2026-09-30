"use client";

import { engineFields, type EngineInputs, type EngineKey, type EngineResult } from "@/lib/clinical-engine";
import { mapClinicalInputs, evaluateAutomaticReview, type AutomaticReview } from "@/lib/automatic-clinical-review";
import type { PatientWorkspace } from "@/lib/types";

export type EngineReviewDraft = {
  result: EngineResult;
  mapped: AutomaticReview;
  observations: EngineInputs;
  disposition: "accepted" | "modified" | "rejected" | "not_evaluated" | "";
  disagreementReason: string;
  modification: string;
};

export function ClinicalEngineReview({ workspace, value, onChange, storageReady }: {
  workspace: PatientWorkspace; value: EngineReviewDraft | null;
  onChange: (value: EngineReviewDraft | null) => void; storageReady: boolean;
}) {
  const observations = value?.observations ?? {};
  const mapped = value?.mapped ?? mapClinicalInputs(workspace);
  const inputs = mapped.inputs;
  const result = value?.result;
  const update = (key: EngineKey, next: string | number | boolean | null) => {
    const edited = {...observations, [key]: next};
    const refreshed = mapClinicalInputs(workspace, edited, mapped.window.to);
    onChange({mapped:refreshed, observations:edited, result:evaluateAutomaticReview(refreshed), disposition:"", disagreementReason:"", modification:""});
  };
  return <section className="form" aria-label="Clinical Decision Engine v0.1">
    <div><p className="eyebrow">Recovered rule-based prototype · v0.1</p><h3>Clinical decision support</h3>
      <p className="muted">Unvalidated pilot rules. Review the evidence and make your own decision. Nothing here is sent to the patient.</p></div>
    {!storageReady ? <p className="empty" role="status">Evaluation storage · Preview. The new clinician-only database storage is not available here yet. You can inspect the rules, but engine comparisons cannot be saved in this environment.</p> : null}
    <h4>Automatically analyzed data</h4>
    <p>Review window: {new Date(mapped.window.from).toLocaleDateString()} – {new Date(mapped.window.to).toLocaleDateString()}</p>
    <p>{mapped.context.counts.completed} completed · {mapped.context.counts.partial} partial · {mapped.context.counts.skipped} skipped. Completion among reported exercises: {mapped.context.completionRate == null ? "unknown" : `${mapped.context.completionRate}%`}. Prescribed adherence remains separate.</p>
    <p>Reported completion trend (earlier → later half of window): {mapped.context.completionTrend.previousRate ?? 'unknown'} → {mapped.context.completionTrend.recentRate ?? 'unknown'}%. This is not prescribed adherence.</p>
    <ul>{(Object.keys(engineFields) as EngineKey[]).filter(key=>mapped.provenance[key].state==='AUTO').map(key=><li key={key}><strong>{engineFields[key].label}: {String(inputs[key])}</strong> · AUTO — {mapped.provenance[key].source}</li>)}</ul>
    {mapped.context.repeatedDifficulty.map(item=><p key={item.exerciseId}>Repeated difficulty: {workspace.programExercises.find(e=>e.id===item.exerciseId)?.exercise?.name ?? 'Previously assigned exercise'} in {item.count} reports.</p>)}
    <details><summary>Source records, comments and limitations</summary>
      {mapped.context.checkins.map(c=><p key={c.id}>{c.checkin_date}: pain {c.pain_score ?? 'unknown'}/10 · {c.patient_comment ?? c.notes ?? 'No comment'}</p>)}
      {mapped.context.logs.map(l=><p key={l.id}>{l.performed_at?.slice(0,10)} · {l.completion_status ?? 'Unknown completion'} · {l.difficulty ?? 'Difficulty unknown'} · {l.notes ?? 'No comment'}</p>)}
      {mapped.context.exercises.map(e=><p key={e.id}>{e.exercise?.name ?? 'Exercise'}: {e.dosage_sets ?? e.sets ?? 'Unknown sets'} × {e.dosage_reps ?? e.reps ?? 'Unknown reps/time'} · {e.frequency ?? 'Unknown frequency'}</p>)}
      {mapped.context.goals.map(g=><p key={g.id}>{g.title}: {g.baseline_value ?? 'Unknown baseline'} → {g.current_value ?? 'Unknown current'}; target {g.target_value ?? 'unknown'} {g.unit}</p>)}
      <p>Previous decision: {mapped.context.previousDecision?.decision_type ?? 'None recorded'} — {mapped.context.previousDecision?.rationale ?? ''}</p>
      {mapped.context.limitations.map(text=><p key={text}>{text}</p>)}
    </details>
    <details><summary>Add clinical observation / inspect unavailable information</summary>
      <p>Observations supplement unavailable fields. Editing an observation recalculates the review and clears the previous approval.</p>
      <div className="form-grid" style={{marginTop:16}}>{(Object.keys(engineFields) as EngineKey[]).map(key => {
        const field = engineFields[key];const v=inputs[key];
        if(mapped.provenance[key].state === "AUTO") return null;
        return <div className="field" key={key}><label htmlFor={`engine-${key}`}>{field.label} · {mapped.provenance[key].state}</label>
          {field.kind === "number" ? <input id={`engine-${key}`} type="number" min={field.min} max={field.max} step="0.5" placeholder="Not assessed" value={typeof v === "number" ? v : ""} onChange={e=>update(key,e.target.value === "" ? null : Number(e.target.value))}/> :
            <select id={`engine-${key}`} value={v == null ? "" : String(v)} onChange={e=>update(key,e.target.value === "" ? null : field.kind === "boolean" ? e.target.value === "true" : e.target.value)}>
              <option value="">Not assessed</option>
              {field.kind === "boolean" ? <><option value="false">Assessed — absent</option><option value="true">Present</option></> : Object.entries(field.options).map(([option,label])=><option key={option} value={option}>{label}</option>)}
            </select>}
        </div>;
      })}</div>
    </details>
    <button type="button" className="secondary-button" onClick={()=>{const next=mapClinicalInputs(workspace,observations,mapped.window.to);onChange({mapped:next,observations,result:evaluateAutomaticReview(next),disposition:"",disagreementReason:"",modification:""});}}>Recalculate with available data</button>
    {result && value ? <div className="panel form" aria-live="polite">
      <strong>{result.recommendation}</strong><p>{result.bottleneck}</p>
      <p className="eyebrow">Why · {result.ruleId}</p><ul>{result.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>
      {result.missing.length ? <details><summary>Information unavailable / not assessed ({result.missing.length})</summary><ul>{result.missing.map(key=><li key={key}>{engineFields[key].label}: not assessed</li>)}</ul><p>Unknowns have not been converted to normal findings.</p></details> : null}
      <ul>{result.flags.map(flag=><li key={flag}>{flag}</li>)}</ul>
      {result.status === "evaluated" ? <>
        <div className="field"><label htmlFor="engine-agreement">Your assessment of this suggestion</label><select id="engine-agreement" value={value.disposition} onChange={e=>onChange({...value,disposition:e.target.value as EngineReviewDraft["disposition"]})}><option value="">Choose after your review</option><option value="accepted">Approve</option><option value="modified">Modify</option><option value="rejected">Reject</option></select></div>
        {value.disposition === "modified" ? <div className="field"><label htmlFor="engine-modification">Your modification</label><textarea id="engine-modification" maxLength={4000} value={value.modification} onChange={e=>onChange({...value,modification:e.target.value})}/></div> : null}
        {value.disposition === "modified" || value.disposition === "rejected" ? <div className="field"><label htmlFor="engine-disagreement">Reason for disagreement (optional)</label><textarea id="engine-disagreement" maxLength={4000} value={value.disagreementReason} onChange={e=>onChange({...value,disagreementReason:e.target.value})}/></div> : null}
      </> : <p>No agreement score will be assigned to an unevaluated case.</p>}
      <p className="muted">Record your final decision below. Publishing patient guidance is a separate clinician approval.</p>
    </div> : null}
  </section>;
}
