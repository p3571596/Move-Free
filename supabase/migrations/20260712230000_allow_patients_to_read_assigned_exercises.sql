-- Patients need read access to exercise instructions only when the exercise is
-- part of a home program attached to an episode they can access. Clinician and
-- admin access remains covered by the existing owner policy.
create policy exercises_select_assigned_to_patient
on public.exercises
for select
to authenticated
using (
  exists (
    select 1
    from public.home_program_exercises hpe
    join public.home_programs hp on hp.id = hpe.home_program_id
    where hpe.exercise_id = exercises.id
      and public.can_access_episode(hp.episode_id)
  )
);
