"use client";

import { FormEvent, useState } from "react";
import { HeartPulse } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { logPainPattern } from "@/lib/data";
import { sampleWorkspace } from "@/lib/sample-data";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

export default function PainPatternPage() {
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const painScore = Number(data.get("painScore"));
    const notes = String(data.get("notes") ?? "");

    if (isSupabaseConfigured()) {
      const supabase = createSupabaseBrowserClient();
      await logPainPattern(supabase, sampleWorkspace.patient?.id ?? "", painScore, notes).catch(() => undefined);
    }

    setMessage("Pain pattern saved.");
    event.currentTarget.reset();
  }

  return (
    <AppShell>
      <RequireAuth>
        <div className="mobile-frame">
          <div className="topbar">
            <div>
              <p className="eyebrow">Log Pain Pattern</p>
              <h2>How are symptoms behaving?</h2>
            </div>
          </div>
          <form className="panel form" onSubmit={submit}>
            <div className="field">
              <label>Pain score</label>
              <input name="painScore" type="range" min={0} max={10} defaultValue={3} />
            </div>
            <div className="field">
              <label>Pattern notes</label>
              <textarea name="notes" placeholder="Where did you feel it, and what changed it?" />
            </div>
            <button className="button" type="submit">
              <HeartPulse size={18} />
              Save pain log
            </button>
            {message ? <p className="muted">{message}</p> : null}
          </form>
        </div>
      </RequireAuth>
    </AppShell>
  );
}
