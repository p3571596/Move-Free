begin;
-- Old {value,unit} exact values stay valid. Ranges never project a guessed exact dose.
create or replace function public.valid_exercise_prescription(p jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare k text; e jsonb; v numeric; u text; units text[]; field text; fields text[];
begin
 if p is null or jsonb_typeof(p)<>'object' then return false; end if;
 for k,e in select * from jsonb_each(p) loop
  units:=case k when 'sets' then array['sets'] when 'reps' then array['reps'] when 'hold' then array['sec','min'] when 'rest' then array['sec','min'] when 'duration' then array['sec','min'] when 'load' then array['kg','lb','%1RM','level'] when 'frequency' then array['sessions/day','sessions/week','days/week'] when 'intensity' then array['RPE/10','%HRmax'] when 'distance' then array['m','ft','km','mi'] end;
  if units is null or jsonb_typeof(e)<>'object' or not(e?'value' and e?'unit') or jsonb_typeof(e->'unit')<>'string' then return false; end if;
  u:=e->>'unit'; if not u=any(units) then return false; end if;
  if e?'mode' and (jsonb_typeof(e->'mode')<>'string' or e->>'mode' not in ('exact','range')) then return false; end if;
  if e->>'mode'='range' then
   if e->'value'<>'null'::jsonb or jsonb_typeof(e->'min') is distinct from 'number' or jsonb_typeof(e->'max') is distinct from 'number' or (e-'value'-'unit'-'mode'-'min'-'max'-'target')<>'{}'::jsonb then return false; end if;
   fields:=array['min','max','target'];
   if (e->>'min')::numeric>(e->>'max')::numeric or (e?'target' and e->'target'<>'null'::jsonb and ((e->>'target')::numeric<(e->>'min')::numeric or (e->>'target')::numeric>(e->>'max')::numeric)) then return false; end if;
  else
   if (e-'value'-'unit'-'mode')<>'{}'::jsonb then return false; end if;
   fields:=array['value'];
  end if;
  foreach field in array fields loop
   if e?field and e->field<>'null'::jsonb then
    if jsonb_typeof(e->field)<>'number' then return false; end if; v:=(e->>field)::numeric;
    if v<0 or v>100000 or (k in ('sets','reps','frequency') and v<>trunc(v)) or (u='RPE/10' and v>10) or (u in ('%HRmax','%1RM') and v>100) or (u='days/week' and v>7) then return false; end if;
   end if;
  end loop;
 end loop; return true;
exception when others then return false;
end $$;
create function public.valid_actual_exercise_dose(p jsonb) returns boolean language sql immutable security invoker set search_path='' as $$
 select public.valid_exercise_prescription(p) and not p?'frequency' and not jsonb_path_exists(p,'$.* ? (@.mode == "range")')
$$;
revoke all on function public.valid_actual_exercise_dose(jsonb) from public,anon;
grant execute on function public.valid_actual_exercise_dose(jsonb) to authenticated;
alter table public.exercise_adherence_logs drop constraint actual_dose_valid;
alter table public.exercise_adherence_logs add constraint actual_dose_valid check(actual_dose is null or public.valid_actual_exercise_dose(actual_dose));
alter table public.exercise_adherence_logs add column actual_reps_by_set integer[], add column scheduled_date date, add column day_template_id text, add column progression_revision_id uuid;
create function public.valid_actual_reps(p integer[]) returns boolean language sql immutable security invoker set search_path='' as $$select cardinality(p) between 1 and 100 and not exists(select 1 from unnest(p) n where n is null or n<0 or n>100000)$$;
revoke all on function public.valid_actual_reps(integer[]) from public,anon;
grant execute on function public.valid_actual_reps(integer[]) to authenticated;
alter table public.exercise_adherence_logs add constraint per_set_reps_valid check(actual_reps_by_set is null or public.valid_actual_reps(actual_reps_by_set));

create table public.program_progression_revisions(
 id uuid primary key default gen_random_uuid(), home_program_id uuid not null references public.home_programs(id),
 document jsonb, approved boolean not null, source_program_version timestamptz not null,
 recorded_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
alter table public.program_progression_revisions enable row level security;
revoke all on public.program_progression_revisions from public,anon,authenticated;
grant select,insert on public.program_progression_revisions to authenticated;
create policy progression_read on public.program_progression_revisions for select to authenticated using(exists(
 select 1 from public.home_programs h join public.episodes e on e.id=h.episode_id where h.id=home_program_id and
 (public.is_clinician_for_episode(e.id) or (approved and public.can_access_patient(e.patient_id)))));
create policy progression_insert on public.program_progression_revisions for insert to authenticated with check(recorded_by=(select auth.uid()) and exists(select 1 from public.home_programs h where h.id=home_program_id and public.is_clinician_for_episode(h.episode_id)));
create index progression_history on public.program_progression_revisions(home_program_id,created_at desc);
alter table public.home_programs add column progression_revision_id uuid references public.program_progression_revisions(id), add column progression_plan jsonb;
alter table public.patient_exercise_sessions add column progression_revision_id uuid references public.program_progression_revisions(id), add column day_template_id text, add column scheduled_date date, add column timezone text not null default 'UTC';

create function private.validate_progression_document(p jsonb, program uuid) returns void language plpgsql security invoker set search_path='' as $$
declare d jsonb; w jsonb; e jsonb; ph jsonb; tid text; aid text; dose jsonb; seen text[]; prior text[]; day_ids text[]:='{}'; phase_ids text[]:='{}'; ix integer;
begin
 if p is null then return; end if;
 if jsonb_typeof(p)<>'object' or length(p::text)>500000 or (p-'startDate'-'activeWeek'-'phases'-'weeks'-'templates')<>'{}'::jsonb
 or coalesce(p->>'startDate','')!~'^\d{4}-\d{2}-\d{2}$' or (p->>'startDate')::date::text<>p->>'startDate'
 or jsonb_typeof(p->'activeWeek') is distinct from 'number' or (p->>'activeWeek')::numeric<>trunc((p->>'activeWeek')::numeric)
 or jsonb_typeof(p->'phases') is distinct from 'array' or jsonb_typeof(p->'weeks') is distinct from 'array' or jsonb_typeof(p->'templates') is distinct from 'array'
 then raise exception 'Invalid progression plan'; end if;
 if jsonb_array_length(p->'weeks') not between 1 and 104 or (p->>'activeWeek')::integer not between 0 and jsonb_array_length(p->'weeks')-1 or jsonb_array_length(p->'templates') not between 1 and 30 or jsonb_array_length(p->'phases')>30 then raise exception 'Invalid plan size or active week'; end if;
 for ph in select value from jsonb_array_elements(p->'phases') loop
  if nullif(trim(ph->>'id'),'') is null or nullif(trim(ph->>'name'),'') is null or ph->>'id'=any(phase_ids) then raise exception 'Invalid phase'; end if;
  if ph?'durationWeeks' and (jsonb_typeof(ph->'durationWeeks')<>'number' or (ph->>'durationWeeks')::numeric<>trunc((ph->>'durationWeeks')::numeric) or (ph->>'durationWeeks')::numeric not between 1 and 104) then raise exception 'Invalid phase duration'; end if;
  if ph?'startDate' and nullif(ph->>'startDate','') is not null then perform (ph->>'startDate')::date; end if;
  phase_ids:=array_append(phase_ids,ph->>'id');
 end loop;
 for d in select value from jsonb_array_elements(p->'templates') loop
  if nullif(trim(d->>'id'),'') is null or nullif(trim(d->>'name'),'') is null or d->>'id'=any(day_ids) or jsonb_typeof(d->'weekdays') is distinct from 'array' or jsonb_typeof(d->'exercises') is distinct from 'array' or jsonb_typeof(d->'scheduledOnly') is distinct from 'boolean' or jsonb_typeof(d->'minRestHours') is distinct from 'number' then raise exception 'Invalid day template'; end if;
  day_ids:=array_append(day_ids,d->>'id');
  if jsonb_array_length(d->'exercises') not between 1 and 100 or (d->>'minRestHours')::numeric not between 0 and 720 then raise exception 'Invalid day exercise count or recovery spacing'; end if;
  if exists(select 1 from jsonb_array_elements(d->'weekdays') n where jsonb_typeof(n)<>'number' or n::text::numeric not between 0 and 6 or n::text::numeric<>trunc(n::text::numeric)) or jsonb_array_length(d->'weekdays')<>(select count(distinct n) from jsonb_array_elements(d->'weekdays') n) then raise exception 'Invalid weekdays'; end if;
  if d?'weeklyTarget' and (not public.valid_exercise_prescription(jsonb_build_object('frequency',d->'weeklyTarget')) or d#>>'{weeklyTarget,unit}' not in ('days/week','sessions/week')) then raise exception 'Invalid weekly target'; end if;
  if exists(select 1 from public.home_programs where id=program and guided_order) and
   array(select x->>'assignmentId' from jsonb_array_elements(d->'exercises') x) is distinct from array(select id::text from public.home_program_exercises where home_program_id=program order by coalesce(sort_order,0),id) then raise exception 'Full guided order requires every exercise in original order in each day'; end if;
  prior:='{}';
  for e in select value from jsonb_array_elements(d->'exercises') loop
   if e->>'assignmentId'=any(prior) or not exists(select 1 from public.home_program_exercises h where h.id=(e->>'assignmentId')::uuid and h.home_program_id=program) or not public.valid_exercise_prescription(e->'prescription') or jsonb_typeof(e->'prerequisiteIds') is distinct from 'array' then raise exception 'Invalid template prescription or assignment'; end if;
   if exists(select 1 from jsonb_array_elements_text(e->'prerequisiteIds') x where not x=any(prior)) then raise exception 'Template prerequisites must be earlier exercises'; end if;
   -- Preserve base prerequisites. They must be present earlier in every containing day.
   if exists(select 1 from public.home_program_exercises h, unnest(h.prerequisite_ids) x where h.id=(e->>'assignmentId')::uuid and not x::text=any(prior)) then raise exception 'Include the required base prerequisites earlier in this day'; end if;
   prior:=array_append(prior,e->>'assignmentId');
  end loop;
 end loop;
 for w in select value from jsonb_array_elements(p->'weeks') loop
  if nullif(trim(w->>'name'),'') is null or jsonb_typeof(w->'recovery') is distinct from 'boolean' or jsonb_typeof(w->'templateIds') is distinct from 'array' or jsonb_typeof(w->'overrides') is distinct from 'object' then raise exception 'Invalid week'; end if;
  if jsonb_array_length(w->'templateIds')<1 or exists(select 1 from jsonb_array_elements_text(w->'templateIds') x where not x=any(day_ids)) or jsonb_array_length(w->'templateIds')<>(select count(distinct x) from jsonb_array_elements_text(w->'templateIds') x) or (nullif(w->>'phaseId','') is not null and not w->>'phaseId'=any(phase_ids)) then raise exception 'Invalid week templates or phase'; end if;
  for tid,d in select * from jsonb_each(w->'overrides') loop
   if not (w->'templateIds')?tid then raise exception 'Override must reference a day in this week'; end if;
   for aid,dose in select * from jsonb_each(d) loop
    if not exists(select 1 from jsonb_array_elements(p->'templates') t,jsonb_array_elements(t->'exercises') x where t->>'id'=tid and x->>'assignmentId'=aid) or not public.valid_exercise_prescription(dose) then raise exception 'Invalid weekly dose'; end if;
   end loop;
  end loop;
 end loop;
end $$;
revoke all on function private.validate_progression_document(jsonb,uuid) from public,anon;
grant execute on function private.validate_progression_document(jsonb,uuid) to authenticated;

create function private.validate_progression_revision() returns trigger language plpgsql security invoker set search_path='' as $$
declare h public.home_programs;
begin
 if tg_op<>'INSERT' then raise exception 'Progression history is immutable'; end if;
 select * into h from public.home_programs where id=new.home_program_id for update;
 if not found or not public.is_clinician_for_episode(h.episode_id) or h.status not in ('active','draft') or not exists(select 1 from public.episodes e join public.patients p on p.id=e.patient_id where e.id=h.episode_id and e.status='active' and p.status in ('active','needs_review')) then raise exception 'Active treating clinician required'; end if;
 if h.updated_at is distinct from new.source_program_version then raise exception 'Program changed; reload before reviewing'; end if;
 perform private.validate_progression_document(new.document,h.id);
 new.recorded_by:=auth.uid();new.created_at:=clock_timestamp();return new;
end $$;
revoke all on function private.validate_progression_revision() from public,anon,authenticated;
create trigger validate_progression_revision before insert or update or delete on public.program_progression_revisions for each row execute function private.validate_progression_revision();
create function private.protect_published_progression() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (new.progression_revision_id,new.progression_plan) is distinct from (old.progression_revision_id,old.progression_plan) then
  if not exists(select 1 from public.program_progression_revisions r where r.id=new.progression_revision_id and r.home_program_id=new.id and r.approved and r.document is not distinct from new.progression_plan and r.source_program_version=old.updated_at and r.recorded_by=auth.uid()) then raise exception 'Clinician-reviewed progression revision required'; end if;
 end if; return new;
end $$;
revoke all on function private.protect_published_progression() from public,anon,authenticated;
create trigger protect_published_progression before update on public.home_programs for each row execute function private.protect_published_progression();
create function public.save_progression_plan(p_program uuid,p_expected timestamptz,p_plan jsonb,p_approve boolean) returns uuid language plpgsql security invoker set search_path='' as $$
declare revision uuid;
begin
 if p_approve is null then raise exception 'Choose draft or clinician approval'; end if;
 insert into public.program_progression_revisions(home_program_id,document,approved,source_program_version,recorded_by) values(p_program,p_plan,p_approve,p_expected,auth.uid()) returning id into revision;
 if p_approve then update public.home_programs set progression_revision_id=revision,progression_plan=p_plan,updated_at=clock_timestamp() where id=p_program; end if;
 return revision;
end $$;
revoke all on function public.save_progression_plan(uuid,timestamptz,jsonb,boolean) from public,anon;
grant execute on function public.save_progression_plan(uuid,timestamptz,jsonb,boolean) to authenticated;
-- Resolve only the clinician-approved active week; advancing weeks is always a new approval.
create function private.progression_day(p_session public.patient_exercise_sessions) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare h public.home_programs; day jsonb; week jsonb; week_start date;
begin
 select * into h from public.home_programs where id=p_session.home_program_id;
 if h.progression_plan is null then
  if p_session.progression_revision_id is not null or p_session.day_template_id is not null or p_session.scheduled_date is not null then raise exception 'No active progression plan'; end if;return null;
 end if;
 if p_session.progression_revision_id is distinct from h.progression_revision_id then raise exception 'Progression changed; reload your program'; end if;
 week:=h.progression_plan->'weeks'->((h.progression_plan->>'activeWeek')::integer);
 week_start:=(h.progression_plan->>'startDate')::date+7*(h.progression_plan->>'activeWeek')::integer;
 if p_session.scheduled_date is null or p_session.scheduled_date<week_start or p_session.scheduled_date>week_start+6 or not (week->'templateIds')?p_session.day_template_id then raise exception 'Choose a day in the clinician-approved week'; end if;
 select value into day from jsonb_array_elements(h.progression_plan->'templates') where value->>'id'=p_session.day_template_id;
 if jsonb_array_length(day->'weekdays')>0 and not (day->'weekdays') @> jsonb_build_array(extract(dow from p_session.scheduled_date)::integer) then raise exception 'Choose a scheduled weekday for this template'; end if;
 return day || jsonb_build_object('overrides',coalesce(week->'overrides'->p_session.day_template_id,'{}'));
end $$;
revoke all on function private.progression_day(public.patient_exercise_sessions) from public,anon;
grant execute on function private.progression_day(public.patient_exercise_sessions) to authenticated;
create function private.validate_progression_session() returns trigger language plpgsql security invoker set search_path='' as $$
declare day jsonb;
begin
 if tg_op='UPDATE' then
  if (new.progression_revision_id,new.day_template_id,new.scheduled_date,new.timezone) is distinct from (old.progression_revision_id,old.day_template_id,old.scheduled_date,old.timezone) then raise exception 'Session schedule is immutable'; end if;
  return new;
 end if;
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Choose a valid timezone'; end if;
 day:=private.progression_day(new);
 if day is not null and exists(select 1 from unnest(new.selected_ids) x where not exists(select 1 from jsonb_array_elements(day->'exercises') e where e->>'assignmentId'=x::text)) then raise exception 'Choose exercises within this day template'; end if;
 return new;
end $$;
revoke all on function private.validate_progression_session() from public,anon,authenticated;
create trigger validate_progression_session before insert or update on public.patient_exercise_sessions for each row execute function private.validate_progression_session();

create function private.capture_progression_activity() returns trigger language plpgsql security invoker set search_path='' as $$
declare s public.patient_exercise_sessions; day jsonb; e jsonb; p jsonb; prior text[]:='{}'; today date; guided boolean;
begin
 -- Logs with no valid selected session cannot evade plan restrictions through the legacy insert path.
 if exists(select 1 from public.home_programs where id=new.home_program_id and progression_plan is not null) and new.activity_source<>'individual_confirmation' and new.activity_source<>'explicit_nonperformance' then raise exception 'Individual confirmation through a day template required'; end if;
 if new.activity_source not in ('individual_confirmation','explicit_nonperformance') then return new; end if;
 select * into s from public.patient_exercise_sessions where id=new.session_id;
 day:=private.progression_day(s);
 new.scheduled_date:=s.scheduled_date;new.day_template_id:=s.day_template_id;new.progression_revision_id:=s.progression_revision_id;
 if day is null then return new; end if;
 today:=(clock_timestamp() at time zone s.timezone)::date;
 if new.activity_source='individual_confirmation' then
  if (day->>'scheduledOnly')::boolean and s.scheduled_date<>today then raise exception 'This template is limited to scheduled days'; end if;
  -- Serialize patient activity across sessions before enforcing minimum recovery spacing.
  perform 1 from public.patients where id=new.patient_id for update;
  if exists(select 1 from public.exercise_adherence_logs l where l.patient_id=new.patient_id and l.home_program_id=new.home_program_id and l.day_template_id=s.day_template_id and l.session_id<>s.id and l.activity_source='individual_confirmation' and l.performed_at>clock_timestamp()-make_interval(secs=>(day->>'minRestHours')::double precision*3600)) then raise exception 'Clinician-required recovery spacing has not elapsed'; end if;
  select guided_order into guided from public.home_programs where id=new.home_program_id;
  for e in select value from jsonb_array_elements(day->'exercises') loop
   exit when e->>'assignmentId'=new.home_program_exercise_id::text;
   if guided then prior:=array_append(prior,e->>'assignmentId');end if;
  end loop;
  select value into e from jsonb_array_elements(day->'exercises') where value->>'assignmentId'=new.home_program_exercise_id::text;
  if e is null then raise exception 'Exercise is not in the approved day template'; end if;
  prior:=prior || array(select jsonb_array_elements_text(e->'prerequisiteIds'));
  if exists(select 1 from unnest(prior) x where not exists(select 1 from public.exercise_adherence_logs l where l.patient_id=new.patient_id and l.session_id=new.session_id and l.home_program_exercise_id=x::uuid and l.activity_source='individual_confirmation')) then raise exception 'Record required day exercises first'; end if;
 end if;
 select value into e from jsonb_array_elements(day->'exercises') where value->>'assignmentId'=new.home_program_exercise_id::text;
 p:=coalesce(day->'overrides'->new.home_program_exercise_id::text,e->'prescription');
 new.prescription_snapshot:=new.prescription_snapshot || jsonb_build_object('prescription',p,'notes',e->>'notes','progression_revision_id',s.progression_revision_id,'day_template_id',s.day_template_id,'scheduled_date',s.scheduled_date,'performed_date',today,'timezone',s.timezone,'source','approved_day_prescription_at_submission');
 -- Server time is the actual performance report date. Suggested dates never move automatically.
 new.performed_at:=clock_timestamp();return new;
end $$;
revoke all on function private.capture_progression_activity() from public,anon,authenticated;
-- Alphabetical trigger order ensures the base snapshot is captured before this override.
create trigger zz_capture_progression_activity before insert on public.exercise_adherence_logs for each row execute function private.capture_progression_activity();

-- Keep current active references valid when assignments are removed or reordered.
create function private.protect_progression_assignment() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.home_programs h,jsonb_array_elements(h.progression_plan->'templates') t,jsonb_array_elements(t->'exercises') e where h.id=old.home_program_id and e->>'assignmentId'=old.id::text) then raise exception 'Review and remove this assignment from the Progression Plan before deleting it'; end if;return old;
end $$;
revoke all on function private.protect_progression_assignment() from public,anon,authenticated;
create trigger protect_progression_assignment before delete on public.home_program_exercises for each row execute function private.protect_progression_assignment();

create or replace function public.confirm_patient_exercise(p_session uuid,p_exercise uuid,p_feedback jsonb default '{}') returns uuid
language plpgsql security invoker set search_path='' as $$
declare s public.patient_exercise_sessions; existing uuid; result uuid;
begin
 perform 1 from public.patients p where p.patient_profile_id=auth.uid() and p.id=(select patient_id from public.patient_exercise_sessions where id=p_session) for update;
 select * into s from public.patient_exercise_sessions where id=p_session for update;
 if not found or not exists(select 1 from public.patients p where p.id=s.patient_id and p.patient_profile_id=auth.uid()) then raise exception 'Patient session required'; end if;
 select id into existing from public.exercise_adherence_logs where patient_id=s.patient_id and session_id=s.id and home_program_exercise_id=p_exercise;
 if existing is not null then return existing; end if;
 perform 1 from public.home_programs where id=s.home_program_id for share;
 if not exists(select 1 from public.home_programs where id=s.home_program_id and updated_at=s.program_version) then raise exception 'Your program changed. Finish for now, reload, and start a new session'; end if;
 if s.state<>'active' then raise exception 'Session is closed'; end if;
 if jsonb_typeof(p_feedback)<>'object' or length(p_feedback::text)>10000 then raise exception 'Invalid exercise feedback'; end if;
 if p_feedback ? 'nonperformance' and jsonb_typeof(p_feedback->'nonperformance')<>'boolean' then raise exception 'Invalid performance report'; end if;
 if p_feedback ? 'painDuring' and p_feedback->'painDuring'<>'null'::jsonb then
  if jsonb_typeof(p_feedback->'painDuring')<>'number' then raise exception 'Pain must be a whole number from 0 to 10'; end if;
  if (p_feedback->>'painDuring')::numeric not between 0 and 10 or (p_feedback->>'painDuring')::numeric<>trunc((p_feedback->>'painDuring')::numeric) then raise exception 'Pain must be a whole number from 0 to 10'; end if;
 end if;
 if p_feedback?'actualDose' and not public.valid_actual_exercise_dose(p_feedback->'actualDose') then raise exception 'Actual dose must contain exact reported values'; end if;
 if p_feedback?'actualRepsBySet' then
  if jsonb_typeof(p_feedback->'actualRepsBySet')<>'array' or jsonb_array_length(p_feedback->'actualRepsBySet') not between 1 and 100 then raise exception 'Invalid per-set repetitions'; end if;
  if exists(select 1 from jsonb_array_elements(p_feedback->'actualRepsBySet') n where jsonb_typeof(n)<>'number' or n::text::numeric<>trunc(n::text::numeric) or n::text::numeric not between 0 and 100000) then raise exception 'Invalid per-set repetitions'; end if;
  if p_feedback#>>'{actualDose,sets,value}' is not null and (p_feedback#>>'{actualDose,sets,value}')::numeric<>jsonb_array_length(p_feedback->'actualRepsBySet') then raise exception 'Set count must match reported per-set repetitions'; end if;
  if p_feedback#>>'{actualDose,reps,value}' is not null then raise exception 'Use either repetitions per set or a single reported repetition value'; end if;
 end if;
 if length(coalesce(p_feedback->>'notes',''))>2000 then raise exception 'Keep comments to 2000 characters'; end if;
 if p_feedback->'nonperformance'='true'::jsonb then p_feedback:=jsonb_build_object('nonperformance',true,'notes',p_feedback->>'notes'); end if;
 insert into public.exercise_adherence_logs(patient_id,home_program_id,home_program_exercise_id,session_id,client_submission_id,
  actual_reps_by_set,completion_status,performed_at,activity_source,actual_dose,actual_sets,actual_reps,actual_duration_minutes,
  difficulty,difficulty_reason,difficulty_explanation,pain_during,symptom_response,symptom_recovery,notes)
 values(s.patient_id,s.home_program_id,p_exercise,s.id,gen_random_uuid(),case when p_feedback?'actualRepsBySet' then array(select jsonb_array_elements_text(p_feedback->'actualRepsBySet')::integer) end,case when p_feedback->'nonperformance'='true'::jsonb then 'skipped' else 'completed' end,clock_timestamp(),case when p_feedback->'nonperformance'='true'::jsonb then 'explicit_nonperformance' else 'individual_confirmation' end,
  p_feedback->'actualDose',(p_feedback#>>'{actualDose,sets,value}')::integer,(p_feedback#>>'{actualDose,reps,value}')::integer,
  (p_feedback#>>'{actualDose,duration,value}')::numeric / case when p_feedback#>>'{actualDose,duration,unit}'='sec' then 60 else 1 end,
  p_feedback->>'difficulty',p_feedback->>'difficultyReason',p_feedback->>'difficultyExplanation',(p_feedback->>'painDuring')::numeric,
  p_feedback->>'symptomResponse',p_feedback->>'symptomRecovery',nullif(trim(p_feedback->>'notes'),'')) returning id into result;
 return result;
end $$;

create or replace function private.validate_individual_confirmation() returns trigger language plpgsql security invoker set search_path='' as $$
declare s public.patient_exercise_sessions; h public.home_program_exercises; guided boolean;
begin
 if tg_op='UPDATE' and old.activity_source in ('individual_confirmation','explicit_nonperformance') then raise exception 'Confirmed activity is immutable'; end if;
 select * into h from public.home_program_exercises where id=new.home_program_exercise_id;
 select guided_order and progression_plan is null into guided from public.home_programs where id=h.home_program_id;
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

create function private.validate_active_progression_consistency() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.progression_plan is not null then perform private.validate_progression_document(new.progression_plan,new.id); end if;return new;
end $$;
revoke all on function private.validate_active_progression_consistency() from public,anon,authenticated;
create trigger validate_active_progression_consistency after update on public.home_programs for each row execute function private.validate_active_progression_consistency();
commit;
