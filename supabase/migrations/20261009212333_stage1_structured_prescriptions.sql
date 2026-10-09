begin;
-- Additive only. Original instructions are retained; ambiguous values are never inferred.
alter table public.exercises add column default_prescription jsonb not null default '{}';
alter table public.home_program_exercises
  add column prescription jsonb not null default '{}',
  add column legacy_prescription jsonb not null default '{}',
  add column prescription_source text not null default 'legacy_unconverted',
  add column patient_name text,
  add column patient_video_url text,
  add column video_overridden boolean not null default false;
alter table public.exercise_adherence_logs
  add column difficulty_explanation text,
  add column prescription_snapshot jsonb,
  add column feedback_provenance jsonb;

create function public.valid_exercise_prescription(p jsonb) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
declare k text; e jsonb; v numeric; u text; units text[];
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  for k,e in select * from jsonb_each(p) loop
    units := case k
      when 'sets' then array['sets'] when 'reps' then array['reps']
      when 'hold' then array['sec','min'] when 'rest' then array['sec','min']
      when 'duration' then array['sec','min'] when 'load' then array['kg','lb','%1RM','level']
      when 'frequency' then array['sessions/day','sessions/week','days/week']
      when 'intensity' then array['RPE/10','%HRmax'] when 'distance' then array['m','ft','km','mi']
      else null end;
    if units is null or jsonb_typeof(e) <> 'object' or not (e ? 'value' and e ? 'unit')
       or (e - 'value' - 'unit') <> '{}'::jsonb or jsonb_typeof(e->'unit') <> 'string' then return false; end if;
    u := e->>'unit';
    if not u = any(units) then return false; end if;
    if e->'value' <> 'null'::jsonb then
      if jsonb_typeof(e->'value') <> 'number' then return false; end if;
      v := (e->>'value')::numeric;
      if v < 0 or v > 100000 or (k in ('sets','reps','frequency') and v <> trunc(v))
        or (u='RPE/10' and v>10) or (u in ('%HRmax','%1RM') and v>100) or (u='days/week' and v>7) then return false; end if;
    end if;
  end loop;
  return true;
end $$;
revoke all on function public.valid_exercise_prescription(jsonb) from public,anon;
grant execute on function public.valid_exercise_prescription(jsonb) to authenticated;
alter table public.home_program_exercises add constraint prescription_valid check(public.valid_exercise_prescription(prescription));
alter table public.exercises add constraint default_prescription_valid check(public.valid_exercise_prescription(default_prescription));

-- Only exact single counts/frequency are parsed. Time in reps/time can mean hold or exercise duration: retain it for clinician review.
create function private.convert_legacy_prescription(s text, r text, f text) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare p jsonb := '{}'; m text[]; u text;
begin
 if trim(s) ~ '^\d{1,5}$' then p:=p || jsonb_build_object('sets',jsonb_build_object('value',trim(s)::numeric,'unit','sets')); end if;
 if trim(r) ~ '^\d{1,5}$' then p:=p || jsonb_build_object('reps',jsonb_build_object('value',trim(r)::numeric,'unit','reps'));

 end if;
 m:=regexp_match(trim(f),'^(\d{1,2})\s*(x|times|sessions|days)\s*(/|per)\s*(day|week)$','i');
 if m is not null then
   u:=case when lower(m[2])='days' then 'days/week' else 'sessions/' || lower(m[4]) end;
   if not (u='days/week' and (lower(m[4])<>'week' or m[1]::numeric>7)) then p:=p || jsonb_build_object('frequency',jsonb_build_object('value',m[1]::numeric,'unit',u)); end if;
 end if;
 return p;
end $$;
revoke all on function private.convert_legacy_prescription(text,text,text) from public,anon,authenticated;
update public.home_program_exercises set
 prescription=private.convert_legacy_prescription(dosage_sets,dosage_reps,frequency),
 prescription_source='exact_legacy_conversion',
 legacy_prescription=jsonb_build_object('dosage_sets',dosage_sets,'dosage_reps',dosage_reps,'frequency',frequency,
 'review_required', (nullif(trim(dosage_sets),'') is not null and not private.convert_legacy_prescription(dosage_sets,null,null) ? 'sets')
 or (nullif(trim(dosage_reps),'') is not null and private.convert_legacy_prescription(null,dosage_reps,null)='{}'::jsonb)
 or (nullif(trim(frequency),'') is not null and not private.convert_legacy_prescription(null,null,frequency) ? 'frequency'),'reviewed',false);
