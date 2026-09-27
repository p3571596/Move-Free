-- Apply to an isolated Stage 2 database first. No deletion or rewriting of legacy data.
alter table public.home_program_exercises alter column exercise_id drop not null;
alter table public.home_program_exercises add column prescription jsonb;
alter table public.home_program_exercises add column prescription_version integer not null default 0;

create table public.exercise_creation_drafts (
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id),
 program_id uuid not null references public.home_programs(id), assignment_id uuid references public.home_program_exercises(id),
 base_version integer not null default 0, template_id uuid references public.exercises(id), owner_id uuid not null references auth.users(id),
 content jsonb not null default '{}'::jsonb, revision integer not null default 0,
 state text not null default 'draft' check(state in ('draft','approved','discarded')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.exercise_creation_media (
 id uuid primary key, draft_id uuid not null references public.exercise_creation_drafts(id),
 object_path text not null unique check(object_path=id::text||'/source'),
 mime_type text not null check(mime_type in ('video/mp4','video/webm','video/quicktime')),
 byte_size integer not null check(byte_size between 1 and 25000000),
 state text not null default 'uploading' check(state in ('uploading','ready','withdrawn')),
 created_at timestamptz not null default now()
);
create table public.exercise_ai_runs (
 id uuid primary key default gen_random_uuid(),draft_id uuid not null references public.exercise_creation_drafts(id),
 media_id uuid references public.exercise_creation_media(id), draft_revision integer not null,
 status text not null default 'pending' check(status in ('pending','success','failed')),
 original_draft jsonb, raw_draft jsonb, evidence jsonb, limitations jsonb, model text,
 populated_fields text[] not null default '{}',error_code text, duration_ms integer,
 created_at timestamptz not null default now()
);
create table public.exercise_prescription_revisions (
 id uuid primary key default gen_random_uuid(),assignment_id uuid not null references public.home_program_exercises(id),
 patient_id uuid not null references public.patients(id), content jsonb not null,
 ai_run_id uuid references public.exercise_ai_runs(id), changed_fields text[] not null default '{}',
 approved_by uuid not null references auth.users(id), approved_at timestamptz not null default now(),
 creation_ms bigint, approval_ms bigint
);
create table public.exercise_creation_events (
 id uuid primary key default gen_random_uuid(),patient_id uuid not null references public.patients(id),
 actor_id uuid not null default auth.uid(),event text not null check(event in ('patient_video_played')),
 media_id uuid not null references public.exercise_creation_media(id),created_at timestamptz not null default now()
);
create index creation_drafts_patient on public.exercise_creation_drafts(patient_id);
create index creation_drafts_program on public.exercise_creation_drafts(program_id);
create index creation_media_draft on public.exercise_creation_media(draft_id);
create index creation_runs_draft on public.exercise_ai_runs(draft_id,created_at desc);
create index creation_revisions_patient on public.exercise_prescription_revisions(patient_id);
create index creation_revisions_assignment on public.exercise_prescription_revisions(assignment_id);
create index creation_events_patient on public.exercise_creation_events(patient_id);
alter table public.exercise_creation_drafts enable row level security;
alter table public.exercise_creation_media enable row level security;
alter table public.exercise_ai_runs enable row level security;
alter table public.exercise_prescription_revisions enable row level security;
alter table public.exercise_creation_events enable row level security;
revoke all on public.exercise_creation_drafts,public.exercise_creation_media,public.exercise_ai_runs,public.exercise_prescription_revisions,public.exercise_creation_events from anon,authenticated;
grant select on public.exercise_creation_drafts,public.exercise_creation_media,public.exercise_ai_runs,public.exercise_prescription_revisions,public.exercise_creation_events to authenticated;
grant all on public.exercise_creation_drafts,public.exercise_creation_media,public.exercise_ai_runs,public.exercise_prescription_revisions,public.exercise_creation_events to service_role;
create policy creation_draft_read on public.exercise_creation_drafts for select to authenticated using(public.is_clinician_for_patient(patient_id));
create policy creation_runs_read on public.exercise_ai_runs for select to authenticated using(exists(select 1 from public.exercise_creation_drafts d where d.id=draft_id));
create policy creation_revisions_read on public.exercise_prescription_revisions for select to authenticated using(public.is_clinician_for_patient(patient_id));
create policy creation_events_read on public.exercise_creation_events for select to authenticated using(public.is_clinician_for_patient(patient_id));
-- This helper avoids recursive RLS and grants patients only the currently published object.
create function private.can_read_creation_media(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.exercise_creation_media m join public.exercise_creation_drafts d on d.id=m.draft_id
 where m.id=p_id and (public.is_clinician_for_patient(d.patient_id) or (m.state='ready' and public.is_patient_self(d.patient_id) and exists(
 select 1 from public.home_program_exercises x join public.home_programs h on h.id=x.home_program_id join public.episodes e on e.id=h.episode_id
 where x.prescription->>'media_id'=m.id::text and h.status='active' and e.patient_id=d.patient_id))))
$$;
create policy creation_media_read on public.exercise_creation_media for select to authenticated using(private.can_read_creation_media(id));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('exercise-creation-private','exercise-creation-private',false,25000000,array['video/mp4','video/webm','video/quicktime']);
create policy creation_object_insert on storage.objects for insert to authenticated with check(bucket_id='exercise-creation-private' and exists(
 select 1 from public.exercise_creation_media m join public.exercise_creation_drafts d on d.id=m.draft_id where m.object_path=name and m.state='uploading' and d.state='draft' and public.is_clinician_for_patient(d.patient_id)));
create policy creation_object_read on storage.objects for select to authenticated using(bucket_id='exercise-creation-private' and exists(
 select 1 from public.exercise_creation_media m where m.object_path=name and m.state='ready' and private.can_read_creation_media(m.id)));
create policy creation_object_delete on storage.objects for delete to authenticated using(bucket_id='exercise-creation-private' and exists(
 select 1 from public.exercise_creation_media m join public.exercise_creation_drafts d on d.id=m.draft_id where m.object_path=name and m.state='withdrawn' and public.is_clinician_for_patient(d.patient_id)));
create policy creation_object_cleanup on storage.objects for select to authenticated using(bucket_id='exercise-creation-private' and storage.allow_any_operation(array['object.delete','object.delete_many']) and exists(
 select 1 from public.exercise_creation_media m join public.exercise_creation_drafts d on d.id=m.draft_id where m.object_path=name and m.state='withdrawn' and public.is_clinician_for_patient(d.patient_id)));

create function private.validate_prescription(p jsonb) returns void language plpgsql set search_path='' as $$
declare k text;
begin
 if jsonb_typeof(p) is distinct from 'object' then raise exception 'Invalid prescription'; end if;
 foreach k in array array['name','instructions','cues','equipment','category','frequency','intensity','sets','reps','hold','duration','rest','type'] loop
 if jsonb_typeof(p->k) is distinct from 'string' or length(p->>k)>(case when k='instructions' then 4000 when k='cues' then 2000 else 300 end) then raise exception 'Invalid prescription field: %',k; end if;
 end loop;
 if nullif(trim(p->>'name'),'') is null then raise exception 'Exercise name is required'; end if;
end $$;

create function public.stage2_draft(p_action text,p_id uuid,p_patient uuid,p_program uuid,p_content jsonb default '{}',p_revision integer default 0) returns uuid
language plpgsql security definer set search_path='' as $$
declare d public.exercise_creation_drafts; assigned public.home_program_exercises; x uuid; m uuid; run public.exercise_ai_runs; changed text[]; final jsonb;
begin
 if auth.uid() is null or not public.is_clinician_for_patient(p_patient) then raise exception 'Access denied'; end if;
 perform 1 from public.home_programs h join public.episodes e on e.id=h.episode_id where h.id=p_program and e.patient_id=p_patient and h.status='active' for update of h;
 if not found then raise exception 'Active program required'; end if;
 if p_action='create' then
 if p_content ? 'assignment_id' then
 select * into assigned from public.home_program_exercises where id=(p_content->>'assignment_id')::uuid and home_program_id=p_program for update;
 if assigned.id is null then raise exception 'Assignment not found';end if;
 end if;
 insert into public.exercise_creation_drafts(id,patient_id,program_id,owner_id,assignment_id,base_version,content) values(p_id,p_patient,p_program,auth.uid(),assigned.id,coalesce(assigned.prescription_version,0),coalesce(assigned.prescription,'{}')-'media_id');return p_id;
 end if;
 select * into d from public.exercise_creation_drafts where id=p_id and patient_id=p_patient and program_id=p_program for update;
 if d.id is null or d.state<>'draft' or d.revision<>p_revision then raise exception 'Draft changed. Reload before continuing.'; end if;
 if p_action='discard' then
 update public.exercise_creation_media set state='withdrawn' where draft_id=d.id;
 update public.exercise_creation_drafts set state='discarded',revision=revision+1,updated_at=now() where id=d.id;return d.id;
 end if;
 perform private.validate_prescription(p_content);
 final=p_content - 'media_id';
 if p_action='save' then
 update public.exercise_creation_drafts set content=final,revision=revision+1,updated_at=now() where id=d.id;return d.id;
 end if;
 if p_action<>'approve' then raise exception 'Invalid action'; end if;
 if nullif(trim(final->>'instructions'),'') is null then raise exception 'Review instructions before approving'; end if;
 select id into m from public.exercise_creation_media where draft_id=d.id and state='ready' order by created_at desc limit 1;
 if exists(select 1 from public.exercise_creation_media where draft_id=d.id and state='uploading') then raise exception 'Finish or delete incomplete upload first'; end if;
 if m is not null then final=final||jsonb_build_object('media_id',m); end if;
 select * into run from public.exercise_ai_runs where draft_id=d.id and status='success' and media_id is not distinct from m order by created_at desc limit 1;
 select coalesce(array_agg(key),'{}') into changed from jsonb_each_text(final) where key<>'media_id' and value is distinct from run.original_draft->>key;
 x=d.assignment_id;
 if x is null then
 x=gen_random_uuid();
 insert into public.home_program_exercises(id,home_program_id,exercise_id,sort_order) values(x,p_program,null,-1);
 else
 select * into assigned from public.home_program_exercises where id=x and home_program_id=p_program for update;
 if assigned.prescription_version<>d.base_version then raise exception 'Assignment changed. Start a new replacement draft.';end if;
 end if;
 update public.home_program_exercises set dosage_sets=final->>'sets',dosage_reps=final->>'reps',frequency=final->>'frequency',notes=final->>'cues',category=case when final->>'category' in ('warm_up','mobility','strength','balance','conditioning','cool_down','education') then final->>'category' else 'other' end,prescription=final,prescription_version=prescription_version+1 where id=x;
 insert into public.exercise_prescription_revisions(assignment_id,patient_id,content,ai_run_id,changed_fields,approved_by,creation_ms,approval_ms)
 values(x,p_patient,final,run.id,changed,auth.uid(),extract(epoch from now()-d.created_at)*1000,case when run.id is not null then extract(epoch from now()-run.created_at)*1000 else null end);
 update public.exercise_creation_drafts set state='approved',assignment_id=x,content=final,revision=revision+1,updated_at=now() where id=d.id;
 update public.home_programs set updated_at=now() where id=p_program;
 return x;
end $$;

create function public.stage2_media(p_action text,p_id uuid,p_draft uuid,p_size integer default 0,p_mime text default '') returns void
language plpgsql security definer set search_path='' as $$
declare d public.exercise_creation_drafts; m public.exercise_creation_media;
begin
 select * into d from public.exercise_creation_drafts where id=p_draft for update;
 if auth.uid() is null or d.id is null or not public.is_clinician_for_patient(d.patient_id) then raise exception 'Access denied'; end if;
 if p_action='withdraw' then
 update public.exercise_creation_media set state='withdrawn' where id=p_id and draft_id=d.id;return;
 end if;
 if d.state<>'draft' then raise exception 'This exercise is already approved'; end if;
 if p_action='create' then
 if exists(select 1 from public.exercise_creation_media where draft_id=d.id and state<>'withdrawn') then raise exception 'Delete the previous recording first'; end if;
 insert into public.exercise_creation_media(id,draft_id,object_path,byte_size,mime_type) values(p_id,d.id,p_id::text||'/source',p_size,p_mime);return;
 end if;
 select * into m from public.exercise_creation_media where id=p_id and draft_id=d.id for update;
 if p_action<>'finish' or m.state is distinct from 'uploading' then raise exception 'Invalid upload'; end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='exercise-creation-private' and o.name=m.object_path and (o.metadata->>'size')::bigint=m.byte_size and o.metadata->>'mimetype'=m.mime_type) then raise exception 'Incomplete upload'; end if;
 update public.exercise_creation_media set state='ready' where id=m.id;
