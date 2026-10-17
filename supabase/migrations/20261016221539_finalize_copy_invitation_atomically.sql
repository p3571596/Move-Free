-- Copying is completed atomically without server delivery credentials.
create or replace function private.manage_patient_delivery(p_patient_id uuid,p_email text,p_mobile text,p_method text,p_action text,p_consent boolean)
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
 sms_consent_at=case when p_method='sms' then now() else null end,
 status=case when p_method='copy' then 'pending' else status end where patient_id=p_patient_id;
 return result;
end; $$;
