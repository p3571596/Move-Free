-- Deliberately revoke legacy unbound links; every new claim requires a verified recipient.
update public.patients set patient_invite_token_hash=null, patient_invite_expires_at=null
where patient_invite_token_hash is not null;

create table private.patient_email_invitations (
  patient_id uuid primary key references public.patients(id) on delete cascade,
  recipient text not null,
  token_hash text unique,
  attempt_id uuid not null,
  status text not null check(status in ('sending','pending','failed','revoked','accepted')),
  attempted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  error_code text
);
alter table private.patient_email_invitations enable row level security;
revoke all on private.patient_email_invitations from public,anon,authenticated;

-- All invitation and link fields must pass through checked database functions.
create function private.protect_patient_invitation_fields() returns trigger
language plpgsql set search_path='' as $$
begin
  if current_user in ('authenticated','anon','authenticator') and (
    (TG_OP='INSERT' and (new.patient_profile_id is not null or new.patient_invite_token_hash is not null or new.patient_invite_expires_at is not null)) or
    (TG_OP='UPDATE' and (new.patient_profile_id is distinct from old.patient_profile_id or
      new.patient_invite_token_hash is distinct from old.patient_invite_token_hash or
      new.patient_invite_expires_at is distinct from old.patient_invite_expires_at))
  ) then raise exception 'Patient access must be changed through the invitation flow'; end if;
  return new;
end; $$;
create trigger protect_patient_invitation_fields before insert or update on public.patients
for each row execute function private.protect_patient_invitation_fields();
revoke all on function private.protect_patient_invitation_fields() from public,anon,authenticated;

create or replace function public.create_patient_invite(p_patient_id uuid) returns text
language plpgsql security invoker set search_path='' as $$
begin raise exception 'Use the email invitation flow; unbound invitation links are disabled'; end; $$;
revoke all on function public.create_patient_invite(uuid) from public,anon,authenticated;

create function private.manage_patient_email_invitation(p_patient_id uuid,p_email text,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_patient public.patients; v_inv private.patient_email_invitations;
 v_token text; v_attempt uuid:=gen_random_uuid(); v_email text:=lower(trim(p_email));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_patient from public.patients where id=p_patient_id and clinician_id=auth.uid() for update;
  if not found then raise exception 'Patient not found or access denied'; end if;
  select * into v_inv from private.patient_email_invitations where patient_id=p_patient_id;
  if p_action='status' then
    return jsonb_build_object('status',case when v_patient.patient_profile_id is not null then 'accepted'
      when v_inv.status in ('pending','sending') and v_inv.expires_at<=now() then 'expired'
      when v_inv.status='sending' and v_inv.attempted_at<now()-interval '2 minutes' then 'failed'
      else coalesce(v_inv.status,'none') end,'email',v_inv.recipient,'errorCode',v_inv.error_code,
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
  v_token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into private.patient_email_invitations(patient_id,recipient,token_hash,attempt_id,status,attempted_at,expires_at,error_code)
  values(p_patient_id,v_email,encode(extensions.digest(v_token,'sha256'),'hex'),v_attempt,'sending',now(),now()+interval '7 days',null)
  on conflict(patient_id) do update set recipient=excluded.recipient,token_hash=excluded.token_hash,
    attempt_id=excluded.attempt_id,status=excluded.status,attempted_at=excluded.attempted_at,expires_at=excluded.expires_at,error_code=null;
  return jsonb_build_object('token',v_token,'attemptId',v_attempt,'status','sending');
end; $$;
revoke all on function private.manage_patient_email_invitation(uuid,text,text) from public,anon;
grant execute on function private.manage_patient_email_invitation(uuid,text,text) to authenticated;
create function public.manage_patient_email_invitation(p_patient_id uuid,p_email text,p_action text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.manage_patient_email_invitation(p_patient_id,p_email,p_action);
$$;
revoke all on function public.manage_patient_email_invitation(uuid,text,text) from public,anon;
grant execute on function public.manage_patient_email_invitation(uuid,text,text) to authenticated;

-- Compare attempt identity so late delivery callbacks cannot revive a replaced/revoked token.
create function public.finish_patient_email_invitation(p_patient_id uuid,p_attempt_id uuid,p_success boolean,p_error_code text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update private.patient_email_invitations set status=case when p_success then 'pending' else 'failed' end,
    token_hash=case when p_success then token_hash else null end,
    error_code=case when p_success then null else p_error_code end
  where patient_id=p_patient_id and attempt_id=p_attempt_id and status='sending'
    and attempted_at>now()-interval '2 minutes';
  return found;
end; $$;
revoke all on function public.finish_patient_email_invitation(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.finish_patient_email_invitation(uuid,uuid,boolean,text) to service_role;

create or replace function private.claim_patient_invite(p_token text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_patient_id uuid; v_email text; v_role text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_token is null or length(p_token)<>64 then raise exception 'Invitation is invalid, expired, revoked, or already claimed'; end if;
  -- Serialize claims by account, as well as by patient, without rejecting existing historic relationships.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  select role into v_role from public.profiles where id=auth.uid();
  if v_role in ('clinician','admin') or exists(select 1 from public.patients where clinician_id=auth.uid()) then
    raise exception 'Clinician and admin accounts cannot claim patient invitations';
  end if;
  if exists(select 1 from public.patients where patient_profile_id=auth.uid()) then
    raise exception 'This account is already linked to a patient';
  end if;
  select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if v_email is null then raise exception 'Verify the invited email before accepting'; end if;
  -- Lock in the same order as manage: patient first, invitation second.
  select p.id into v_patient_id from public.patients p join private.patient_email_invitations i on i.patient_id=p.id
  where i.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and i.status='pending'
    and i.expires_at>now() and i.recipient=v_email and p.patient_profile_id is null for update of p;
  if v_patient_id is null then raise exception 'Invitation is invalid, expired, revoked, already claimed, or for a different email'; end if;
  perform 1 from private.patient_email_invitations where patient_id=v_patient_id
    and token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and status='pending'
    and expires_at>now() and recipient=v_email for update;
  if not found then raise exception 'Invitation is no longer valid'; end if;
  insert into public.profiles(id,role,email) values(auth.uid(),'patient',v_email) on conflict(id) do nothing;
  select role into v_role from public.profiles where id=auth.uid();
  if v_role is distinct from 'patient' then raise exception 'This account is not eligible for patient access'; end if;
  update public.patients set patient_profile_id=auth.uid(),updated_at=now() where id=v_patient_id;
  update private.patient_email_invitations set status='accepted',token_hash=null where patient_id=v_patient_id;
  return v_patient_id;
end; $$;
revoke all on function private.claim_patient_invite(text) from public,anon;
grant execute on function private.claim_patient_invite(text) to authenticated;