end $$;

create function public.stage2_begin_ai(p_draft uuid,p_media uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.exercise_creation_drafts; x uuid;
begin
 select * into d from public.exercise_creation_drafts where id=p_draft for update;
 if auth.uid() is null or d.id is null or d.state<>'draft' or not public.is_clinician_for_patient(d.patient_id) then raise exception 'Access denied'; end if;
 if exists(select 1 from public.exercise_ai_runs r join public.exercise_creation_drafts q on q.id=r.draft_id where q.patient_id=d.patient_id and r.created_at>now()-interval '30 seconds') then raise exception 'Wait 30 seconds before retrying AI'; end if;
 if (select count(*) from public.exercise_ai_runs r join public.exercise_creation_drafts q on q.id=r.draft_id where q.owner_id=auth.uid() and r.created_at>now()-interval '1 hour')>=30 then raise exception 'Hourly AI limit reached'; end if;
 if p_media is not null and not exists(select 1 from public.exercise_creation_media where id=p_media and draft_id=d.id and state='ready') then raise exception 'Video not ready'; end if;
 insert into public.exercise_ai_runs(draft_id,media_id,draft_revision) values(d.id,p_media,d.revision) returning id into x;return x;
end $$;

create function public.stage2_video_played(p_media uuid) returns void language plpgsql security definer set search_path='' as $$
declare patient uuid;
begin
 select d.patient_id into patient from public.exercise_creation_media m join public.exercise_creation_drafts d on d.id=m.draft_id where m.id=p_media;
 if auth.uid() is null or not public.is_patient_self(patient) or not private.can_read_creation_media(p_media) then raise exception 'Access denied'; end if;
 if not exists(select 1 from public.exercise_creation_events where media_id=p_media and actor_id=auth.uid() and created_at>now()-interval '1 hour') then
 insert into public.exercise_creation_events(patient_id,event,media_id) values(patient,'patient_video_played',p_media);end if;
end $$;
revoke all on function private.can_read_creation_media(uuid),private.validate_prescription(jsonb),public.stage2_draft(text,uuid,uuid,uuid,jsonb,integer),public.stage2_media(text,uuid,uuid,integer,text),public.stage2_begin_ai(uuid,uuid),public.stage2_video_played(uuid) from public,anon;
grant execute on function private.can_read_creation_media(uuid),public.stage2_draft(text,uuid,uuid,uuid,jsonb,integer),public.stage2_media(text,uuid,uuid,integer,text),public.stage2_begin_ai(uuid,uuid),public.stage2_video_played(uuid) to authenticated;

-- Atomic program save: retained IDs survive; patient edits never write exercises.
create function public.stage2_save_program(p_program uuid,p_patient uuid,p_items jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare item jsonb; c jsonb; x public.home_program_exercises; aid uuid; tid uuid; ids uuid[]='{}'; pos integer=0;
begin
 if auth.uid() is null or not public.is_clinician_for_patient(p_patient) then raise exception 'Access denied';end if;
 perform 1 from public.home_programs h join public.episodes e on e.id=h.episode_id where h.id=p_program and e.patient_id=p_patient and h.status='active' for update of h;
 if not found then raise exception 'Active program required'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>100 then raise exception 'Invalid program';end if;
 for item in select value from jsonb_array_elements(p_items) loop
 c=item->'content';perform private.validate_prescription(c);c=c-'media_id';
 aid=(item->>'id')::uuid;tid=(item->>'template_id')::uuid;
 if aid is not null then
 select * into x from public.home_program_exercises where id=aid and home_program_id=p_program for update;
 if x.id is null or x.prescription_version<>(item->>'expected_version')::integer then raise exception 'Program changed. Reload before saving.';end if;
 tid=x.exercise_id;
 if x.prescription ? 'media_id' then c=c||jsonb_build_object('media_id',x.prescription->>'media_id');end if;
 else
 if tid is null or not exists(select 1 from public.exercises where id=tid and clinician_id=auth.uid()) then raise exception 'Choose a standard exercise or use personalized creation';end if;
 aid=gen_random_uuid();
 insert into public.home_program_exercises(id,home_program_id,exercise_id) values(aid,p_program,tid);
 end if;
 if aid=any(ids) then raise exception 'Duplicate assignment';end if;
 update public.home_program_exercises set prescription=c,prescription_version=prescription_version+1,sort_order=pos,dosage_sets=c->>'sets',dosage_reps=c->>'reps',frequency=c->>'frequency',notes=c->>'cues',category=case when c->>'category' in ('warm_up','mobility','strength','balance','conditioning','cool_down','education') then c->>'category' else 'other' end where id=aid;
 insert into public.exercise_prescription_revisions(assignment_id,patient_id,content,approved_by) values(aid,p_patient,c,auth.uid());
 ids=array_append(ids,aid);pos=pos+1;
 end loop;
 -- Refuse stale clients omitting assignments; removal is a separate explicit operation.
 if exists(select 1 from public.home_program_exercises where home_program_id=p_program and not(id=any(ids))) then raise exception 'Program contains other exercises. Reload before saving.';end if;
 update public.home_programs set updated_at=now() where id=p_program;
end $$;
revoke all on function public.stage2_save_program(uuid,uuid,jsonb) from public,anon;
grant execute on function public.stage2_save_program(uuid,uuid,jsonb) to authenticated;

-- Keep privileged implementations outside the exposed API schema.
alter function public.stage2_draft(text,uuid,uuid,uuid,jsonb,integer) set schema private;
create function public.stage2_draft(p_action text,p_id uuid,p_patient uuid,p_program uuid,p_content jsonb default '{}',p_revision integer default 0) returns uuid language sql security invoker set search_path='' as $$select private.stage2_draft(p_action,p_id,p_patient,p_program,p_content,p_revision)$$;
revoke all on function public.stage2_draft(text,uuid,uuid,uuid,jsonb,integer) from public,anon;
grant execute on function public.stage2_draft(text,uuid,uuid,uuid,jsonb,integer) to authenticated;
alter function public.stage2_media(text,uuid,uuid,integer,text) set schema private;
create function public.stage2_media(p_action text,p_id uuid,p_draft uuid,p_size integer default 0,p_mime text default '') returns void language sql security invoker set search_path='' as $$select private.stage2_media(p_action,p_id,p_draft,p_size,p_mime)$$;
revoke all on function public.stage2_media(text,uuid,uuid,integer,text) from public,anon;
grant execute on function public.stage2_media(text,uuid,uuid,integer,text) to authenticated;
alter function public.stage2_begin_ai(uuid,uuid) set schema private;
create function public.stage2_begin_ai(p_draft uuid,p_media uuid default null) returns uuid language sql security invoker set search_path='' as $$select private.stage2_begin_ai(p_draft,p_media)$$;
revoke all on function public.stage2_begin_ai(uuid,uuid) from public,anon;
grant execute on function public.stage2_begin_ai(uuid,uuid) to authenticated;
alter function public.stage2_video_played(uuid) set schema private;
create function public.stage2_video_played(p_media uuid) returns void language sql security invoker set search_path='' as $$select private.stage2_video_played(p_media)$$;
revoke all on function public.stage2_video_played(uuid) from public,anon;
grant execute on function public.stage2_video_played(uuid) to authenticated;
alter function public.stage2_save_program(uuid,uuid,jsonb) set schema private;
create function public.stage2_save_program(p_program uuid,p_patient uuid,p_items jsonb) returns void language sql security invoker set search_path='' as $$select private.stage2_save_program(p_program,p_patient,p_items)$$;
revoke all on function public.stage2_save_program(uuid,uuid,jsonb) from public,anon;
grant execute on function public.stage2_save_program(uuid,uuid,jsonb) to authenticated;
