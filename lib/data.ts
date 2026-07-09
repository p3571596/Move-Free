"use client";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type {
  ClinicalDecision,
  ClinicianSnapshot,
  DailyCheckin,
  Database,
  Episode,
  Exercise,
  HomeProgram,
  HomeProgramExercise,
  Patient,
  PatientWorkspace,
  Profile,
  ProgressMetric,
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

  const [patientsResult, checkinsResult, decisionsResult] = await Promise.all([
    client
      .from("patients")
      .select("*")
      .eq("clinician_id", user.id)
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
    profile: await getProfile(client, user),
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

  if (!patientId) {
    return emptyWorkspace();
  }

  const patientResult = await client
    .from("patients")
    .select("*")
    .eq("id", patientId)
    .eq("clinician_id", user.id)
    .limit(1)
    .maybeSingle();

  const patient = patientResult.data;
  if (!patient) {
    return emptyWorkspace();
  }

  const resolvedPatientId = patient.id;

  const episodeResult = await client
    .from("episodes")
    .select("*")
    .eq("patient_id", resolvedPatientId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const episodeId = episodeResult.data?.id;

  const [
    goalsResult,
    checkinsResult,
    metricsResult,
    decisionsResult,
    notesResult,
    barriersResult,
    programResult,
  ] = await Promise.all([
    episodeId ? client.from("goals").select("*").eq("episode_id", episodeId).limit(8) : emptyResult(),
    client.from("daily_checkins").select("*").eq("patient_id", resolvedPatientId).order("created_at", { ascending: false }).limit(7),
    episodeId ? client.from("progress_metrics").select("*").eq("episode_id", episodeId).order("measured_at", { ascending: true }).limit(12) : emptyResult(),
    client.from("clinical_decisions").select("*").eq("patient_id", resolvedPatientId).order("created_at", { ascending: false }).limit(1),
    client.from("visit_notes").select("*").eq("patient_id", resolvedPatientId).order("created_at", { ascending: false }).limit(1),
    client.from("barriers").select("*").eq("patient_id", resolvedPatientId).order("created_at", { ascending: false }).limit(5),
    episodeId ? client
      .from("home_programs")
      .select("*")
      .eq("episode_id", episodeId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle() : emptySingleResult(),
  ]);

  const program = normalizeProgram(programResult.data, patient.id);
  const programExercises = program
    ? await loadProgramExercises(client, program.id)
    : [];

  return {
    patient,
    episode: episodeResult.data,
    goals: goalsResult.data ?? [],
    checkins: normalizeCheckins(checkinsResult.data ?? []),
    progressMetrics: normalizeProgressMetrics(metricsResult.data ?? []),
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

  return (data ?? []).map(normalizeProgramExercise) as HomeProgramExercise[];
}

export async function loadExerciseLibrary(client: Client) {
  const { data } = await client.from("exercises").select("*").order("name", { ascending: true }).limit(100);

  return (data ?? []).map(normalizeExercise) as Exercise[];
}

export async function loadCurrentPatientAppWorkspace(client: Client): Promise<PatientWorkspace> {
  const user = await getCurrentUser(client);

  if (!user) {
    return emptyWorkspace();
  }

  const { data } = await client
    .from("patients")
    .select("*")
    .or(`clinician_id.eq.${user.id},patient_profile_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const patient = data as Patient | null;

  return patient ? loadPatientWorkspace(client, patient.id) : emptyWorkspace();
}

export async function saveProgramDraft(client: Client, patientId: string, items: HomeProgramExercise[]) {
  const user = await getCurrentUser(client);

  if (!user) {
    throw new Error("Sign in before saving a program.");
  }

  const episode = await ensureActiveEpisode(client, patientId);
  const program = await ensureHomeProgram(client, episode);
  const exercises = await Promise.all(items.map((item) => ensureExercise(client, item.exercise)));
  const savedItems: HomeProgramExercise[] = [];

  const { error: deleteError } = await client
    .from("home_program_exercises")
    .delete()
    .eq("home_program_id", program.id);

  if (deleteError) {
    throw deleteError;
  }

  for (const [index, item] of items.entries()) {
    const exercise = exercises[index];
    const { data, error } = await client
      .from("home_program_exercises")
      .insert({
        home_program_id: program.id,
        exercise_id: exercise.id,
        sort_order: index,
        dosage_sets: String(item.sets ?? item.dosage_sets ?? ""),
        dosage_reps: String(item.reps ?? item.dosage_reps ?? ""),
        frequency: item.frequency ?? null,
        notes: item.notes ?? null,
        category: normalizeExerciseCategory(item.category ?? item.exercise?.category),
      })
      .select("*, exercise:exercises(*)")
      .single();

    if (error) {
      throw error;
    }

    savedItems.push(normalizeProgramExercise(data));
  }

  return { program: normalizeProgram(program, patientId), programExercises: savedItems };
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
    completion_status: "completed",
    pain_during: painBefore,
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
    patient_comment: notes,
  });

  if (error) {
    throw error;
  }
}

async function ensureActiveEpisode(client: Client, patientId: string) {
  const existing = await client
    .from("episodes")
    .select("*")
    .eq("patient_id", patientId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.data) {
    return existing.data as Episode;
  }

  const { data, error } = await client
    .from("episodes")
    .insert({
      patient_id: patientId,
      title: "Active care episode",
      status: "active",
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as Episode;
}

async function ensureHomeProgram(client: Client, episode: Episode) {
  const existing = await client
    .from("home_programs")
    .select("*")
    .eq("episode_id", episode.id)
    .in("status", ["draft", "active"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.data) {
    const { data, error } = await client
      .from("home_programs")
      .update({ status: "active", assigned_at: new Date().toISOString() })
      .eq("id", existing.data.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return data as HomeProgram;
  }

  const { data, error } = await client
    .from("home_programs")
    .insert({
      episode_id: episode.id,
      name: "Home program",
      status: "active",
      assigned_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as HomeProgram;
}

async function ensureExercise(client: Client, exercise?: Exercise | null) {
  if (exercise?.id && !exercise.id.startsWith("custom-")) {
    return exercise;
  }

  const { data, error } = await client
    .from("exercises")
    .insert({
      name: exercise?.name?.trim() || "New exercise",
      category: normalizeExerciseCategory(exercise?.category),
      clinical_purpose: exercise?.description ?? exercise?.clinical_purpose ?? null,
      patient_instructions: exercise?.instructions ?? exercise?.patient_instructions ?? null,
      default_dosage: exercise?.default_dosage ?? null,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return normalizeExercise(data) as Exercise;
}

function normalizeProgram(program?: Partial<HomeProgram> | null, patientId?: string): HomeProgram | null {
  if (!program?.id) {
    return null;
  }

  return {
    ...program,
    patient_id: program.patient_id ?? patientId,
    title: program.title ?? program.name ?? "Home program",
    start_date: program.start_date ?? program.assigned_at,
  } as HomeProgram;
}

function normalizeProgramExercise(item: HomeProgramExercise) {
  const sets = Number(item.sets ?? item.dosage_sets ?? 0);
  const reps = Number(item.reps ?? item.dosage_reps ?? 0);

  return {
    ...item,
    sets: Number.isNaN(sets) ? 0 : sets,
    reps: Number.isNaN(reps) ? 0 : reps,
    exercise: normalizeExercise(item.exercise),
  };
}

function normalizeExercise(exercise?: Exercise | null): Exercise | null {
  if (!exercise) {
    return null;
  }

  return {
    ...exercise,
    description: exercise.description ?? exercise.clinical_purpose,
    instructions: exercise.instructions ?? exercise.patient_instructions,
    difficulty: exercise.difficulty ?? exercise.default_dosage,
  };
}

function normalizeExerciseCategory(value?: string | null) {
  const category = value?.toLowerCase().replace(/\s+/g, "_");
  const allowed = ["mobility", "strength", "balance", "conditioning", "motor_control", "education", "other"];

  return category && allowed.includes(category) ? category : "other";
}

function normalizeCheckins(checkins: DailyCheckin[]) {
  return checkins.map((checkin) => ({
    ...checkin,
    notes: checkin.notes ?? checkin.patient_comment,
  }));
}

function normalizeProgressMetrics(metrics: Array<Record<string, unknown>>) {
  return metrics.map((metric) => ({
    ...metric,
    value: metric.value ?? metric.metric_value,
    recorded_at: metric.recorded_at ?? metric.measured_at,
  })) as ProgressMetric[];
}

function emptyResult() {
  return Promise.resolve({ data: [] });
}

function emptySingleResult() {
  return Promise.resolve({ data: null });
}

export function emptyWorkspace(): PatientWorkspace {
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
