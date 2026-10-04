-- Stage 1 only. Server-owned delivery; no messaging provider or treatment mutations.
alter table public.daily_checkins add column function_direction text check (function_direction in ('improving','stable','worsening','unsure'));
alter table public.exercise_adherence_logs
 add column difficulty_reason text check (difficulty_reason in ('symptoms','fatigue','movement','instructions','other')),
 add column completion_reason text check (completion_reason in ('symptoms','time','fatigue','instructions','other')),
 add column symptom_response text check (symptom_response in ('none','little','lot')),
 add column symptom_recovery text check (symptom_recovery in ('settled','improving','still_increased','unsure'));

create table public.patient_followups (
 id uuid primary key default gen_random_uuid(),
 patient_id uuid not null references public.patients(id),
 episode_id uuid not null references public.episodes(id),
 home_program_id uuid not null references public.home_programs(id),
 kind text not null check (kind in ('inactivity','response')),
 questions text[] not null,
 status text not null default 'pending' check (status in ('pending','answered','cancelled')),
 reason text not null,
 created_at timestamptz not null default now(),
 answered_at timestamptz,
 answers jsonb,
 escalated_at timestamptz
);
create unique index patient_followups_one_pending on public.patient_followups(home_program_id) where status='pending';
create index patient_followups_patient on public.patient_followups(patient_id,created_at desc);
create index patient_followups_episode on public.patient_followups(episode_id);
alter table public.patient_followups enable row level security;
revoke all on public.patient_followups from anon,authenticated;
grant select on public.patient_followups to authenticated;
create policy followups_relationship_read on public.patient_followups for select to authenticated using (public.can_access_patient(patient_id));

-- Minimal scheduler state, separate from clinician-only engine review snapshots.
create table public.patient_followup_state (
 home_program_id uuid primary key references public.home_programs(id),
 patient_id uuid not null references public.patients(id),
 episode_id uuid not null references public.episodes(id),
 state text not null check (state in ('NEEDS_CHECK_IN','CLINICIAN_REVIEW','SAFETY_REVIEW','RESPONSE_AVAILABLE','INACTIVE')),
 reason text not null,
 missing text[] not null default '{}',
 evaluated_at timestamptz not null,
 last_activity_at timestamptz
);
create index patient_followup_state_patient on public.patient_followup_state(patient_id);
create index patient_followup_state_episode on public.patient_followup_state(episode_id);
alter table public.patient_followup_state enable row level security;
revoke all on public.patient_followup_state from anon,authenticated;
grant select on public.patient_followup_state to authenticated;
create policy followup_state_clinician_read on public.patient_followup_state for select to authenticated using (public.is_clinician_for_patient(patient_id));

create or replace function private.refresh_patient_followups(p_patient uuid, p_now timestamptz default now()) returns void
language plpgsql security invoker set search_path='' as $$
declare h record; activity timestamptz; started timestamptz; reviewed timestamptz; cutoff timestamptz;
 safety boolean; abnormal boolean; symptoms boolean; functional boolean; missing text[];
 pending public.patient_followups%rowtype; latest public.patient_followups%rowtype;
 next_state text; why text; question_kind text;
