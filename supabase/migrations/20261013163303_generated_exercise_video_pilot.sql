begin;
alter table private.clinician_feature_grants drop constraint clinician_feature_grants_feature_check;
alter table private.clinician_feature_grants add constraint clinician_feature_grants_feature_check check(feature in ('personalized_exercises','ai_video_assistance','ai_video_generation'));
-- No grants are seeded: generation and analysis have independent account gates.
create table public.clinician_video_generation_jobs (
 id uuid primary key, owner_id uuid not null references auth.users(id),
 movement text not null check(movement in ('squat','heel_raise','sit_to_stand','wall_push_up')),
 model text not null default 'google/veo-3.1-fast-generate-001' check(model='google/veo-3.1-fast-generate-001'),
 duration_seconds integer not null default 4 check(duration_seconds=4),
 cost_cents integer not null default 40 check(cost_cents=40),
 status text not null default 'starting' check(status in ('starting','generating','ready','reviewed','approved','failed')),
 provider_operation jsonb, object_path text unique, error_code text,
 reviewed_content jsonb, reviewed_at timestamptz, review_attestations jsonb,
 asset_id uuid unique references public.exercise_video_assets(id),
 created_at timestamptz not null default now(),
 check(object_path is null or object_path=id::text||'/source.mp4')
);
create index generation_owner_time on public.clinician_video_generation_jobs(owner_id,created_at desc);
alter table public.clinician_video_generation_jobs enable row level security;
revoke all on public.clinician_video_generation_jobs from public,anon,authenticated;
grant select(id,owner_id,movement,model,duration_seconds,cost_cents,status,object_path,error_code,reviewed_content,reviewed_at,review_attestations,asset_id,created_at) on public.clinician_video_generation_jobs to authenticated;
create policy generation_owner_read on public.clinician_video_generation_jobs for select to authenticated using(owner_id=auth.uid() and public.pilot_feature_enabled('ai_video_generation'));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('exercise-generation-private','exercise-generation-private',false,26214400,array['video/mp4']);
create policy generation_draft_read on storage.objects for select to authenticated using(bucket_id='exercise-generation-private' and exists(select 1 from public.clinician_video_generation_jobs j where j.object_path=name and j.status in ('ready','reviewed','approved')));

create function private.begin_video_generation(p_id uuid,p_movement text) returns uuid language plpgsql security definer set search_path='' as $$
declare existing public.clinician_video_generation_jobs;
begin
 if not public.pilot_feature_enabled('ai_video_generation') then raise exception 'Generation access denied'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 select * into existing from public.clinician_video_generation_jobs where id=p_id;
 if found then
 if existing.owner_id<>auth.uid() or existing.movement<>p_movement then raise exception 'Invalid request'; end if;
 return existing.id;
 end if;
 if coalesce((select sum(cost_cents) from public.clinician_video_generation_jobs where owner_id=auth.uid() and created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),0)+40>500 then raise exception 'Daily $5 generation limit reached'; end if;
 -- A lost start response may already be billable. Keep its reservation and never automatically retry it.
 update public.clinician_video_generation_jobs set status='failed',error_code='START_UNCERTAIN' where owner_id=auth.uid() and (status='starting' or (status='generating' and provider_operation is null)) and created_at<now()-interval '5 minutes';
 if exists(select 1 from public.clinician_video_generation_jobs where owner_id=auth.uid() and status in ('starting','generating')) then raise exception 'Finish or resume the existing generation first'; end if;
 insert into public.clinician_video_generation_jobs(id,owner_id,movement) values(p_id,auth.uid(),p_movement);
 return p_id;
