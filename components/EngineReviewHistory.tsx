"use client";
import {useEffect,useState} from "react";
import {createSupabaseBrowserClient} from "@/lib/supabase";
import type {EngineReviewRecord,PatientWorkspace,ClinicalDecision} from "@/lib/types";
export function EngineReviewHistory({workspace,refresh}:{workspace:PatientWorkspace;refresh:boolean}){
  const [rows,setRows]=useState<EngineReviewRecord[]>([]);const [decisions,setDecisions]=useState<ClinicalDecision[]>([]);
  useEffect(()=>{let active=true;if(!workspace.patient)return;const db=createSupabaseBrowserClient();Promise.all([db.from("clinical_engine_reviews").select("*").eq("patient_id",workspace.patient.id).order("created_at",{ascending:false}).limit(20),db.from("clinical_decisions").select("*").eq("patient_id",workspace.patient.id).order("created_at",{ascending:false}).limit(50)]).then(([r,d])=>{if(active&&!r.error){setRows(r.data??[]);setDecisions(d.data??[]);}});return()=>{active=false;};},[workspace.patient,refresh]);
  if(!rows.length)return null;
  return <section className="panel"><h3>Decision and response history</h3>{rows.map((row,index)=>{
    const decision=decisions.find(d=>d.id===row.id);
    const next=rows[index-1]?.created_at;
    const responses=workspace.checkins.filter(c=>c.created_at && c.created_at>row.created_at && (!next||c.created_at<next));
    return <details key={row.id}><summary>{new Date(row.created_at).toLocaleString()} · {row.disposition.replaceAll('_',' ')} · {decision?.decision_type??'Clinical review'}</summary><p>Engine: {row.engine_result.recommendation}</p><ul>{row.engine_result.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul><p>Clinician decision: {decision?.rationale??'See clinical decision record'}</p>{row.clinician_modification?<p>Modification: {row.clinician_modification}</p>:null}{row.disagreement_reason?<p>Reason for disagreement: {row.disagreement_reason}</p>:null}<p>Subsequent response (within the latest 30 check-ins): {responses.length?responses.map(c=>`${c.symptom_direction??'Symptoms not rated'}${c.pain_score!=null?`, pain ${c.pain_score}/10`:''}${c.patient_comment?` — ${c.patient_comment}`:''}`).join('; '):'No later response recorded in this window.'}</p><small>Engine version {row.engine_version}. Patient evidence and program snapshots retained with this review. Later responses are associated by time, not proof of causation.</small></details>;
  })}</section>;
}
