-- Additive v2 cycles. No data backfill, approval or production activation.
create or replace function private.cycle_occurrence(p jsonb, at_date date, chosen text default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare c jsonb:=p->'cycle'; slot integer; pid text; r jsonb; d jsonb; doses jsonb:='{}'; aid text; k text; v jsonb;
begin
 if at_date<(p->>'startDate')::date or at_date>(c->>'endDate')::date then raise exception 'Date outside approved cycle'; end if;
 slot:=(at_date-(p->>'startDate')::date)%jsonb_array_length(c->'pattern');pid:=c->'pattern'->>slot;
 for r in select value from jsonb_array_elements(c->'futureEdits') loop if at_date>=(r->>'from')::date and slot=(r->>'slot')::integer then pid:=r->>'profileId';end if;end loop;
 pid:=coalesce(c->'occurrenceEdits'->>at_date::text,pid);
 if chosen is not null then if c->>'mode'='fixed' and chosen<>pid then raise exception 'Choose the approved profile for this date';end if;pid:=chosen;end if;
 select value into d from jsonb_array_elements(p->'templates') where value->>'id'=pid;if d is null then raise exception 'Unknown cycle profile';end if;
 for r in select value from jsonb_array_elements(c->'adjustments') loop
  if r->>'profileId'=pid and at_date between (r->>'startDate')::date and (r->>'endDate')::date then
   aid:=r->>'assignmentId';for k,v in select * from jsonb_each(r->'prescription') loop
    if coalesce(doses->aid,'{}'::jsonb)?k then raise exception 'Conflicting dated parameter adjustments';end if;
    doses:=jsonb_set(doses,array[aid],coalesce(doses->aid,'{}'::jsonb)||jsonb_build_object(k,v),true);
   end loop;
  end if;
 end loop;
 for r in select value from jsonb_array_elements(d->'exercises') loop aid:=r->>'assignmentId';if doses?aid then doses:=jsonb_set(doses,array[aid],(r->'prescription')||(doses->aid));end if;end loop;
 return d||jsonb_build_object('overrides',doses,'scheduledOnly',c->>'mode'='fixed');
end $$;
revoke all on function private.cycle_occurrence(jsonb,date,text) from public,anon;
grant execute on function private.cycle_occurrence(jsonb,date,text) to authenticated;

create or replace function private.validate_cycle_document(p jsonb, program uuid) returns void language plpgsql security invoker set search_path='' as $$
declare c jsonb:=p->'cycle'; t jsonb; e jsonb; r jsonb; v jsonb; k text; aid text; pid text; ids text[]; params text[]:=array['sets','reps','hold','rest','load','duration','frequency','intensity','distance']; start_day date; end_day date; dt date; previous_high date; resolved jsonb; base jsonb;
begin
 if c is null then return;end if;
 if jsonb_array_length(p->'weeks')<>1 or p->>'activeWeek'<>'0' or p#>'{weeks,0,overrides}'<>'{}'::jsonb then raise exception 'Cycle uses explicit dated adjustments';end if;
 if jsonb_typeof(c) is distinct from 'object' or c->>'version' is distinct from '2' or coalesce(c->>'mode','') not in ('fixed','flexible') or jsonb_typeof(c->'pattern') is distinct from 'array' or jsonb_typeof(c->'variables') is distinct from 'object' or jsonb_typeof(c->'occurrenceEdits') is distinct from 'object' or jsonb_typeof(c->'futureEdits') is distinct from 'array' or jsonb_typeof(c->'adjustments') is distinct from 'array' or jsonb_typeof(c->'allowedWeekdays') is distinct from 'array' or jsonb_typeof(c->'multipleSessionsPerDay') is distinct from 'boolean' or jsonb_typeof(c->'minHighSpacingDays') is distinct from 'number' then raise exception 'Invalid cycle configuration';end if;
 start_day:=(p->>'startDate')::date;end_day:=(c->>'endDate')::date;
 if end_day is null or end_day<start_day or end_day-start_day>727 or jsonb_array_length(c->'pattern') not between 1 and 28 or (c->>'minHighSpacingDays')::numeric<>trunc((c->>'minHighSpacingDays')::numeric) or (c->>'minHighSpacingDays')::numeric not between 0 and 28 then raise exception 'Invalid cycle duration or recovery spacing';end if;
 ids:=array(select x->>'id' from jsonb_array_elements(p->'templates') x);
 if not coalesce(c->>'highProfileId'=any(ids),false) or exists(select 1 from jsonb_array_elements_text(c->'pattern') x where not x=any(ids)) then raise exception 'Invalid cycle profile';end if;
 if jsonb_array_length(c->'allowedWeekdays')=0 or exists(select 1 from jsonb_array_elements(c->'allowedWeekdays') x where jsonb_typeof(x)<>'number' or x::text::numeric not between 0 and 6 or x::text::numeric<>trunc(x::text::numeric)) then raise exception 'Invalid allowed weekdays';end if;
 for aid,v in select * from jsonb_each(c->'variables') loop
  if jsonb_typeof(v)<>'array' or exists(select 1 from jsonb_array_elements_text(v) x where not x=any(params)) or jsonb_array_length(v)<>(select count(distinct x) from jsonb_array_elements_text(v) x) then raise exception 'Invalid variable parameters';end if;
  select prescription into base from public.home_program_exercises where id=aid::uuid and home_program_id=program;
  if not found or exists(select 1 from jsonb_array_elements_text(v) x where not coalesce(base,'{}'::jsonb)?x) then raise exception 'Variables require structured base parameters';end if;
 end loop;
 for t in select value from jsonb_array_elements(p->'templates') loop
  if jsonb_typeof(t->'fullRest') is distinct from 'boolean' or ((t->>'fullRest')::boolean and jsonb_array_length(t->'exercises')<>0) then raise exception 'Full rest must have no exercise dose';end if;
  for e in select value from jsonb_array_elements(t->'exercises') loop
   aid:=e->>'assignmentId';select coalesce(prescription,'{}'::jsonb) into base from public.home_program_exercises where id=aid::uuid and home_program_id=program;
   for k in select unnest(params) loop
    if not coalesce(c->'variables'->aid,'[]'::jsonb)?k and (base->k) is distinct from (e->'prescription'->k) then raise exception 'Unselected parameters must inherit base prescription';end if;
    if coalesce(c->'variables'->aid,'[]'::jsonb)?k and (e->'prescription'->k is null or (e#>>array['prescription',k,'value'] is null and e#>>array['prescription',k,'mode'] is distinct from 'range')) then raise exception 'Complete selected profile parameters';end if;
   end loop;
  end loop;
 end loop;
 for k,v in select * from jsonb_each(c->'occurrenceEdits') loop if k::date not between start_day and end_day or not coalesce(v#>>'{}'=any(ids),false) then raise exception 'Invalid occurrence edit';end if;end loop;
 for r in select value from jsonb_array_elements(c->'futureEdits') loop if (r->>'from')::date is null or (r->>'from')::date not between start_day and end_day or not coalesce(r->>'profileId'=any(ids),false) or (r->>'slot') is null or (r->>'slot')::numeric<>trunc((r->>'slot')::numeric) or (r->>'slot')::integer not between 0 and jsonb_array_length(c->'pattern')-1 then raise exception 'Invalid future edit';end if;end loop;
 for r in select value from jsonb_array_elements(c->'adjustments') loop
  if (r->>'startDate') is null or (r->>'endDate') is null or (r->>'startDate')::date<start_day or (r->>'endDate')::date>end_day or (r->>'startDate')::date>(r->>'endDate')::date or not public.valid_exercise_prescription(r->'prescription') or r->'prescription'='{}'::jsonb then raise exception 'Invalid dated adjustment';end if;
  if not exists(select 1 from jsonb_array_elements(p->'templates') tt,jsonb_array_elements(tt->'exercises') ee where tt->>'id'=r->>'profileId' and ee->>'assignmentId'=r->>'assignmentId') then raise exception 'Invalid adjustment exercise';end if;
  if exists(select 1 from jsonb_object_keys(r->'prescription') x where not coalesce(c->'variables'->(r->>'assignmentId'),'[]'::jsonb)?x) then raise exception 'Adjustment must use selected variables';end if;
 end loop;
 dt:=start_day;while dt<=end_day loop
  resolved:=private.cycle_occurrence(p,dt);
  if not (resolved->>'fullRest')::boolean and not (c->'allowedWeekdays')@>jsonb_build_array(extract(dow from dt)::integer) then raise exception 'Schedule conflicts with allowed weekdays';end if;
  if resolved->>'id'=c->>'highProfileId' then if previous_high is not null and dt-previous_high<(c->>'minHighSpacingDays')::integer then raise exception 'High-day recovery spacing conflict';end if;previous_high:=dt;end if;
  if c->>'mode'='flexible' then for pid in select unnest(ids) loop perform private.cycle_occurrence(p,dt,pid);end loop;end if;
  dt:=dt+1;
 end loop;
end $$;
revoke all on function private.validate_cycle_document(jsonb,uuid) from public,anon;
grant execute on function private.validate_cycle_document(jsonb,uuid) to authenticated;

-- Enforce all approved dates for v2; keep active-week behavior for existing v1 plans.
create or replace function private.progression_day(p_session public.patient_exercise_sessions) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare h public.home_programs; day jsonb; week jsonb; week_start date;
begin
 select * into h from public.home_programs where id=p_session.home_program_id;
 if h.progression_plan is null then
  if p_session.progression_revision_id is not null or p_session.day_template_id is not null or p_session.scheduled_date is not null then raise exception 'No active progression plan';end if;return null;
 end if;
 if p_session.progression_revision_id is distinct from h.progression_revision_id then raise exception 'Progression changed; reload your program';end if;
 if h.progression_plan?'cycle' then
  if p_session.scheduled_date is null then raise exception 'Choose an approved cycle date';end if;
  day:=private.cycle_occurrence(h.progression_plan,p_session.scheduled_date,p_session.day_template_id);
  if coalesce((day->>'fullRest')::boolean,false) then raise exception 'Full rest does not require an exercise session';end if;return day;
 end if;
 week:=h.progression_plan->'weeks'->((h.progression_plan->>'activeWeek')::integer);
 week_start:=(h.progression_plan->>'startDate')::date+7*(h.progression_plan->>'activeWeek')::integer;
 if p_session.scheduled_date is null or p_session.scheduled_date<week_start or p_session.scheduled_date>week_start+6 or not (week->'templateIds')?p_session.day_template_id then raise exception 'Choose a day in the clinician-approved week';end if;
 select value into day from jsonb_array_elements(h.progression_plan->'templates') where value->>'id'=p_session.day_template_id;
 if jsonb_array_length(day->'weekdays')>0 and not (day->'weekdays')@>jsonb_build_array(extract(dow from p_session.scheduled_date)::integer) then raise exception 'Choose a scheduled weekday for this template';end if;
 return day||jsonb_build_object('overrides',coalesce(week->'overrides'->p_session.day_template_id,'{}'));
end $$;

-- Runs after the existing patient lock in activity capture. Direct inserts pass this too.
create or replace function private.enforce_cycle_activity() returns trigger language plpgsql security invoker set search_path='' as $$
declare p jsonb; c jsonb; s public.patient_exercise_sessions; today date; win_start date; quota integer:=0; used integer; d date; day jsonb; last_high timestamptz; freq jsonb; maximum numeric; freq_used integer;
begin
 if new.activity_source<>'individual_confirmation' then return new;end if;
 select progression_plan into p from public.home_programs where id=new.home_program_id;c:=p->'cycle';if c is null then return new;end if;
 select * into s from public.patient_exercise_sessions where id=new.session_id;today:=(clock_timestamp() at time zone s.timezone)::date;
 if today<(p->>'startDate')::date or today>(c->>'endDate')::date then raise exception 'Today is outside approved cycle dates';end if;
 if not (c->'allowedWeekdays')@>jsonb_build_array(extract(dow from today)::integer) then raise exception 'Today is outside allowed exercise weekdays';end if;
 perform 1 from public.patients where id=new.patient_id for update;
 if not (c->>'multipleSessionsPerDay')::boolean and exists(select 1 from public.exercise_adherence_logs l where l.patient_id=new.patient_id and l.home_program_id=new.home_program_id and l.activity_source='individual_confirmation' and l.session_id<>s.id and (l.performed_at at time zone s.timezone)::date=today) then raise exception 'Only one session per day is approved';end if;
 if s.day_template_id=c->>'highProfileId' then
  select max(l.performed_at) into last_high from public.exercise_adherence_logs l where l.patient_id=new.patient_id and l.home_program_id=new.home_program_id and l.day_template_id=c->>'highProfileId' and l.activity_source='individual_confirmation' and l.session_id<>s.id;
  if last_high is not null and (last_high at time zone s.timezone)::date>today-(c->>'minHighSpacingDays')::integer then raise exception 'High-day recovery spacing has not elapsed';end if;
 end if;
 freq:=new.prescription_snapshot#>'{prescription,frequency}';
 maximum:=case when freq->>'mode'='range' then (freq->>'max')::numeric else (freq->>'value')::numeric end;
 if maximum is not null then
  win_start:=(p->>'startDate')::date+7*((today-(p->>'startDate')::date)/7);
  if freq->>'unit'='sessions/day' then select count(distinct l.session_id) into freq_used from public.exercise_adherence_logs l where l.patient_id=new.patient_id and l.home_program_id=new.home_program_id and l.home_program_exercise_id=new.home_program_exercise_id and l.activity_source='individual_confirmation' and l.session_id<>s.id and (l.performed_at at time zone s.timezone)::date=today;
  elsif freq->>'unit'='sessions/week' then select count(distinct l.session_id) into freq_used from public.exercise_adherence_logs l where l.patient_id=new.patient_id and l.home_program_id=new.home_program_id and l.home_program_exercise_id=new.home_program_exercise_id and l.activity_source='individual_confirmation' and l.session_id<>s.id and (l.performed_at at time zone s.timezone)::date between win_start and win_start+6;
  elsif freq->>'unit'='days/week' then select count(distinct (l.performed_at at time zone s.timezone)::date) into freq_used from public.exercise_adherence_logs l where l.patient_id=new.patient_id and l.home_program_id=new.home_program_id and l.home_program_exercise_id=new.home_program_exercise_id and l.activity_source='individual_confirmation' and l.session_id<>s.id and (l.performed_at at time zone s.timezone)::date between win_start and win_start+6 and (l.performed_at at time zone s.timezone)::date<>today;
  end if;
  if freq_used>=maximum then raise exception 'Approved exercise frequency reached';end if;
 end if;
 if c->>'mode'='flexible' then
  win_start:=(p->>'startDate')::date+7*((today-(p->>'startDate')::date)/7);
  if s.scheduled_date<win_start or s.scheduled_date>win_start+6 then raise exception 'Choose a session within the current approved week';end if;
  d:=win_start;while d<=least(win_start+6,(c->>'endDate')::date) loop day:=private.cycle_occurrence(p,d);if day->>'id'=s.day_template_id then quota:=quota+1;end if;d:=d+1;end loop;
  select count(distinct l.session_id) into used from public.exercise_adherence_logs l where l.patient_id=new.patient_id and l.home_program_id=new.home_program_id and l.day_template_id=s.day_template_id and l.activity_source='individual_confirmation' and l.session_id<>s.id and (l.performed_at at time zone s.timezone)::date between win_start and win_start+6;
  if used>=quota then raise exception 'Approved weekly profile frequency reached';end if;
 end if;
 return new;
end $$;
revoke all on function private.enforce_cycle_activity() from public,anon,authenticated;
create trigger zzz_enforce_cycle_activity before insert on public.exercise_adherence_logs for each row execute function private.enforce_cycle_activity();

-- Approved cycles are snapshots of base values at approval, not live references.
-- Base edits must never rewrite active/historical day doses implicitly.
create or replace function private.validate_active_progression_consistency() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.progression_plan is not null and (not (new.progression_plan?'cycle') or new.progression_plan is distinct from old.progression_plan or new.guided_order is distinct from old.guided_order) then perform private.validate_progression_document(new.progression_plan,new.id);end if;return new;
end $$;

create or replace function private.validate_cycle_frequencies(p jsonb) returns void language plpgsql stable security invoker set search_path='' as $$
declare c jsonb:=p->'cycle'; win date; dt date; last_date date; day jsonb; e jsonb; counts jsonb; aid text; frequency jsonb; maximum numeric; planned numeric;
begin
 if c->>'mode'<>'fixed' then return;end if;win:=(p->>'startDate')::date;
 while win<=(c->>'endDate')::date loop
  counts:='{}';last_date:=least(win+6,(c->>'endDate')::date);dt:=win;
  while dt<=last_date loop
   day:=private.cycle_occurrence(p,dt);
   for e in select value from jsonb_array_elements(day->'exercises') loop aid:=e->>'assignmentId';counts:=jsonb_set(counts,array[aid],to_jsonb(coalesce((counts->>aid)::integer,0)+1));end loop;dt:=dt+1;
  end loop;
  dt:=win;while dt<=last_date loop
   day:=private.cycle_occurrence(p,dt);
   for e in select value from jsonb_array_elements(day->'exercises') loop
    aid:=e->>'assignmentId';frequency:=coalesce(day->'overrides'->aid,e->'prescription')->'frequency';
    maximum:=case when frequency->>'mode'='range' then (frequency->>'max')::numeric else (frequency->>'value')::numeric end;
    planned:=case when frequency->>'unit'='sessions/day' then 1 else (counts->>aid)::numeric end;
    if maximum is not null and planned>maximum then raise exception 'Schedule exceeds prescribed exercise frequency; review base frequency or selected parameters';end if;
   end loop;dt:=dt+1;
  end loop;win:=win+7;
 end loop;
end $$;
revoke all on function private.validate_cycle_frequencies(jsonb) from public,anon;
grant execute on function private.validate_cycle_frequencies(jsonb) to authenticated;

create or replace function private.validate_progression_document(p jsonb, program uuid) returns void language plpgsql security invoker set search_path='' as $$
declare d jsonb; w jsonb; e jsonb; ph jsonb; tid text; aid text; dose jsonb; seen text[]; prior text[]; day_ids text[]:='{}'; phase_ids text[]:='{}'; ix integer;
begin
 if p is null then return; end if;
 if jsonb_typeof(p)<>'object' or length(p::text)>500000 or (p-'startDate'-'activeWeek'-'phases'-'weeks'-'templates'-'cycle')<>'{}'::jsonb
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
  if (jsonb_array_length(d->'exercises') not between 1 and 100 and not (p?'cycle' and d->>'fullRest'='true' and jsonb_array_length(d->'exercises')=0)) or (d->>'minRestHours')::numeric not between 0 and 720 then raise exception 'Invalid day exercise count or recovery spacing'; end if;
  if exists(select 1 from jsonb_array_elements(d->'weekdays') n where jsonb_typeof(n)<>'number' or n::text::numeric not between 0 and 6 or n::text::numeric<>trunc(n::text::numeric)) or jsonb_array_length(d->'weekdays')<>(select count(distinct n) from jsonb_array_elements(d->'weekdays') n) then raise exception 'Invalid weekdays'; end if;
  if d?'weeklyTarget' and (not public.valid_exercise_prescription(jsonb_build_object('frequency',d->'weeklyTarget')) or d#>>'{weeklyTarget,unit}' not in ('days/week','sessions/week')) then raise exception 'Invalid weekly target'; end if;
  if not (p?'cycle' and coalesce(d->>'fullRest'='true',false)) and exists(select 1 from public.home_programs where id=program and guided_order) and
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
 perform private.validate_cycle_document(p,program);
 if p?'cycle' then perform private.validate_cycle_frequencies(p);end if;
end $$;
revoke all on function private.validate_progression_document(jsonb,uuid) from public,anon;
grant execute on function private.validate_progression_document(jsonb,uuid) to authenticated;

