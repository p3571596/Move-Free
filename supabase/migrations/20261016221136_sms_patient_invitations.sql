-- One current invitation across all methods; email remains the verified identity boundary.
alter table private.patient_email_invitations
 add column method text not null default 'email' check(method in ('email','sms','copy')),
 add column mobile text,
 add column provider_sid text unique,
 add column delivery_status text,
 add column sms_consent_at timestamptz;
alter table private.patient_email_invitations drop constraint patient_email_invitations_status_check;
alter table private.patient_email_invitations add constraint patient_email_invitations_status_check check(status in ('sending','pending','failed','revoked','accepted','expired'));
create table private.patient_invitation_events (
 id bigint generated always as identity primary key,
 patient_id uuid not null references public.patients(id) on delete cascade,
 clinician_id uuid not null,
 attempt_id uuid not null,
 event text not null,
 status text not null,
 created_at timestamptz not null default now()
);
alter table private.patient_invitation_events enable row level security;
revoke all on private.patient_invitation_events from public,anon,authenticated;
create index invitation_events_actor_time on private.patient_invitation_events(clinician_id,created_at);
create index invitation_events_patient_time on private.patient_invitation_events(patient_id,created_at);
create function private.audit_patient_invitation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' or new.attempt_id is distinct from old.attempt_id then
   if TG_OP='UPDATE' and old.status not in ('accepted','revoked','failed') then
     insert into private.patient_invitation_events(patient_id,clinician_id,attempt_id,event,status)
     select old.patient_id,clinician_id,old.attempt_id,'status','revoked' from public.patients where id=old.patient_id;
   end if;
   insert into private.patient_invitation_events(patient_id,clinician_id,attempt_id,event,status)
   select new.patient_id,clinician_id,new.attempt_id,'attempt',new.status from public.patients where id=new.patient_id;
 elsif new.status is distinct from old.status or new.delivery_status is distinct from old.delivery_status then
   insert into private.patient_invitation_events(patient_id,clinician_id,attempt_id,event,status)
   select new.patient_id,clinician_id,new.attempt_id,'status',coalesce(new.delivery_status,new.status) from public.patients where id=new.patient_id;
 end if;
 return new;
end; $$;
revoke all on function private.audit_patient_invitation() from public,anon,authenticated;
create trigger audit_patient_invitation after insert or update on private.patient_email_invitations
 for each row execute function private.audit_patient_invitation();
