"use client";

import { useEffect, useState } from "react";
import { PlayCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { loadExerciseLibrary } from "@/lib/data";
import { sampleExercises } from "@/lib/sample-data";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { Exercise } from "@/lib/types";

export default function ExerciseStudioPage() {
  const [exercises, setExercises] = useState<Exercise[]>(sampleExercises);
  const [selected, setSelected] = useState<Exercise>(sampleExercises[0]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    loadExerciseLibrary(supabase)
      .then((items) => {
        if (items.length) {
          setExercises(items);
          setSelected(items[0]);
        }
      })
      .catch(() => undefined);
  }, []);

  return (
    <AppShell>
      <RequireAuth>
        <div className="topbar">
          <div>
            <p className="eyebrow">Exercise Studio</p>
            <h2>{selected.name ?? "Exercise review"}</h2>
            <p className="muted">Browse the `exercises` library and prepare coaching notes for home programs.</p>
          </div>
        </div>
        <section className="grid two">
          <div className="panel">
            <div style={{ aspectRatio: "16 / 9", borderRadius: 8, display: "grid", placeItems: "center", background: "linear-gradient(135deg, #dcefe7, #d9e3ef)" }}>
              <PlayCircle size={64} color="var(--accent)" />
            </div>
            <h3 style={{ marginTop: 18 }}>{selected.name}</h3>
            <p className="muted">{selected.body_region ?? "Body region"} · {selected.category ?? "Category"} · {selected.difficulty ?? "Difficulty"}</p>
            <p style={{ marginTop: 12 }}>{selected.instructions ?? selected.description ?? "Add patient-friendly cues and progression criteria."}</p>
            {selected.video_url ? <a className="button" href={selected.video_url} style={{ marginTop: 16 }} target="_blank">Open video</a> : null}
          </div>
          <div className="panel">
            <p className="eyebrow">Library</p>
            <ul className="list" style={{ marginTop: 12 }}>
              {exercises.map((exercise) => (
                <li className="list-item" key={exercise.id}>
                  <button className="row-between" type="button" onClick={() => setSelected(exercise)} style={{ border: 0, background: "transparent", padding: 0, textAlign: "left" }}>
                    <span>
                      <strong>{exercise.name ?? "Exercise"}</strong>
                      <p className="muted">{exercise.description ?? exercise.instructions ?? "No description"}</p>
                    </span>
                    <span className="pill">{exercise.difficulty ?? "Level"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </RequireAuth>
    </AppShell>
  );
}
