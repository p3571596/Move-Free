-- Clinical access is based on the treating relationship, never administrator status.
-- Keep privileged lookups private to avoid recursive RLS; expose no patient data.
create or replace function private.can_access_patient(target_patient_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists (
  select 1 from public.patients p where p.id=target_patient_id
  and (p.clinician_id=auth.uid() or p.patient_profile_id=auth.uid())
 );
$$;
create or replace function private.can_access_episode(target_episode_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists (
  select 1 from public.episodes e join public.patients p on p.id=e.patient_id
  where e.id=target_episode_id and (p.clinician_id=auth.uid() or p.patient_profile_id=auth.uid())
 );
$$;
revoke all on function private.can_access_patient(uuid), private.can_access_episode(uuid) from public, anon;
grant execute on function private.can_access_patient(uuid), private.can_access_episode(uuid) to authenticated;

-- Browser clients may edit contact details, but cannot change their authorization role.
-- Invitation claiming runs as its trusted function owner and can still create a patient profile.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (id, role, email, full_name, clinic_name) on public.profiles to authenticated;
grant update (email, full_name, clinic_name) on public.profiles to authenticated;
alter policy profiles_insert_own on public.profiles with check (
 id=(select auth.uid()) and role in ('patient','clinician')
);
alter policy profiles_select_own_or_admin on public.profiles using (id=(select auth.uid()));

alter policy patients_delete_clinician_owner on public.patients using (clinician_id=(select auth.uid()));
alter policy patients_update_clinician_owner on public.patients
 using (clinician_id=(select auth.uid())) with check (clinician_id=(select auth.uid()));
alter policy episodes_delete_clinician on public.episodes using (public.is_clinician_for_patient(patient_id));
alter policy episodes_insert_clinician on public.episodes with check (public.is_clinician_for_patient(patient_id));
alter policy episodes_update_clinician on public.episodes
 using (public.is_clinician_for_patient(patient_id)) with check (public.is_clinician_for_patient(patient_id));
alter policy clinical_decisions_write_clinician on public.clinical_decisions
 using (clinician_id=(select auth.uid()) and public.is_clinician_for_patient(patient_id))
 with check (clinician_id=(select auth.uid()) and public.is_clinician_for_patient(patient_id));
alter policy visit_notes_write_clinician on public.visit_notes
 using (clinician_id=(select auth.uid()) and public.is_clinician_for_patient(patient_id))
 with check (clinician_id=(select auth.uid()) and public.is_clinician_for_patient(patient_id));
alter policy goals_write_clinician on public.goals
 using (public.is_clinician_for_episode(episode_id)) with check (public.is_clinician_for_episode(episode_id));
alter policy progress_metrics_write_clinician on public.progress_metrics
 using (public.is_clinician_for_episode(episode_id)) with check (public.is_clinician_for_episode(episode_id));
alter policy home_programs_write_clinician on public.home_programs
 using (public.is_clinician_for_episode(episode_id)) with check (public.is_clinician_for_episode(episode_id));
alter policy home_program_exercises_write_clinician on public.home_program_exercises
 using (exists(select 1 from public.home_programs h where h.id=home_program_id and public.is_clinician_for_episode(h.episode_id)))
 with check (exists(select 1 from public.home_programs h where h.id=home_program_id and public.is_clinician_for_episode(h.episode_id)));
alter policy exercises_select_own_clinician on public.exercises using (clinician_id=(select auth.uid()));
alter policy exercises_write_own_clinician on public.exercises
 using (clinician_id=(select auth.uid())) with check (clinician_id=(select auth.uid()));

-- Founder analytics remain available through the aggregate-only RPC, not raw patient events.
drop policy analytics_events_select_admin on public.analytics_events;
create policy analytics_events_select_treating on public.analytics_events for select to authenticated
 using (public.is_clinician_for_patient(patient_id));
