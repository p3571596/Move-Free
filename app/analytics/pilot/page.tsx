"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  CalendarCheck2,
  Clock3,
  Dumbbell,
  HeartPulse,
  RefreshCw,
  Stethoscope,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RoleGate } from "@/components/RoleGate";
import { loadFounderAnalytics } from "@/lib/data";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { FounderAnalytics } from "@/lib/types";

const ranges = [7, 30, 90] as const;

export default function FounderAnalyticsPage() {
  const [days, setDays] = useState(30);
  const [analytics, setAnalytics] = useState<FounderAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!isSupabaseConfigured()) {
      setError("Supabase is not configured for this deployment.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    loadFounderAnalytics(createSupabaseBrowserClient(), days)
      .then(setAnalytics)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Analytics could not be loaded."))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(load, [load]);

  return (
    <AppShell>
      <RequireAuth><RoleGate allowed={["admin"]}>
        <header className="dashboard-hero analytics-hero">
          <div>
            <p className="eyebrow">Founder analytics</p>
            <h2>What is the pilot teaching us?</h2>
            <p className="muted">Real usage, recovery signals, and workflow timing. No mock data and no patient notes or names.</p>
          </div>
          <div className="analytics-controls" aria-label="Analytics date range">
            {ranges.map((range) => <button className={days === range ? "active" : ""} type="button" onClick={() => setDays(range)} key={range}>{range} days</button>)}
            <button type="button" onClick={load} aria-label="Refresh analytics"><RefreshCw size={16} /></button>
          </div>
        </header>

        {loading ? <div className="panel dashboard-loading"><RefreshCw className="spin" size={20} /><strong>Reading pilot activity…</strong></div> : null}
        {!loading && error ? <div className="panel dashboard-error"><div><strong>Analytics are unavailable.</strong><p className="muted">{error}</p></div><button className="secondary-button" type="button" onClick={load}>Try again</button></div> : null}
        {!loading && !error && analytics ? <AnalyticsContent analytics={analytics} /> : null}
      </RoleGate></RequireAuth>
    </AppShell>
  );
}

function AnalyticsContent({ analytics }: { analytics: FounderAnalytics }) {
  const { summary } = analytics;
  const hasActivity = summary.activePatients > 0 || summary.programsAssigned > 0 || analytics.recentActivity.length > 0;
  return (
    <>
      <section className="analytics-kpi-grid" aria-label="Pilot metrics">
        <AnalyticsKpi icon={Stethoscope} label="Active clinicians" value={summary.activeClinicians} detail="With an active caseload" />
        <AnalyticsKpi icon={UsersRound} label="Active patients" value={summary.activePatients} detail="Active or needs review" />
        <AnalyticsKpi icon={Dumbbell} label="Programs assigned" value={summary.programsAssigned} detail={`In ${analytics.rangeDays} days`} />
        <AnalyticsKpi icon={Activity} label="Exercise sessions" value={summary.exerciseSessions} detail={`In ${analytics.rangeDays} days`} />
        <AnalyticsKpi icon={TrendingUp} label="Exercise adherence" value={percent(summary.exerciseAdherencePercent)} detail="Completed or partial ÷ attempted" />
        <AnalyticsKpi icon={CalendarCheck2} label="Daily check-ins" value={percent(summary.checkinCompletionPercent)} detail="Submitted days ÷ eligible days" />
        <AnalyticsKpi icon={Clock3} label="Between check-ins" value={hours(summary.averageHoursBetweenCheckins)} detail="Average interval" />
      </section>

      {!hasActivity ? <div className="empty analytics-empty"><strong>No pilot activity is available for this range.</strong><p>These cards will populate from clinician assignments and patient submissions. Nothing is backfilled or mocked.</p></div> : null}

      <section className="analytics-grid analytics-trends-grid">
        <div className="panel">
          <div className="section-header"><div><p className="eyebrow">Recovery signal</p><h3>Pain and confidence trend</h3></div><BarChart3 size={20} color="var(--blue)" /></div>
          <div className="analytics-trend-summaries">
            <TrendSummary label="Pain" value={analytics.painTrend.recent} change={analytics.painTrend.change} inverse />
            <TrendSummary label="Confidence / function" value={analytics.confidenceTrend.recent} change={analytics.confidenceTrend.change} />
          </div>
          <AnalyticsTrendChart points={analytics.dailyTrends} />
        </div>
        <div className="panel">
          <div className="section-header"><div><p className="eyebrow">Workflow</p><h3>Time to complete key actions</h3></div><Clock3 size={20} color="var(--gold)" /></div>
          {analytics.workflowTimings.length ? <ul className="analytics-timing-list">{analytics.workflowTimings.map((item) => (
            <li key={item.eventName}><span><strong>{eventLabel(item.eventName)}</strong><small>{item.eventCount} measured event{item.eventCount === 1 ? "" : "s"}</small></span><span><strong>{time(item.medianSeconds)}</strong><small>median · {time(item.averageSeconds)} avg</small></span></li>
          ))}</ul> : <p className="empty-inline">Timing begins with new patient reviews, program saves, exercise sessions, and check-ins.</p>}
        </div>
      </section>

      <section className="panel analytics-activity-panel">
        <div className="section-header"><div><p className="eyebrow">Recent activity</p><h3>What happened across the pilot</h3></div><HeartPulse size={20} color="var(--coral)" /></div>
        {analytics.recentActivity.length ? <ul className="analytics-activity-list">{analytics.recentActivity.map((item, index) => (
          <li key={`${item.occurredAt}-${item.label}-${index}`}><span className={`analytics-activity-icon ${item.kind}`}><Activity size={16} /></span><span><strong>{eventLabel(item.label)}</strong><small>{dateTime(item.occurredAt)}</small></span></li>
        ))}</ul> : <p className="empty-inline">No assignments, check-ins, exercise sessions, or measured workflow events in this range.</p>}
      </section>
    </>
  );
}

function AnalyticsKpi({ icon: Icon, label, value, detail }: { icon: typeof Activity; label: string; value: string | number; detail: string }) {
  return <article className="analytics-kpi"><span><Icon size={20} /></span><div><small>{label}</small><strong>{value}</strong><em>{detail}</em></div></article>;
}

function TrendSummary({ label, value, change, inverse = false }: { label: string; value: number | null; change: number | null; inverse?: boolean }) {
  const improved = change != null && (inverse ? change < 0 : change > 0);
  return <div className="analytics-trend-summary"><small>{label} · recent 7 days</small><strong>{value == null ? "No data" : `${value}/10`}</strong><em className={change == null ? "" : improved ? "positive" : change === 0 ? "" : "negative"}>{change == null ? "Needs two weeks of data" : `${change > 0 ? "+" : ""}${change} vs prior 7 days`}</em></div>;
}

function AnalyticsTrendChart({ points }: { points: FounderAnalytics["dailyTrends"] }) {
  if (!points.length) return <p className="empty-inline">Pain and confidence trends begin after the first daily check-in.</p>;
  return <div className="analytics-chart" aria-label="Daily average pain and confidence"><div className="analytics-chart-legend"><span className="pain">Pain</span><span className="confidence">Confidence</span></div><div className="analytics-chart-bars">{points.map((point) => (
    <div className="analytics-chart-day" key={point.date} title={`${point.date}: pain ${point.pain ?? "n/a"}, confidence ${point.confidence ?? "n/a"}`}><span className="analytics-bar-pair"><i className="pain" style={{ height: `${barHeight(point.pain)}%` }} /><i className="confidence" style={{ height: `${barHeight(point.confidence)}%` }} /></span><small>{new Date(`${point.date}T12:00:00`).toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}</small></div>
  ))}</div></div>;
}

function barHeight(value: number | null) { return value == null ? 2 : Math.max(6, Math.min(100, value * 10)); }
function percent(value: number | null) { return value == null ? "No data" : `${value}%`; }
function hours(value: number | null) { return value == null ? "No data" : value < 24 ? `${value}h` : `${Math.round(value / 24 * 10) / 10}d`; }
function time(value: number | null) { if (value == null) return "No data"; return value < 60 ? `${value}s` : `${Math.round(value / 6) / 10}m`; }
function dateTime(value: string) { return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
function eventLabel(value: string) { return ({ patient_review_opened: "Patient review opened", program_created: "Program created", program_updated: "Program updated", patient_checkin_submitted: "Daily check-in submitted", exercise_session_submitted: "Exercise session submitted", program_assigned: "Program assigned" } as Record<string, string>)[value] ?? value; }
