import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function FeaturePreview({
  eyebrow,
  title,
  description,
  icon: Icon,
  capabilities,
  patient = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  capabilities: string[];
  patient?: boolean;
}) {
  return (
    <section className={patient ? "feature-preview patient-feature-preview" : "feature-preview"}>
      <div className="feature-preview-icon"><Icon size={28} /></div>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p className="feature-preview-lead">{description}</p>
      <div className="feature-preview-grid">
        {capabilities.map((capability) => (
          <div className="feature-preview-card" key={capability}>
            <span className="feature-preview-dot" />
            <span>{capability}</span>
          </div>
        ))}
      </div>
      <div className="feature-preview-note">
        <strong>Product preview</strong>
        <span>This area is intentionally in the product shell now so pilot feedback can guide what we build next.</span>
      </div>
      <Link className="secondary-button" href={patient ? "/patient" : "/dashboard"}>Back to {patient ? "Today" : "workspace"}</Link>
    </section>
  );
}
