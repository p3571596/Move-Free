# Dashboard signals

The clinician Dashboard is a priority feed. The Patients page remains the complete caseload.

## Signal definitions

- **Pain concern:** the latest check-in is no more than 14 days old and reports pain of at least 7/10, pain increased by at least two points from the previous check-in, or the two newest check-ins both report `worsening`.
- **Adherence attention:** there is no check-in/program activity for at least three days; at least three exercise rows exist in the last seven days and fewer than 60% are `completed` or `partial`; or at least two exercises were `skipped` in that period.
- **Repeated hard exercise:** at least two exercise rows in the last seven days are rated `too_hard` or the legacy value `painful`. This adds a review reason even when participation is adequate.
- **Care setup/review:** the patient is explicitly marked `needs_review` or has no assigned program.
- **Meaningful progress:** an otherwise on-track patient has a goal updated in the last seven days that is marked `met` or at least 80% complete.
- **Recent activity:** the six newest `daily_checkins` or `exercise_adherence_logs` visible to the authenticated clinician through RLS.

## Current schema limitations

`exercise_adherence_logs` records exercise events but the schema does not store a dated schedule of expected sessions. Therefore, the Dashboard calls this **participation**, not a true prescribed-session adherence rate. `completed` and `partial` count as participation; `skipped` does not. A future scheduled-session model could distinguish a missed prescription from a day on which nothing was scheduled.

The schema also does not contain discrete goal-milestone rows. Meaningful progress currently uses goal status and progress percentage; it does not claim that a newly defined milestone was crossed.
