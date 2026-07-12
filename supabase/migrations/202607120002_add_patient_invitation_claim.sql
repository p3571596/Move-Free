alter table public.patients
  add column if not exists patient_invite_token_hash text,
  add column if not exists patient_invite_expires_at timestamptz;

create unique index if not exists patients_invite_token_hash_key
  on public.patients (patient_invite_token_hash)
  where patient_invite_token_hash is not null;

create or replace function public.create_patient_invite(p_patient_id uuid)
returns text language plpgsql security invoker set search_path = '' as $$
declare v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.patients where id = p_patient_id and clinician_id = auth.uid()) then
    raise exception 'Patient not found or access denied';
  end if;
  update public.patients set
    patient_invite_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
    patient_invite_expires_at = now() + interval '7 days', updated_at = now()
  where id = p_patient_id;
  return v_token;
end; $$;

create or replace function public.claim_patient_invite(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_patient_id uuid; v_role text; v_email text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select role into v_role from public.profiles where id = auth.uid();
  if v_role in ('clinician', 'admin') then raise exception 'Clinician and admin accounts cannot claim patient invitations'; end if;
  select id into v_patient_id from public.patients
  where patient_invite_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and patient_invite_expires_at > now()
    and (patient_profile_id is null or patient_profile_id = auth.uid()) for update;
  if v_patient_id is null then raise exception 'Invitation is invalid, expired, or already claimed'; end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.profiles (id, role, email) values (auth.uid(), 'patient', v_email) on conflict (id) do nothing;
  select role into v_role from public.profiles where id = auth.uid();
  if v_role <> 'patient' then raise exception 'This account is not eligible for patient access'; end if;
  update public.patients set patient_profile_id = auth.uid(), patient_invite_token_hash = null,
    patient_invite_expires_at = null, updated_at = now() where id = v_patient_id;
  return v_patient_id;
end; $$;

revoke all on function public.create_patient_invite(uuid) from public, anon;
revoke all on function public.claim_patient_invite(text) from public, anon;
grant execute on function public.create_patient_invite(uuid) to authenticated;
grant execute on function public.claim_patient_invite(text) to authenticated;
