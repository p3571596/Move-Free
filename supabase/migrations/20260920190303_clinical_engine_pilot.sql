-- Additive pilot migration. Apply to an approved test environment first.
-- Existing production policies are intentionally not replaced here.
create table public.clinical_engine_reviews (
  id uuid primary key references public.clinical_decisions(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  clinician_id uuid not null references public.profiles(id),
  engine_version text not null,
  engine_result jsonb not null check (jsonb_typeof(engine_result) = 'object'),
  source_snapshot jsonb not null check (jsonb_typeof(source_snapshot) = 'object'),
  disposition text not null check (disposition in ('accepted','modified','rejected','not_evaluated')),
  disagreement_reason text check (length(disagreement_reason) <= 4000),
  clinician_modification text check (length(clinician_modification) <= 4000),
  program_snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index clinical_engine_reviews_patient_time on public.clinical_engine_reviews(patient_id, created_at);
alter table public.clinical_engine_reviews enable row level security;
revoke all on public.clinical_engine_reviews from anon, authenticated;
grant select, insert on public.clinical_engine_reviews to authenticated;
create policy engine_treating_clinician_read on public.clinical_engine_reviews for select to authenticated
using (exists (select 1 from public.patients p where p.id = patient_id and p.clinician_id = (select auth.uid())));
create policy engine_treating_clinician_insert on public.clinical_engine_reviews for insert to authenticated
with check (clinician_id = (select auth.uid()) and exists (
  select 1 from public.patients p join public.clinical_decisions d on d.patient_id = p.id
  where p.id = clinical_engine_reviews.patient_id and p.clinician_id = (select auth.uid())
    and d.id = clinical_engine_reviews.id and d.clinician_id = (select auth.uid())
));

-- One transaction: a decision cannot clear the inbox while losing its evaluation record.
create function public.record_engine_review(p_id uuid, p_patient_id uuid, p_episode_id uuid,
  p_decision text, p_rationale text, p_engine jsonb, p_source jsonb,
  p_disposition text, p_disagreement text, p_modification text)
returns void language plpgsql security invoker set search_path = '' as $$
declare program_state jsonb;
begin
  if not exists (select 1 from public.patients where id=p_patient_id and clinician_id=auth.uid()) then
    raise exception 'An explicit treating relationship is required';
  end if;
  if not exists (select 1 from public.episodes where id=p_episode_id and patient_id=p_patient_id) then
    raise exception 'Episode does not belong to this patient';
  end if;
  if length(trim(p_rationale))=0 or p_disposition not in ('accepted','modified','rejected','not_evaluated') then
    raise exception 'Clinical decision and evaluation are required';
  end if;
  if (p_engine->>'status' = 'missing_information') <> (p_disposition='not_evaluated') then
    raise exception 'Missing information cannot be recorded as agreement';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('program',to_jsonb(h), 'exercises',
    (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order),'[]'::jsonb) from public.home_program_exercises x where x.home_program_id=h.id))), '[]'::jsonb)
    into program_state from public.home_programs h where h.episode_id=p_episode_id and h.status='active';
  insert into public.clinical_decisions(id, patient_id, episode_id, clinician_id, decision_type, rationale)
  values(p_id,p_patient_id,p_episode_id,auth.uid(),p_decision,p_rationale);
  insert into public.clinical_engine_reviews(id,patient_id,clinician_id,engine_version,engine_result,source_snapshot,disposition,disagreement_reason,clinician_modification,program_snapshot)
  values(p_id,p_patient_id,auth.uid(),p_engine->>'version',p_engine,p_source,p_disposition,nullif(trim(p_disagreement),''),nullif(trim(p_modification),''),program_state);
end $$;
revoke all on function public.record_engine_review(uuid,uuid,uuid,text,text,jsonb,jsonb,text,text,text) from public, anon;
grant execute on function public.record_engine_review(uuid,uuid,uuid,text,text,jsonb,jsonb,text,text,text) to authenticated;

-- Aggregate founder evaluation only; no notes, identifiers, inputs, or patient-level outputs.
create schema if not exists private;
create function private.engine_pilot_analytics(p_days integer default 30)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id=auth.uid() and role='admin') then
    raise exception 'Founder analytics access required';
  end if;
  select jsonb_build_object('reviews',count(*),
    'accepted',count(*) filter(where disposition='accepted'),
    'modified',count(*) filter(where disposition='modified'),
    'rejected',count(*) filter(where disposition='rejected'),
    'notEvaluated',count(*) filter(where disposition='not_evaluated'),
    'withSubsequentResponse',count(*) filter(where exists (
      select 1 from public.daily_checkins c where c.patient_id=r.patient_id and c.created_at>r.created_at
      and not exists (select 1 from public.clinical_engine_reviews n where n.patient_id=r.patient_id and n.created_at>r.created_at and n.created_at<c.created_at)
    )), 'rules',coalesce((select jsonb_agg(t) from (
      select engine_result->>'ruleId' as rule, count(*) as reviews,
        count(*) filter(where disposition='accepted') as accepted,
        count(*) filter(where disposition='modified') as modified,
        count(*) filter(where disposition='rejected') as rejected
      from public.clinical_engine_reviews where created_at >= now()-make_interval(days=>greatest(1,least(p_days,365)))
      group by engine_result->>'ruleId'
    )t),'[]'::jsonb)) into result from public.clinical_engine_reviews r
    where created_at >= now()-make_interval(days=>greatest(1,least(p_days,365)));
  return result;