-- Combined default_dosage strings are deliberately retained verbatim, not parsed into guesses.

create function private.capture_prescribed_feedback() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare item public.home_program_exercises;
begin
 new.feedback_provenance:=jsonb_build_object('source',case when exists(select 1 from public.patients where id=new.patient_id and patient_profile_id=auth.uid()) then 'PATIENT_REPORTED' else 'CLINICIAN_RECORDED' end,'recorded_by',auth.uid(),'recorded_at',clock_timestamp());
 if new.difficulty='too_hard' and new.difficulty_reason='other' then
   if nullif(trim(new.difficulty_explanation),'') is null then raise exception 'A short explanation is required for Other'; end if;
   if length(new.difficulty_explanation)>500 then raise exception 'Explanation must be 500 characters or fewer'; end if;
   new.difficulty_explanation:=trim(new.difficulty_explanation);
 else new.difficulty_explanation:=null;
 end if;
 -- INSERT-time server snapshot only; old logs are left unknown, never backfilled with today's dose.
 if tg_op='INSERT' then
   select * into item from public.home_program_exercises where id=new.home_program_exercise_id and home_program_id=new.home_program_id;
   if not found then raise exception 'Assigned exercise no longer available; reload your program'; end if;
   new.prescription_snapshot:=jsonb_build_object('source','assigned_prescription_at_submission','exercise_id',item.exercise_id,
     'program_exercise_id',item.id,'prescription',item.prescription,'legacy_prescription',item.legacy_prescription,
     'notes',item.notes,'name',coalesce(item.patient_name,(select name from public.exercises where id=item.exercise_id)),
     'captured_at',clock_timestamp(),'prescription_source',item.prescription_source);
 else new.prescription_snapshot:=old.prescription_snapshot;
 end if;
 return new;
end $$;
revoke all on function private.capture_prescribed_feedback() from public,anon,authenticated;
create trigger prescribed_feedback before insert or update on public.exercise_adherence_logs for each row execute function private.capture_prescribed_feedback();

