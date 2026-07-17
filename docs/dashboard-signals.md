# Dashboard signals

The clinician Dashboard is a priority feed. The Patients page remains the complete caseload.

## Signal definitions

- **Needs review:** the patient is explicitly marked `needs_review`, has no program, has a pain alert, has no check-in/program activity for at least three days, or has a recent completion signal below 70%.
- **Pain concern:** the latest check-in is no more than 14 days old and reports pain of at least 7/10, or its pain score increased by at least two points compared with the previous check-in.
- **Adherence attention:** there is no check-in/program activity for at least three days, or fewer than 70% of exercise-adherence rows created in the last seven days are `completed`.
- **Meaningful progress:** an otherwise on-track patient has an active/latest goal marked `met` or at least 80% complete.
- **Recent activity:** the six newest `daily_checkins` or `exercise_adherence_logs` visible to the authenticated clinician through RLS.

## Current schema limitations

`exercise_adherence_logs` records exercise events but the schema does not store a dated schedule of expected sessions. Therefore, the Dashboard labels its calculation a **completion signal**, not a true prescribed-session adherence rate. A future scheduled-session model could distinguish a missed prescription from a day on which nothing was scheduled.

The schema also does not contain discrete goal-milestone rows. Meaningful progress currently uses goal status and progress percentage; it does not claim that a newly defined milestone was crossed.
