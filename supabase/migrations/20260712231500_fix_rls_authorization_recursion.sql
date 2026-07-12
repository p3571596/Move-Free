-- RLS policies call authorization helpers while reading the same protected
-- tables. Put the privileged lookups in a non-exposed schema so they bypass
-- RLS without exposing table data or creating recursive policy evaluation.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

create or replace function private.is_clinician_for_patient(target_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.patients p
    where p.id = target_patient_id
      and p.clinician_id = (select auth.uid())
  );
$$;

create or replace function private.is_patient_self(target_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.patients p
    where p.id = target_patient_id
      and p.patient_profile_id = (select auth.uid())
  );
$$;

create or replace function private.can_access_patient(target_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.patients p
    left join public.profiles profile on profile.id = (select auth.uid())
    where p.id = target_patient_id
      and (
        p.clinician_id = (select auth.uid())
        or p.patient_profile_id = (select auth.uid())
        or profile.role = 'admin'
      )
  );
$$;

create or replace function private.is_clinician_for_episode(target_episode_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.episodes e
    join public.patients p on p.id = e.patient_id
    where e.id = target_episode_id
      and p.clinician_id = (select auth.uid())
  );
$$;

create or replace function private.can_access_episode(target_episode_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.episodes e
    join public.patients p on p.id = e.patient_id
    left join public.profiles profile on profile.id = (select auth.uid())
    where e.id = target_episode_id
      and (
        p.clinician_id = (select auth.uid())
        or p.patient_profile_id = (select auth.uid())
        or profile.role = 'admin'
      )
  );
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

create or replace function public.is_admin()
returns boolean language sql stable set search_path = ''
as $$ select private.is_admin(); $$;

create or replace function public.is_clinician_for_patient(target_patient_id uuid)
returns boolean language sql stable set search_path = ''
as $$ select private.is_clinician_for_patient(target_patient_id); $$;

create or replace function public.is_patient_self(target_patient_id uuid)
returns boolean language sql stable set search_path = ''
as $$ select private.is_patient_self(target_patient_id); $$;

create or replace function public.can_access_patient(target_patient_id uuid)
returns boolean language sql stable set search_path = ''
as $$ select private.can_access_patient(target_patient_id); $$;

create or replace function public.is_clinician_for_episode(target_episode_id uuid)
returns boolean language sql stable set search_path = ''
as $$ select private.is_clinician_for_episode(target_episode_id); $$;

create or replace function public.can_access_episode(target_episode_id uuid)
returns boolean language sql stable set search_path = ''
as $$ select private.can_access_episode(target_episode_id); $$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_clinician_for_patient(uuid) from public, anon;
revoke all on function public.is_patient_self(uuid) from public, anon;
revoke all on function public.can_access_patient(uuid) from public, anon;
revoke all on function public.is_clinician_for_episode(uuid) from public, anon;
revoke all on function public.can_access_episode(uuid) from public, anon;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_clinician_for_patient(uuid) to authenticated;
grant execute on function public.is_patient_self(uuid) to authenticated;
grant execute on function public.can_access_patient(uuid) to authenticated;
grant execute on function public.is_clinician_for_episode(uuid) to authenticated;
grant execute on function public.can_access_episode(uuid) to authenticated;
