"use client";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type {
  ClinicalDecision,
  ClinicianSnapshot,
  DailyCheckin,
  Database,
  Episode,
  Exercise,
  ExerciseAdherenceLog,
  Goal,
  HomeProgram,
  HomeProgramExercise,
  Patient,
  PatientWorkspace,
  Profile,
  ProgressMetric,
  Role,
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

export async function getEffectiveRole(client: Client, user: User): Promise<Role> {
  const profile = await getProfile(client, user);
  if (profile?.role) return profile.role;

  const { data, error } = await client
    .from("patients")
    .select("id")
    .eq("patient_profile_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? "patient" : "clinician";
}

export async function createPatientInvite(client: Client, patientId: string) {
  const { data, error } = await client.rpc("create_patient_invite", { p_patient_id: patientId });
  if (error) throw error;
  return data;
}

export async function claimPatientInvite(client: Client, token: string) {
  const { data, error } = await client.rpc("claim_patient_invite", { p_token: token });
  if (error) throw error;
  return data;
}

export async function loadClinicianSnapshot(client: Client): Promise<ClinicianSnapshot> {
  const user = await getCurrentUser(client);

  if (!user) {
    return {
      profile: null,
      patients: [],
      episodes: [],
      goals: [],
      programs: [],
      adherenceLogs: [],
      recentCheckins: [],
      openDecisions: [],
    };
  }

  const patientsResult = await client
    .from("patients")
    .select("*")
    .eq("clinician_id", user.id)
    .order("created_at", { ascending: false });

  const patients = patientsResult.data ?? [];
  const patientIds = patients.map((patient) => patient.id);

  if (!patientIds.length) {
    return {
      profile: await getProfile(client, user),
      patients: [],
      episodes: [],
      goals: [],
      programs: [],
      adherenceLogs: [],
      recentCheckins: [],
      openDecisions: [],
    };
  }

  const [episodesResult, checkinsResult, adherenceResult, decisionsResult] = await Promise.all([
    client
      .from("episodes")
      .select("*")
      .in("patient_id", patientIds)
      .order("updated_at", { ascending: false }),
    client
      .from("daily_checkins")
      .select("*")
      .in("patient_id", patientIds)
      .order("created_at", { ascending: false }),
    client
      .from("exercise_adherence_logs")
      .select("*")
      .in("patient_id", patientIds)
      .order("created_at", { ascending: false }),
    client
      .from("clinical_decisions")
      .select("*")
      .in("patient_id", patientIds)
      .order("created_at", { ascending: false }),
  ]);

  const episodes = episodesResult.data ?? [];
  const episodeIds = episodes.map((episode) => episode.id);
  const [goalsResult, programsResult] = episodeIds.length
    ? await Promise.all([
      client
        .from("goals")
        .select("*")
        .in("episode_id", episodeIds)
        .order("updated_at", { ascending: false }),
      client
        .from("home_programs")
        .select("*")
        .in("episode_id", episodeIds)
        .order("updated_at", { ascending: false }),
    ])
    : [await emptyResult(), await emptyResult()];

  return {
    profile: await getProfile(client, user),
    patients,
    episodes,
    goals: goalsResult.data ?? [],
    programs: programsResult.data ?? [],
    adherenceLogs: (adherenceResult.data ?? []) as ExerciseAdherenceLog[],
    recentCheckins: normalizeCheckins(checkinsResult.data ?? []),
    openDecisions: decisionsResult.data ?? [],
  };
}

export async function loadPatientWorkspace(client: Client, patientId?: string, access: "clinician" | "patient" = "clinician"): Promise<PatientWorkspace> {
  const user = await getCurrentUser(client);

  if (!user) {
    return emptyWorkspace();
  }

  if (!patientId) {
    return emptyWorkspace();
  }

  let patientQuery = client
    .from("patients")
    .select("*")
    .eq("id", patientId)
    .limit(1);

  patientQuery = access === "patient"
    ? patientQuery.eq("patient_profile_id", user.id)
    : patientQuery.eq("clinician_id", user.id);

  const patientResult = await patientQuery.maybeSingle();

  if (patientResult.error) {
    throw patientResult.error;
  }

  const patient = patientResult.data;
  if (!patient) {
    return emptyWorkspace();
  }

  const resolvedPatientId = patient.id;

  const activeEpisodeResult = await client
    .from("episodes")
    .select("*")
    .eq("patient_id", resolvedPatientId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeEpisodeResult.error) {
    throw activeEpisodeResult.error;
  }

  const latestEpisodeResult = activeEpisodeResult.data
    ? activeEpisodeResult
    : await client
      .from("episodes")
      .select("*")
      .eq("patient_id", resolvedPatientId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (latestEpisodeResult.error) {
    throw latestEpisodeResult.error;
  }

  const episode = latestEpisodeResult.data as Episode | null;
  const episodeId = episode?.id;

  const [
    goalsResult,
    checkinsResult,
    metricsResult,
    decisionsResult,
    notesResult,
    barriersResult,
    programsResult,
    adherenceResult,
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
      .limit(20) : emptyResult(),
    client
      .from("exercise_adherence_logs")
      .select("*")
      .eq("patient_id", resolvedPatientId)
      .order("performed_at", { ascending: false })
      .limit(100),
  ]);

  throwFirstQueryError([
    goalsResult,
    checkinsResult,
    metricsResult,
    decisionsResult,
    notesResult,
    barriersResult,
    programsResult,
    adherenceResult,
  ]);

  const selectedProgram = selectVisibleProgram((programsResult.data ?? []) as HomeProgram[]);
  const program = normalizeProgram(selectedProgram, patient.id);
  const programExercises = program
    ? await loadProgramExercises(client, program.id)
    : [];

  return {
    patient,
    episode,
    goals: withPatientGoalFallback(goalsResult.data ?? [], patient),
    checkins: normalizeCheckins(checkinsResult.data ?? []),
    progressMetrics: normalizeProgressMetrics(metricsResult.data ?? []),
    decision: (decisionsResult.data?.[0] as ClinicalDecision | undefined) ?? null,
    visitNote: notesResult.data?.[0] ?? null,
    barriers: barriersResult.data ?? [],
    program,
    programExercises,
    adherenceLogs: (adherenceResult.data ?? []) as ExerciseAdherenceLog[],
  };
}

export async function loadProgramExercises(client: Client, programId: string) {
  const { data, error } = await client
    .from("home_program_exercises")
    .select("*, exercise:exercises(*)")
    .eq("home_program_id", programId)
    .order("sort_order", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizeProgramExercise) as HomeProgramExercise[];
}

export async function loadExerciseLibrary(client: Client) {
  const user = await getCurrentUser(client);

  if (!user) {
    return [];
  }

  const { data } = await client
    .from("exercises")
    .select("*")
    .eq("clinician_id", user.id)
    .order("name", { ascending: true })
    .limit(100);

  return (data ?? []).map(normalizeExercise) as Exercise[];
}

export async function loadCurrentPatientAppWorkspace(client: Client): Promise<PatientWorkspace> {
  const user = await getCurrentUser(client);

  if (!user) {
    return emptyWorkspace();
  }

  const { data, error } = await client
    .from("patients")
    .select("*")
    .eq("patient_profile_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const patient = data as Patient | null;

  return patient ? loadPatientWorkspace(client, patient.id, "patient") : emptyWorkspace();
}

export async function saveProgramDraft(client: Client, patientId: string, items: HomeProgramExercise[]) {
  const user = await getCurrentUser(client);

  if (!user) {
    throw new Error("Sign in before saving a program.");
  }

  const episode = await ensureActiveEpisode(client, patientId);
  const program = await ensureHomeProgram(client, episode);
  const exercises = await Promise.all(items.map((item) => ensureExercise(client, exerciseFromProgramItem(item), user.id)));
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

  return {
    program: normalizeProgram(program, patientId),
    programExercises: savedItems,
    libraryExerciseCount: new Set(exercises.map((exercise) => exercise.id)).size,
  };
}

export async function createExercise(client: Client, exercise: Partial<Exercise>) {
  const user = await getCurrentUser(client);

  if (!user) {
    throw new Error("Sign in before creating an exercise.");
  }

  const normalizedName = normalizeExerciseName(exercise.name);
  const existing = await findExerciseByNormalizedName(client, user.id, normalizedName);

  if (existing) {
    const merged = await mergeExerciseTags(client, existing, exercise.tags);
    return { exercise: merged, wasDuplicate: true };
  }

  const { data, error } = await client
    .from("exercises")
    .insert({
      clinician_id: user.id,
      name: exercise.name?.trim() || "New exercise",
      tags: normalizeTags(exercise.tags),
      category: normalizeExerciseCategory(exercise.category),
      clinical_purpose: exercise.clinical_purpose ?? exercise.description ?? null,
      patient_instructions: exercise.patient_instructions ?? exercise.instructions ?? null,
      default_dosage: exercise.default_dosage ?? null,
      is_active: exercise.is_active ?? true,
    })
    .select("*")
    .single();

  if (error?.code === "23505") {
    const duplicate = await findExerciseByNormalizedName(client, user.id, normalizedName);
    if (duplicate) {
      const merged = await mergeExerciseTags(client, duplicate, exercise.tags);
      return { exercise: merged, wasDuplicate: true };
    }
  }

  if (error) {
    throw error;
  }

  return { exercise: normalizeExercise(data) as Exercise, wasDuplicate: false };
}

export async function updateExercise(client: Client, exerciseId: string, exercise: Partial<Exercise>) {
  const user = await getCurrentUser(client);
  if (!user) throw new Error("Sign in before editing an exercise.");

  const normalizedName = normalizeExerciseName(exercise.name);
  const existing = await findExerciseByNormalizedName(client, user.id, normalizedName, exerciseId);
  if (existing) {
    return { exercise: normalizeExercise(existing) as Exercise, wasDuplicate: true };
  }

  const { data, error } = await client
    .from("exercises")
    .update({
      name: exercise.name?.trim() || "New exercise",
      tags: normalizeTags(exercise.tags),
      category: normalizeExerciseCategory(exercise.category),
      clinical_purpose: exercise.clinical_purpose ?? exercise.description ?? null,
      patient_instructions: exercise.patient_instructions ?? exercise.instructions ?? null,
      default_dosage: exercise.default_dosage ?? null,
      is_active: exercise.is_active ?? true,
    })
    .eq("id", exerciseId)
    .eq("clinician_id", user.id)
    .select("*")
    .single();

  if (error?.code === "23505") {
    const duplicate = await findExerciseByNormalizedName(client, user.id, normalizedName, exerciseId);
    if (duplicate) return { exercise: normalizeExercise(duplicate) as Exercise, wasDuplicate: true };
  }
  if (error) throw error;
  return { exercise: normalizeExercise(data) as Exercise, wasDuplicate: false };
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
  homeProgramId: string,
  homeProgramExerciseId: string,
  completionStatus: string,
  difficulty: string,
  painDuring: number | null,
  painAfter: number | null,
  notes: string,
) {
  const { error } = await client.from("exercise_adherence_logs").insert({
    patient_id: patientId,
    home_program_id: homeProgramId,
    home_program_exercise_id: homeProgramExerciseId,
    performed_at: new Date().toISOString(),
    completion_status: completionStatus,
    difficulty,
    pain_during: painDuring,
    pain_after: painAfter,
    notes,
  });

  if (error) {
    throw error;
  }
}

export async function logPainPattern(
  client: Client,
  input: {
    patientId: string;
    episodeId: string;
    painScore: number;
    painLocation: string;
    symptomBehavior: string;
    activityContext: string;
    aggravatingFactors: string;
    easingFactors: string;
    confidenceScore: number | null;
    patientComment: string;
  },
) {
  const { error } = await client.from("daily_checkins").insert({
    patient_id: input.patientId,
    episode_id: input.episodeId,
    checkin_date: new Date().toISOString().slice(0, 10),
    pain_score: input.painScore,
    pain_location: input.painLocation,
    symptom_behavior: input.symptomBehavior,
    activity_context: input.activityContext,
    aggravating_factors: input.aggravatingFactors,
    easing_factors: input.easingFactors,
    confidence_score: input.confidenceScore,
    patient_comment: input.patientComment,
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

async function ensureExercise(client: Client, exercise?: Exercise | null, clinicianId?: string) {
  if (
    exercise?.id &&
    !exercise.id.startsWith("custom-") &&
    clinicianId &&
    exercise.clinician_id === clinicianId
  ) {
    return exercise;
  }

  const normalizedName = normalizeExerciseName(exercise?.name);
  const existing = clinicianId ? await findExerciseByNormalizedName(client, clinicianId, normalizedName) : null;
  if (existing) return mergeExerciseTags(client, existing, exercise?.tags);

  const { data, error } = await client
    .from("exercises")
    .insert({
      clinician_id: clinicianId,
      name: exercise?.name?.trim() || "New exercise",
      tags: normalizeTags(exercise?.tags),
      category: normalizeExerciseCategory(exercise?.category),
      clinical_purpose: exercise?.description ?? exercise?.clinical_purpose ?? null,
      patient_instructions: exercise?.instructions ?? exercise?.patient_instructions ?? null,
      default_dosage: exercise?.default_dosage ?? null,
      is_active: true,
    })
    .select("*")
    .single();

  if (error?.code === "23505" && clinicianId) {
    const duplicate = await findExerciseByNormalizedName(client, clinicianId, normalizedName);
    if (duplicate) return mergeExerciseTags(client, duplicate, exercise?.tags);
  }
  if (error) {
    throw error;
  }

  return normalizeExercise(data) as Exercise;
}

async function mergeExerciseTags(client: Client, exercise: Exercise, incomingTags?: string[] | null) {
  const mergedTags = normalizeTags([...(exercise.tags ?? []), ...(incomingTags ?? [])]);
  if (mergedTags.length === (exercise.tags ?? []).length && mergedTags.every((tag) => exercise.tags?.includes(tag))) {
    return normalizeExercise(exercise) as Exercise;
  }
  if (!exercise.clinician_id) {
    throw new Error("Exercise ownership could not be verified before saving tags.");
  }

  const { data, error } = await client
    .from("exercises")
    .update({ tags: mergedTags })
    .eq("id", exercise.id)
    .eq("clinician_id", exercise.clinician_id)
    .select("*")
    .single();

  if (error) throw error;
  return normalizeExercise(data) as Exercise;
}

async function findExerciseByNormalizedName(client: Client, clinicianId: string, normalizedName: string, excludeId?: string) {
  let query = client
    .from("exercises")
    .select("*")
    .eq("clinician_id", clinicianId)
    .eq("normalized_name", normalizedName)
    .eq("is_active", true);

  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data as Exercise | null;
}

function normalizeExerciseName(name?: string | null) {
  return (name?.trim() || "New exercise").toLowerCase().replace(/\s+/g, " ");
}

function normalizeTags(tags?: string[] | null) {
  return Array.from(new Set((tags ?? []).map((tag) => tag.trim().replace(/\s+/g, " ").toLowerCase()).filter(Boolean)));
}

function selectVisibleProgram(programs: HomeProgram[]) {
  return programs.find((program) => program.status === "active") ?? programs[0] ?? null;
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

function exerciseFromProgramItem(item: HomeProgramExercise) {
  return {
    ...(item.exercise ?? {}),
    category: item.exercise?.category ?? item.category,
    default_dosage: item.exercise?.default_dosage ?? formatDefaultDosage(item),
  } as Exercise;
}

function formatDefaultDosage(item: HomeProgramExercise) {
  const sets = item.sets ?? item.dosage_sets;
  const reps = item.reps ?? item.dosage_reps;
  const frequency = item.frequency;
  const dosage = [
    sets ? `${sets} sets` : null,
    reps ? `${reps} reps` : null,
    frequency,
  ].filter(Boolean).join(" · ");

  return dosage || null;
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
  return Promise.resolve({ data: [], error: null });
}

function emptySingleResult() {
  return Promise.resolve({ data: null, error: null });
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
    adherenceLogs: [],
  };
}

function withPatientGoalFallback(goals: Goal[], patient: Patient): Goal[] {
  if (goals.length || !patient.goal) {
    return goals;
  }

  return [{
    id: `patient-goal-${patient.id}`,
    patient_id: patient.id,
    title: patient.goal,
    baseline_value: patient.baseline_value,
    current_value: patient.current_value,
    target_value: patient.target_value,
    progress_percent: patient.progress_percent ?? 0,
    status: "active",
  }];
}

function throwFirstQueryError(results: Array<{ error?: unknown }>) {
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    throw failed.error;
  }
}
