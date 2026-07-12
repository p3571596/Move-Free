import { goalPercent } from "@/lib/format";
import type { Goal } from "@/lib/types";

export function GoalProgress({ goals }: { goals: Goal[] }) {
  if (!goals.length) {
    return <div className="empty">No goals visible for this patient yet.</div>;
  }

  const average = Math.round(
    goals.reduce((sum, goal) => sum + normalizedGoalPercent(goal), 0) / goals.length,
  );

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Goal Progress</p>
          <h3>{average}% overall</h3>
        </div>
        <span className="pill">{goals.length} active</span>
      </div>
      <div className="grid" style={{ marginTop: 16 }}>
        {goals.map((goal) => {
          const percent = normalizedGoalPercent(goal);
          return (
            <div key={goal.id}>
              <div className="row-between">
                <strong>{goal.title ?? "Clinical goal"}</strong>
                <span>{percent}%</span>
              </div>
              <div className="progress-track" aria-label={`${goal.title} ${percent}%`}>
                <div className="progress-fill" style={{ width: `${percent}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function normalizedGoalPercent(goal: Goal) {
  if (typeof goal.progress_percent === "number") {
    return Math.min(100, Math.max(0, goal.progress_percent));
  }

  const current = goal.current_value == null ? null : Number(goal.current_value);
  const target = goal.target_value == null ? null : Number(goal.target_value);

  return goalPercent(
    current != null && !Number.isNaN(current) ? current : null,
    target != null && !Number.isNaN(target) ? target : null,
  );
}