begin
 -- Serialize scheduler and submissions; unique index is a second deduplication guard.
 perform pg_advisory_xact_lock(hashtextextended(p_patient::text,731));
 update public.patient_followups f set status='cancelled'
 where f.patient_id=p_patient and f.status='pending' and not exists (
  select 1 from public.home_programs hp join public.episodes e on e.id=hp.episode_id join public.patients p on p.id=e.patient_id
  where hp.id=f.home_program_id and hp.status='active' and e.status='active' and p.status in ('active','needs_review')
  and exists(select 1 from public.home_program_exercises x where x.home_program_id=hp.id));
 update public.patient_followup_state set state='INACTIVE',reason='No current active case and program',evaluated_at=p_now
 where patient_id=p_patient;
 for h in select hp.*,e.patient_id,e.created_at as episode_created
  from public.home_programs hp join public.episodes e on e.id=hp.episode_id join public.patients p on p.id=e.patient_id
  where p.id=p_patient and p.status in ('active','needs_review') and e.status='active' and hp.status='active'
  and exists(select 1 from public.home_program_exercises x where x.home_program_id=hp.id)
 loop
  started:=greatest(coalesce(h.assigned_at,h.created_at),h.episode_created);
  if started>p_now then continue; end if;
  select max(created_at) into reviewed from public.clinical_decisions where patient_id=p_patient and episode_id=h.episode_id and created_at<=p_now;
  cutoff:=greatest(p_now-interval '14 days',started);
  -- Meaningful activity is a submitted result, nonempty check-in or answered follow-up.
  -- Server creation time caps future-dated reports. Page/video views and analytics do not count.
  select greatest(started,max(t)) into activity from (
   select least(created_at,coalesce(performed_at,created_at)) t from public.exercise_adherence_logs
    where patient_id=p_patient and home_program_id=h.id and completion_status in ('completed','partial','skipped')
   union all select created_at from public.daily_checkins where patient_id=p_patient and episode_id=h.episode_id
    and (symptom_direction is not null or pain_score is not null or function_direction is not null or nullif(btrim(patient_comment),'') is not null)
   union all select answered_at from public.patient_followups where home_program_id=h.id and status='answered'
  ) a where t<=p_now;
  select exists(select 1 from public.clinical_engine_reviews r join public.clinical_decisions d on d.id=r.id
   where r.patient_id=p_patient and d.episode_id=h.episode_id and d.created_at=reviewed
   and r.engine_result->>'ruleId'='v0.1.safety' and r.disposition<>'rejected') into safety;
  select exists(select 1 from public.daily_checkins c where c.patient_id=p_patient and c.episode_id=h.episode_id
    and c.created_at>greatest(cutoff,coalesce(reviewed,cutoff)) and c.created_at<=p_now and (c.symptom_direction='worsening' or c.pain_score>=7 or c.function_direction='worsening'))
   or exists(select 1 from public.exercise_adherence_logs l where l.patient_id=p_patient and l.home_program_id=h.id
    and l.created_at>greatest(cutoff,coalesce(reviewed,cutoff)) and l.created_at<=p_now
    and (l.pain_during>5 or l.symptom_response='lot' or l.symptom_recovery='still_increased'))
   or exists(select 1 from public.patient_followups f where f.home_program_id=h.id and f.answered_at>coalesce(reviewed,cutoff) and f.answered_at<=p_now
    and (f.answers->>'symptoms'='worsening' or f.answers->>'function'='worsening' or f.answers->>'barrier' in ('symptoms','help'))) into abnormal;
  select exists(select 1 from public.daily_checkins c where c.patient_id=p_patient and c.episode_id=h.episode_id
    and c.created_at>=cutoff and c.created_at<=p_now and c.symptom_direction in ('improving','unchanged','worsening')) into symptoms;
  select exists(select 1 from public.daily_checkins c where c.patient_id=p_patient and c.episode_id=h.episode_id
    and c.created_at>=cutoff and c.created_at<=p_now and c.function_direction in ('improving','stable','worsening'))
   or exists(select 1 from public.goals g where g.episode_id=h.episode_id and g.updated_at>=cutoff and g.updated_at<=p_now
    and g.baseline_value ~ '^[0-9]+([.][0-9]+)?$' and g.current_value ~ '^[0-9]+([.][0-9]+)?$' and g.target_value ~ '^[0-9]+([.][0-9]+)?$'
    and case when g.target_value ~ '^[0-9]+([.][0-9]+)?$' and g.baseline_value ~ '^[0-9]+([.][0-9]+)?$' then g.target_value::numeric<>g.baseline_value::numeric else false end) into functional;
  missing:='{}'; if not symptoms then missing:=array_append(missing,'symptoms'); end if;
  if not functional then missing:=array_append(missing,'function'); end if;
  select * into pending from public.patient_followups where home_program_id=h.id and status='pending';
  select * into latest from public.patient_followups where home_program_id=h.id order by created_at desc limit 1;
  next_state:='RESPONSE_AVAILABLE'; why:='Patient response available; clinician assessment still required before treatment changes';
  if safety or abnormal then
   next_state:=case when safety then 'SAFETY_REVIEW' else 'CLINICIAN_REVIEW' end;
   why:=case when safety then 'Unresolved safety finding: clinician review takes priority' else 'New symptom, function or recovery concern needs clinician review' end;
   update public.patient_followups set status='cancelled' where id=pending.id;
  elsif pending.id is not null then
   if pending.kind='response' and p_now>=activity+interval '72 hours' then
    update public.patient_followups set kind='inactivity',questions=array['barrier'],reason='No meaningful program activity for 3 days' where id=pending.id;
    pending.kind:='inactivity'; pending.reason:='No meaningful program activity for 3 days';
   end if;
   if pending.kind='response' and cardinality(missing)>0 then update public.patient_followups set questions=missing where id=pending.id; end if;
   if (pending.kind='inactivity' and activity>pending.created_at) or (pending.kind='response' and cardinality(missing)=0) then
    update public.patient_followups set status='cancelled' where id=pending.id;
   else
    next_state:='NEEDS_CHECK_IN'; why:=pending.reason;
    if p_now>=pending.created_at+interval '3 days' then
     next_state:='CLINICIAN_REVIEW'; why:='Check-in unanswered for 3 days; contact patient or review barriers';
     update public.patient_followups set escalated_at=coalesce(escalated_at,p_now) where id=pending.id;
    end if;
   end if;
  elsif latest.status='answered' and latest.answered_at>coalesce(reviewed,'-infinity') and
    (latest.answers->>'symptoms'='unsure' or latest.answers->>'function'='unsure' or latest.answers->>'barrier' in ('symptoms','help')) then
   next_state:='CLINICIAN_REVIEW'; why:='Patient remains unsure or requests help; review instead of repeating questions';
  elsif p_now>=activity+interval '72 hours' or (cardinality(missing)>0 and activity>started) then
   question_kind:=case when p_now>=activity+interval '72 hours' then 'inactivity' else 'response' end;
   if latest.id is null or (p_now>=latest.created_at+interval '7 days' and
      (latest.kind<>'inactivity' or activity>latest.created_at)) then
    insert into public.patient_followups(patient_id,episode_id,home_program_id,kind,questions,reason,created_at)
    values(p_patient,h.episode_id,h.id,question_kind,
     case when question_kind='inactivity' then array['barrier'] else missing end,
     case when question_kind='inactivity' then 'No meaningful program activity for 3 days' else 'Symptom or function response is missing or older than 14 days' end,p_now)
    on conflict do nothing;
    next_state:='NEEDS_CHECK_IN'; why:=case when question_kind='inactivity' then 'Gentle check-in available after 3 days without activity' else 'Targeted check-in requested for missing symptom/function response' end;
   else
    next_state:='CLINICIAN_REVIEW'; why:='Response remains incomplete or activity has not resumed; reminder cooldown prevents repeat questions';
   end if;
  end if;
  if next_state='RESPONSE_AVAILABLE' and cardinality(missing)>0 then
   next_state:='CLINICIAN_REVIEW'; why:='No response evidence yet; assessment cannot establish tolerance or function';
  elsif next_state='RESPONSE_AVAILABLE' and exists(select 1 from public.clinical_engine_reviews r join public.clinical_decisions d on d.id=r.id where r.patient_id=p_patient and d.episode_id=h.episode_id and d.created_at=reviewed and r.engine_result->>'status'='missing_information') then
   next_state:='CLINICIAN_REVIEW'; why:='Clinician-only assessment is still incomplete; patient self-report cannot supply examination findings';
  end if;
  insert into public.patient_followup_state(home_program_id,patient_id,episode_id,state,reason,missing,evaluated_at,last_activity_at)
   values(h.id,p_patient,h.episode_id,next_state,why,missing,p_now,activity)
   on conflict(home_program_id) do update set state=excluded.state,reason=excluded.reason,missing=excluded.missing,evaluated_at=excluded.evaluated_at,last_activity_at=excluded.last_activity_at;
 end loop;