create or replace function private.manage_patient_email_invitation(p_patient_id uuid,p_email text,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_patient public.patients; v_inv private.patient_email_invitations;
 v_token text; v_attempt uuid:=gen_random_uuid(); v_email text:=lower(trim(p_email));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_patient from public.patients where id=p_patient_id and clinician_id=auth.uid() for update;
  if not found then raise exception 'Patient not found or access denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended('invitation:'||auth.uid()::text,0));
  select * into v_inv from private.patient_email_invitations where patient_id=p_patient_id;
  if p_action='status' then
    update private.patient_email_invitations set status='expired',token_hash=null where patient_id=p_patient_id and status in ('sending','pending') and expires_at<=now();
    update private.patient_email_invitations set status='failed',token_hash=null where patient_id=p_patient_id and status='sending' and attempted_at<now()-interval '2 minutes';
    select * into v_inv from private.patient_email_invitations where patient_id=p_patient_id;
    return jsonb_build_object('status',case when v_patient.patient_profile_id is not null then 'accepted'
      when v_inv.status in ('pending','sending') and v_inv.expires_at<=now() then 'expired'
      when v_inv.status='sending' and v_inv.attempted_at<now()-interval '2 minutes' then 'failed'
      when v_inv.status='pending' and v_inv.method<>'copy' then 'sent'
      when v_inv.status='sending' then 'pending' else coalesce(v_inv.status,'none') end,'email',v_inv.recipient,'phone',v_inv.mobile,'method',v_inv.method,'errorCode',v_inv.error_code,
      'retryAt',v_inv.attempted_at+interval '60 seconds');
  end if;
  if v_patient.patient_profile_id is not null then raise exception 'Patient account already linked'; end if;
  if p_action='revoke' then
    update private.patient_email_invitations set status='revoked',token_hash=null where patient_id=p_patient_id;
    return jsonb_build_object('status','revoked');
  end if;
  if p_action not in ('send','replace') or v_email is null or length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid invitation action and email are required';
  end if;
  if v_inv.recipient is not null and v_inv.recipient<>v_email and (p_action<>'replace' or v_inv.recipient=v_email) then
    raise exception 'Use Correct Email / Replace Invitation to revoke the old invitation';
  end if;
  -- Replacements may revoke immediately; serialize all delivery attempts, including failed ones.
  if v_inv.status='sending' and v_inv.attempted_at>now()-interval '2 minutes' then
    raise exception 'Invitation is being sent. Wait two minutes before retrying';
  end if;
  if v_inv.attempted_at>now()-interval '60 seconds' and (p_action<>'replace' or v_inv.recipient=v_email) then
    raise exception 'Wait 60 seconds before resending';
  end if;
  if v_inv.attempted_at>now()-interval '60 seconds' then raise exception 'Wait 60 seconds before resending'; end if;
  if (select count(*) from private.patient_invitation_events where clinician_id=auth.uid() and event='attempt' and created_at>now()-interval '1 hour')>=30 or
     (select count(*) from private.patient_invitation_events where patient_id=p_patient_id and event='attempt' and created_at>now()-interval '1 day')>=5 then
    raise exception 'Wait: invitation delivery limit reached'; end if;
  v_token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into private.patient_email_invitations(patient_id,recipient,token_hash,attempt_id,status,attempted_at,expires_at,error_code)
  values(p_patient_id,v_email,encode(extensions.digest(v_token,'sha256'),'hex'),v_attempt,'sending',now(),now()+interval '7 days',null)
  on conflict(patient_id) do update set recipient=excluded.recipient,token_hash=excluded.token_hash,
    attempt_id=excluded.attempt_id,status=excluded.status,attempted_at=excluded.attempted_at,expires_at=excluded.expires_at,error_code=null,method='email',mobile=null,provider_sid=null,delivery_status=null;
  return jsonb_build_object('token',v_token,'attemptId',v_attempt,'status','sending');
end; $$;
revoke all on function private.manage_patient_email_invitation(uuid,text,text) from public,anon;
grant execute on function private.manage_patient_email_invitation(uuid,text,text) to authenticated;
create or replace function public.manage_patient_email_invitation(p_patient_id uuid,p_email text,p_action text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.manage_patient_email_invitation(p_patient_id,p_email,p_action);
$$;
revoke all on function public.manage_patient_email_invitation(uuid,text,text) from public,anon;
grant execute on function public.manage_patient_email_invitation(uuid,text,text) to authenticated;


create function private.manage_patient_delivery(p_patient_id uuid,p_email text,p_mobile text,p_method text,p_action text,p_consent boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_method not in ('sms','copy') then raise exception 'Invalid delivery method'; end if;
 if p_method='sms' and (not coalesce(p_consent,false) or p_mobile is null or p_mobile !~ '^\+[1-9][0-9]{7,14}$') then raise exception 'Mobile and SMS consent required'; end if;
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 perform 1 from public.patients where id=p_patient_id and clinician_id=auth.uid() for update;
 if not found then raise exception 'Patient not found or access denied'; end if;
 if p_action not in ('send','replace') then raise exception 'Invalid action'; end if;
 if p_action='send' and exists(select 1 from private.patient_email_invitations where patient_id=p_patient_id and (method<>p_method or mobile is distinct from nullif(p_mobile,''))) then
   raise exception 'Correct contact and replace invitation'; end if;
 result:=private.manage_patient_email_invitation(p_patient_id,p_email,p_action);
 update private.patient_email_invitations set method=p_method,mobile=case when p_method='sms' then p_mobile else null end,
 sms_consent_at=case when p_method='sms' then now() else null end where patient_id=p_patient_id;
 return result;
end; $$;
revoke all on function private.manage_patient_delivery(uuid,text,text,text,text,boolean) from public,anon;
grant execute on function private.manage_patient_delivery(uuid,text,text,text,text,boolean) to authenticated;
create function public.manage_patient_delivery(p_patient_id uuid,p_email text,p_mobile text,p_method text,p_action text,p_consent boolean)
returns jsonb language sql security invoker set search_path='' as $$select private.manage_patient_delivery(p_patient_id,p_email,p_mobile,p_method,p_action,p_consent)$$;
revoke all on function public.manage_patient_delivery(uuid,text,text,text,text,boolean) from public,anon;
grant execute on function public.manage_patient_delivery(uuid,text,text,text,text,boolean) to authenticated;
-- Provider callbacks can only move the matching current attempt forward, never revive it.
create function private.record_patient_sms(p_attempt_id uuid,p_sid text,p_status text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_status not in ('queued','sent','delivered','failed','undelivered') then return false; end if;
 update private.patient_email_invitations set provider_sid=p_sid,delivery_status=p_status,
 status=case when p_status in ('failed','undelivered') then 'failed' else status end,
 token_hash=case when p_status in ('failed','undelivered') then null else token_hash end
 where attempt_id=p_attempt_id and method='sms' and status in ('sending','pending') and expires_at>now()
 and (provider_sid is null or provider_sid=p_sid)
 and (delivery_status is null or delivery_status='queued' or (delivery_status='sent' and p_status in ('delivered','failed','undelivered')));
 return found;
end; $$;
revoke all on function private.record_patient_sms(uuid,text,text) from public,anon,authenticated;
create function public.record_patient_sms(p_attempt_id uuid,p_sid text,p_status text) returns boolean
language sql security invoker set search_path='' as $$select private.record_patient_sms(p_attempt_id,p_sid,p_status)$$;
revoke all on function public.record_patient_sms(uuid,text,text) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.record_patient_sms(uuid,text,text),public.record_patient_sms(uuid,text,text) to service_role;
