-- Closed-loop patient pilot: richer exercise logs, repeatable daily check-ins,
-- idempotency, and ownership-safe inserts.

alter table public.exercise_adherence_logs
  add column if not exists session_id uuid,
  add column if not exists actual_sets integer check (actual_sets is null or actual_sets >= 0),
  add column if not exists actual_reps integer check (actual_reps is null or actual_reps >= 0),
  add column if not exists actual_duration_minutes numeric check (actual_duration_minutes is null or actual_duration_minutes >= 0),
  add column if not exists client_submission_id uuid;

alter table public.daily_checkins
  drop constraint if exists daily_checkins_patient_id_checkin_date_key;

alter table public.daily_checkins
  add column if not exists symptom_direction text
    check (symptom_direction is null or symptom_direction in ('improving', 'unchanged', 'worsening')),
  add column if not exists client_submission_id uuid;

create unique index if not exists exercise_adherence_logs_client_submission_uidx
  on public.exercise_adherence_logs (patient_id, client_submission_id)
  where client_submission_id is not null;

create unique index if not exists exercise_adherence_logs_session_exercise_uidx
  on public.exercise_adherence_logs (patient_id, session_id, home_program_exercise_id)
  where session_id is not null and home_program_exercise_id is not null;

create unique index if not exists daily_checkins_client_submission_uidx
  on public.daily_checkins (patient_id, client_submission_id)
  where client_submission_id is not null;

create index if not exists exercise_adherence_logs_patient_performed_idx
  on public.exercise_adherence_logs (patient_id, performed_at desc);

create index if not exists daily_checkins_patient_created_idx
  on public.daily_checkins (patient_id, created_at desc);

drop policy if exists exercise_adherence_logs_insert_patient_or_clinician
  on public.exercise_adherence_logs;

create policy exercise_adherence_logs_insert_patient_or_clinician
  on public.exercise_adherence_logs
  for insert
  to authenticated
  with check (
    public.can_access_patient(patient_id)
    and (
      home_program_id is null
      or exists (
        select 1
        from public.home_programs hp
        join public.episodes e on e.id = hp.episode_id
        where hp.id = home_program_id
          and e.patient_id = exercise_adherence_logs.patient_id
      )
    )
    and (
      home_program_exercise_id is null
      or exists (
        select 1
        from public.home_program_exercises hpe
        join public.home_programs hp on hp.id = hpe.home_program_id
        join public.episodes e on e.id = hp.episode_id
        where hpe.id = home_program_exercise_id
          and e.patient_id = exercise_adherence_logs.patient_id
          and (exercise_adherence_logs.home_program_id is null or hp.id = exercise_adherence_logs.home_program_id)
      )
    )
  );

drop policy if exists daily_checkins_insert_patient_or_clinician
  on public.daily_checkins;

create policy daily_checkins_insert_patient_or_clinician
  on public.daily_checkins
  for insert
  to authenticated
  with check (
    public.can_access_patient(patient_id)
    and (
      episode_id is null
      or exists (
        select 1
        from public.episodes e
        where e.id = episode_id
          and e.patient_id = daily_checkins.patient_id
      )
    )
  );
