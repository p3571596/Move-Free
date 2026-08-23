-- Founder analytics and privacy-minimized workflow instrumentation.
-- No patient names, email addresses, diagnoses, notes, or free-text values are
-- copied into analytics. The aggregate RPC is admin-only and returns no PHI.

create table public.analytics_events (
  id bigint generated always as identity primary key,
  event_name text not null check (event_name in (
    'patient_review_opened',
    'program_created',
    'program_updated',
    'patient_checkin_submitted',
    'exercise_session_submitted'
  )),
  actor_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete cascade,
  home_program_id uuid references public.home_programs(id) on delete set null,
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 21600000),
  client_event_id uuid not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (actor_id, client_event_id)
);

comment on table public.analytics_events is
  'Privacy-minimized product workflow events. Contains identifiers and timing only; never store names, diagnoses, notes, or other free text.';

create index analytics_events_occurred_at_idx
  on public.analytics_events (occurred_at desc);
create index analytics_events_event_occurred_idx
  on public.analytics_events (event_name, occurred_at desc);
create index analytics_events_patient_occurred_idx
  on public.analytics_events (patient_id, occurred_at desc)
  where patient_id is not null;

alter table public.analytics_events enable row level security;

create policy analytics_events_insert_owned
  on public.analytics_events
  for insert
  to authenticated
  with check (
    actor_id = (select auth.uid())
    and patient_id is not null
    and (
      (
        event_name in ('patient_review_opened', 'program_created', 'program_updated')
        and (select public.is_clinician_for_patient(patient_id))
      )
      or (
        event_name in ('patient_checkin_submitted', 'exercise_session_submitted')
        and (select public.is_patient_self(patient_id))
      )
    )
    and (
      home_program_id is null
      or exists (
        select 1
        from public.home_programs hp
        join public.episodes e on e.id = hp.episode_id
        where hp.id = analytics_events.home_program_id
          and e.patient_id = analytics_events.patient_id
      )
    )
  );

create policy analytics_events_select_admin
  on public.analytics_events
  for select
  to authenticated
  using ((select public.is_admin()));

revoke all on table public.analytics_events from anon;
grant insert, select on table public.analytics_events to authenticated;
revoke all on sequence public.analytics_events_id_seq from anon;
grant usage, select on sequence public.analytics_events_id_seq to authenticated;

