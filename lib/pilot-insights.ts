import type { DailyCheckin, ExerciseAdherenceLog } from "@/lib/types";

export type TrendPoint = {
  date: string;
  pain: number | null;
  confidence: number | null;
  adherence: number | null;
  comments: string[];
};

export type PatientActivitySummary = {
  completionRate: number | null;
  completedSessions: number;
  skippedExercises: number;
  latestPain: number | null;
  averagePain: number | null;
  symptomDirection: "Improving" | "Unchanged" | "Worsening" | "Not enough data";
  difficultyTrend: string;
  latestSubmissionAt: string | null;
  comments: Array<{ text: string; date: string }>;
  streakDays: number;
};

export function summarizePatientActivity(
  checkins: DailyCheckin[],
  logs: ExerciseAdherenceLog[],
  since?: string | null,
): PatientActivitySummary {
  const cutoff = since ? new Date(since).getTime() : Date.now() - 14 * 86_400_000;
  const scopedCheckins = checkins.filter((item) => timestamp(item.created_at ?? item.checkin_date) >= cutoff);
  const scopedLogs = logs.filter((item) => timestamp(item.performed_at ?? item.created_at) >= cutoff);
  const attempted = scopedLogs.filter((log) => ["completed", "partial", "skipped"].includes(log.completion_status ?? ""));
  const participated = attempted.filter((log) => ["completed", "partial"].includes(log.completion_status ?? "")).length;
  const painValues = scopedCheckins.flatMap((checkin) => typeof checkin.pain_score === "number" ? [checkin.pain_score] : []);
  const latestCheckin = [...scopedCheckins].sort(sortNewest)[0];
  const hardCount = scopedLogs.filter((log) => ["too_hard", "painful"].includes(log.difficulty ?? "")).length;
  const easyCount = scopedLogs.filter((log) => log.difficulty === "too_easy").length;

  return {
    completionRate: attempted.length ? Math.round((participated / attempted.length) * 100) : null,
    completedSessions: uniqueSessions(scopedLogs.filter((log) => ["completed", "partial"].includes(log.completion_status ?? ""))).length,
    skippedExercises: attempted.filter((log) => log.completion_status === "skipped").length,
    latestPain: typeof latestCheckin?.pain_score === "number" ? latestCheckin.pain_score : null,
    averagePain: painValues.length ? roundOne(painValues.reduce((sum, value) => sum + value, 0) / painValues.length) : null,
    symptomDirection: deriveDirection(scopedCheckins),
    difficultyTrend: hardCount >= 2 ? `${hardCount} exercises rated hard` : easyCount >= 2 ? `${easyCount} exercises rated easy` : scopedLogs.length ? "Mostly about right" : "No ratings yet",
    latestSubmissionAt: latestDate(scopedCheckins, scopedLogs),
    comments: recentComments(scopedCheckins, scopedLogs).slice(0, 4),
    streakDays: calculateStreak(scopedLogs),
  };
}

export function buildTrendPoints(checkins: DailyCheckin[], logs: ExerciseAdherenceLog[], days = 14): TrendPoint[] {
  const cutoff = Date.now() - days * 86_400_000;
  const buckets = new Map<string, { pain: number[]; confidence: number[]; logs: ExerciseAdherenceLog[]; comments: string[] }>();

  for (const checkin of checkins) {
    const value = checkin.created_at ?? checkin.checkin_date;
    if (!value || timestamp(value) < cutoff) continue;
    const bucket = getBucket(buckets, dateKey(value));
    if (typeof checkin.pain_score === "number") bucket.pain.push(checkin.pain_score);
    if (typeof checkin.confidence_score === "number") bucket.confidence.push(checkin.confidence_score);
    if (checkin.patient_comment?.trim()) bucket.comments.push(checkin.patient_comment.trim());
  }

  for (const log of logs) {
    const value = log.performed_at ?? log.created_at;
    if (!value || timestamp(value) < cutoff) continue;
    const bucket = getBucket(buckets, dateKey(value));
    bucket.logs.push(log);
    if (log.notes?.trim()) bucket.comments.push(log.notes.trim());
  }

  return [...buckets.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, bucket]) => {
    const attempted = bucket.logs.filter((log) => ["completed", "partial", "skipped"].includes(log.completion_status ?? ""));
    const participated = attempted.filter((log) => ["completed", "partial"].includes(log.completion_status ?? "")).length;
    return {
      date,
      pain: average(bucket.pain),
      confidence: average(bucket.confidence),
      adherence: attempted.length ? Math.round((participated / attempted.length) * 100) : null,
      comments: [...new Set(bucket.comments)],
    };
  });
}

