import { Settings } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { FeaturePreview } from "@/components/FeaturePreview";
import { RequireAuth } from "@/components/RequireAuth";

export default function SettingsPage() {
  return <AppShell><RequireAuth><FeaturePreview eyebrow="Practice" title="Settings" description="Configure the Move Free experience as the pilot grows into a practice-ready platform." icon={Settings} capabilities={["Profile and practice identity", "Patient communication preferences", "Security and access", "Future integrations"]} /></RequireAuth></AppShell>;
}
