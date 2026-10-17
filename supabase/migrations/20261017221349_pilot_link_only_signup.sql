-- Explicit, service-gated private-pilot exception. Existing invitations stay verified.
alter table private.patient_email_invitations
 add column link_only_signup boolean not null default false,
 add column signup_user_id uuid,
 add column signup_lease_id uuid,
 add column signup_reserved_at timestamptz,
 add column signup_email text,
 add column signup_failures integer not null default 0;

create function private.reset_patient_pilot_signup() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.attempt_id is distinct from old.attempt_id then
  new.link_only_signup:=false; new.signup_user_id:=null; new.signup_lease_id:=null;
  new.signup_reserved_at:=null; new.signup_email:=null; new.signup_failures:=0;
 end if;
 return new;
end $$;
revoke all on function private.reset_patient_pilot_signup() from public,anon,authenticated;
create trigger reset_patient_pilot_signup before update on private.patient_email_invitations
 for each row execute function private.reset_patient_pilot_signup();

-- These functions intentionally authorize a bearer token instead of auth.uid().
-- Only service_role can execute; never expose them to anon/authenticated clients.
create function private.enable_patient_pilot_signup(p_token text,p_clinician_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare pid uuid;
begin
 select p.id into pid from public.patients p join private.patient_email_invitations i on i.patient_id=p.id
 where i.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and i.status='pending'
 and i.expires_at>now() and p.clinician_id=p_clinician_id and p.patient_profile_id is null for update of p;
 if pid is null then raise exception 'Invitation unavailable'; end if;
 update private.patient_email_invitations set link_only_signup=true where patient_id=pid
 and token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and status='pending' and expires_at>now();
 if not found then raise exception 'Invitation unavailable'; end if;
 return true;
end $$;

create function private.reserve_patient_pilot_signup(p_token text,p_user_id uuid,p_lease_id uuid,p_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pid uuid; inv private.patient_email_invitations;
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
 -- Never reserve an already existing account, even when a caller has its UUID.
 if exists(select 1 from auth.users where id=p_user_id) then raise exception 'New account required'; end if;
 update private.patient_email_invitations set signup_user_id=p_user_id,signup_lease_id=p_lease_id,
 signup_reserved_at=now(),signup_email=lower(trim(p_email)),signup_failures=signup_failures+1 where patient_id=pid;
 return jsonb_build_object('patientId',pid);
end $$;

create function private.complete_patient_pilot_signup(p_token text,p_user_id uuid,p_lease_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare pid uuid; inv private.patient_email_invitations; account_email text;
begin
 select p.id into pid from public.patients p join private.patient_email_invitations i on i.patient_id=p.id
 where i.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and p.patient_profile_id is null for update of p;
 if pid is null then raise exception 'Invitation unavailable'; end if;
 select * into inv from private.patient_email_invitations where patient_id=pid for update;
 if inv.token_hash is distinct from encode(extensions.digest(p_token,'sha256'),'hex') or inv.status<>'pending'
 or inv.expires_at<=now() or not inv.link_only_signup or inv.signup_user_id is distinct from p_user_id
 or inv.signup_lease_id is distinct from p_lease_id or inv.signup_reserved_at<=now()-interval '2 minutes'
 then raise exception 'Invitation unavailable'; end if;
 select lower(email) into account_email from auth.users where id=p_user_id
 and raw_app_meta_data->>'signup_assurance'='invitation_link_only'
 and raw_app_meta_data->>'email_ownership_verified'='false';
 if account_email is null or account_email is distinct from inv.signup_email
 or exists(select 1 from public.patients where clinician_id=p_user_id or patient_profile_id=p_user_id)
 then raise exception 'Account is not eligible'; end if;
 insert into public.profiles(id,role,email) values(p_user_id,'patient',account_email) on conflict(id) do nothing;
 if not exists(select 1 from public.profiles where id=p_user_id and role='patient') then raise exception 'Account is not eligible'; end if;
 update public.patients set patient_profile_id=p_user_id,updated_at=now() where id=pid;
 update private.patient_email_invitations set status='accepted',token_hash=null where patient_id=pid;
 insert into private.patient_invitation_events(patient_id,clinician_id,attempt_id,event,status)
 select pid,clinician_id,inv.attempt_id,'signup_link_only','accepted' from public.patients where id=pid;
 return pid;
end $$;

create function private.cancel_patient_pilot_signup(p_patient_id uuid,p_user_id uuid,p_lease_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 -- Same lock order as acceptance; cancel the lease before allowing Auth cleanup.
 perform 1 from public.patients where id=p_patient_id for update;
 if not found then return false; end if;
 if exists(select 1 from public.patients where patient_profile_id=p_user_id or clinician_id=p_user_id) then return false; end if;
 update private.patient_email_invitations set signup_user_id=null,signup_lease_id=null,signup_reserved_at=null,signup_email=null
 where patient_id=p_patient_id and signup_user_id=p_user_id and signup_lease_id=p_lease_id;
 return true;
end $$;

create function public.enable_patient_pilot_signup(p_token text,p_clinician_id uuid) returns boolean
language sql security invoker set search_path='' as $$select private.enable_patient_pilot_signup(p_token,p_clinician_id)$$;
create function public.reserve_patient_pilot_signup(p_token text,p_user_id uuid,p_lease_id uuid,p_email text) returns jsonb
language sql security invoker set search_path='' as $$select private.reserve_patient_pilot_signup(p_token,p_user_id,p_lease_id,p_email)$$;
create function public.complete_patient_pilot_signup(p_token text,p_user_id uuid,p_lease_id uuid) returns uuid
language sql security invoker set search_path='' as $$select private.complete_patient_pilot_signup(p_token,p_user_id,p_lease_id)$$;
create function public.cancel_patient_pilot_signup(p_patient_id uuid,p_user_id uuid,p_lease_id uuid) returns boolean
language sql security invoker set search_path='' as $$select private.cancel_patient_pilot_signup(p_patient_id,p_user_id,p_lease_id)$$;

revoke all on function private.enable_patient_pilot_signup(text,uuid),private.reserve_patient_pilot_signup(text,uuid,uuid,text),
 private.complete_patient_pilot_signup(text,uuid,uuid),private.cancel_patient_pilot_signup(uuid,uuid,uuid),
 public.enable_patient_pilot_signup(text,uuid),public.reserve_patient_pilot_signup(text,uuid,uuid,text),
 public.complete_patient_pilot_signup(text,uuid,uuid),public.cancel_patient_pilot_signup(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function private.enable_patient_pilot_signup(text,uuid),private.reserve_patient_pilot_signup(text,uuid,uuid,text),
 private.complete_patient_pilot_signup(text,uuid,uuid),private.cancel_patient_pilot_signup(uuid,uuid,uuid),
 public.enable_patient_pilot_signup(text,uuid),public.reserve_patient_pilot_signup(text,uuid,uuid,text),
 public.complete_patient_pilot_signup(text,uuid,uuid),public.cancel_patient_pilot_signup(uuid,uuid,uuid) to service_role;
