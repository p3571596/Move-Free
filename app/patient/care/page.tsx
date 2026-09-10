import { HeartHandshake } from "lucide-react";
import { FeaturePreview } from "@/components/FeaturePreview";
import { PatientShell } from "@/components/PatientShell";
import { RequireAuth } from "@/components/RequireAuth";

export default function PatientCarePage() {
  return <PatientShell><RequireAuth><FeaturePreview patient eyebrow="Your care" title="Stay connected to your recovery" description="Your future home for appointments, therapist guidance, education, and virtual care." icon={HeartHandshake} capabilities={["Next appointment and visit preparation", "Therapist messages and guidance", "Helpful recovery education", "Future secure video visits"]} /></RequireAuth></PatientShell>;
}
