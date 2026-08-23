# Founder analytics

The founder dashboard lives at `/analytics`. The route is shown only to profiles with `role = 'admin'`, is guarded by `RoleGate`, and reads data through the admin-only `get_founder_analytics` RPC. The database function checks the signed-in user independently before aggregating across RLS-protected tables.

## Privacy model

Analytics use real application records. No mock rows are generated. `analytics_events` stores only:

- an allow-listed event name
- authenticated actor ID
- patient and program IDs when needed to validate ownership
- action duration
- server timestamp
- an idempotency ID

Do not add names, email addresses, diagnoses, pain locations, comments, notes, or arbitrary JSON properties to this table. The dashboard RPC returns aggregate values and generic recent-activity labels only; it does not return patient identifiers or free text.

RLS allows clinicians to insert clinician events only for their own patients and patients to insert patient events only for their linked patient record. Only admins may select event rows. There are no client update or delete policies.

## Metric derivation

Date ranges are limited to 7–90 days.

| Metric | Derivation |
| --- | --- |
| Active clinicians | Distinct clinician IDs with at least one patient whose status is `active` or `needs_review`. |
| Active patients | Patients whose status is `active` or `needs_review`. |
| Programs assigned | `home_programs` with `assigned_at` inside the selected range. |
| Exercise sessions | Distinct completed/partial session IDs inside the range, falling back to individual log IDs for legacy rows. |
| Exercise adherence | Completed or partially completed exercise logs divided by completed, partial, or skipped logs in the range. |
| Daily check-in completion | Distinct patient/check-in days divided by eligible active-patient days. Eligibility starts at the later of the range start, first assigned active/completed program, or patient creation. The result is capped at 100%. |
| Pain trend | Average pain score in the latest 7 days compared with the preceding 7 days. A negative change is improvement. |
| Function/confidence trend | Average confidence score in the latest 7 days compared with the preceding 7 days. A positive change is improvement. |
| Time between check-ins | Average hours between consecutive check-in timestamps per patient in the selected range. |
| Recent activity | Most recent program assignments, check-ins, exercise sessions, and timing events, displayed without names or notes. |
| Workflow timing | Median and average client-observed duration for each allow-listed event. |

## Instrumented workflows

- `patient_review_opened`: time from patient-workspace mount until real workspace data has loaded.
- `program_created` / `program_updated`: time from the program builder becoming ready until a successful save.
- `patient_checkin_submitted`: time from the check-in form becoming ready until a successful submission.
- `exercise_session_submitted`: time from the exercise form becoming ready until a successful session submission.

Instrumentation is best-effort: an analytics insert failure never blocks the underlying clinical action. This supports a staged rollout where the database migration is applied before the matching application deployment.

## Release order

1. Review and apply `20260823144009_add_founder_analytics.sql` to the intended Supabase environment.
2. Confirm the security and performance advisors have no new analytics findings.
3. Verify an admin can call `get_founder_analytics` and a clinician/patient receives `Admin access required`.
4. Deploy the application only after Vercel project ownership, production environment variables, domain, and deployment protection are reconciled.
5. Complete the admin, clinician, and patient smoke tests before inviting pilot users.
