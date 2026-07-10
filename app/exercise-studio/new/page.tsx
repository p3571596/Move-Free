"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Save } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { createExercise } from "@/lib/data";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

export default function NewExercisePage() {
  const router = useRouter();
  const [status, setStatus] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Creating exercise...");

    if (!isSupabaseConfigured()) {
      setStatus("Connect Supabase before creating exercises.");
      return;
    }

    const form = new FormData(event.currentTarget);

    try {
      const supabase = createSupabaseBrowserClient();
      await createExercise(supabase, {
        name: String(form.get("name") ?? ""),
        category: String(form.get("category") ?? "other"),
        clinical_purpose: String(form.get("clinical_purpose") ?? ""),
        patient_instructions: String(form.get("patient_instructions") ?? ""),
        default_dosage: String(form.get("default_dosage") ?? ""),
        is_active: true,
      });
      router.push("/exercise-studio");
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Exercise could not be created.");
    }
  }

  return (
    <AppShell>
      <RequireAuth>
        <div className="topbar">
          <div>
            <p className="eyebrow">Exercise Studio</p>
            <h2>Create Exercise</h2>
            <p className="muted">Save a reusable exercise to your clinician library.</p>
          </div>
          <Link className="secondary-button" href="/exercise-studio">Back to Studio</Link>
        </div>
        <form className="panel form patient-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="name">Exercise name</label>
            <input id="name" name="name" required placeholder="Sit to stand" />
          </div>
          <div className="field">
            <label htmlFor="category">Category</label>
            <select id="category" name="category" defaultValue="strength">
              <option value="mobility">Mobility</option>
              <option value="strength">Strength</option>
              <option value="balance">Balance</option>
              <option value="conditioning">Conditioning</option>
              <option value="motor_control">Motor Control</option>
              <option value="education">Education</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="clinical_purpose">Clinical purpose</label>
            <textarea id="clinical_purpose" name="clinical_purpose" />
          </div>
          <div className="field">
            <label htmlFor="patient_instructions">Patient instructions</label>
            <textarea id="patient_instructions" name="patient_instructions" />
          </div>
          <div className="field">
            <label htmlFor="default_dosage">Default dosage</label>
            <input id="default_dosage" name="default_dosage" placeholder="2 sets of 10, 3x/week" />
          </div>
          <button className="button" type="submit">
            <Save size={18} />
            Save Exercise
          </button>
          {status ? <p className="muted">{status}</p> : null}
        </form>
      </RequireAuth>
    </AppShell>
  );
}
