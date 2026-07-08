export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Role = "clinician" | "patient" | "admin" | string;

export type Profile = {
  id: string;
  user_id?: string | null;
  full_name?: string | null;
  role?: Role | null;
  email?: string | null;
  created_at?: string | null;
};

export type Patient = {
  id: string;
  profile_id?: string | null;
  clinician_id?: string | null;
  display_name?: string | null;
  full_name?: string | null;
  date_of_birth?: string | null;
  diagnosis?: string | null;
  primary_complaint?: string | null;
  current_focus?: string | null;
  status?: string | null;
  created_at?: string | null;
};

export type Episode = {
  id: string;
  patient_id?: string | null;
  clinician_id?: string | null;
  diagnosis?: string | null;
  body_region?: string | null;
  stage?: string | null;
  status?: string | null;
  started_at?: string | null;
  updated_at?: string | null;
};

export type Goal = {
  id: string;
  patient_id?: string | null;
  episode_id?: string | null;
  title?: string | null;
  target_value?: number | null;
  current_value?: number | null;
  unit?: string | null;
  due_date?: string | null;
  status?: string | null;
};

export type Exercise = {
  id: string;
  name?: string | null;
  body_region?: string | null;
  category?: string | null;
  difficulty?: string | null;
  description?: string | null;
  instructions?: string | null;
  video_url?: string | null;
};

export type HomeProgram = {
  id: string;
  patient_id?: string | null;
  episode_id?: string | null;
  clinician_id?: string | null;
  title?: string | null;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  notes?: string | null;
};

export type HomeProgramExercise = {
  id: string;
  home_program_id?: string | null;
  exercise_id?: string | null;
  sets?: number | null;
  reps?: number | null;
  frequency?: string | null;
  notes?: string | null;
  sort_order?: number | null;
  exercise?: Exercise | null;
};

export type DailyCheckin = {
  id: string;
  patient_id?: string | null;
  pain_score?: number | null;
  energy_score?: number | null;
  confidence_score?: number | null;
  notes?: string | null;
  created_at?: string | null;
};

export type ProgressMetric = {
  id: string;
  patient_id?: string | null;
  metric_name?: string | null;
  value?: number | null;
  unit?: string | null;
  recorded_at?: string | null;
};

export type ClinicalDecision = {
  id: string;
  patient_id?: string | null;
  episode_id?: string | null;
  decision?: string | null;
  rationale?: string | null;
  created_at?: string | null;
};

export type VisitNote = {
  id: string;
  patient_id?: string | null;
  episode_id?: string | null;
  summary?: string | null;
  plan?: string | null;
  created_at?: string | null;
};

export type Barrier = {
  id: string;
  patient_id?: string | null;
  type?: string | null;
  description?: string | null;
  status?: string | null;
  created_at?: string | null;
};

export type Feedback = {
  id?: string;
  user_id?: string | null;
  page?: string | null;
  sentiment?: string | null;
  message?: string | null;
  created_at?: string | null;
};

export type ExerciseAdherenceLog = {
  id: string;
  patient_id?: string | null;
  home_program_exercise_id?: string | null;
  completed?: boolean | null;
  pain_before?: number | null;
  pain_after?: number | null;
  notes?: string | null;
  created_at?: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile>;
      patients: Table<Patient>;
      episodes: Table<Episode>;
      goals: Table<Goal>;
      exercises: Table<Exercise>;
      home_programs: Table<HomeProgram>;
      home_program_exercises: Table<HomeProgramExercise>;
      exercise_adherence_logs: Table<ExerciseAdherenceLog>;
      daily_checkins: Table<DailyCheckin>;
      progress_metrics: Table<ProgressMetric>;
      clinical_decisions: Table<ClinicalDecision>;
      visit_notes: Table<VisitNote>;
      barriers: Table<Barrier>;
      feedback: Table<Feedback>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: never[];
};

export type ClinicianSnapshot = {
  profile: Profile | null;
  patients: Patient[];
  recentCheckins: DailyCheckin[];
  openDecisions: ClinicalDecision[];
};

export type PatientWorkspace = {
  patient: Patient | null;
  episode: Episode | null;
  goals: Goal[];
  checkins: DailyCheckin[];
  progressMetrics: ProgressMetric[];
  decision: ClinicalDecision | null;
  visitNote: VisitNote | null;
  barriers: Barrier[];
  program: HomeProgram | null;
  programExercises: HomeProgramExercise[];
};
