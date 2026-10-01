-- Additive Stage 1 lifecycle. Patient identity and episode identity remain separate.
-- New episodes are deliberately not exposed until legacy patient-wide data is migrated.
create table public.case_lifecycle_events (
 id uuid primary key default gen_random_uuid(),
 patient_id uuid not null references public.patients(id),
 episode_id uuid not null references public.episodes(id),
 clinician_id uuid not null references auth.users(id),
 action text not null check (action in ('discharge','reactivate')),
 reason text not null,
 effective_date date not null,
 program_plan text not null check (program_plan in ('independent','ended','review_required')),
 note text not null default '' check (length(note)<=2000),
 snapshot jsonb not null,
 created_at timestamptz not null default now()
);
create index case_lifecycle_patient_date on public.case_lifecycle_events(patient_id,created_at desc);
create index case_lifecycle_episode on public.case_lifecycle_events(episode_id);
create index case_lifecycle_clinician on public.case_lifecycle_events(clinician_id);
alter table public.case_lifecycle_events enable row level security;
revoke all on public.case_lifecycle_events from public, anon, authenticated;
grant select,insert on public.case_lifecycle_events to authenticated;
create policy lifecycle_read_treating on public.case_lifecycle_events for select to authenticated
 using (public.is_clinician_for_patient(patient_id));
create policy lifecycle_insert_treating on public.case_lifecycle_events for insert to authenticated
 with check (clinician_id=(select auth.uid()) and public.is_clinician_for_patient(patient_id)
 and exists(select 1 from public.episodes e where e.id=episode_id and e.patient_id=case_lifecycle_events.patient_id));

create function public.transition_case(p_patient_id uuid,p_episode_id uuid,p_action text,p_reason text,p_date date,p_program_plan text,p_note text default '')
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_patient public.patients; v_episode public.episodes; v_snapshot jsonb; v_event uuid;
begin
 if auth.uid() is null or not public.is_clinician_for_patient(p_patient_id) then raise exception 'Treating clinician required'; end if;
 select * into v_patient from public.patients where id=p_patient_id for update;
 select * into v_episode from public.episodes where id=p_episode_id and patient_id=p_patient_id for update;
 if v_patient.id is null or v_episode.id is null then raise exception 'Case unavailable'; end if;
 if p_action is null or p_action not in ('discharge','reactivate') or p_date is null or p_date>current_date or p_date<coalesce(v_episode.start_date,p_date) or length(coalesce(p_note,''))>2000 then raise exception 'Invalid case transition'; end if;
 if exists(select 1 from public.episodes where patient_id=p_patient_id and id<>p_episode_id and status='active') then raise exception 'Another active episode exists; review the care record first'; end if;
 if p_action='discharge' then
  if v_patient.status='discharged' or v_episode.status is distinct from 'active' then raise exception 'Case changed; refresh before discharging'; end if;
  if p_reason is null or p_reason not in ('Goals met','Independent program','Referred elsewhere','Lost to follow-up','Patient request','Other') or p_program_plan is null or p_program_plan not in ('independent','ended') then raise exception 'Discharge reason and program plan required'; end if;
 else
  if v_patient.status is distinct from 'discharged' or v_episode.status is distinct from 'discharged' then raise exception 'Case changed; refresh before reactivating'; end if;
  if nullif(trim(p_reason),'') is null or length(p_reason)>500 or p_program_plan is distinct from 'review_required' then raise exception 'Reactivation reason required'; end if;
 end if;
 select jsonb_build_object(
  'episode',to_jsonb(v_episode),
  'patient_goal',jsonb_build_object('title',v_patient.goal,'baseline',v_patient.baseline_value,'current',v_patient.current_value,'target',v_patient.target_value),
  'goals',coalesce((select jsonb_agg(to_jsonb(g)) from public.goals g where episode_id=p_episode_id),'[]'::jsonb),
  'programs',coalesce((select jsonb_agg(to_jsonb(h)||jsonb_build_object('exercises',coalesce((select jsonb_agg(to_jsonb(x)) from public.home_program_exercises x where x.home_program_id=h.id),'[]'::jsonb))) from public.home_programs h where episode_id=p_episode_id),'[]'::jsonb)
 ) into v_snapshot;
 insert into public.case_lifecycle_events(patient_id,episode_id,clinician_id,action,reason,effective_date,program_plan,note,snapshot)
 values(p_patient_id,p_episode_id,auth.uid(),p_action,p_reason,p_date,p_program_plan,coalesce(p_note,''),v_snapshot) returning id into v_event;
 update public.episodes set status=case when p_action='discharge' then 'discharged' else 'active' end where id=p_episode_id;
 update public.patients set status=case when p_action='discharge' then 'discharged' else 'needs_review' end where id=p_patient_id;
 if p_action='discharge' and p_program_plan='ended' then
  update public.home_programs set status='archived' where episode_id=p_episode_id and status in ('active','draft');
 end if;
 return v_event;
end $$;
revoke all on function public.transition_case(uuid,uuid,text,text,date,text,text) from public,anon;
grant execute on function public.transition_case(uuid,uuid,text,text,date,text,text) to authenticated;
