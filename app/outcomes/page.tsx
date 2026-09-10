import { BarChart3 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { FeaturePreview } from "@/components/FeaturePreview";
import { RequireAuth } from "@/components/RequireAuth";

export default function OutcomesPage() {
  return <AppShell><RequireAuth><FeaturePreview eyebrow="Insights" title="Outcomes" description="Turn rehabilitation activity into a clearer picture of progress across patients, episodes, and the practice." icon={BarChart3} capabilities={["Patient-reported outcomes", "Goal attainment", "Pain and function change", "Caseload-level trends"]} /></RequireAuth></AppShell>;
}
