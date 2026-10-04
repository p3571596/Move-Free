# Stage 1 adaptive follow-ups

Production baseline audited: main `599f66951bf10dfd7e01ef435de3944e5a02550f`, deployment `dpl_7QmWbDiDMBqjvhPiSR8qcwQXmZ8K`. Preserve this deployment as the application rollback point. No Stage 2 branches are part of this change.

## Before this release

Three-day inactivity was a computed dashboard reason only. There was no background job, persistent patient check-in, or targeted missing-data response loop. The recovered v0.1 evaluator preserved unknowns, but its automatic integration presented incomplete evidence as an evaluated provisional suggestion. Today could count a reviewed patient with a pain score and a goal as On Track without recent function response.

## Activity and delivery

Only active/needs-review patients with an active episode, active program and at least one assigned exercise qualify. Meaningful activity means a submitted completed/partial/skipped result for that program, an episode-linked check-in containing symptom direction, pain score, function direction or a nonblank patient comment, or an answered automatic follow-up. The clock begins at the later of assignment/program creation and episode creation if no activity exists. Merely opening pages, loading videos, or analytics events does not reset it. Server creation time caps future-dated exercise reports.

The database job `move-free-stage1-followups` runs hourly at minute zero in UTC. The threshold is 72 elapsed hours, including the exact boundary, not three local calendar dates. Therefore delivery is due at 72 hours and generated on the next hourly run (normally less than one hour later). Inserts and lifecycle/review updates also refresh the affected patient without a dashboard visit. The schedule is initially installed paused; activate only after the matching application is READY.

Delivery is a persistent **in-app** check-in on patient Today, refreshed on focus/visibility and every 30 seconds while visible. No reminder email or push is implemented. Invitation email is a separate existing channel and is not reused. The job creates the check-in even while no one opens the app; seeing it still requires the patient to return online.

One pending card per program, serialized processing and a database unique index prevent duplicates. A same-kind question has a seven-day cooldown; inactivity additionally requires activity after the previous inactivity check-in before another inactivity period can create one. An unanswered card remains available, and after three more elapsed days appears as clinician attention. It is not regenerated daily. If inactivity supersedes a pending missing-response question, the earlier question is retained as cancelled history. Answering an inactivity check-in can immediately unlock a different missing-response question; the seven-day cooldown is per question kind.

## Data sufficiency and adaptive questions

The full recovered v0.1 pathway still requires all of its explicit valid inputs, including clinician safety/examination findings, exposure, response and expected progress. Known positive safety findings retain the safety branch despite other unknowns. Incomplete evidence now returns `missing_information` with `NEEDS_CHECK_IN` or `CLINICIAN_REVIEW`, never an approvable treatment suggestion. Reported exercise completion is not prescribed adherence; difficulty is not RPE; demonstration is not verified technique; unknown neurological findings are not normal.

The server checks for explicit symptom direction and function direction within the preceding 14 days/current program. Comparable numeric goal baseline/current/target values can supply goal direction; patient self-report is labelled with provenance and never substitutes for an objective examination. Response data are not discarded merely because a clinician reviewed them. Exercise concern summaries retain the existing post-review window.

Automatic questions are restricted to:

- Inactivity: what would help resume the program (time, symptoms, instructions, therapist help, exercising without logging, other)?
- Missing symptoms: better, same, worse, unsure?
- Missing function: daily activity getting easier, same, harder, unsure/not tried?

Only missing response domains are asked; no full examination questionnaire. An optional comment is available. With no meaningful activity since assignment, missing-response prompts wait for activity; the inactivity check-in is due at 72 hours.

Exercise feedback branches add optional difficulty reason only after Too hard, completion reason only after partial/skipped, symptom increase for performed exercises, and settled/improving/still increased/unsure only after increased symptoms. Existing session Better/Same/Worse and comments remain optional.

Answers are validated and saved atomically to follow-up history plus `daily_checkins`; a trigger immediately re-evaluates sufficiency/attention. The clinician engine consumes those structured records and provenance when the Summary is loaded/recalculated. Full treatment-rule evaluation remains clinician-facing, not a scheduled autonomous prescription system.

## Clinician escalation

Known unresolved safety findings take precedence over all generic reminders. New worsening symptoms/function, high pain, large symptom increase or ongoing increased symptoms route to clinician review. Help requests or uncertain answers also route to review instead of repeated questioning. Patient questions never ask for neurological, movement-quality, technique or other clinician examination results. An explicitly recorded incomplete clinical assessment remains a review item even when patient response data are available.

Today retains Alerts/Needs Attention and Recommendations to Review, with On Track represented only by a count. Review links open the patient Summary. Follow-up question/answer history appears in Patient Log, and relevant pending/attention reasons appear in Summary. Approve/Modify/Reject is available for evaluated suggestions; insufficient cases may be recorded as a clinician's independent decision with `not_evaluated`. Publishing guidance and changing prescriptions remain separate clinician actions.

## Security and operations

New tables have relationship-based RLS and explicit authenticated SELECT grants. Patients cannot directly insert/update follow-ups or scheduler state. The patient answer RPC validates authenticated ownership, active case/program, permitted question keys and enumerated values, then invokes a narrowly scoped private function. Clinician-only scheduler state remains inaccessible to patients and unrelated clinicians. Scheduler functions are private invoker-rights functions unavailable to public/anon/authenticated callers; triggers and the narrowly scoped answer handler use a fixed empty search path. No service credentials enter the browser and no response text is added to analytics.

Monitor `cron.job_run_details` for this named job. Job output contains counts/status, not patient content. This pilot has a small patient population; revisit batching and execution duration as it grows. Use `cron.alter_job(jobid, active := false)` to pause scheduling. Preserve additive tables/history on application rollback; the previous application will not show new follow-up cards, so pause the job when rolling back.

## Verification

`npm test`, `node tests/followups.mjs`, existing relationship/clinical-storage/lifecycle suites, lint, TypeScript, build, and synthetic live browser acceptance. The follow-up suite covers A–E, G–K at the database boundary; engine tests cover adequate-input recommendations, explicit insufficiency, provenance, clinician-only missingness and safety ordering. Existing suites protect program/video/message and lifecycle paths. `tests/followup-browser.mjs` tests live RLS and patient → structured data → clinician UI; it requires a private synthetic fixture and is not a real-patient test.
