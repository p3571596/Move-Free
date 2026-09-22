import { CalendarDays } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { FeaturePreview } from "@/components/FeaturePreview";
import { RequireAuth } from "@/components/RequireAuth";

export default function SchedulePage() {
  return <AppShell><RequireAuth><FeaturePreview eyebrow="Workspace" title="Schedule" description="See upcoming visits alongside the patient signals that matter before the appointment starts." icon={CalendarDays} capabilities={["Upcoming visits", "Pre-visit review status", "Patient check-in readiness", "Future video visit entry point"]} /></RequireAuth></AppShell>;
}