end $$;
revoke all on function private.refresh_patient_followups(uuid,timestamptz) from public,anon,authenticated;

-- Triggers perform only this patient's processing, after a committed structured change.
create function private.followup_data_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.refresh_patient_followups(new.patient_id);
 return new;
end $$;
revoke all on function private.followup_data_changed() from public,anon,authenticated;
create trigger followup_checkin after insert on public.daily_checkins for each row execute function private.followup_data_changed();
create trigger followup_exercise after insert on public.exercise_adherence_logs for each row execute function private.followup_data_changed();

create function private.answer_patient_followup(p_id uuid,p_answers jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare f public.patient_followups%rowtype; k text; v text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into f from public.patient_followups where id=p_id;
 if f.id is null or not public.is_patient_self(f.patient_id) then raise exception 'Follow-up not available'; end if;
 perform pg_advisory_xact_lock(hashtextextended(f.patient_id::text,731));
 select * into f from public.patient_followups where id=p_id for update;
 if f.status='answered' then return; end if;
 if f.status<>'pending' or not exists(select 1 from public.home_programs h join public.episodes e on e.id=h.episode_id join public.patients p on p.id=e.patient_id
  where h.id=f.home_program_id and h.status='active' and e.status='active' and p.status in ('active','needs_review')) then raise exception 'Follow-up is no longer active'; end if;
 if jsonb_typeof(p_answers)<>'object' or p_answers is null then raise exception 'Invalid answers'; end if;
 for k,v in select * from jsonb_each_text(p_answers) loop
  if k<>'comment' and not k=any(f.questions) then raise exception 'Unexpected answer'; end if;
  if k='symptoms' and (v is null or v not in ('improving','unchanged','worsening','unsure')) then raise exception 'Invalid symptoms'; end if;
  if k='function' and (v is null or v not in ('improving','stable','worsening','unsure')) then raise exception 'Invalid function'; end if;
  if k='barrier' and (v is null or v not in ('time','symptoms','instructions','help','offline','other')) then raise exception 'Invalid barrier'; end if;
  if k='comment' and (v is null or length(v)>2000) then raise exception 'Invalid comment'; end if;
 end loop;
 foreach k in array f.questions loop if not (p_answers ? k) then raise exception 'Answer the requested question'; end if; end loop;
 update public.patient_followups set status='answered',answers=p_answers,answered_at=now() where id=p_id;
 insert into public.daily_checkins(patient_id,episode_id,symptom_direction,function_direction,activity_context,patient_comment,client_submission_id)
 values(f.patient_id,f.episode_id,nullif(p_answers->>'symptoms','unsure'),p_answers->>'function','Automatic check-in',nullif(p_answers->>'comment',''),f.id);
 -- The check-in trigger re-evaluates immediately, including an unsure/help response.
end $$;
revoke all on function private.answer_patient_followup(uuid,jsonb) from public,anon;
grant execute on function private.answer_patient_followup(uuid,jsonb) to authenticated;
create function public.answer_patient_followup(p_id uuid,p_answers jsonb) returns void
language sql security invoker set search_path='' as $$ select private.answer_patient_followup(p_id,p_answers) $$;
revoke all on function public.answer_patient_followup(uuid,jsonb) from public,anon;
grant execute on function public.answer_patient_followup(uuid,jsonb) to authenticated;

create function private.run_stage1_followups() returns integer language plpgsql security invoker set search_path='' as $$
declare p record; n integer:=0;
begin
 for p in select id from public.patients order by id loop
  perform private.refresh_patient_followups(p.id); n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function private.run_stage1_followups() from public,anon,authenticated;

-- Keep lifecycle exclusions and recorded clinician findings current without a dashboard visit.
create function private.followup_case_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare patient uuid;
begin
 if tg_table_name='patients' then patient:=new.id;
 elsif tg_table_name in ('episodes','clinical_engine_reviews') then patient:=new.patient_id;
 else select patient_id into patient from public.episodes where id=new.episode_id;
 end if;
 if patient is not null then perform private.refresh_patient_followups(patient); end if;
 return new;
end $$;
revoke all on function private.followup_case_changed() from public,anon,authenticated;
create trigger followup_patient_lifecycle after update of status on public.patients for each row execute function private.followup_case_changed();
create trigger followup_episode_lifecycle after update of status on public.episodes for each row execute function private.followup_case_changed();
create trigger followup_program_lifecycle after update of status on public.home_programs for each row execute function private.followup_case_changed();
create trigger followup_engine_review after insert on public.clinical_engine_reviews for each row execute function private.followup_case_changed();
create trigger followup_goal after insert or update on public.goals for each row execute function private.followup_case_changed();
