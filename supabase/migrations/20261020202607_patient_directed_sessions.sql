begin;
-- Additive backfill: existing programs stay flexible; historical performance/dose stays unknown.
alter table public.home_programs add column guided_order boolean not null default false;
alter table public.home_program_exercises add column prerequisite_ids uuid[] not null default '{}';
alter table public.exercise_adherence_logs
 add column actual_dose jsonb,
 add column activity_source text not null default 'legacy_report' check(activity_source in ('legacy_report','individual_confirmation','explicit_nonperformance')),
 add constraint actual_dose_valid check(actual_dose is null or (public.valid_exercise_prescription(actual_dose) and not actual_dose ? 'frequency'));

create table public.patient_exercise_sessions (
 id uuid primary key, patient_id uuid not null references public.patients(id),
 home_program_id uuid not null references public.home_programs(id),
 program_version timestamptz not null,
 selection_mode text not null check(selection_mode in ('full','individual','sections')),
 selected_ids uuid[] not null check(cardinality(selected_ids) between 1 and 100),
 current_exercise_id uuid, state text not null default 'active' check(state in ('active','closed')),
 created_at timestamptz not null default now()
);
alter table public.patient_exercise_sessions enable row level security;
revoke all on public.patient_exercise_sessions from public,anon,authenticated;
grant select,insert on public.patient_exercise_sessions to authenticated;
grant update(current_exercise_id,state) on public.patient_exercise_sessions to authenticated;
create policy session_read on public.patient_exercise_sessions for select to authenticated using(public.can_access_patient(patient_id));
create policy session_start on public.patient_exercise_sessions for insert to authenticated with check(exists(select 1 from public.patients p where p.id=patient_id and p.patient_profile_id=(select auth.uid())));
create policy session_resume on public.patient_exercise_sessions for update to authenticated
 using(exists(select 1 from public.patients p where p.id=patient_id and p.patient_profile_id=(select auth.uid())))
 with check(exists(select 1 from public.patients p where p.id=patient_id and p.patient_profile_id=(select auth.uid())));
create index patient_exercise_sessions_resume on public.patient_exercise_sessions(patient_id,home_program_id,created_at desc) where state='active';

create function private.validate_patient_session() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and ((old.state='closed' and (new.state<>'closed' or new.current_exercise_id is distinct from old.current_exercise_id)) or (new.id,new.patient_id,new.home_program_id,new.selection_mode,new.selected_ids,new.created_at,new.program_version) is distinct from
  (old.id,old.patient_id,old.home_program_id,old.selection_mode,old.selected_ids,old.created_at,old.program_version)) then raise exception 'Session selection is immutable'; end if;
 if tg_op='UPDATE' and new.state='closed' then return new; end if;
 perform 1 from public.home_programs where id=new.home_program_id for share;
 if not exists(select 1 from public.home_programs h join public.episodes e on e.id=h.episode_id
  join public.patients p on p.id=e.patient_id where h.id=new.home_program_id and p.id=new.patient_id
  and p.patient_profile_id=auth.uid() and h.status='active' and e.status='active' and p.status in ('active','needs_review')) then
  raise exception 'Active assigned program required'; end if;
 if tg_op='INSERT' and not exists(select 1 from public.home_programs where id=new.home_program_id and updated_at=new.program_version) then raise exception 'Your program changed. Reload before starting a new session'; end if;
 if exists(select 1 from unnest(new.selected_ids) x where not exists(select 1 from public.home_program_exercises h where h.id=x and h.home_program_id=new.home_program_id))
 or cardinality(new.selected_ids)<>(select count(distinct x) from unnest(new.selected_ids) x)
 or (new.current_exercise_id is not null and not new.current_exercise_id=any(new.selected_ids)) then raise exception 'Invalid exercise selection'; end if;
 return new;
end $$;
revoke all on function private.validate_patient_session() from public,anon,authenticated;
create trigger validate_patient_session before insert or update on public.patient_exercise_sessions for each row execute function private.validate_patient_session();

create function private.protect_exercise_prerequisite() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.home_program_exercises h where old.id=any(h.prerequisite_ids)) then raise exception 'Remove this exercise from prerequisites before removing it from the program'; end if;
 return old;