-- Existing relationship-based RLS and immutable engine_program_changes audit remain in force.
-- One transaction, stable exercise IDs, and program-version locking prevent partial/stale saves.
create function public.save_structured_program(p_patient uuid, p_program uuid, p_expected timestamptz, p_items jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare e_id uuid; h public.home_programs; item jsonb; x_id uuid; row_id uuid; kept uuid[] := '{}'; original public.home_program_exercises; ordinal integer := 0;
begin
 perform id from public.patients where id=p_patient and clinician_id=auth.uid() and status in ('active','needs_review') for update;
 if auth.uid() is null or not found then raise exception 'Active treating relationship required'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Choose 1–100 exercises'; end if;
 select id into e_id from public.episodes where patient_id=p_patient and status='active' order by updated_at desc limit 1 for update;
 if e_id is null then
   if exists(select 1 from public.episodes where patient_id=p_patient) then raise exception 'Reactivate the closed case before prescribing'; end if;
   insert into public.episodes(patient_id,title,status) values(p_patient,'Active care episode','active') returning id into e_id;
 end if;
 if p_program is null then
   if exists(select 1 from public.home_programs where episode_id=e_id and status in ('draft','active')) then raise exception 'Program changed; reload before saving'; end if;
   insert into public.home_programs(episode_id,name,status,assigned_at) values(e_id,'Home program','active',clock_timestamp()) returning * into h;
 else
   select * into h from public.home_programs where id=p_program and episode_id=e_id and status in ('draft','active') for update;
   if h.id is null or h.updated_at is distinct from p_expected then raise exception 'Program changed; reload before saving'; end if;
 end if;
 for item in select value from jsonb_array_elements(p_items) loop
   if not public.valid_exercise_prescription(item->'prescription') then raise exception 'Invalid numerical prescription'; end if;
   x_id:=nullif(item->>'exercise_id','')::uuid;
   if x_id is null then
     -- A new personalized exercise may reference an existing standard by name, never update it.
     select id into x_id from public.exercises where clinician_id=auth.uid() and normalized_name=lower(regexp_replace(trim(item->>'name'),'\s+',' ','g')) and is_active limit 1;
     if x_id is null then
       insert into public.exercises(clinician_id,name,category,tags,patient_instructions,is_active)
       values(auth.uid(),coalesce(nullif(trim(item->>'name'),''),'New exercise'),coalesce(item->>'category','other'),
         array(select jsonb_array_elements_text(coalesce(item->'tags','[]'))),item->>'patient_instructions',true) returning id into x_id;
     end if;
   elsif not exists(select 1 from public.exercises where id=x_id and clinician_id=auth.uid()) then raise exception 'Exercise template unavailable'; end if;
   row_id:=nullif(item->>'id','')::uuid;
   if row_id is not null then
     select * into original from public.home_program_exercises where id=row_id and home_program_id=h.id;
     if not found or row_id=any(kept) or original.exercise_id<>x_id then raise exception 'Program exercise changed; reload before saving'; end if;
     update public.home_program_exercises set prescription=item->'prescription',prescription_source='clinician_entered',
       legacy_prescription=jsonb_set(legacy_prescription,'{reviewed}',coalesce(item->'legacy_reviewed','false')),
       notes=item->>'notes',category=item->>'category',sort_order=ordinal,patient_name=item->>'patient_name',
       video_overridden=coalesce((item->>'video_overridden')::boolean,false),patient_video_url=item->>'patient_video_url',
       dosage_sets=item->'prescription'->'sets'->>'value',
       dosage_reps=coalesce(item->'prescription'->'reps'->>'value',case when item->'prescription'->'duration'->>'value' is not null then (item->'prescription'->'duration'->>'value') || ' ' || (item->'prescription'->'duration'->>'unit') end),
       frequency=case when item->'prescription'->'frequency'->>'value' is not null then (item->'prescription'->'frequency'->>'value') || ' ' || (item->'prescription'->'frequency'->>'unit') end
       where id=row_id;
   else
     insert into public.home_program_exercises(home_program_id,exercise_id,sort_order,prescription,prescription_source,notes,category,patient_name,video_overridden,patient_video_url,dosage_sets,dosage_reps,frequency,legacy_prescription)
     values(h.id,x_id,ordinal,item->'prescription','clinician_entered',item->>'notes',item->>'category',item->>'patient_name',coalesce((item->>'video_overridden')::boolean,false),item->>'patient_video_url',item->'prescription'->'sets'->>'value',coalesce(item->'prescription'->'reps'->>'value',case when item->'prescription'->'duration'->>'value' is not null then (item->'prescription'->'duration'->>'value') || ' ' || (item->'prescription'->'duration'->>'unit') end),
       case when item->'prescription'->'frequency'->>'value' is not null then (item->'prescription'->'frequency'->>'value') || ' ' || (item->'prescription'->'frequency'->>'unit') end,
       coalesce((select jsonb_build_object('dosage_reps',default_dosage,'review_required',true,'reviewed',coalesce((item->>'legacy_reviewed')::boolean,false)) from public.exercises where id=x_id and nullif(trim(default_dosage),'') is not null),'{}'::jsonb)) returning id into row_id;
   end if;
   kept:=array_append(kept,row_id); ordinal:=ordinal+1;
 end loop;
 delete from public.home_program_exercises where home_program_id=h.id and not id=any(kept);
 update public.home_programs set status='active',updated_at=clock_timestamp(),assigned_at=coalesce(assigned_at,clock_timestamp()) where id=h.id;
 return h.id;
end $$;
revoke all on function public.save_structured_program(uuid,uuid,timestamptz,jsonb) from public,anon;
grant execute on function public.save_structured_program(uuid,uuid,timestamptz,jsonb) to authenticated;
-- Aggregate structured edits for learning. No patient IDs, text, or individual values exposed.
create function private.prescription_analytics(p_days integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Founder access required'; end if;
 select jsonb_build_object('changes',count(*),'numericChanges',count(*) filter(where before_value->'prescription' is distinct from after_value->'prescription'),
   'notesChanges',count(*) filter(where before_value->'notes' is distinct from after_value->'notes')) into result
 from public.engine_program_changes where entity='home_program_exercises' and operation='UPDATE'
   and created_at >= now()-make_interval(days=>greatest(1,least(coalesce(p_days,30),365)));
 return result;
end $$;
revoke all on function private.prescription_analytics(integer) from public,anon;
grant execute on function private.prescription_analytics(integer) to authenticated;
create function public.get_prescription_analytics(p_days integer default 30) returns jsonb
language sql security invoker set search_path = '' as $$select private.prescription_analytics(p_days)$$;
revoke all on function public.get_prescription_analytics(integer) from public,anon;
grant execute on function public.get_prescription_analytics(integer) to authenticated;
commit;