create or replace function private.get_founder_analytics(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := greatest(7, least(coalesce(p_days, 30), 90));
  v_start timestamptz := now() - make_interval(days => greatest(7, least(coalesce(p_days, 30), 90)));
  v_result jsonb;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  with
  active_patient_rows as (
    select p.id, p.clinician_id, p.created_at,
      coalesce(min(hp.assigned_at) filter (where hp.assigned_at is not null), p.created_at) as eligible_since
    from public.patients p
    left join public.episodes e on e.patient_id = p.id
    left join public.home_programs hp on hp.episode_id = e.id and hp.status in ('active', 'completed')
    where p.status in ('active', 'needs_review')
    group by p.id, p.clinician_id, p.created_at
  ),
  exercise_totals as (
    select
      count(*) filter (where l.completion_status in ('completed', 'partial', 'skipped')) as attempted,
      count(*) filter (where l.completion_status in ('completed', 'partial')) as participated,
      count(distinct coalesce(l.session_id::text, l.id::text)) filter (where l.completion_status in ('completed', 'partial')) as sessions
    from public.exercise_adherence_logs l
    where coalesce(l.performed_at, l.created_at) >= v_start
  ),
  eligible_days as (
    select coalesce(sum(
      greatest(0, current_date - greatest(eligible_since::date, v_start::date) + 1)
    ), 0)::numeric as total
    from active_patient_rows
  ),
  checkin_days as (
    select count(distinct (c.patient_id, c.checkin_date))::numeric as total
    from public.daily_checkins c
    join active_patient_rows p on p.id = c.patient_id
    where c.created_at >= v_start
  ),
  checkin_gaps as (
    select extract(epoch from (created_at - lag(created_at) over (partition by patient_id order by created_at))) / 3600.0 as gap_hours
    from public.daily_checkins
    where created_at >= v_start
  ),
  daily_trends as (
    select c.checkin_date as day,
      round(avg(c.pain_score)::numeric, 1) as pain,
      round(avg(c.confidence_score)::numeric, 1) as confidence,
      count(*) as checkins
    from public.daily_checkins c
    where c.created_at >= v_start
    group by c.checkin_date
    order by c.checkin_date
  ),
  pain_summary as (
    select
      round(avg(pain_score) filter (where created_at >= now() - interval '7 days')::numeric, 1) as recent,
      round(avg(pain_score) filter (where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days')::numeric, 1) as previous
    from public.daily_checkins
  ),
  confidence_summary as (
    select
      round(avg(confidence_score) filter (where created_at >= now() - interval '7 days')::numeric, 1) as recent,
      round(avg(confidence_score) filter (where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days')::numeric, 1) as previous
    from public.daily_checkins
  ),
  workflow as (
    select event_name,
      count(*) as event_count,
      round(avg(duration_ms)::numeric / 1000.0, 1) as average_seconds,
      round(percentile_cont(0.5) within group (order by duration_ms)::numeric / 1000.0, 1) as median_seconds
    from public.analytics_events
    where occurred_at >= v_start and duration_ms is not null
    group by event_name
  ),
  activity as (
    select 'workflow'::text as kind, ae.event_name as label, ae.occurred_at, ae.id::text as source_id
    from public.analytics_events ae
    where ae.occurred_at >= v_start
      and ae.event_name in ('patient_review_opened', 'program_created', 'program_updated')
    union all
    select 'checkin', 'patient_checkin_submitted', c.created_at, c.id::text
    from public.daily_checkins c where c.created_at >= v_start
    union all
    select 'exercise', 'exercise_session_submitted', max(coalesce(l.performed_at, l.created_at)), coalesce(l.session_id::text, l.id::text)
    from public.exercise_adherence_logs l
    where coalesce(l.performed_at, l.created_at) >= v_start
    group by l.patient_id, coalesce(l.session_id::text, l.id::text)
    union all
    select 'program', 'program_assigned', hp.assigned_at, hp.id::text
    from public.home_programs hp where hp.assigned_at >= v_start
  ),
  recent_activity as (
    select kind, label, occurred_at
    from activity
    order by occurred_at desc
    limit 16
  )
  select jsonb_build_object(
    'rangeDays', v_days,
    'generatedAt', now(),
    'summary', jsonb_build_object(
      'activeClinicians', (select count(distinct clinician_id) from active_patient_rows),
      'activePatients', (select count(*) from active_patient_rows),
      'programsAssigned', (select count(*) from public.home_programs where assigned_at >= v_start),
      'exerciseSessions', (select sessions from exercise_totals),
      'exerciseAdherencePercent', (select case when attempted = 0 then null else round(participated::numeric * 100 / attempted, 1) end from exercise_totals),
      'checkinCompletionPercent', (select case when e.total = 0 then null else round(least(c.total, e.total) * 100 / e.total, 1) end from eligible_days e cross join checkin_days c),
      'averageHoursBetweenCheckins', (select round(avg(gap_hours)::numeric, 1) from checkin_gaps where gap_hours is not null and gap_hours >= 0)
    ),
    'painTrend', (select jsonb_build_object('recent', recent, 'previous', previous, 'change', case when recent is null or previous is null then null else round(recent - previous, 1) end) from pain_summary),
    'confidenceTrend', (select jsonb_build_object('recent', recent, 'previous', previous, 'change', case when recent is null or previous is null then null else round(recent - previous, 1) end) from confidence_summary),
    'dailyTrends', coalesce((select jsonb_agg(jsonb_build_object('date', day, 'pain', pain, 'confidence', confidence, 'checkins', checkins) order by day) from daily_trends), '[]'::jsonb),
    'workflowTimings', coalesce((select jsonb_agg(jsonb_build_object('eventName', event_name, 'eventCount', event_count, 'averageSeconds', average_seconds, 'medianSeconds', median_seconds) order by event_name) from workflow), '[]'::jsonb),
    'recentActivity', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'label', label, 'occurredAt', occurred_at) order by occurred_at desc) from recent_activity), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function private.get_founder_analytics(integer) from public, anon;
grant execute on function private.get_founder_analytics(integer) to authenticated;

create or replace function public.get_founder_analytics(p_days integer default 30)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_founder_analytics(p_days);
$$;

revoke all on function public.get_founder_analytics(integer) from public, anon;
grant execute on function public.get_founder_analytics(integer) to authenticated;
