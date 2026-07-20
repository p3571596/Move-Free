import type {
  ClinicianSnapshot,
  DailyCheckin,
  Episode,
  ExerciseAdherenceLog,
  Goal,
  HomeProgram,
  Patient,
} from "@/lib/types";

export type ReviewCategory = "pain" | "adherence" | "review";

export type PatientSummary = {
  patient: Patient;
  episode: Episode | null;
  latestGoal: Goal | null;
  program: HomeProgram | null;
  latestCheckin: DailyCheckin | null;
  lastActivity: string | null;
  lastActivityLabel: string;
  adherencePercent: number | null;
  painDelta: number | null;
  painAlert: boolean;
  repeatedWorsening: boolean;
  hardExerciseAlert: boolean;
  skippedCount: number;
  inactivityAlert: boolean;
  needsReview: boolean;
  reviewCategory: ReviewCategory | null;
  reviewReasons: string[];
  goalProgress: number;
  milestone: boolean;
};

export type ActivityEvent = {
  id: string;
  patientId: string;
  patientName: string;
  occurredAt: string;
  label: string;
  detail: string;
  kind: "checkin" | "exercise";
};

export function buildPatientSummaries(snapshot: ClinicianSnapshot | null): PatientSummary[] {
  if (!snapshot) return [];

  return snapshot.patients.map((patient) => {
    const patientEpisodes = snapshot.episodes
      .filter((episode) => episode.patient_id === patient.id)
      .sort((a, b) => timestamp(b.updated_at ?? b.start_date) - timestamp(a.updated_at ?? a.start_date));
    const episode = patientEpisodes[0] ?? null;
    const episodeIds = patientEpisodes.map((item) => item.id);
    const goals = snapshot.goals
      .filter((goal) => goal.episode_id && episodeIds.includes(goal.episode_id))
      .sort((a, b) => timestamp(b.updated_at ?? b.created_at) - timestamp(a.updated_at ?? a.created_at));
    const latestGoal = goals.find((goal) => goal.status === "active") ?? goals[0] ?? null;
    const programs = snapshot.programs
      .filter((program) => program.episode_id && episodeIds.includes(program.episode_id))
      .sort((a, b) => timestamp(b.updated_at ?? b.assigned_at) - timestamp(a.updated_at ?? a.assigned_at));
    const program = programs.find((item) => item.status === "active") ?? programs[0] ?? null;
    const checkins = snapshot.recentCheckins
      .filter((checkin) => checkin.patient_id === patient.id)
      .sort((a, b) => timestamp(b.created_at ?? b.checkin_date) - timestamp(a.created_at ?? a.checkin_date));
    const adherenceLogs = snapshot.adherenceLogs
      .filter((log) => log.patient_id === patient.id)
      .sort((a, b) => timestamp(b.performed_at ?? b.created_at) - timestamp(a.performed_at ?? a.created_at));
    const latestCheckin = checkins[0] ?? null;
    const lastActivity = latestActivity(checkins, adherenceLogs);
    const adherencePercent = calculateAdherence(adherenceLogs);
    const painDelta = calculatePainDelta(checkins);
    const latestPain = latestCheckin?.pain_score;
    const repeatedWorsening = checkins.slice(0, 2).length === 2 && checkins.slice(0, 2).every((checkin) => checkin.symptom_direction === "worsening");
    const painAlert = isRecentCheckin(latestCheckin) && (
      (typeof latestPain === "number" && latestPain >= 7) ||
      (painDelta != null && painDelta >= 2) ||
      repeatedWorsening
    );
    const inactivityAlert = !lastActivity || daysSince(lastActivity) >= 3;
    const recentAdherence = adherenceLogs.filter((log) => isWithinDays(log.performed_at ?? log.created_at, 7));
    const skippedCount = recentAdherence.filter((log) => log.completion_status === "skipped").length;
    const hardExerciseAlert = recentAdherence.filter((log) => ["too_hard", "painful"].includes(log.difficulty ?? "")).length >= 2;
    const reviewReasons = reviewReasonsFor({ patient, lastActivity, program, adherencePercent, painAlert, repeatedWorsening, skippedCount, hardExerciseAlert, recentLogCount: recentAdherence.length });
    const progress = getGoalProgress(latestGoal, patient);
    const milestone = !reviewReasons.length && isWithinDays(latestGoal?.updated_at ?? latestGoal?.created_at, 7) && (
      latestGoal?.status === "met" ||
      progress >= 80
    );

    return {
      patient,
      episode,
      latestGoal,
      program,
      latestCheckin,
      lastActivity,
      lastActivityLabel: activityLabel(checkins, adherenceLogs),
      adherencePercent,
      painDelta,
      painAlert,
      repeatedWorsening,
      hardExerciseAlert,
      skippedCount,
      inactivityAlert,
      needsReview: reviewReasons.length > 0,
      reviewCategory: painAlert ? "pain" : (inactivityAlert || skippedCount >= 2 || (adherencePercent != null && recentAdherence.length >= 3 && adherencePercent < 60)) ? "adherence" : reviewReasons.length ? "review" : null,
      reviewReasons,
      goalProgress: progress,
      milestone,
    };
  });
}

