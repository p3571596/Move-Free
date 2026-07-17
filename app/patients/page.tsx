"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Plus, Search, UsersRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import {
  buildPatientSummaries,
  formatStatus,
  getGoalTitle,
  getPatientDiagnosis,
  getPatientName,
  type PatientSummary,
} from "@/lib/clinician-overview";
import { loadClinicianSnapshot } from "@/lib/data";
import { formatDate, initials } from "@/lib/format";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { ClinicianSnapshot } from "@/lib/types";

type Filter = "all" | "active" | "review" | "discharged";

const filters: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "review", label: "Needs Review" },
  { value: "discharged", label: "Discharged" },
];

export default function PatientsPage() {
  const [snapshot, setSnapshot] = useState<ClinicianSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setError("Supabase is not configured for this deployment.");
      setLoading(false);
      return;
    }

    loadClinicianSnapshot(createSupabaseBrowserClient())
      .then(setSnapshot)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load your patient caseload."))
      .finally(() => setLoading(false));
  }, []);

  const summaries = useMemo(() => buildPatientSummaries(snapshot), [snapshot]);
  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    return summaries.filter((summary) => {
      if (!matchesFilter(summary, filter)) return false;
      if (!search) return true;
      return [
        getPatientName(summary.patient),
        getPatientDiagnosis(summary),
        getGoalTitle(summary),
        summary.patient.current_focus,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(search));
    });
  }, [filter, query, summaries]);

  return (
    <AppShell>
      <RequireAuth>
        <header className="dashboard-hero caseload-hero">
          <div>
            <p className="eyebrow">Caseload</p>
            <h2>Patients</h2>
            <p className="muted">Search and manage everyone under your care. Open a patient to enter their clinical workspace.</p>
          </div>
          <Link className="button" href="/patients/new"><Plus size={18} />Add Patient</Link>
        </header>

        <section className="caseload-toolbar" aria-label="Patient search and filters">
          <label className="input-with-icon caseload-search">
            <Search size={18} />
            <span className="sr-only">Search patients</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, diagnosis, goal, or focus" />
          </label>
          <div className="filter-tabs" role="group" aria-label="Filter patient caseload">
            {filters.map((item) => (
              <button
                className={filter === item.value ? "active" : ""}
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                aria-pressed={filter === item.value}
              >
                {item.label}
                <span>{countForFilter(summaries, item.value)}</span>
              </button>
            ))}
          </div>
        </section>

        {loading ? <div className="dashboard-loading">Loading your caseload…</div> : null}
        {!loading && error ? (
          <div className="panel dashboard-error" role="alert">
            <AlertTriangle size={22} />
            <div><strong>We could not load Patients.</strong><p>{error}</p></div>
          </div>
        ) : null}

        {!loading && !error && !summaries.length ? (
          <div className="empty dashboard-empty">
            <UsersRound size={28} color="var(--accent)" />
            <strong>No patients yet.</strong>
            <p>Create your first patient to begin building programs and tracking between-visit progress.</p>
            <Link className="button" href="/patients/new"><Plus size={18} />Add Patient</Link>
          </div>
        ) : null}

        {!loading && !error && summaries.length ? (
          <section className="dashboard-section">
            <div className="section-header caseload-results-heading">
              <div><p className="eyebrow">Results</p><h3>{visible.length} patient{visible.length === 1 ? "" : "s"}</h3></div>
              <p className="muted">{filter === "all" ? "Complete caseload" : filters.find((item) => item.value === filter)?.label}</p>
            </div>
            {visible.length ? (
              <ul className="caseload-list">
                {visible.map((summary) => <CaseloadRow key={summary.patient.id} summary={summary} />)}
              </ul>
            ) : (
              <div className="empty">No patients match this search and filter.</div>
            )}
          </section>
        ) : null}
      </RequireAuth>
    </AppShell>
  );
}

function CaseloadRow({ summary }: { summary: PatientSummary }) {
  const name = getPatientName(summary.patient);
  return (
    <li>
      <Link className="caseload-row" href={`/patients/${summary.patient.id}`} aria-label={`Open workspace for ${name}`}>
        <span className="avatar">{initials(name)}</span>
        <span className="caseload-primary">
          <span className="row-between">
            <strong>{name}</strong>
            <span className={`status-badge ${summary.needsReview ? "status-review" : ""}`}>{summary.needsReview ? "Needs review" : formatStatus(summary.patient.status)}</span>
          </span>
          <small>{getPatientDiagnosis(summary)}</small>
          <span className="caseload-goal">{getGoalTitle(summary)}</span>
        </span>
        <span className="caseload-metric">
          <small>Goal progress</small>
          <strong>{summary.goalProgress}%</strong>
        </span>
        <span className="caseload-metric">
          <small>Latest activity</small>
          <strong>{summary.lastActivity ? formatDate(summary.lastActivity) : "None yet"}</strong>
          <em>{summary.lastActivityLabel}</em>
        </span>
        <ChevronRight size={20} />
      </Link>
    </li>
  );
}

function matchesFilter(summary: PatientSummary, filter: Filter) {
  const status = summary.patient.status ?? "active";
  if (filter === "all") return true;
  if (filter === "review") return summary.needsReview;
  if (filter === "discharged") return status === "discharged";
  return ["active", "needs_review", "paused"].includes(status) && status !== "discharged";
}

function countForFilter(summaries: PatientSummary[], filter: Filter) {
  return summaries.filter((summary) => matchesFilter(summary, filter)).length;
}
