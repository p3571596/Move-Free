import { goalPercent } from "@/lib/format";
import type { Goal } from "@/lib/types";

export function GoalProgress({ goals }: { goals: Goal[] }) {
  if (!goals.length) {
    return <div className="empty">No goals visible for this patient yet.</div>;
  }

  const average = Math.round(
    goals.reduce((sum, goal) => sum + goalPercent(goal.current_value, goal.target_value), 0) / goals.length,
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
          const percent = goalPercent(goal.current_value, goal.target_value);
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