end $$;
revoke all on function private.engine_pilot_analytics(integer) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.engine_pilot_analytics(integer) to authenticated;
create function public.get_engine_pilot_analytics(p_days integer default 30)
returns jsonb language sql security invoker set search_path = '' as $$select private.engine_pilot_analytics(p_days)$$;
revoke all on function public.get_engine_pilot_analytics(integer) from public, anon;
grant execute on function public.get_engine_pilot_analytics(integer) to authenticated;

-- Clinically contextual messages contain only authored/approved text, never engine output.
create table public.care_messages (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (length(trim(body)) between 1 and 4000),
  program_id uuid references public.home_programs(id) on delete set null,
  kind text not null check (kind in ('patient_message','clinician_message','approved_guidance')),
  created_at timestamptz not null default now()
);
create index care_messages_patient_time on public.care_messages(patient_id, created_at);
alter table public.care_messages enable row level security;
revoke all on public.care_messages from anon, authenticated;
grant select, insert on public.care_messages to authenticated;
create policy care_relationship_read on public.care_messages for select to authenticated
using (exists(select 1 from public.patients p where p.id=patient_id and (p.clinician_id=(select auth.uid()) or p.patient_profile_id=(select auth.uid()))));
create policy care_relationship_send on public.care_messages for insert to authenticated
with check (author_id=(select auth.uid()) and exists(select 1 from public.patients p where p.id=patient_id and
  ((p.clinician_id=(select auth.uid()) and kind in ('clinician_message','approved_guidance')) or (p.patient_profile_id=(select auth.uid()) and kind='patient_message')))
  and (program_id is null or exists(select 1 from public.home_programs h join public.episodes e on e.id=h.episode_id where h.id=program_id and e.patient_id=care_messages.patient_id)));

-- Atomic guidance publication + preserved history, with stale-version protection.
create function public.publish_care_guidance(p_patient_id uuid, p_program_id uuid, p_expected_version timestamptz, p_body text, p_message_id uuid)
returns timestamptz language plpgsql security invoker set search_path = '' as $$
declare saved_at timestamptz;
begin
  if not exists(select 1 from public.patients where id=p_patient_id and clinician_id=auth.uid()) then raise exception 'An explicit treating relationship is required'; end if;
  if length(trim(p_body)) not between 1 and 4000 then raise exception 'Guidance must contain 1–4000 characters'; end if;
  update public.home_programs h set patient_explanation=trim(p_body),updated_at=clock_timestamp()
    where h.id=p_program_id and h.updated_at=p_expected_version and h.status='active'
    and exists(select 1 from public.episodes e where e.id=h.episode_id and e.patient_id=p_patient_id)
    returning updated_at into saved_at;
  if saved_at is null then raise exception 'The program changed. Reload and review the latest version.'; end if;
  insert into public.care_messages(id,patient_id,author_id,body,program_id,kind)
  values(p_message_id,p_patient_id,auth.uid(),trim(p_body),p_program_id,'approved_guidance');
  return saved_at;
end $$;
revoke all on function public.publish_care_guidance(uuid,uuid,timestamptz,text,uuid) from public, anon;
grant execute on function public.publish_care_guidance(uuid,uuid,timestamptz,text,uuid) to authenticated;

-- Actual program edits are captured separately from the clinician's intended modification.
create table public.engine_program_changes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  review_id uuid references public.clinical_engine_reviews(id) on delete set null,
  clinician_id uuid not null references public.profiles(id),
  entity text not null,
  operation text not null,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default now()
);
create index engine_program_changes_patient_time on public.engine_program_changes(patient_id,created_at);
alter table public.engine_program_changes enable row level security;
revoke all on public.engine_program_changes from anon,authenticated;
grant select on public.engine_program_changes to authenticated;
create policy program_change_treating_read on public.engine_program_changes for select to authenticated
using(exists(select 1 from public.patients p where p.id=patient_id and p.clinician_id=(select auth.uid())));
create function private.capture_engine_program_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p_id uuid; h_id uuid; r_id uuid; previous jsonb; current_value jsonb;
begin
  if tg_op <> 'INSERT' then previous=to_jsonb(old); end if;
  if tg_op <> 'DELETE' then current_value=to_jsonb(new); end if;
  if tg_table_name='home_programs' then
    select e.patient_id into p_id from public.episodes e where e.id=coalesce((current_value->>'episode_id')::uuid,(previous->>'episode_id')::uuid);
  else
    h_id=coalesce((current_value->>'home_program_id')::uuid,(previous->>'home_program_id')::uuid);
    select e.patient_id into p_id from public.home_programs h join public.episodes e on e.id=h.episode_id where h.id=h_id;
  end if;
  if auth.uid() is null or not exists(select 1 from public.patients where id=p_id and clinician_id=auth.uid()) then return null; end if;
  select id into r_id from public.clinical_engine_reviews where patient_id=p_id order by created_at desc limit 1;
  insert into public.engine_program_changes(patient_id,review_id,clinician_id,entity,operation,before_value,after_value)
  values(p_id,r_id,auth.uid(),tg_table_name,tg_op,previous,current_value);
  return null;
end $$;
revoke all on function private.capture_engine_program_change() from public,anon,authenticated;
create trigger capture_engine_program after insert or update or delete on public.home_programs
for each row execute function private.capture_engine_program_change();
create trigger capture_engine_exercise after insert or update or delete on public.home_program_exercises
for each row execute function private.capture_engine_program_change();
