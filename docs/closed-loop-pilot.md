# Closed-loop patient pilot

## Purpose

This release validates one workflow:

```text
Clinician assigns an active program
  -> patient records each exercise and a daily check-in
  -> clinician reviews context and trends
  -> clinician updates the program
  -> patient receives the current program on the next load
```

It intentionally excludes chat, notifications, wearables, video visits, offline sync, gamification, AI treatment recommendations, and a large education library.

## Data model

- `home_programs` and `home_program_exercises` are the assigned plan and dosage.
- `exercise_adherence_logs` stores one row per assigned exercise response. Rows from the same patient session share `session_id`. Actual sets, reps, or minutes are optional. A unique client submission ID and a session/exercise unique index guard against duplicate saves.
- `daily_checkins` stores pain, symptom direction, confidence/function, activity context, and comments. Multiple entries per date are supported; the UI encourages one entry unless something meaningful changes.
- `goals` and `progress_metrics` provide patient goal and clinician-measured progress.

The app derives summaries and charts from these source records. It does not store a second analytics copy.

## Ownership and RLS

Existing `can_access_patient` ownership rules remain the access boundary:

- A linked patient can read/write only rows for `patients.patient_profile_id = auth.uid()`.
- A clinician can read/write only rows for patients where `patients.clinician_id = auth.uid()`.
- Exercise-log inserts additionally verify that the referenced program and program exercise belong to the same patient.
- Daily-check-in inserts verify that the referenced episode belongs to the same patient.

## Freshness

Patient and clinician screens query Supabase on each page load. Program Builder persists the active program before returning to the Patient Workspace. The patient sees the latest active program after a reload, a new session, or a new-device login; no mock cache or fallback patient is used.

## Manual pilot QA

### Invitation and authentication

- [ ] Clinician sends an email invitation from the intended patient workspace.
- [ ] Patient opens the link in a private browser, creates a password, and reaches `/patient`.
- [ ] Patient signs out and signs in through `/login`.
- [ ] The same email/password signs in on a second browser or device.
- [ ] A different patient account cannot open this patient or their logs.

### Patient reporting

- [ ] Patient Home shows the active program and the correct exercise count.
- [ ] “Start today’s program” opens the assigned exercises on a phone-sized screen.
- [ ] Patient chooses completed, partial, or skipped for every exercise.
- [ ] Patient records actual dosage, pain, difficulty, and an optional comment.
- [ ] A successful save is clear; repeated clicking does not create a duplicate session.
- [ ] Patient submits pain, symptom direction, confidence, and a comment in Daily Check-in.
- [ ] A second same-day check-in is allowed when symptoms change.
- [ ] Patient Progress shows sessions, participation, goal progress, and pain/confidence trends.

### Clinician review and update

- [ ] The correct Dashboard item links to the correct Patient Workspace.
- [ ] “Since last review” shows participation, skips, pain, symptom direction, difficulty, comments, and the latest submission.
- [ ] Progress shows pain, exercise completion, and confidence/function trends with dated context.
- [ ] Exercise logs show actual dosage and the patient’s comment.
- [ ] Clinician updates the program and returns to the workspace successfully.
- [ ] Patient reloads on the original device and sees the update.
- [ ] Patient signs in on the second device and sees the same update.

## Required production configuration

Keep the authentication settings in `docs/authentication-audit.md`. Before using real patient data, also enable Supabase leaked-password protection. Production must use one public Vercel origin and must not be behind Vercel Authentication.
