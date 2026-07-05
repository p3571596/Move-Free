"use client";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type {
  ClinicalDecision,
  ClinicianSnapshot,
  DailyCheckin,
  Database,
  Exercise,
  HomeProgramExercise,
  PatientWorkspace,
  Profile,
} from "@/lib/types";

type Client = SupabaseClient<Database>;

export async function getCurrentUser(client: Client) {
  const { data, error } = await client.auth.getUser();

  if (error) {
    throw error;
  }

  return data.user;
}

export async function getProfile(client: Client, user: User) {
  const { data } = await client
    .from("profiles")
    .select("*")
    .or(`user_id.eq.${user.id},id.eq.${user.id}`)
    .maybeSingle();

  return data as Profile | null;
}

export async function loadClinicianSnapshot(client: Client): Promise<ClinicianSnapshot> {
  const user = await getCurrentUser(client);

  if (!user) {
    return { profile: null, patients: [], recentCheckins: [], openDecisions: [] };
  }

  const profile = await getProfile(client, user);
  const clinicianId = profile?.id ?? user.id;

  const [patientsResult, checkinsResult, decisionsResult] = await Promise.all([
    client
      .from("patients")
      .select("*")
      .or(`clinician_id.eq.${clinicianId},profile_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(12),
    client
      .from("daily_checkins")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(8),
    client
      .from("clinical_decisions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  return {
    profile,
    patients: patientsResult.data ?? [],
    recentCheckins: checkinsResult.data ?? [],
    openDecisions: decisionsResult.data ?? [],
  };
}

export async function loadPatientWorkspace(client: Client, patientId?: string): Promise<PatientWorkspace> {
  const user = await getCurrentUser(client);

  if (!user) {
    return emptyWorkspace();
  }

  const profile = await getProfile(client, user);
  const scopedPatientId = patientId ?? profile?.id ?? user.id;

  const patientResult = await client
    .from("patients")
    .select("*")
    .or(`id.eq.${scopedPatientId},profile_id.eq.${user.id}`)
    .limit(1)
    .maybeSingle();

  const patient = patientResult.data;
  const resolvedPatientId = patient?.id ?? scopedPatientId;

  const [
    episodeResult,
    goalsResult,
    checkinsResult,
    metricsResult,
    decisionsResult,
    notesResult,
    barriersResult,
    programResult,
  ] = await Promise.all([
    client.from("episodes").select("*").eq("patient_id", resolvedPatientId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("goals").select("*").eq("patient_id", resolvedPatientId).limit(8),
    client.from("daily_checkins").select("*").eq("patient_id", resolvedPatientId).order("created_at", { ascending: false }).limit(7),
    client.from("progress_metrics").select("*").eq("patient_id", resolvedPatientId).order("recorded_at", { ascending: true }).limit(12),
    client.from("clinical_decisions").select("*").eq("patient_id", resolvedPatientId).order("created_at", { ascending: false }).limit(1),
    client.from("visit_notes").select("*").eq("patient_id", resolvedPatientId).order("created_at", { ascending: false }).limit(1),
    client.from("barriers").select("*").eq("patient_id", resolvedPatientId).order("created_at", { ascending: false }).limit(5),
    client.from("home_programs").select("*").eq("patient_id", resolvedPatientId).order("start_date", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const program = programResult.data;
  const programExercises = program
    ? await loadProgramExercises(client, program.id)
    : [];

  return {
    patient,
    episode: episodeResult.data,
    goals: goalsResult.data ?? [],
    checkins: checkinsResult.data ?? [],
    progressMetrics: metricsResult.data ?? [],
    decision: (decisionsResult.data?.[0] as ClinicalDecision | undefined) ?? null,
    visitNote: notesResult.data?.[0] ?? null,
    barriers: barriersResult.data ?? [],
    program,
    programExercises,
  };
}

export async function loadProgramExercises(client: Client, programId: string) {
  const { data } = await client
    .from("home_program_exercises")
    .select("*, exercise:exercises(*)")
    .eq("home_program_id", programId)
    .order("sort_order", { ascending: true });

  return (data ?? []) as HomeProgramExercise[];
}

export async function loadExerciseLibrary(client: Client) {
  const { data } = await client.from("exercises").select("*").order("name", { ascending: true }).limit(100);

  return (data ?? []) as Exercise[];
}

export async function saveFeedback(client: Client, message: string, sentiment: string, page: string) {
  const user = await getCurrentUser(client);

  const { error } = await client.from("feedback").insert({
    user_id: user?.id,
    message,
    sentiment,
    page,
  });

  if (error) {
    throw error;
  }
}

export async function logExerciseCompletion(
  client: Client,
  patientId: string,
  homeProgramExerciseId: string,
  painBefore: number,
  painAfter: number,
  notes: string,
) {
  const { error } = await client.from("exercise_adherence_logs").insert({
    patient_id: patientId,
    home_program_exercise_id: homeProgramExerciseId,
    completed: true,
    pain_before: painBefore,
    pain_after: painAfter,
    notes,
  });

  if (error) {
    throw error;
  }
}

export async function logPainPattern(client: Client, patientId: string, painScore: number, notes: string) {
  const { error } = await client.from("daily_checkins").insert({
    patient_id: patientId,
    pain_score: painScore,
    notes,
  });

  if (error) {
    throw error;
  }
}

function emptyWorkspace(): PatientWorkspace {
  return {
    patient: null,
    episode: null,
    goals: [],
    checkins: [],
    progressMetrics: [],
    decision: null,
    visitNote: null,
    barriers: [],
    program: null,
    programExercises: [],
  };
}
