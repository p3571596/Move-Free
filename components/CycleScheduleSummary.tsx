import type { HomeProgramExercise } from "@/lib/types";
import type { ProgressionPlan } from "@/lib/progression";
import { cycleOccurrences, cyclePrescription, addDays } from "@/lib/cycle";
import { formatPrescription } from "@/lib/prescription";
export function CycleScheduleSummary({
  plan,
  items,
  date = new Date().toLocaleDateString("en-CA"),
}: {
  plan: ProgressionPlan;
  items: HomeProgramExercise[];
  date?: string;
}) {
  if (!plan.cycle) return null;
  const start = date < plan.startDate ? plan.startDate : date;
  const occurrences = cycleOccurrences(plan).filter(
    (o) => o.date >= start && o.date <= addDays(start, 6),
  );
  return (
    <section className="panel form">
      <h3>Weekly overview</h3>
      <p>
        {plan.startDate} – {plan.cycle.endDate} ·{" "}
        {plan.cycle.mode === "fixed"
          ? "Follow the approved dated sessions"
          : "Choose approved sessions within weekly limits and recovery spacing"}
      </p>
      {occurrences.length ? (
        occurrences.map((o) => {
          const profile = plan.templates.find((t) => t.id === o.profileId)!;
          return (
            <details key={o.date}>
              <summary>
                {o.date} · {profile.name}
              </summary>
              <p>{profile.notes}</p>
              {profile.fullRest ? (
                <p>Full rest. No mandatory exercise.</p>
              ) : (
                profile.exercises.map((e) => (
                  <p key={e.assignmentId}>
                    <strong>
                      {items.find((i) => i.id === e.assignmentId)
                        ?.patient_name ??
                        items.find((i) => i.id === e.assignmentId)?.exercise
                          ?.name}
                    </strong>{" "}
                    ·{" "}
                    {formatPrescription(
                      cyclePrescription(
                        plan,
                        o.date,
                        o.profileId,
                        e.assignmentId,
                      ),
                    )}
                  </p>
                ))
              )}
            </details>
          );
        })
      ) : (
        <p>
          This approved cycle has ended. Ask your clinician to review the next
          plan.
        </p>
      )}
    </section>
  );
}
