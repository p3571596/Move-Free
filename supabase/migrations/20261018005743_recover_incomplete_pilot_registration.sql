-- Resume abandoned email signup only with its original password; never reset credentials.
create or replace function private.reserve_patient_pilot_signup(p_token text,p_user_id uuid,p_lease_id uuid,p_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pid uuid; inv private.patient_email_invitations; existing_id uuid;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' or p_user_id is null or p_lease_id is null
 or p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invitation unavailable'; end if;
 select p.id into pid from public.patients p join private.patient_email_invitations i on i.patient_id=p.id
 where i.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and p.patient_profile_id is null for update of p;
 if pid is null then raise exception 'Invitation unavailable'; end if;
 select * into inv from private.patient_email_invitations where patient_id=pid for update;
 if inv.token_hash is distinct from encode(extensions.digest(p_token,'sha256'),'hex') or inv.status<>'pending'
 or inv.expires_at<=now() or not inv.link_only_signup or inv.signup_failures>=5
 or inv.signup_reserved_at>now()-interval '2 minutes' then raise exception 'Invitation unavailable or signup in progress'; end if;
 -- Only incomplete, never-used email registrations may be resumed. The server
 -- must also prove the original password through Auth before confirming them.
 select u.id into existing_id from auth.users u where lower(u.email)=lower(trim(p_email));
 if existing_id is not null then
  if not exists(select 1 from auth.users u where u.id=existing_id
   and u.email_confirmed_at is null and u.phone_confirmed_at is null and u.last_sign_in_at is null
   and not coalesce(u.is_sso_user,false) and not coalesce(u.is_anonymous,false)
   and (u.banned_until is null or u.banned_until<=now())
   and coalesce(u.raw_app_meta_data->>'role','patient')='patient'
   and coalesce(u.raw_user_meta_data->>'role','patient')='patient')
   or exists(select 1 from public.profiles where id=existing_id and role<>'patient')
   or exists(select 1 from public.patients where clinician_id=existing_id or patient_profile_id=existing_id)
   or exists(select 1 from auth.sessions where user_id=existing_id)
   or exists(select 1 from auth.identities where user_id=existing_id and provider<>'email')
   or exists(select 1 from auth.mfa_factors where user_id=existing_id)
  then raise exception 'Existing account must sign in'; end if;
  p_user_id:=existing_id;
 elsif exists(select 1 from auth.users where id=p_user_id) then raise exception 'New account required';
 end if;
 update private.patient_email_invitations set signup_user_id=p_user_id,signup_lease_id=p_lease_id,
 signup_reserved_at=now(),signup_email=lower(trim(p_email)),signup_failures=signup_failures+1 where patient_id=pid;
 return jsonb_build_object('patientId',pid,'userId',p_user_id,'resumeExisting',existing_id is not null);
end $$;
