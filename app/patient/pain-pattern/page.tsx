"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { HeartPulse } from "lucide-react";
import { PatientShell } from "@/components/PatientShell";
import { RoleGate } from "@/components/RoleGate";
import { RequireAuth } from "@/components/RequireAuth";
import { loadCurrentPatientAppWorkspace, logPainPattern } from "@/lib/data";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { PatientWorkspace } from "@/lib/types";

export default function PainPatternPage() {
  const [workspace, setWorkspace] = useState<PatientWorkspace | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setWorkspace(null);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    loadCurrentPatientAppWorkspace(supabase).then(setWorkspace).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load your patient record."));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!workspace?.patient || !workspace.episode) {
      setError("Your account is not linked to an active care episode. Ask your clinician for help.");
      return;
    }

    const data = new FormData(event.currentTarget);
    const painScore = Number(data.get("painScore"));
    setError("");
    setSaving(true);

    if (isSupabaseConfigured()) {
      const supabase = createSupabaseBrowserClient();
      try {
        await logPainPattern(supabase, {
          patientId: workspace.patient.id,
          episodeId: workspace.episode.id,
          painScore,
          painLocation: String(data.get("painLocation") ?? ""),
          symptomBehavior: String(data.get("symptomBehavior") ?? ""),
          activityContext: String(data.get("activityContext") ?? ""),
          aggravatingFactors: String(data.get("aggravatingFactors") ?? ""),
          easingFactors: String(data.get("easingFactors") ?? ""),
          confidenceScore: data.get("confidenceScore") ? Number(data.get("confidenceScore")) : null,
          symptomDirection: String(data.get("symptomDirection")) as "improving" | "unchanged" | "worsening",
          patientComment: String(data.get("patientComment") ?? ""),
          clientSubmissionId: submissionId,
        });
      } catch (cause) {
        const duplicate = cause instanceof Error && cause.message.includes("duplicate key");
        setError(duplicate ? "This check-in was already saved." : cause instanceof Error ? cause.message : "Could not save daily check-in.");
        setSaving(false);
        return;
      }
    }

    setMessage("Today’s check-in was saved. Your therapist can now see it.");
    setSubmissionId(crypto.randomUUID());
    setSaving(false);
    event.currentTarget.reset();
  }

  return (
    <PatientShell>
      <RequireAuth><RoleGate allowed={["patient"]}>
        <div className="mobile-frame">
          <div className="topbar">
            <div>
              <p className="eyebrow">Daily check-in</p>
              <h2>How are you doing today?</h2>
              <p className="muted">One check-in each day is usually enough. Add another if something meaningful changes.</p>
            </div>
          </div>
          {!workspace && !error ? <div className="empty">Loading patient...</div> : null}
          {error && !workspace ? <div className="empty form-error" role="alert">{error}</div> : null}
          {workspace && !workspace.patient ? (
            <div className="empty">
              <strong>No patient found.</strong>
              <p>This login is not linked to a patient record. Ask your clinician to complete your patient invitation.</p>
            </div>
          ) : null}
          {workspace?.patient ? (
            <form className="panel form" onSubmit={submit}>
              <div className="field">
                <label htmlFor="painScore">Pain intensity (0–10)</label>
                <input id="painScore" name="painScore" type="number" min={0} max={10} defaultValue={3} required />
              </div>
              <div className="field"><label htmlFor="symptomDirection">Compared with your last check-in</label><select id="symptomDirection" name="symptomDirection" defaultValue="unchanged" required><option value="improving">Improving</option><option value="unchanged">About the same</option><option value="worsening">Worsening</option></select></div>
              <div className="field">
                <label htmlFor="painLocation">Where did you feel it?</label>
                <input id="painLocation" name="painLocation" placeholder="For example: low back" />
              </div>
              <div className="field"><label htmlFor="symptomBehavior">When did it happen?</label><select id="symptomBehavior" name="symptomBehavior"><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option><option value="night">During the night</option><option value="intermittent">On and off during the day</option></select></div>
              <div className="field"><label htmlFor="activityContext">What were you doing?</label><select id="activityContext" name="activityContext" required><option value="">Choose an activity</option><option value="sitting">Sitting</option><option value="walking">Walking</option><option value="working">Working</option><option value="driving">Driving</option><option value="exercise">Exercising</option><option value="sleeping">Sleeping</option><option value="lifting">Lifting</option><option value="other">Something else</option></select></div>
              <div className="field"><label htmlFor="aggravatingFactors">What made it worse?</label><input id="aggravatingFactors" name="aggravatingFactors" /></div>
              <div className="field"><label htmlFor="easingFactors">What helped?</label><input id="easingFactors" name="easingFactors" /></div>
              <div className="field"><label htmlFor="confidenceScore">Confidence in your progress (0–10, optional)</label><input id="confidenceScore" name="confidenceScore" type="number" min={0} max={10}/></div>
              <div className="field"><label htmlFor="patientComment">What would you like your PT to know?</label><textarea id="patientComment" name="patientComment" /></div>
              <button className="button" type="submit" disabled={saving || Boolean(message)}>
                <HeartPulse size={18} />
                {saving ? "Saving…" : message ? "Check-in saved" : "Save today’s check-in"}
              </button>
              {message ? <div className="success-banner" role="status"><strong>{message}</strong><Link href="/patient">Return home</Link></div> : null}
              {error ? <p className="form-error" role="alert">{error}</p> : null}
            </form>
          ) : null}
        </div>
      </RoleGate></RequireAuth>
    </PatientShell>
  );
}
