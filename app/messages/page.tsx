import { MessageSquare } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { FeaturePreview } from "@/components/FeaturePreview";
import { RequireAuth } from "@/components/RequireAuth";

export default function MessagesPage() {
  return <AppShell><RequireAuth><FeaturePreview eyebrow="Care" title="Messages" description="A focused communication space for questions that come up between visits—without turning rehabilitation into another noisy inbox." icon={MessageSquare} capabilities={["Patient questions in clinical context", "Therapist follow-up and encouragement", "Conversation attached to the care journey", "Future notification controls"]} /></RequireAuth></AppShell>;
}
