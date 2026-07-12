"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { Patient } from "@/lib/types";

export default function EditPatientPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [status, setStatus] = useState("Loading patient profile...");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setStatus("Connect Supabase before editing patient profiles.");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data: authData, error: authError }) => {
      if (authError || !authData.user) throw authError ?? new Error("Sign in before editing a patient.");

      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .eq("id", params.id)
        .eq("clinician_id", authData.user.id)
        .maybeSingle();

      if (error) throw error;
      setPatient(data as Patient | null);
      setStatus(data ? "" : "Patient not found for the current clinician.");
    }).catch((caught) => setStatus(getErrorMessage(caught)));
  }, [params.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!patient) return;

    setIsSaving(true);
    setStatus("");
    const form = new FormData(event.currentTarget);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw authError ?? new Error("Sign in before editing a patient.");

      const { data, error } = await supabase
        .from("patients")
        .update({
          display_name: String(form.get("display_name") ?? "").trim(),
          date_of_birth: nullableValue(form.get("date_of_birth")),
          diagnosis: nullableValue(form.get("diagnosis")),
          primary_complaint: nullableValue(form.get("primary_complaint")),
          current_focus: nullableValue(form.get("current_focus")),
          status: String(form.get("status") ?? "active"),
        })
        .eq("id", patient.id)
        .eq("clinician_id", authData.user.id)
        .select("id")
        .single();

      if (error) throw error;
      router.push(`/patients/${data.id}`);
    } catch (caught) {
      setStatus(getErrorMessage(caught));
      setIsSaving(false);
    }
  }

  return (
    <AppShell>
      <RequireAuth>
        <div className="topbar">
          <div>
            <p className="eyebrow">Patient workspace</p>
            <h2>Edit Patient Profile</h2>
            <p className="muted">Update the clinical context shown throughout this patient&apos;s workspace.</p>
          </div>
          <Link className="secondary-button" href={`/patients/${params.id}`}>Cancel</Link>
        </div>
        {patient ? (
          <form className="panel form patient-form" onSubmit={submit}>
            <div className="field"><label htmlFor="display_name">Name</label><input id="display_name" name="display_name" required defaultValue={patient.display_name ?? patient.name ?? ""} /></div>
            <div className="field"><label htmlFor="date_of_birth">Date of birth</label><input id="date_of_birth" name="date_of_birth" type="date" defaultValue={patient.date_of_birth ?? ""} /></div>
            <div className="field"><label htmlFor="diagnosis">Diagnosis</label><input id="diagnosis" name="diagnosis" defaultValue={patient.diagnosis ?? ""} /></div>
            <div className="field"><label htmlFor="primary_complaint">Primary complaint</label><textarea id="primary_complaint" name="primary_complaint" defaultValue={patient.primary_complaint ?? ""} /></div>
            <div className="field"><label htmlFor="current_focus">Current focus</label><textarea id="current_focus" name="current_focus" defaultValue={patient.current_focus ?? ""} /></div>
            <div className="field"><label htmlFor="status">Status</label><select id="status" name="status" defaultValue={patient.status ?? "active"}>
              <option value="active">Active</option><option value="needs_review">Needs Review</option><option value="paused">Paused</option><option value="discharged">Discharged</option><option value="inactive">Inactive</option>
            </select></div>
            <button className="button" type="submit" disabled={isSaving}><Save size={18} />{isSaving ? "Saving..." : "Save Profile"}</button>
            {status ? <p className="form-error">{status}</p> : null}
          </form>
        ) : <div className="empty">{status}</div>}
      </RequireAuth>
    </AppShell>
  );
}

function nullableValue(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function getErrorMessage(caught: unknown) {
  if (caught instanceof Error) return caught.message;
  if (caught && typeof caught === "object" && "message" in caught && typeof caught.message === "string") return caught.message;
  return "Patient profile could not be saved.";
}
