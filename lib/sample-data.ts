import type {
  Barrier,
  ClinicalDecision,
  DailyCheckin,
  Exercise,
  Goal,
  HomeProgram,
  HomeProgramExercise,
  Patient,
  PatientWorkspace,
  ProgressMetric,
  VisitNote,
} from "@/lib/types";

export const samplePatient: Patient = {
  id: "sample-patient",
  full_name: "Avery Chen",
  diagnosis: "Rotator cuff tendinopathy",
  status: "Active",
};

export const sampleGoals: Goal[] = [
  {
    id: "goal-1",
    title: "Reach overhead without flare",
    current_value: 72,
    target_value: 100,
    unit: "%",
    status: "On track",
  },
  {
    id: "goal-2",
    title: "Complete program 4 days weekly",
    current_value: 3,
    target_value: 4,
    unit: "days",
    status: "Needs support",
  },
];

export const sampleExercises: Exercise[] = [
  {
    id: "ex-1",
    name: "Wall Slide",
    body_region: "Shoulder",
    category: "Mobility",
    difficulty: "Foundational",
    description: "Controlled shoulder flexion with low irritability.",
  },
  {
    id: "ex-2",
    name: "Band External Rotation",
    body_region: "Shoulder",
    category: "Strength",
    difficulty: "Moderate",
    description: "Rotator cuff loading with elbow supported.",
  },
  {
    id: "ex-3",
    name: "Scapular Row",
    body_region: "Upper back",
    category: "Strength",
    difficulty: "Foundational",
    description: "Postural endurance and scapular control.",
  },
];

export const sampleProgram: HomeProgram = {
  id: "program-1",
  title: "Shoulder return-to-reach",
  status: "Current",
  notes: "Progress load only if pain returns to baseline within 24 hours.",
};

export const sampleProgramExercises: HomeProgramExercise[] = [
  {
    id: "hpe-1",
    home_program_id: "program-1",
    exercise_id: "ex-1",
    sets: 2,
    reps: 12,
    frequency: "Daily",
    notes: "Pause at the top for two breaths.",
    exercise: sampleExercises[0],
  },
  {
    id: "hpe-2",
    home_program_id: "program-1",
    exercise_id: "ex-2",
    sets: 3,
    reps: 10,
    frequency: "4x/week",
    notes: "Keep elbow tucked with a towel roll.",
    exercise: sampleExercises[1],
  },
];

export const sampleCheckins: DailyCheckin[] = [
  { id: "check-1", pain_score: 3, confidence_score: 8, notes: "Soreness after gardening.", created_at: new Date().toISOString() },
  { id: "check-2", pain_score: 4, confidence_score: 6, notes: "Skipped one session due to travel.", created_at: new Date(Date.now() - 86400000).toISOString() },
];

export const sampleMetrics: ProgressMetric[] = [
  { id: "metric-1", metric_name: "Pain", value: 3, unit: "/10", recorded_at: new Date().toISOString() },
  { id: "metric-2", metric_name: "Function", value: 72, unit: "%", recorded_at: new Date().toISOString() },
  { id: "metric-3", metric_name: "Adherence", value: 78, unit: "%", recorded_at: new Date().toISOString() },
];

export const sampleDecision: ClinicalDecision = {
  id: "decision-1",
  decision: "Progress band resistance if pain stays at or below 3/10 for two sessions.",
  rationale: "Adherence is steady and symptoms settle within expected window.",
};

export const sampleVisitNote: VisitNote = {
  id: "note-1",
  summary: "Improving shoulder elevation with mild end-range discomfort.",
  plan: "Keep mobility daily, progress cuff loading, monitor next-day pain.",
};

export const sampleBarriers: Barrier[] = [
  { id: "barrier-1", type: "Schedule", description: "Travel disrupted two program days.", status: "Open" },
];

export const sampleWorkspace: PatientWorkspace = {
  patient: samplePatient,
  episode: {
    id: "episode-1",
    diagnosis: samplePatient.diagnosis,
    body_region: "Shoulder",
    stage: "Strength",
    status: "Active",
  },
  goals: sampleGoals,
  checkins: sampleCheckins,
  progressMetrics: sampleMetrics,
  decision: sampleDecision,
  visitNote: sampleVisitNote,
  barriers: sampleBarriers,
  program: sampleProgram,
  programExercises: sampleProgramExercises,
};
