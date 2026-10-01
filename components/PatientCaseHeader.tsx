"use client";
import Link from "next/link";
import { PatientInviteButton } from "./PatientInviteButton";
import type { PatientWorkspace } from "@/lib/types";
export function PatientCaseHeader({workspace,section}:{workspace:PatientWorkspace;section:string}) {
 const p=workspace.patient!; const goal=workspace.goals.find(g=>g.status==='active')??workspace.goals[0];
 return <div className="patient-case-header">
  <header className="case-identity"><div><p className="eyebrow">Patient workspace · {p.status==='discharged'?'Discharged':workspace.episode?.status??'Active'}</p><h2>{p.display_name??p.name??p.full_name??'Patient'}</h2><p className="muted">{workspace.episode?.title??p.diagnosis??p.primary_complaint??'Clinical context not recorded'}</p></div>
   <details className="case-actions"><summary>Patient actions</summary><div className="form"><PatientInviteButton patientId={p.id} isLinked={!!p.patient_profile_id}/><Link href={`/patients/${p.id}/edit`}>Edit Profile</Link><Link href={`/patients/${p.id}/preview`}>Preview Patient App</Link></div></details>
  </header>
  <div className="case-goal"><strong>{goal?.title??'Primary goal not recorded'}</strong><span>{goal?.baseline_value??'Baseline not recorded'} → {goal?.current_value??'Current not recorded'}{goal?.unit ? ` ${goal.unit}` : ''} · Target {goal?.target_value??'not recorded'}</span></div>
  <nav className="case-tabs" aria-label="Patient workspace tabs">{[['summary','Summary',''],['progress','Progress','/progress'],['logs','Patient Log','/logs'],['program','Program','/program']].map(([key,label,path])=><Link key={key} href={`/patients/${p.id}${path}`} aria-current={section===key?'page':undefined}>{label}</Link>)}</nav>
 </div>;
}
