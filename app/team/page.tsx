import { Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { FeaturePreview } from "@/components/FeaturePreview";
import { RequireAuth } from "@/components/RequireAuth";

export default function TeamPage() {
  return <AppShell><RequireAuth><FeaturePreview eyebrow="Practice" title="Team" description="A future home for clinicians, roles, caseload ownership, and collaborative care." icon={Users} capabilities={["Clinician roster", "Roles and permissions", "Caseload assignment", "Practice-level collaboration"]} /></RequireAuth></AppShell>;
}
