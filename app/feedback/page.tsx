"use client";

import { FormEvent, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { saveFeedback } from "@/lib/data";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

export default function FeedbackPage() {
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const feedback = String(data.get("message") ?? "");
    const sentiment = String(data.get("sentiment") ?? "neutral");
    const page = String(data.get("page") ?? "pilot");

    if (isSupabaseConfigured()) {
      const supabase = createSupabaseBrowserClient();
      await saveFeedback(supabase, feedback, sentiment, page).catch(() => undefined);
    }

    setMessage("Thanks. Feedback captured for the pilot team.");
    event.currentTarget.reset();
  }

  return (
    <AppShell>
      <RequireAuth>
        <div className="topbar">
          <div>
            <p className="eyebrow">Pilot feedback</p>
            <h2>Tell us what needs tuning</h2>
            <p className="muted">Feedback is written to the `feedback` table when Supabase is configured and RLS allows the insert.</p>
          </div>
        </div>
        <form className="panel form" onSubmit={submit}>
          <div className="grid two">
            <div className="field">
              <label>Area</label>
              <select name="page">
                <option value="clinician-dashboard">Clinician dashboard</option>
                <option value="patient-workspace">Patient workspace</option>
                <option value="program-builder">Program builder</option>
                <option value="patient-app">Patient app</option>
              </select>
            </div>
            <div className="field">
              <label>Sentiment</label>
              <select name="sentiment">
                <option value="idea">Idea</option>
                <option value="issue">Issue</option>
                <option value="positive">Positive</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Feedback</label>
            <textarea name="message" required placeholder="What would make Move Free better for this pilot?" />
          </div>
          <button className="button" type="submit">
            <MessageSquarePlus size={18} />
            Submit feedback
          </button>
          {message ? <p className="muted">{message}</p> : null}
        </form>
      </RequireAuth>
    </AppShell>
  );
}
