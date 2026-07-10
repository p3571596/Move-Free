"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { TagInput } from "@/components/TagInput";
import { loadExerciseLibrary, updateExercise } from "@/lib/data";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { Exercise } from "@/lib/types";

export default function EditExercisePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [status, setStatus] = useState("Loading exercise...");

  useEffect(() => {
    if (!isSupabaseConfigured()) return setStatus("Connect Supabase before editing exercises.");
    loadExerciseLibrary(createSupabaseBrowserClient())
      .then((items) => {
        const match = items.find((item) => item.id === params.id) ?? null;
        setExercise(match);
        setTags(match?.tags ?? []);
        setStatus(match ? "" : "Exercise not found.");
      })
      .catch(() => setStatus("Exercise could not be loaded."));
  }, [params.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!exercise) return;
    setStatus("Saving exercise...");
    const form = new FormData(event.currentTarget);

    try {
      const result = await updateExercise(createSupabaseBrowserClient(), exercise.id, {
        name: String(form.get("name") ?? ""),
        category: String(form.get("category") ?? "other"),
        clinical_purpose: String(form.get("clinical_purpose") ?? ""),
        patient_instructions: String(form.get("patient_instructions") ?? ""),
        default_dosage: String(form.get("default_dosage") ?? ""),
        tags,
        is_active: exercise.is_active ?? true,
      });

      if (result.wasDuplicate) {
        setStatus(`That name already belongs to “${result.exercise.name}”. No duplicate was created.`);
        return;
      }
      router.push("/exercise-studio");
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Exercise could not be saved.");
    }
  }

  return (
    <AppShell>
      <RequireAuth>
        <div className="topbar">
          <div><p className="eyebrow">Exercise Studio</p><h2>Edit Exercise</h2></div>
          <Link className="secondary-button" href="/exercise-studio">Back to Studio</Link>
        </div>
        {exercise ? (
          <form className="panel form patient-form" onSubmit={submit}>
            <div className="field"><label htmlFor="name">Exercise name</label><input id="name" name="name" required defaultValue={exercise.name ?? ""} /></div>
            <div className="field"><label htmlFor="category">Category</label><select id="category" name="category" defaultValue={exercise.category ?? "other"}>
              <option value="mobility">Mobility</option><option value="strength">Strength</option><option value="balance">Balance</option>
              <option value="conditioning">Conditioning</option><option value="motor_control">Motor Control</option><option value="education">Education</option><option value="other">Other</option>
            </select></div>
            <TagInput value={tags} onChange={setTags} />
            <div className="field"><label htmlFor="clinical_purpose">Clinical purpose</label><textarea id="clinical_purpose" name="clinical_purpose" defaultValue={exercise.clinical_purpose ?? ""} /></div>
            <div className="field"><label htmlFor="patient_instructions">Patient instructions</label><textarea id="patient_instructions" name="patient_instructions" defaultValue={exercise.patient_instructions ?? ""} /></div>
            <div className="field"><label htmlFor="default_dosage">Default dosage</label><input id="default_dosage" name="default_dosage" defaultValue={exercise.default_dosage ?? ""} /></div>
            <button className="button" type="submit"><Save size={18} />Save Changes</button>
            {status ? <p className="muted">{status}</p> : null}
          </form>
        ) : <div className="empty">{status}</div>}
      </RequireAuth>
    </AppShell>
  );
}