export function uniqueSessions(logs: ExerciseAdherenceLog[]) {
  const keys = new Set<string>();
  for (const log of logs) {
    if (!log.performed_at && !log.created_at) continue;
    keys.add(log.session_id ?? `${dateKey(log.performed_at ?? log.created_at!)}:${log.home_program_id ?? "program"}`);
  }
  return [...keys];
}

function deriveDirection(checkins: DailyCheckin[]): PatientActivitySummary["symptomDirection"] {
  const ordered = [...checkins].sort(sortNewest);
  const explicit = ordered[0]?.symptom_direction;
  if (explicit) return titleCase(explicit) as PatientActivitySummary["symptomDirection"];
  const scores = ordered.flatMap((item) => typeof item.pain_score === "number" ? [item.pain_score] : []).slice(0, 2);
  if (scores.length < 2) return "Not enough data";
  if (scores[0] <= scores[1] - 1) return "Improving";
  if (scores[0] >= scores[1] + 1) return "Worsening";
  return "Unchanged";
}

function recentComments(checkins: DailyCheckin[], logs: ExerciseAdherenceLog[]) {
  return [
    ...checkins.flatMap((item) => item.patient_comment?.trim() && (item.created_at ?? item.checkin_date)
      ? [{ text: item.patient_comment.trim(), date: item.created_at ?? item.checkin_date! }] : []),
    ...logs.flatMap((item) => item.notes?.trim() && (item.performed_at ?? item.created_at)
      ? [{ text: item.notes.trim(), date: item.performed_at ?? item.created_at! }] : []),
  ].sort((a, b) => timestamp(b.date) - timestamp(a.date));
}

function calculateStreak(logs: ExerciseAdherenceLog[]) {
  const activeDates = new Set(logs.filter((log) => ["completed", "partial"].includes(log.completion_status ?? ""))
    .flatMap((log) => log.performed_at ?? log.created_at ? [dateKey(log.performed_at ?? log.created_at!)] : []));
  if (!activeDates.size) return 0;
  let cursor = new Date();
  if (!activeDates.has(dateKey(cursor.toISOString()))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (activeDates.has(dateKey(cursor.toISOString()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function latestDate(checkins: DailyCheckin[], logs: ExerciseAdherenceLog[]) {
  const dates = [
    ...checkins.flatMap((item) => item.created_at ?? item.checkin_date ? [item.created_at ?? item.checkin_date!] : []),
    ...logs.flatMap((item) => item.performed_at ?? item.created_at ? [item.performed_at ?? item.created_at!] : []),
  ].sort((a, b) => timestamp(b) - timestamp(a));
  return dates[0] ?? null;
}

function getBucket(map: Map<string, { pain: number[]; confidence: number[]; logs: ExerciseAdherenceLog[]; comments: string[] }>, key: string) {
  const existing = map.get(key);
  if (existing) return existing;
  const bucket = { pain: [], confidence: [], logs: [], comments: [] };
  map.set(key, bucket);
  return bucket;
}

function average(values: number[]) {
  return values.length ? roundOne(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function sortNewest(left: DailyCheckin, right: DailyCheckin) {
  return timestamp(right.created_at ?? right.checkin_date) - timestamp(left.created_at ?? left.checkin_date);
}

function timestamp(value?: string | null) {
  return value ? new Date(value).getTime() : 0;
}

function dateKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