end $$;
create function public.begin_video_generation(p_id uuid,p_movement text) returns uuid language sql security invoker set search_path='' as $$select private.begin_video_generation(p_id,p_movement)$$;
create function private.review_generated_video(p_id uuid,p_content jsonb,p_checks jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.pilot_feature_enabled('ai_video_generation') or p_checks is distinct from '{"movement":true,"instructions":true,"fitt":true,"viewed":true}'::jsonb then raise exception 'Review movement, instructions and FITT after viewing'; end if;
 if private.valid_ai_prescription(p_content->'prescription') is distinct from true or jsonb_typeof(p_content) is distinct from 'object'
 or not (p_content ?& array['name','instructions','cues','exercise_type','equipment','prescription'])
 or exists(select 1 from jsonb_object_keys(p_content) k where k<>all(array['name','instructions','cues','exercise_type','equipment','prescription']))
 or exists(select 1 from jsonb_each(p_content) e where e.key<>'prescription' and (jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>case when e.key='instructions' then 4000 when e.key='cues' then 1400 else 200 end))
 or nullif(trim(p_content->>'name'),'') is null or nullif(trim(p_content->>'instructions'),'') is null then raise exception 'Invalid clinical draft'; end if;
 update public.clinician_video_generation_jobs set status='reviewed',reviewed_content=p_content,review_attestations=p_checks,reviewed_at=now()
 where id=p_id and owner_id=auth.uid() and status in ('ready','reviewed');
 if not found then raise exception 'Draft unavailable'; end if;
end $$;
create function public.review_generated_video(p_id uuid,p_content jsonb,p_checks jsonb) returns void language sql security invoker set search_path='' as $$select private.review_generated_video(p_id,p_content,p_checks)$$;
alter table public.exercise_video_assets add column generated_job_id uuid unique references public.clinician_video_generation_jobs(id);
-- Clients may not forge provenance or use the generic manual approval RPC for generated media.
create function private.guard_generated_video() returns trigger language plpgsql security definer set search_path='' as $$
declare j public.clinician_video_generation_jobs;
begin
 if tg_op='UPDATE' and new.generated_job_id is distinct from old.generated_job_id then raise exception 'Immutable video provenance'; end if;
 if new.generated_job_id is null then return new; end if;
 if not public.pilot_feature_enabled('ai_video_generation') then raise exception 'Generation access denied'; end if;
 select * into j from public.clinician_video_generation_jobs where id=new.generated_job_id;
 if j.owner_id is distinct from auth.uid() or j.status not in ('reviewed','approved') then raise exception 'Review required'; end if;
 if new.state='approved' and (j.status<>'approved' or j.asset_id is distinct from new.id or new.title<>j.reviewed_content->>'name' or new.instructions<>j.reviewed_content->>'instructions' or new.cues<>j.reviewed_content->>'cues') then raise exception 'Use reviewed generated video approval'; end if;
 return new;
end $$;
create policy generated_no_client_upload on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'exercise-video-preview' or not exists(select 1 from public.exercise_video_assets a where a.object_path=name and a.generated_job_id is not null));
create trigger generated_video_guard before insert or update on public.exercise_video_assets for each row execute function private.guard_generated_video();
create function private.assign_generated_video(p_job uuid,p_asset uuid) returns void language plpgsql security definer set search_path='' as $$
declare j public.clinician_video_generation_jobs; a public.exercise_video_assets;
begin
 select * into j from public.clinician_video_generation_jobs where id=p_job for update;
 select * into a from public.exercise_video_assets where id=p_asset for update;
 if not public.pilot_feature_enabled('ai_video_generation') or not public.pilot_feature_enabled('personalized_exercises')
 or j.owner_id is distinct from auth.uid() or j.status is distinct from 'reviewed' or a.owner_id is distinct from auth.uid() or a.generated_job_id is distinct from j.id or a.state is distinct from 'ready' or not public.is_clinician_for_patient(a.patient_id) then raise exception 'Reviewed draft and active care relationship required'; end if;
 if not exists(select 1 from public.home_program_exercises x where x.id=a.program_exercise_id and x.prescription=j.reviewed_content->'prescription' and x.patient_name=j.reviewed_content->>'name') then raise exception 'Save the reviewed exercise name and numerical FITT before assigning'; end if;
 -- The authenticated API copies the approved draft bytes. Validate byte counts and MIME in both private buckets.
 if not exists(select 1 from storage.objects s join storage.objects d on d.name=a.object_path and d.bucket_id='exercise-video-preview' where s.name=j.object_path and s.bucket_id='exercise-generation-private' and s.metadata->>'size'=d.metadata->>'size' and d.metadata->>'mimetype'='video/mp4') then raise exception 'Video copy incomplete'; end if;
 update public.clinician_video_generation_jobs set status='approved',asset_id=a.id where id=j.id;
 perform private.approve_exercise_video(a.id,j.reviewed_content->>'name',j.reviewed_content->>'instructions',j.reviewed_content->>'cues');
end $$;
create function public.assign_generated_video(p_job uuid,p_asset uuid) returns void language sql security invoker set search_path='' as $$select private.assign_generated_video(p_job,p_asset)$$;
revoke all on function private.begin_video_generation(uuid,text),public.begin_video_generation(uuid,text),private.review_generated_video(uuid,jsonb,jsonb),public.review_generated_video(uuid,jsonb,jsonb),private.assign_generated_video(uuid,uuid),public.assign_generated_video(uuid,uuid) from public,anon;
grant execute on function private.begin_video_generation(uuid,text),public.begin_video_generation(uuid,text),private.review_generated_video(uuid,jsonb,jsonb),public.review_generated_video(uuid,jsonb,jsonb),private.assign_generated_video(uuid,uuid),public.assign_generated_video(uuid,uuid) to authenticated;
revoke all on function private.guard_generated_video() from public,anon,authenticated;
commit;
