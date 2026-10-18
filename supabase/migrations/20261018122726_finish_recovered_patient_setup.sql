-- Finish only a clinician-recovered, authenticated patient account. Email alone
-- never authorizes linkage; the private recovery ledger must bind this identity
-- to the same still-current invitation and owning clinician.
create function private.can_finish_recovered_patient_setup(p_patient_id uuid,p_user_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(
  select 1 from public.patients p
  join private.patient_email_invitations i on i.patient_id=p.id
  join private.patient_password_resets r on r.patient_id=p.id
  join auth.users u on u.id=r.user_id
  join public.profiles profile on profile.id=u.id
  where p.id=p_patient_id and u.id=p_user_id and p.patient_profile_id is null
   and p.clinician_id=r.clinician_id and profile.role='patient'
   and u.email_confirmed_at is not null and u.last_sign_in_at is not null
   and u.raw_app_meta_data->>'signup_assurance' in ('clinician_recovery_link','invitation_link_only')
   and u.raw_app_meta_data->>'email_ownership_verified'='false'
   and lower(u.email)=r.email and r.email=i.recipient
   and r.consumed_at is not null and r.consumed_at>=r.issued_at and r.consumed_at<=now()
   and r.issued_at>=i.attempted_at
   and i.status='pending' and i.expires_at>now() and i.token_hash is not null and i.link_only_signup
   and not exists(select 1 from public.patients owned where owned.clinician_id=u.id or owned.patient_profile_id=u.id)
 );
$$;
revoke all on function private.can_finish_recovered_patient_setup(uuid,uuid) from public,anon,authenticated;

create function private.finish_recovered_patient_setup() returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); candidates uuid[]; pid uuid;
begin
 if actor is null then raise exception 'Sign in before completing patient setup'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 if exists(select 1 from public.patients where patient_profile_id=actor) then raise exception 'Account is already linked'; end if;
 select array_agg(candidate.patient_id) into candidates from (
  select r.patient_id from private.patient_password_resets r where r.user_id=actor
   and private.can_finish_recovered_patient_setup(r.patient_id,actor) limit 2
 ) candidate;
 if coalesce(array_length(candidates,1),0)<>1 then raise exception 'No single current recovered invitation is available. Ask your clinician for help'; end if;
 pid:=candidates[1];
 -- Same lock order as ordinary acceptance, revocation and reset redemption.
 perform 1 from public.patients where id=pid for update;
 perform 1 from private.patient_email_invitations where patient_id=pid for update;
 perform 1 from private.patient_password_resets where patient_id=pid for update;
 if not private.can_finish_recovered_patient_setup(pid,actor) then raise exception 'Invitation is no longer available'; end if;
 update public.patients set patient_profile_id=actor,updated_at=now() where id=pid;
 insert into private.patient_invitation_events(patient_id,clinician_id,attempt_id,event,status)
 select pid,p.clinician_id,i.attempt_id,'accepted_after_clinician_recovery','accepted'
 from public.patients p join private.patient_email_invitations i on i.patient_id=p.id where p.id=pid;
 update private.patient_email_invitations set status='accepted',token_hash=null where patient_id=pid;
 return pid;
end $$;
create function public.finish_recovered_patient_setup() returns uuid
language sql security invoker set search_path='' as $$select private.finish_recovered_patient_setup()$$;
revoke all on function private.finish_recovered_patient_setup(),public.finish_recovered_patient_setup() from public,anon,authenticated;
grant execute on function private.finish_recovered_patient_setup(),public.finish_recovered_patient_setup() to authenticated;