end $$;
revoke all on function private.protect_exercise_prerequisite() from public,anon,authenticated;
create trigger protect_exercise_prerequisite before delete on public.home_program_exercises for each row execute function private.protect_exercise_prerequisite();

-- Dependencies must point to earlier assignments, preventing cycles while allowing flexible order elsewhere.
create function private.validate_exercise_prerequisites() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from unnest(new.prerequisite_ids) x where not exists(select 1 from public.home_program_exercises h where h.id=x and h.home_program_id=new.home_program_id and (coalesce(h.sort_order,0),h.id)<(coalesce(new.sort_order,0),new.id))) then raise exception 'Prerequisites must be earlier exercises in this program'; end if;
 -- Reordering a prerequisite cannot invalidate the reverse edge.
 if exists(select 1 from public.home_program_exercises h where new.id=any(h.prerequisite_ids) and h.id<>new.id and (coalesce(new.sort_order,0),new.id)>=(coalesce(h.sort_order,0),h.id)) then raise exception 'Reorder or remove dependent prerequisites first'; end if;
 return new;
end $$;
revoke all on function private.validate_exercise_prerequisites() from public,anon,authenticated;
create trigger validate_exercise_prerequisites before insert or update on public.home_program_exercises for each row execute function private.validate_exercise_prerequisites();

create function private.protect_confirmed_activity() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.activity_source in ('individual_confirmation','explicit_nonperformance') then raise exception 'Confirmed activity is immutable'; end if;
 return old;
end $$;
revoke all on function private.protect_confirmed_activity() from public,anon,authenticated;
create trigger protect_confirmed_activity before delete on public.exercise_adherence_logs for each row execute function private.protect_confirmed_activity();

create function private.validate_individual_confirmation() returns trigger language plpgsql security invoker set search_path='' as $$
declare s public.patient_exercise_sessions; h public.home_program_exercises; guided boolean;
begin
 if tg_op='UPDATE' and old.activity_source in ('individual_confirmation','explicit_nonperformance') then raise exception 'Confirmed activity is immutable'; end if;
 select * into h from public.home_program_exercises where id=new.home_program_exercise_id;
 select guided_order into guided from public.home_programs where id=h.home_program_id;
 if new.activity_source in ('individual_confirmation','explicit_nonperformance') then
  select * into s from public.patient_exercise_sessions where id=new.session_id for update;
  if not exists(select 1 from public.home_programs p join public.episodes e on e.id=p.episode_id join public.patients pt on pt.id=e.patient_id where p.id=new.home_program_id and pt.id=new.patient_id and pt.patient_profile_id=auth.uid() and p.status='active' and e.status='active' and pt.status in ('active','needs_review')) then raise exception 'Active patient assignment required'; end if;
  if not found or s.patient_id<>new.patient_id or s.home_program_id<>new.home_program_id or not h.id=any(s.selected_ids)
   or s.state<>'active' or new.completion_status<>(case when new.activity_source='explicit_nonperformance' then 'skipped' else 'completed' end) then raise exception 'Active session and individual confirmation required'; end if;
 end if;
 if (guided or cardinality(h.prerequisite_ids)>0) and new.completion_status in ('completed','partial') then
  if exists(select 1 from public.home_program_exercises r where r.home_program_id=h.home_program_id
   and ((guided and (coalesce(r.sort_order,0),r.id)<(coalesce(h.sort_order,0),h.id)) or r.id=any(h.prerequisite_ids))
   and not exists(select 1 from public.exercise_adherence_logs l where l.patient_id=new.patient_id and l.session_id=new.session_id
    and l.home_program_exercise_id=r.id and l.completion_status='completed')) then raise exception 'Record required exercises first'; end if;
 end if;
 return new;
end $$;
revoke all on function private.validate_individual_confirmation() from public,anon,authenticated;
create trigger validate_individual_confirmation before insert or update on public.exercise_adherence_logs for each row execute function private.validate_individual_confirmation();

