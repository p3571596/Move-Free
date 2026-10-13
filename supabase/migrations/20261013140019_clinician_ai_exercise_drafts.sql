begin;
create function private.valid_ai_prescription(p jsonb) returns boolean
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
revoke all on function private.valid_ai_prescription(jsonb) from public,anon;
grant execute on function private.valid_ai_prescription(jsonb) to authenticated;

-- Clinician-owned drafts: no patient/chart IDs, raw recordings, frames or transcripts are stored.
create table public.clinician_ai_exercise_drafts (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),
 purpose text not null default 'clinician_self_demonstration' check(purpose='clinician_self_demonstration'),
 status text not null default 'pending' check(status in ('pending','success','failed','reviewed')),
 original_content jsonb,reviewed_content jsonb,changed_fields text[] not null default '{}',
 model text,limitations text[] not null default '{}',error_code text,
 created_at timestamptz not null default now(),reviewed_at timestamptz,
 check(original_content is null or jsonb_typeof(original_content)='object'),
 check(reviewed_content is null or jsonb_typeof(reviewed_content)='object')
);
create index clinician_ai_owner_time on public.clinician_ai_exercise_drafts(owner_id,created_at desc);
alter table public.clinician_ai_exercise_drafts enable row level security;
revoke all on public.clinician_ai_exercise_drafts from public,anon,authenticated;
grant select on public.clinician_ai_exercise_drafts to authenticated;
grant all on public.clinician_ai_exercise_drafts to service_role;
create policy clinician_ai_owner_read on public.clinician_ai_exercise_drafts for select to authenticated using(owner_id=auth.uid() and public.pilot_feature_enabled('ai_video_assistance'));
create function private.begin_clinician_ai_draft(p_self_demonstration boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare x uuid;
begin
 if auth.uid() is null or not public.pilot_feature_enabled('ai_video_assistance') or p_self_demonstration is distinct from true then raise exception 'AI pilot access and self demonstration confirmation required';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,19371));
 if exists(select 1 from public.clinician_ai_exercise_drafts where owner_id=auth.uid() and created_at>now()-interval '30 seconds') then raise exception 'Wait 30 seconds before requesting another draft';end if;
 if (select count(*) from public.clinician_ai_exercise_drafts where owner_id=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'Hourly AI draft limit reached';end if;
 insert into public.clinician_ai_exercise_drafts(owner_id) values(auth.uid()) returning id into x;return x;
end $$;
create function public.begin_clinician_ai_draft(p_self_demonstration boolean) returns uuid language sql security invoker set search_path='' as $$select private.begin_clinician_ai_draft(p_self_demonstration)$$;
revoke all on function private.begin_clinician_ai_draft(boolean),public.begin_clinician_ai_draft(boolean) from public,anon;
grant execute on function private.begin_clinician_ai_draft(boolean),public.begin_clinician_ai_draft(boolean) to authenticated;
create function public.review_clinician_ai_draft(p_id uuid,p_content jsonb) returns void
language plpgsql security invoker set search_path='' as $$
begin
 -- This function deliberately has no table write privilege; delegate to the checked private implementation.
 perform private.review_clinician_ai_draft(p_id,p_content);
end $$;
create function private.review_clinician_ai_draft(p_id uuid,p_content jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare d public.clinician_ai_exercise_drafts;changed text[];k text;
begin
 if auth.uid() is null or not public.pilot_feature_enabled('ai_video_assistance') then raise exception 'Access denied';end if;
 select * into d from public.clinician_ai_exercise_drafts where id=p_id and owner_id=auth.uid() for update;
 if d.id is null or d.status<>'success' then raise exception 'Draft unavailable or already reviewed';end if;
 if jsonb_typeof(p_content) is distinct from 'object' or (p_content-'name'-'exercise_type'-'instructions'-'cues'-'equipment'-'prescription')<>'{}'::jsonb then raise exception 'Invalid draft';end if;
 foreach k in array array['name','exercise_type','instructions','cues','equipment'] loop
 if jsonb_typeof(p_content->k) is distinct from 'string' or length(p_content->>k)>(case when k='instructions' then 4000 when k='cues' then 1400 else 200 end) then raise exception 'Invalid draft field';end if;
 end loop;
 if nullif(trim(p_content->>'name'),'') is null or nullif(trim(p_content->>'instructions'),'') is null or not private.valid_ai_prescription(p_content->'prescription') then raise exception 'Review the exercise name, instructions and numerical prescription';end if;
 select coalesce(array_agg(key),'{}') into changed from jsonb_each(p_content) where value is distinct from d.original_content->key;
 update public.clinician_ai_exercise_drafts set status='reviewed',reviewed_content=p_content,changed_fields=changed,reviewed_at=now() where id=d.id;
 -- No prescription assignment or patient publication occurs here.
end $$;
revoke all on function private.review_clinician_ai_draft(uuid,jsonb),public.review_clinician_ai_draft(uuid,jsonb) from public,anon;
grant execute on function private.review_clinician_ai_draft(uuid,jsonb),public.review_clinician_ai_draft(uuid,jsonb) to authenticated;
commit;

begin;
alter table public.exercise_video_assets add column reviewed_ai_draft_id uuid references public.clinician_ai_exercise_drafts(id);
create function private.attach_reviewed_ai_demonstration(p_asset uuid,p_draft uuid) returns void
language plpgsql security definer set search_path='' as $$
declare d public.clinician_ai_exercise_drafts;a public.exercise_video_assets;
begin
 if not public.pilot_feature_enabled('ai_video_assistance') or not public.pilot_feature_enabled('personalized_exercises') then raise exception 'Access denied';end if;
 select * into d from public.clinician_ai_exercise_drafts where id=p_draft and owner_id=auth.uid() and status='reviewed';
 select * into a from public.exercise_video_assets where id=p_asset and owner_id=auth.uid() and kind='demonstration' and state='ready' for update;
 if d.id is null or a.id is null or not public.is_clinician_for_patient(a.patient_id) then raise exception 'Reviewed draft or video unavailable';end if;
 update public.exercise_video_assets set reviewed_ai_draft_id=d.id,title=d.reviewed_content->>'name',instructions=d.reviewed_content->>'instructions',
 cues=concat_ws(E'\n',nullif(d.reviewed_content->>'cues',''),case when nullif(d.reviewed_content->>'equipment','') is not null then 'Equipment: '||(d.reviewed_content->>'equipment') end,case when nullif(d.reviewed_content->>'exercise_type','') is not null then 'Exercise type: '||(d.reviewed_content->>'exercise_type') end) where id=a.id;
end $$;
create function public.attach_reviewed_ai_demonstration(p_asset uuid,p_draft uuid) returns void language sql security invoker set search_path='' as $$select private.attach_reviewed_ai_demonstration(p_asset,p_draft)$$;
revoke all on function private.attach_reviewed_ai_demonstration(uuid,uuid),public.attach_reviewed_ai_demonstration(uuid,uuid) from public,anon;
grant execute on function private.attach_reviewed_ai_demonstration(uuid,uuid),public.attach_reviewed_ai_demonstration(uuid,uuid) to authenticated;
-- The existing approval RPC remains the only publication operation. Numeric dose is saved via Stage 1's atomic program save.
commit;
