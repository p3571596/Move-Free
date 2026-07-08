"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function NewPatientPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [primaryComplaint, setPrimaryComplaint] = useState("");
  const [currentFocus, setCurrentFocus] = useState("");
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setError("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();

      if (authError) {
        throw authError;
      }

      if (!authData.user) {
        throw new Error("Sign in before adding a patient.");
      }

      const { data, error: insertError } = await supabase
        .from("patients")
        .insert({
          display_name: displayName.trim(),
          diagnosis: diagnosis.trim() || null,
          primary_complaint: primaryComplaint.trim() || null,
          current_focus: currentFocus.trim() || null,
          status: status || "active",
        })
        .select("id")
        .single();

      if (insertError) {
        throw insertError;
      }

      router.push(`/patients/${data.id}`);
    } catch (caught) {
      setError(getErrorMessage(caught));
      setIsSaving(false);
    }
  }

  return (
    <AppShell>
      <RequireAuth>
        <div className="topbar">
          <div>
            <p className="eyebrow">Move Free</p>
            <h2>Add Patient</h2>
            <p className="muted">Create a real patient workspace for the authenticated clinician.</p>
          </div>
        </div>
        <form className="panel form patient-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="display_name">Name</label>
            <input id="display_name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="diagnosis">Diagnosis</label>
            <input id="diagnosis" value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="primary_complaint">Primary complaint</label>
            <textarea id="primary_complaint" value={primaryComplaint} onChange={(event) => setPrimaryComplaint(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="current_focus">Current focus</label>
            <textarea id="current_focus" value={currentFocus} onChange={(event) => setCurrentFocus(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="status">Status</label>
            <select id="status" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Active</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="discharged">Discharged</option>
            </select>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
          <div>
            <button className="button" type="submit" disabled={isSaving}>
              {isSaving ? "Creating..." : "Create Patient"}
            </button>
          </div>
        </form>
      </RequireAuth>
    </AppShell>
  );
}

function getErrorMessage(caught: unknown) {
  if (caught instanceof Error) {
    return caught.message;
  }

  if (
    caught &&
    typeof caught === "object" &&
    "message" in caught &&
    typeof caught.message === "string"
  ) {
    return caught.message;
  }

  return "Patient could not be created.";
}
