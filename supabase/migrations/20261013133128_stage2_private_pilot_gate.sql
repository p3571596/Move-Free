begin;
-- Operator-managed grants; deliberately no account is enabled by migration.
create table private.clinician_feature_grants (
 user_id uuid not null references auth.users(id),
 feature text not null check(feature in ('personalized_exercises','ai_video_assistance')),
 enabled boolean not null default false,
 expires_at timestamptz,
 primary key(user_id,feature)
);
alter table private.clinician_feature_grants enable row level security;
revoke all on private.clinician_feature_grants from public,anon,authenticated;
create function private.pilot_feature_enabled(p_feature text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists (
 select 1 from private.clinician_feature_grants g join auth.users u on u.id=g.user_id
 where g.user_id=auth.uid() and g.feature=p_feature and g.enabled
 and (g.expires_at is null or g.expires_at>now()) and u.email_confirmed_at is not null
 and (exists(select 1 from public.profiles p where p.id=u.id and p.role in ('clinician','admin'))
      or exists(select 1 from public.patients p where p.clinician_id=u.id))
 )
$$;
create function public.pilot_feature_enabled(p_feature text) returns boolean
language sql stable security invoker set search_path='' as $$select private.pilot_feature_enabled(p_feature)$$;
revoke all on function private.pilot_feature_enabled(text),public.pilot_feature_enabled(text) from public,anon;
grant execute on function private.pilot_feature_enabled(text),public.pilot_feature_enabled(text) to authenticated;
-- Restrictive policies AND existing relationship policies. Patient playback needs no clinician grant.
create policy pilot_video_read on public.exercise_video_assets as restrictive for select to authenticated using (
 (kind='demonstration' and public.is_clinician_for_patient(patient_id) and public.pilot_feature_enabled('personalized_exercises'))
 or (kind='demonstration' and state='approved' and public.is_patient_self(patient_id)
 and exists(select 1 from public.home_program_exercises x join public.home_programs h on h.id=x.home_program_id join public.episodes e on e.id=h.episode_id
 where x.id=program_exercise_id and h.status='active' and e.patient_id=exercise_video_assets.patient_id))
);
create policy pilot_video_insert on public.exercise_video_assets as restrictive for insert to authenticated with check (
 kind='demonstration' and public.pilot_feature_enabled('personalized_exercises') and public.is_clinician_for_patient(patient_id)
);
create policy pilot_video_delete on public.exercise_video_assets as restrictive for delete to authenticated using (
 public.pilot_feature_enabled('personalized_exercises') and public.is_clinician_for_patient(patient_id)
);
-- SECURITY DEFINER RPCs bypass RLS; a trigger gates their writes as well.
create function private.enforce_pilot_video_write() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if not public.pilot_feature_enabled('personalized_exercises') or new.kind<>'demonstration'
 or not public.is_clinician_for_patient(new.patient_id) then raise exception 'Private pilot access required'; end if;
 if new.state<>'withdrawn' and not exists(select 1 from public.home_program_exercises x join public.home_programs h on h.id=x.home_program_id join public.episodes e on e.id=h.episode_id
 where x.id=new.program_exercise_id and e.patient_id=new.patient_id and h.status='active' and e.status<>'discharged') then raise exception 'Active assigned program required'; end if;
 return new;
end $$;
create trigger pilot_video_write before insert or update on public.exercise_video_assets for each row execute function private.enforce_pilot_video_write();
revoke all on function private.enforce_pilot_video_write() from public,anon,authenticated;
-- Prevent cascade removal of metadata while storage files still exist.
create function private.preserve_video_assignment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.exercise_video_assets a where a.program_exercise_id=old.id and
 (a.state<>'withdrawn' or exists(select 1 from storage.objects o where o.bucket_id='exercise-video-preview' and o.name=a.object_path)))
 then raise exception 'Withdraw and delete this exercise video before removing the assignment'; end if;
 return old;
end $$;
create trigger preserve_video_assignment before delete on public.home_program_exercises for each row execute function private.preserve_video_assignment();
revoke all on function private.preserve_video_assignment() from public,anon,authenticated;
-- Disabled unless explicitly configured after privacy/draft validation. No real-patient inference implementation is included.
commit;
