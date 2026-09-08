create or replace function private.claim_patient_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_patient_id uuid;
  v_role text;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_token is null or length(trim(p_token)) < 32 then
    raise exception 'Invitation is invalid, expired, or already claimed';
  end if;

  select role
  into v_role
  from public.profiles
  where id = auth.uid();

  if v_role in ('clinician', 'admin')
    or exists (
      select 1
      from public.patients p
      where p.clinician_id = auth.uid()
    ) then
    raise exception 'Clinician and admin accounts cannot claim patient invitations';
  end if;

  select p.id
  into v_patient_id
  from public.patients p
  where p.patient_invite_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and p.patient_invite_expires_at > now()
    and (p.patient_profile_id is null or p.patient_profile_id = auth.uid())
  for update;

  if v_patient_id is null then
    raise exception 'Invitation is invalid, expired, or already claimed';
  end if;

  select email
  into v_email
  from auth.users
  where id = auth.uid();

  if v_email is null then
    raise exception 'The authenticated account does not have an email address';
  end if;

  insert into public.profiles (id, role, email)
  values (auth.uid(), 'patient', v_email)
  on conflict (id) do nothing;

  select role
  into v_role
  from public.profiles
  where id = auth.uid();

  if v_role <> 'patient' then
    raise exception 'This account is not eligible for patient access';
  end if;

  update public.patients
  set patient_profile_id = auth.uid(),
      patient_invite_token_hash = null,
      patient_invite_expires_at = null,
      updated_at = now()
  where id = v_patient_id;

  return v_patient_id;
end;
$function$;

revoke all on function private.claim_patient_invite(text) from public, anon;
grant execute on function private.claim_patient_invite(text) to authenticated;
