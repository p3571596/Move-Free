-- Stage 2 additive preview storage. No Stage 1 tables, policies or engine inputs change.
create table public.exercise_video_assets (
 id uuid primary key,
 patient_id uuid not null references public.patients(id) on delete cascade,
 program_exercise_id uuid not null references public.home_program_exercises(id) on delete cascade,
 owner_id uuid not null references auth.users(id),
 kind text not null check(kind in ('demonstration','performance')),
 state text not null default 'uploading' check(state in ('uploading','ready','approved','withdrawn')),
 object_path text not null unique check(object_path=id::text||'/source'),
 mime_type text not null check(mime_type in ('video/mp4','video/webm','video/quicktime')),
 byte_size integer not null check(byte_size between 1 and 26214400),
 title text not null default '' check(length(title)<=200),
 instructions text not null default '' check(length(instructions)<=4000),
 cues text not null default '' check(length(cues)<=2000),
 consented_at timestamptz,
 consent_notice_version text,
 approved_by uuid references auth.users(id),
 approved_at timestamptz,
 created_at timestamptz not null default now(),
 check(kind<>'performance' or (consented_at is not null and consent_notice_version='video-pilot-v1' and state<>'approved')),
 check((state='approved' and approved_by is not null and approved_at is not null) or (state<>'approved' and approved_by is null and approved_at is null))
);
create index exercise_video_patient_time on public.exercise_video_assets(patient_id,created_at desc);
create index exercise_video_assignment on public.exercise_video_assets(program_exercise_id,created_at desc);
create unique index exercise_video_one_approved on public.exercise_video_assets(program_exercise_id) where kind='demonstration' and state='approved';
create index exercise_video_owner on public.exercise_video_assets(owner_id);
create index exercise_video_approver on public.exercise_video_assets(approved_by);
alter table public.exercise_video_assets enable row level security;
revoke all on public.exercise_video_assets from anon,authenticated;
grant select,insert,delete on public.exercise_video_assets to authenticated;
create policy video_relationship_read on public.exercise_video_assets for select to authenticated using (
 public.is_clinician_for_patient(patient_id) or
 (public.is_patient_self(patient_id) and ((kind='demonstration' and state='approved') or (kind='performance' and owner_id=(select auth.uid()))))
);
create policy video_relationship_insert on public.exercise_video_assets for insert to authenticated with check (
 owner_id=(select auth.uid()) and state='uploading' and approved_at is null and approved_by is null
 and ((kind='demonstration' and public.is_clinician_for_patient(patient_id)) or (kind='performance' and public.is_patient_self(patient_id)))
 and exists(select 1 from public.home_program_exercises x join public.home_programs h on h.id=x.home_program_id join public.episodes e on e.id=h.episode_id
 where x.id=program_exercise_id and e.patient_id=exercise_video_assets.patient_id and h.status='active')
);
create policy video_failed_upload_cleanup on public.exercise_video_assets for delete to authenticated using (
 owner_id=(select auth.uid()) and state='uploading' and public.can_access_patient(patient_id)
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('exercise-video-preview','exercise-video-preview',false,26214400,array['video/mp4','video/webm','video/quicktime']);
create policy exercise_video_upload on storage.objects for insert to authenticated with check (
 bucket_id='exercise-video-preview' and exists(select 1 from public.exercise_video_assets a where a.object_path=name and a.owner_id=(select auth.uid()) and a.state='uploading')
);
create policy exercise_video_private_read on storage.objects for select to authenticated using (
 bucket_id='exercise-video-preview' and exists(select 1 from public.exercise_video_assets a where a.object_path=name and a.state in ('ready','approved'))
);
create policy exercise_video_failed_upload_cleanup on storage.objects for delete to authenticated using (
 bucket_id='exercise-video-preview' and exists(select 1 from public.exercise_video_assets a where a.object_path=name and a.owner_id=(select auth.uid()) and a.state in ('uploading','withdrawn'))
);
-- SELECT is also required by Storage deletion, but must not authorize signing or playback.
create policy exercise_video_cleanup_lookup on storage.objects for select to authenticated using (
 bucket_id='exercise-video-preview' and storage.allow_any_operation(array['object.delete','object.delete_many'])
 and exists(select 1 from public.exercise_video_assets a where a.object_path=name and a.owner_id=(select auth.uid()) and a.state in ('uploading','withdrawn'))
);
-- No object UPDATE policy: approved media can never be overwritten underneath a clinician's approval.

create function private.finish_exercise_video(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a public.exercise_video_assets;
begin
 select * into a from public.exercise_video_assets where id=p_id for update;
 if auth.uid() is null or a.owner_id is distinct from auth.uid() or a.state is distinct from 'uploading'
 or not public.can_access_patient(a.patient_id) then raise exception 'Upload is unavailable or access denied'; end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='exercise-video-preview' and o.name=a.object_path
   and (o.metadata->>'size')::bigint=a.byte_size and o.metadata->>'mimetype'=a.mime_type)
 then raise exception 'Upload is incomplete. Retry the file upload.'; end if;
 update public.exercise_video_assets set state='ready' where id=p_id;
end $$;
create function public.finish_exercise_video(p_id uuid) returns void language sql security invoker set search_path='' as $$select private.finish_exercise_video(p_id)$$;

create function private.approve_exercise_video(p_id uuid,p_title text,p_instructions text,p_cues text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.exercise_video_assets;
begin
 select * into a from public.exercise_video_assets where id=p_id for update;
 if auth.uid() is null or a.kind is distinct from 'demonstration' or a.state is distinct from 'ready'
 or not public.is_clinician_for_patient(a.patient_id) then raise exception 'Only the treating clinician may approve this demonstration'; end if;
 if nullif(trim(p_title),'') is null or nullif(trim(p_instructions),'') is null then raise exception 'Exercise name and instructions are required'; end if;
 -- A new approval replaces the previous demonstration only for this patient assignment.
 update public.exercise_video_assets set state='withdrawn',approved_by=null,approved_at=null
 where program_exercise_id=a.program_exercise_id and kind='demonstration' and state='approved';
 update public.exercise_video_assets set state='approved',title=trim(p_title),instructions=trim(p_instructions),cues=trim(coalesce(p_cues,'')),approved_by=auth.uid(),approved_at=now() where id=p_id;
end $$;
create function public.approve_exercise_video(p_id uuid,p_title text,p_instructions text,p_cues text) returns void language sql security invoker set search_path='' as $$select private.approve_exercise_video(p_id,p_title,p_instructions,p_cues)$$;

create function private.withdraw_exercise_video(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a public.exercise_video_assets;
begin
 select * into a from public.exercise_video_assets where id=p_id for update;
 if auth.uid() is null or a.id is null or not(public.is_clinician_for_patient(a.patient_id) or (a.kind='performance' and a.owner_id=auth.uid() and public.is_patient_self(a.patient_id))) then raise exception 'Access denied'; end if;
 update public.exercise_video_assets set state='withdrawn',approved_by=null,approved_at=null where id=p_id;
end $$;
create function public.withdraw_exercise_video(p_id uuid) returns void language sql security invoker set search_path='' as $$select private.withdraw_exercise_video(p_id)$$;

revoke all on function private.finish_exercise_video(uuid),private.approve_exercise_video(uuid,text,text,text),private.withdraw_exercise_video(uuid),public.finish_exercise_video(uuid),public.approve_exercise_video(uuid,text,text,text),public.withdraw_exercise_video(uuid) from public,anon;
grant execute on function private.finish_exercise_video(uuid),private.approve_exercise_video(uuid,text,text,text),private.withdraw_exercise_video(uuid),public.finish_exercise_video(uuid),public.approve_exercise_video(uuid,text,text,text),public.withdraw_exercise_video(uuid) to authenticated;
