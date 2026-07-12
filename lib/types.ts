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
  patient_profile_id?: string | null;
  patient_invite_token_hash?: string | null;
  patient_invite_expires_at?: string | null;
  clinician_id?: string | null;
  display_name?: string | null;
  name?: string | null;
  full_name?: string | null;
  date_of_birth?: string | null;
  diagnosis?: string | null;
  primary_complaint?: string | null;
  current_focus?: string | null;
  goal?: string | null;
  primary_outcome?: string | null;
  baseline_value?: string | null;
  current_value?: string | null;
  target_value?: string | null;
  progress_percent?: number | null;
  status?: string | null;
  created_at?: string | null;
};

export type Episode = {
  id: string;
  patient_id?: string | null;
  clinician_id?: string | null;
  title?: string | null;
  diagnosis?: string | null;
  body_region?: string | null;
  stage?: string | null;
  status?: string | null;
  clinical_summary?: string | null;
  start_date?: string | null;
  started_at?: string | null;
  updated_at?: string | null;
};

export type Goal = {
  id: string;
  patient_id?: string | null;
  episode_id?: string | null;
  title?: string | null;
  baseline_value?: number | string | null;
  target_value?: number | string | null;
  current_value?: number | string | null;
  progress_percent?: number | null;
  unit?: string | null;
  due_date?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type Exercise = {
  id: string;
  clinician_id?: string | null;
  name?: string | null;
  body_region?: string | null;
  category?: string | null;
  tags?: string[] | null;
  normalized_name?: string | null;
  difficulty?: string | null;
  description?: string | null;
  instructions?: string | null;
  clinical_purpose?: string | null;
  patient_instructions?: string | null;
  default_dosage?: string | null;
  video_url?: string | null;
  is_active?: boolean | null;
};

export type HomeProgram = {
  id: string;
  patient_id?: string | null;
  episode_id?: string | null;
  clinician_id?: string | null;
  title?: string | null;
  name?: string | null;
  patient_explanation?: string | null;
  status?: string | null;
  start_date?: string | null;
  assigned_at?: string | null;
  end_date?: string | null;
  notes?: string | null;
  updated_at?: string | null;
};

export type HomeProgramExercise = {
  id: string;
  home_program_id?: string | null;
  exercise_id?: string | null;
  sets?: number | null;
  reps?: number | null;
  dosage_sets?: string | null;
  dosage_reps?: string | null;
  frequency?: string | null;
  notes?: string | null;
  category?: string | null;
  sort_order?: number | null;
  exercise?: Exercise | null;
};

export type DailyCheckin = {
  id: string;
  patient_id?: string | null;
  pain_score?: number | null;
  episode_id?: string | null;
  pain_location?: string | null;
  symptom_behavior?: string | null;
  activity_context?: string | null;
  aggravating_factors?: string | null;
  easing_factors?: string | null;
  energy_score?: number | null;
  confidence_score?: number | null;
  notes?: string | null;
  patient_comment?: string | null;
  checkin_date?: string | null;
  created_at?: string | null;
};

export type ProgressMetric = {
  id: string;
  patient_id?: string | null;
  episode_id?: string | null;
  metric_name?: string | null;
  value?: number | null;
  metric_value?: number | null;
  metric_text_value?: string | null;
  unit?: string | null;
  recorded_at?: string | null;
  measured_at?: string | null;
};

export type ClinicalDecision = {
  id: string;
  patient_id?: string | null;
  episode_id?: string | null;
  decision?: string | null;
  decision_type?: string | null;
  rationale?: string | null;
  action_items?: string | null;
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
  home_program_id?: string | null;
  home_program_exercise_id?: string | null;
  completed?: boolean | null;
  completion_status?: string | null;
  difficulty?: string | null;
  performed_at?: string | null;
  pain_before?: number | null;
  pain_during?: number | null;
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
    Functions: {
      create_patient_invite: { Args: { p_patient_id: string }; Returns: string };
      claim_patient_invite: { Args: { p_token: string }; Returns: string };
    };
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
  episodes: Episode[];
  goals: Goal[];
  programs: HomeProgram[];
  adherenceLogs: ExerciseAdherenceLog[];
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
  adherenceLogs: ExerciseAdherenceLog[];
};
