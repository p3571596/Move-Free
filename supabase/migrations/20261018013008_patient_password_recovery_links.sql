-- Clinician-issued, SMTP-independent recovery. Preserve accounts and clinical data.
create table private.patient_password_resets (
 patient_id uuid primary key references public.patients(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 clinician_id uuid not null,
 email text not null,
 token_hash text,
 expires_at timestamptz not null,
 issued_at timestamptz not null default now(),
 consumed_at timestamptz
);
alter table private.patient_password_resets enable row level security;
revoke all on private.patient_password_resets from public,anon,authenticated;

create function private.invalidate_patient_password_reset() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.attempt_id is distinct from old.attempt_id or new.status in ('revoked','accepted','failed') then
  update private.patient_password_resets set token_hash=null where patient_id=new.patient_id;
 end if;
 return new;
end $$;
revoke all on function private.invalidate_patient_password_reset() from public,anon,authenticated;
create trigger invalidate_patient_password_reset after update on private.patient_email_invitations
 for each row execute function private.invalidate_patient_password_reset();

-- Locks must always be patient -> invitation -> recovery. Clinician RPC is
-- independent of the delivery provider; server gates the private-pilot exception.
create function private.manage_patient_password_reset(p_patient_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pat public.patients; inv private.patient_email_invitations; target auth.users; prior private.patient_password_resets; token text;
begin
 select * into pat from public.patients where id=p_patient_id and clinician_id=auth.uid() for update;
 if pat.id is null then raise exception 'Patient unavailable'; end if;
 select * into inv from private.patient_email_invitations where patient_id=pat.id for update;
 select * into prior from private.patient_password_resets where patient_id=pat.id for update;
 if p_action='revoke' then
  update private.patient_password_resets set token_hash=null where patient_id=pat.id;
  return jsonb_build_object('status','revoked');
 end if;
 if p_action<>'issue' then raise exception 'Invalid action'; end if;
 if prior.issued_at>now()-interval '60 seconds' then raise exception 'Wait before generating another reset link'; end if;
 if pat.patient_profile_id is not null then
  select * into target from auth.users where id=pat.patient_profile_id;
 else
  if inv.status<>'pending' or inv.expires_at<=now() or not coalesce(inv.link_only_signup,false)
   or inv.token_hash is null then raise exception 'Generate a current pilot invitation first'; end if;
  select * into target from auth.users where lower(email)=inv.recipient;
  if target.id is not null and not coalesce((
   (target.email_confirmed_at is null and target.phone_confirmed_at is null and target.last_sign_in_at is null
    and not exists(select 1 from auth.sessions where user_id=target.id))
   or prior.user_id=target.id
   or (inv.signup_user_id=target.id and target.raw_app_meta_data->>'signup_assurance'='invitation_link_only')
  ),false) then raise exception 'Account is not eligible for this patient'; end if;
 end if;
 if target.id is null or target.email is null
  or coalesce(target.is_sso_user,false) or coalesce(target.is_anonymous,false)
  or target.banned_until>now()
  or coalesce(target.raw_app_meta_data->>'role','patient')<>'patient'
  or coalesce(target.raw_user_meta_data->>'role','patient')<>'patient'
  or exists(select 1 from public.profiles where id=target.id and role is distinct from 'patient')
  or exists(select 1 from public.patients where clinician_id=target.id or (patient_profile_id=target.id and id<>pat.id))
  or exists(select 1 from auth.identities where user_id=target.id and provider<>'email')
  or exists(select 1 from auth.mfa_factors where user_id=target.id)
 then raise exception 'Account is not eligible for this patient'; end if;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into private.patient_password_resets(patient_id,user_id,clinician_id,email,token_hash,expires_at)
 values(pat.id,target.id,auth.uid(),lower(target.email),encode(extensions.digest(token,'sha256'),'hex'),now()+interval '30 minutes')
 on conflict(patient_id) do update set user_id=excluded.user_id,clinician_id=excluded.clinician_id,email=excluded.email,
 token_hash=excluded.token_hash,expires_at=excluded.expires_at,issued_at=now(),consumed_at=null;
 return jsonb_build_object('token',token,'status','pending');
end $$;

create function private.consume_patient_password_reset(p_token text,p_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pid uuid; pat public.patients; inv private.patient_email_invitations; reset private.patient_password_resets; account auth.users;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Reset unavailable'; end if;
 select patient_id into pid from private.patient_password_resets where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 select * into pat from public.patients where id=pid for update;
 if pat.id is null then raise exception 'Reset unavailable'; end if;
 select * into inv from private.patient_email_invitations where patient_id=pid for update;
 select * into reset from private.patient_password_resets where patient_id=pid for update;
 select * into account from auth.users where id=reset.user_id;
 if reset.token_hash is distinct from encode(extensions.digest(p_token,'sha256'),'hex')
  or reset.expires_at<=now() or reset.consumed_at is not null or pat.clinician_id<>reset.clinician_id
  or lower(trim(p_email)) is distinct from reset.email or lower(account.email) is distinct from reset.email
  or account.id is null or account.banned_until>now() or coalesce(account.is_sso_user,false) or coalesce(account.is_anonymous,false)
  or coalesce(account.raw_app_meta_data->>'role','patient')<>'patient'
  or coalesce(account.raw_user_meta_data->>'role','patient')<>'patient'
  or exists(select 1 from public.profiles where id=account.id and role is distinct from 'patient')
  or exists(select 1 from public.patients where clinician_id=account.id or (patient_profile_id=account.id and id<>pid))
  or exists(select 1 from auth.identities where user_id=account.id and provider<>'email')
  or exists(select 1 from auth.mfa_factors where user_id=account.id)
 then raise exception 'Reset unavailable'; end if;
 if pat.patient_profile_id is null then
  if inv.status is distinct from 'pending' or inv.expires_at<=now() or not coalesce(inv.link_only_signup,false)
   or inv.recipient<>reset.email or inv.token_hash is null then raise exception 'Reset unavailable'; end if;
 elsif pat.patient_profile_id<>account.id then raise exception 'Reset unavailable'; end if;
 -- Consume before calling Auth: only one request can change credentials. A failed
 -- provider call requires a newly issued link rather than replaying this token.
 update private.patient_password_resets set consumed_at=now(),token_hash=null where patient_id=pid;
 insert into public.profiles(id,role,email) values(account.id,'patient',reset.email) on conflict(id) do nothing;
 return jsonb_build_object('userId',account.id,'unconfirmed',account.email_confirmed_at is null);
end $$;

create function public.manage_patient_password_reset(p_patient_id uuid,p_action text) returns jsonb
language sql security invoker set search_path='' as $$select private.manage_patient_password_reset(p_patient_id,p_action)$$;
create function public.consume_patient_password_reset(p_token text,p_email text) returns jsonb
language sql security invoker set search_path='' as $$select private.consume_patient_password_reset(p_token,p_email)$$;
revoke all on function private.manage_patient_password_reset(uuid,text),public.manage_patient_password_reset(uuid,text),
 private.consume_patient_password_reset(text,text),public.consume_patient_password_reset(text,text) from public,anon,authenticated;
grant execute on function private.manage_patient_password_reset(uuid,text),public.manage_patient_password_reset(uuid,text) to authenticated;
grant execute on function private.consume_patient_password_reset(text,text),public.consume_patient_password_reset(text,text) to service_role;