export function buildRecentActivity(snapshot: ClinicianSnapshot | null, limit = 6): ActivityEvent[] {
  if (!snapshot) return [];

  const names = new Map(snapshot.patients.map((patient) => [patient.id, getPatientName(patient)]));
  const checkins: ActivityEvent[] = snapshot.recentCheckins.flatMap((checkin) => {
    if (!checkin.patient_id || !names.has(checkin.patient_id)) return [];
    const occurredAt = checkin.created_at ?? checkin.checkin_date;
    if (!occurredAt) return [];
    const context = checkin.activity_context ? ` during ${checkin.activity_context.toLowerCase()}` : "";
    return [{
      id: `checkin-${checkin.id}`,
      patientId: checkin.patient_id,
      patientName: names.get(checkin.patient_id)!,
      occurredAt,
      label: "Pain pattern logged",
      detail: typeof checkin.pain_score === "number" ? `${checkin.pain_score}/10${context}` : `New check-in${context}`,
      kind: "checkin" as const,
    }];
  });
  const adherence: ActivityEvent[] = snapshot.adherenceLogs.flatMap((log) => {
    if (!log.patient_id || !names.has(log.patient_id)) return [];
    const occurredAt = log.performed_at ?? log.created_at;
    if (!occurredAt) return [];
    const status = log.completion_status ?? (log.completed ? "completed" : "updated");
    return [{
      id: `adherence-${log.id}`,
      patientId: log.patient_id,
      patientName: names.get(log.patient_id)!,
      occurredAt,
      label: "Program activity",
      detail: sentenceCase(status),
      kind: "exercise" as const,
    }];
  });

  return [...checkins, ...adherence]
    .sort((a, b) => timestamp(b.occurredAt) - timestamp(a.occurredAt))
    .slice(0, limit);
}

export function getPatientName(patient: Patient) {
  return patient.display_name ?? patient.name ?? patient.full_name ?? "Patient";
}

export function getPatientDiagnosis(summary: PatientSummary) {
  return summary.episode?.title ?? summary.patient.diagnosis ?? summary.patient.primary_complaint ?? "Clinical focus pending";
}

export function getGoalTitle(summary: PatientSummary) {
  return summary.latestGoal?.title ?? summary.patient.goal ?? "No goal recorded";
}

export function formatStatus(status?: string | null) {
  return sentenceCase(status ?? "active");
}

function reviewReasonsFor({
  patient,
  lastActivity,
  program,
  adherencePercent,
  painAlert,
  repeatedWorsening,
  skippedCount,
  hardExerciseAlert,
  recentLogCount,
}: {
  patient: Patient;
  lastActivity: string | null;
  program: HomeProgram | null;
  adherencePercent: number | null;
  painAlert: boolean;
  repeatedWorsening: boolean;
  skippedCount: number;
  hardExerciseAlert: boolean;
  recentLogCount: number;
}) {
  const reasons: string[] = [];

  if (patient.status === "needs_review") reasons.push("Marked for review");
  if (painAlert) reasons.push(repeatedWorsening ? "Symptoms worsening twice in a row" : "Pain increased or remains high");
  if (!program) reasons.push("No program assigned");
  if (!lastActivity || daysSince(lastActivity) >= 3) reasons.push("No activity in 3+ days");
  if (recentLogCount >= 3 && adherencePercent != null && adherencePercent < 60) reasons.push("Participation below 60%");
  if (skippedCount >= 2) reasons.push("2+ exercises skipped this week");
  if (hardExerciseAlert) reasons.push("2+ exercises rated hard");

  return reasons;
}

function latestActivity(checkins: DailyCheckin[], logs: ExerciseAdherenceLog[]) {
  const values = [
    ...checkins.map((checkin) => checkin.created_at ?? checkin.checkin_date ?? null),
    ...logs.map((log) => log.performed_at ?? log.created_at ?? null),
  ].filter(Boolean) as string[];

  return values.sort((a, b) => timestamp(b) - timestamp(a))[0] ?? null;
}

function activityLabel(checkins: DailyCheckin[], logs: ExerciseAdherenceLog[]) {
  const latestCheckin = checkins[0];
  const latestLog = logs[0];
  const checkinTime = timestamp(latestCheckin?.created_at ?? latestCheckin?.checkin_date);
  const logTime = timestamp(latestLog?.performed_at ?? latestLog?.created_at);

  if (!checkinTime && !logTime) return "No activity yet";
  return checkinTime >= logTime ? "Pain pattern log" : "Program activity";
}

function calculateAdherence(logs: ExerciseAdherenceLog[]) {
  const recentLogs = logs.filter((log) => {
    const value = log.performed_at ?? log.created_at;
    return value ? daysSince(value) <= 7 : false;
  });
  if (!recentLogs.length) return null;
  const participated = recentLogs.filter((log) => log.completed || ["completed", "partial"].includes(log.completion_status ?? "")).length;
  return Math.round((participated / recentLogs.length) * 100);
}

function calculatePainDelta(checkins: DailyCheckin[]) {
  const scores = checkins
    .filter((checkin) => typeof checkin.pain_score === "number")
    .slice(0, 2)
    .map((checkin) => checkin.pain_score as number);
  return scores.length === 2 ? scores[0] - scores[1] : null;
}

function isRecentCheckin(checkin: DailyCheckin | null) {
  const value = checkin?.created_at ?? checkin?.checkin_date;
  return Boolean(value && daysSince(value) <= 14);
}

function isWithinDays(value: string | null | undefined, days: number) {
  return Boolean(value && daysSince(value) <= days);
}

function getGoalProgress(goal: Goal | null, patient: Patient) {
  if (typeof goal?.progress_percent === "number") return clamp(goal.progress_percent);
  if (!goal && typeof patient.progress_percent === "number") return clamp(patient.progress_percent);

  const current = Number(goal?.current_value ?? patient.current_value);
  const target = Number(goal?.target_value ?? patient.target_value);
  if (!target || Number.isNaN(current) || Number.isNaN(target)) return 0;
  return clamp(Math.round((current / target) * 100));
}

function clamp(value: number) {
  return Math.min(100, Math.max(0, value));
}

export function daysSince(value: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
}

function timestamp(value?: string | null) {
  return value ? new Date(value).getTime() : 0;
}

function sentenceCase(value: string) {
  const cleaned = value.replaceAll("_", " ");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