-- One transaction per Done. Session lock serializes retries; the existing session/exercise unique index is retained.
create function public.confirm_patient_exercise(p_session uuid,p_exercise uuid,p_feedback jsonb default '{}') returns uuid
language plpgsql security invoker set search_path='' as $$
declare s public.patient_exercise_sessions; existing uuid; result uuid;
begin
 select * into s from public.patient_exercise_sessions where id=p_session for update;
 if not found or not exists(select 1 from public.patients p where p.id=s.patient_id and p.patient_profile_id=auth.uid()) then raise exception 'Patient session required'; end if;
 select id into existing from public.exercise_adherence_logs where patient_id=s.patient_id and session_id=s.id and home_program_exercise_id=p_exercise;
 if existing is not null then return existing; end if;
 perform 1 from public.home_programs where id=s.home_program_id for share;
 if not exists(select 1 from public.home_programs where id=s.home_program_id and updated_at=s.program_version) then raise exception 'Your program changed. Finish for now, reload, and start a new session'; end if;
 if s.state<>'active' then raise exception 'Session is closed'; end if;
 if jsonb_typeof(p_feedback)<>'object' or length(p_feedback::text)>10000 then raise exception 'Invalid exercise feedback'; end if;
 if p_feedback->'nonperformance'='true'::jsonb then p_feedback:=jsonb_build_object('nonperformance',true,'notes',p_feedback->>'notes'); end if;
 insert into public.exercise_adherence_logs(patient_id,home_program_id,home_program_exercise_id,session_id,client_submission_id,
  completion_status,performed_at,activity_source,actual_dose,actual_sets,actual_reps,actual_duration_minutes,
  difficulty,difficulty_reason,difficulty_explanation,pain_during,symptom_response,symptom_recovery,notes)
 values(s.patient_id,s.home_program_id,p_exercise,s.id,gen_random_uuid(),case when p_feedback->'nonperformance'='true'::jsonb then 'skipped' else 'completed' end,clock_timestamp(),case when p_feedback->'nonperformance'='true'::jsonb then 'explicit_nonperformance' else 'individual_confirmation' end,
  p_feedback->'actualDose',(p_feedback#>>'{actualDose,sets,value}')::integer,(p_feedback#>>'{actualDose,reps,value}')::integer,
  (p_feedback#>>'{actualDose,duration,value}')::numeric / case when p_feedback#>>'{actualDose,duration,unit}'='sec' then 60 else 1 end,
  p_feedback->>'difficulty',p_feedback->>'difficultyReason',p_feedback->>'difficultyExplanation',(p_feedback->>'painDuring')::numeric,
  p_feedback->>'symptomResponse',p_feedback->>'symptomRecovery',nullif(trim(p_feedback->>'notes'),'')) returning id into result;
 return result;
end $$;
revoke all on function public.confirm_patient_exercise(uuid,uuid,jsonb) from public,anon;
grant execute on function public.confirm_patient_exercise(uuid,uuid,jsonb) to authenticated;
comment on column public.exercise_adherence_logs.activity_source is 'Individual Done confirms patient-reported activity, not full prescribed dose or actual adherence. Missing records are unknown performance. Historical explicit skipped reports are retained.';

create function public.set_program_sequence(p_program uuid,p_expected timestamptz,p_guided boolean,p_dependencies jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare h public.home_programs; k text; v jsonb;
begin
 select * into h from public.home_programs where id=p_program for update;
 if not found or not public.is_clinician_for_episode(h.episode_id) then raise exception 'Treating clinician required'; end if;
 if h.updated_at is distinct from p_expected then raise exception 'Program changed; reload before saving'; end if;
 if jsonb_typeof(p_dependencies)<>'object' then raise exception 'Invalid prerequisites'; end if;
 update public.home_program_exercises set prerequisite_ids='{}' where home_program_id=p_program;
 for k,v in select * from jsonb_each(p_dependencies) loop
  if jsonb_typeof(v)<>'array' or not exists(select 1 from public.home_program_exercises where id=k::uuid and home_program_id=p_program) then raise exception 'Invalid prerequisite assignment'; end if;
  update public.home_program_exercises set prerequisite_ids=array(select jsonb_array_elements_text(v)::uuid) where id=k::uuid and home_program_id=p_program;
 end loop;
 update public.home_programs set guided_order=p_guided,updated_at=clock_timestamp() where id=p_program;
end $$;
revoke all on function public.set_program_sequence(uuid,timestamptz,boolean,jsonb) from public,anon;
grant execute on function public.set_program_sequence(uuid,timestamptz,boolean,jsonb) to authenticated;
commit;
