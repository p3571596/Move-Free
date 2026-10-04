-- A pending response question must not bypass the inactivity cooldown.
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
   if pending.kind='response' and p_now>=activity+interval '72 hours'
    and not exists(select 1 from public.patient_followups f where f.home_program_id=h.id and f.kind='inactivity' and f.created_at>p_now-interval '7 days')
    and not exists(select 1 from public.patient_followups f where f.home_program_id=h.id and f.kind='inactivity' and f.created_at>=activity) then
    update public.patient_followups set status='cancelled' where id=pending.id;
    insert into public.patient_followups(patient_id,episode_id,home_program_id,kind,questions,reason,created_at)
    values(p_patient,h.episode_id,h.id,'inactivity',array['barrier'],'No meaningful program activity for 3 days',p_now) returning * into pending;
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
   if not exists(select 1 from public.patient_followups f where f.home_program_id=h.id and f.kind=question_kind and f.created_at>p_now-interval '7 days')
      and (question_kind<>'inactivity' or not exists(select 1 from public.patient_followups f where f.home_program_id=h.id and f.kind='inactivity' and f.created_at>=activity)) then
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

