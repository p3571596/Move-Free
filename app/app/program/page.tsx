"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { logExerciseCompletion } from "@/lib/data";
import { sampleWorkspace } from "@/lib/sample-data";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

export default function TodayProgramPage() {
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const exerciseId = String(data.get("exerciseId"));
    const painBefore = Number(data.get("painBefore"));
    const painAfter = Number(data.get("painAfter"));
    const notes = String(data.get("notes") ?? "");

    if (isSupabaseConfigured()) {
      const supabase = createSupabaseBrowserClient();
      await logExerciseCompletion(supabase, sampleWorkspace.patient?.id ?? "", exerciseId, painBefore, painAfter, notes).catch(() => undefined);
    }

    setMessage("Completion logged for today.");
    event.currentTarget.reset();
  }

  return (
    <AppShell>
      <RequireAuth>
        <div className="mobile-frame">
          <div className="topbar">
            <div>
              <p className="eyebrow">Start Today&apos;s Program</p>
              <h2>{sampleWorkspace.program?.title}</h2>
            </div>
          </div>
          <form className="panel form" onSubmit={submit}>
            <div className="field">
              <label>Exercise</label>
              <select name="exerciseId">
                {sampleWorkspace.programExercises.map((item) => (
                  <option key={item.id} value={item.id}>{item.exercise?.name}</option>
                ))}
              </select>
            </div>
            <div className="grid two">
              <div className="field">
                <label>Pain before</label>
                <input name="painBefore" type="number" min={0} max={10} defaultValue={2} />
              </div>
              <div className="field">
                <label>Pain after</label>
                <input name="painAfter" type="number" min={0} max={10} defaultValue={3} />
              </div>
            </div>
            <div className="field">
              <label>Notes</label>
              <textarea name="notes" placeholder="How did the movement feel?" />
            </div>
            <button className="button" type="submit">
              <CheckCircle2 size={18} />
              Log completion
            </button>
            {message ? <p className="muted">{message}</p> : null}
          </form>
        </div>
      </RequireAuth>
    </AppShell>
  );
}
