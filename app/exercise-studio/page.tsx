"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { loadExerciseLibrary } from "@/lib/data";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { Exercise } from "@/lib/types";

export default function ExerciseStudioPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [tag, setTag] = useState("all");
  const [status, setStatus] = useState("Loading exercises...");

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setStatus("Connect Supabase to load Exercise Studio.");
      setExercises([]);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    loadExerciseLibrary(supabase)
      .then((loadedExercises) => {
        setExercises(loadedExercises);
        setStatus("");
      })
      .catch(() => {
        setExercises([]);
        setStatus("Exercise Studio could not be loaded.");
      });
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(exercises.map((exercise) => exercise.category).filter((item): item is string => Boolean(item)))).sort(),
    [exercises],
  );
  const tags = useMemo(
    () => Array.from(new Set(exercises.flatMap((exercise) => exercise.tags ?? []))).sort(),
    [exercises],
  );
  const visibleExercises = useMemo(() => {
    const query = search.trim().toLowerCase();
    return exercises.filter((exercise) => {
      const matchesCategory = category === "all" || exercise.category === category;
      const matchesTag = tag === "all" || exercise.tags?.includes(tag);
      const searchableText = [
        exercise.name,
        exercise.category,
        exercise.clinical_purpose,
        exercise.patient_instructions,
        exercise.default_dosage,
        ...(exercise.tags ?? []),
      ].filter(Boolean).join(" ").toLowerCase();

      return matchesCategory && matchesTag && (!query || searchableText.includes(query));
    });
  }, [category, exercises, search, tag]);

  return (
    <AppShell>
      <RequireAuth>
        <div className="topbar">
          <div>
            <p className="eyebrow">Exercise Studio</p>
            <h2>Exercise Studio</h2>
            <p className="muted">Real exercises saved to your clinician library.</p>
          </div>
          <Link className="button" href="/exercise-studio/new" aria-label="Create exercise">
            <Plus size={18} />
            Create Exercise
          </Link>
        </div>
        <section className="panel">
          <div className="exercise-toolbar">
            <label className="field search-field">
              <span>Search</span>
              <span className="input-with-icon">
                <Search size={18} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search exercises" />
              </span>
            </label>
            <label className="field">
              <span>Category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="all">All categories</option>
                {categories.map((item) => (
                  <option key={item} value={item}>{labelize(item)}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Tag</span>
              <select value={tag} onChange={(event) => setTag(event.target.value)}>
                <option value="all">All tags</option>
                {tags.map((item) => <option key={item} value={item}>{labelize(item)}</option>)}
              </select>
            </label>
          </div>
        </section>
        {status ? <div className="empty" style={{ marginTop: 18 }}>{status}</div> : null}
        {!status && !exercises.length ? (
          <div className="empty" style={{ marginTop: 18 }}>
            <strong>No exercises yet.</strong>
            <p>Create an exercise or save a custom exercise while building a patient program.</p>
          </div>
        ) : null}
        {!status && exercises.length && !visibleExercises.length ? (
          <div className="empty" style={{ marginTop: 18 }}>
            <strong>No matches.</strong>
            <p>Adjust the search or category filter.</p>
          </div>
        ) : null}
        <section className="exercise-card-list" style={{ marginTop: 18 }}>
          {visibleExercises.map((exercise) => (
            <article className="card exercise-library-card" key={exercise.id}>
              <div className="section-header">
                <div>
                  <p className="eyebrow">{labelize(exercise.category ?? "Uncategorized")}</p>
                  <h3>{exercise.name ?? "Exercise"}</h3>
                </div>
                <span className="pill">{exercise.is_active === false ? "Inactive" : "Active"}</span>
              </div>
              <div className="exercise-detail-grid">
                <div>
                  <p className="eyebrow">Clinical Purpose</p>
                  <p>{exercise.clinical_purpose ?? exercise.description ?? "Not documented"}</p>
                </div>
                <div>
                  <p className="eyebrow">Patient Instructions</p>
                  <p>{exercise.patient_instructions ?? exercise.instructions ?? "Not documented"}</p>
                </div>
                <div>
                  <p className="eyebrow">Default Dosage</p>
                  <p>{exercise.default_dosage ?? "Not set"}</p>
                </div>
              </div>
              <div className="tag-list">
                {(exercise.tags ?? []).map((item) => <span className="tag-chip" key={item}>{item}</span>)}
              </div>
              <Link className="secondary-button" href={`/exercise-studio/${exercise.id}/edit`}>Edit Exercise</Link>
            </article>
          ))}
        </section>
      </RequireAuth>
    </AppShell>
  );
}

function labelize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
