import Link from "next/link";
import type {PatientWorkspace} from "@/lib/types";
export function PatientGoalSummary({workspace}: {workspace: PatientWorkspace}) {
  const goal=workspace.goals[0];const patient=workspace.patient;
  const baseline=goal?.baseline_value ?? patient?.baseline_value;
  const current=goal?.current_value ?? patient?.current_value;
  const target=goal?.target_value ?? patient?.target_value;
  return <section className="patient-goal-hero" style={{display:"block"}}>
    <p className="eyebrow">What you’re working toward</p>
    <h2>{goal?.title ?? patient?.goal ?? "Your therapist is preparing your goal"}</h2>
    <p>{patient?.primary_outcome ?? "Your main goal"}{goal?.unit ? ` · ${goal.unit}` : ""}</p>
    {baseline != null && current != null ? <p><strong>{baseline} at the start → {current} now</strong>{target != null ? ` · Goal: ${target}` : ""}</p> : <p className="muted">Your progress will appear as you and your therapist record it.</p>}
    <Link href="/patient/progress">See your progress</Link>
  </section>;
}
