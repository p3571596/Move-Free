"use client";
import {useEffect,useState} from "react";
import {createSupabaseBrowserClient} from "@/lib/supabase";
import type {EngineAnalytics} from "@/lib/types";
export function EngineAnalyticsPanel({days}:{days:number}){
  const [data,setData]=useState<EngineAnalytics|null>(null);const [unavailable,setUnavailable]=useState(false);
  useEffect(()=>{let active=true;createSupabaseBrowserClient().rpc("get_engine_pilot_analytics",{p_days:days}).then(({data,error})=>{if(active){setData(error?null:data);setUnavailable(!!error);}});return()=>{active=false;};},[days]);
  const evaluated=data?data.accepted+data.modified+data.rejected:0;
  return <section className="panel" style={{marginBottom:24}}><p className="eyebrow">Clinical Decision Engine v0.1 · Pilot evaluation</p><h3>Where do clinician decisions differ?</h3>
    {unavailable?<p>Preview: engine evaluation storage and aggregate reporting are not enabled in this environment yet.</p>:!data?<p>Loading evaluations…</p>:<>
      <p>{data.reviews} reviews · {data.accepted} accepted · {data.modified} modified · {data.rejected} rejected · {data.notEvaluated} missing information</p>
      <p>Acceptance: {evaluated?`${Math.round(data.accepted/evaluated*100)}% of ${evaluated} evaluated reviews`:"No evaluated cases yet"}. Acceptance reflects clinician agreement, not clinical validation.</p>
      <p>{data.withSubsequentResponse} reviews have a later patient check-in before the next engine review. This records temporal association, not treatment effectiveness.</p>
      {data.rules.length?<div style={{overflowX:"auto"}}><table className="table"><thead><tr><th>Rule</th><th>Reviews</th><th>Accepted</th><th>Modified</th><th>Rejected</th></tr></thead><tbody>{data.rules.map(r=><tr key={r.rule}><td>{r.rule}</td><td>{r.reviews}</td><td>{r.accepted}</td><td>{r.modified}</td><td>{r.rejected}</td></tr>)}</tbody></table></div>:null}
    </>}
  </section>;
}
