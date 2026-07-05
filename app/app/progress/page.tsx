import { AppShell } from "@/components/AppShell";
import { GoalProgress } from "@/components/GoalProgress";
import { ProgressBars } from "@/components/ProgressBars";
import { RequireAuth } from "@/components/RequireAuth";
import { sampleWorkspace } from "@/lib/sample-data";

export default function PatientProgressPage() {
  return (
    <AppShell>
      <RequireAuth>
        <div className="mobile-frame">
          <div className="topbar">
            <div>
              <p className="eyebrow">Progress</p>
              <h2>Recovery signals</h2>
            </div>
          </div>
          <GoalProgress goals={sampleWorkspace.goals} />
          <section className="panel" style={{ marginTop: 18 }}>
            <p className="eyebrow">Trend</p>
            <ProgressBars metrics={sampleWorkspace.progressMetrics} />
          </section>
        </div>
      </RequireAuth>
    </AppShell>
  );
}
