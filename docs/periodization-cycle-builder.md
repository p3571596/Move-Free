# Repeating cycle builder — October 25, 2026

## Audit and scope

Based on main `5860b1535fe9c08f636e744baa9e5c4be58d672e`, the deployed October 24 progression/ranges release (merged PR #23). Read production UI, repository, applied migration metadata, branch inventory and prior Work development. Production has 19 programs / 37 assignments, individual patient confirmations, range dosage, sessions, immutable approval revisions and the v1 active-week progression plan. Open independent PRs #5/#7/#15 remain unmerged. Those media/invitation projects and feature gates are not dependencies and are unchanged.

This implementation extends the same Program Builder, `progression_plan` document, `save_progression_plan` RPC and immutable `program_progression_revisions` history. It does not create another prescription store. Existing v1 plans keep their active-week semantics and editor; new plans use the concise four-step cycle builder. Simple programs remain optional and fixed-dose prescriptions retain the existing assignment editor.

## Four-step workflow

1. Per exercise, select applicable saved base parameters individually or with All/Common/Clear. Common means sets/reps/load/intensity where prescribed. Unsupported/unprescribed fields cannot be selected. No selection opens fixed-program review. Selection is local draft state and never publishes.
2. Higher intensity, Lower intensity and Recovery/Rest profiles inherit base numerical values. Only selected variables are edited. Profile exercise membership and cues are independent. Add, rename, duplicate and remove custom profiles. Recovery can be full rest (zero exercises) or clinician-defined active recovery. No universal High/Low doses are invented.
3. Enter dates or duration in weeks, cycle distribution (1–28 days), fixed or flexible mode, allowed weekdays, High-day spacing, per-profile recovery hours and multiple-session permission. Generate the arrangement once and preview dated prescriptions. Weekly/phase/calendar-month adjustments use explicit inclusive effective dates and partial numerical parameter overrides. No month is approximated as four weeks. Fixed schedules that exceed the numerical exercise frequency block approval until the clinician reconciles them.
4. Inspect conflicts, resolved prescriptions, duration, restrictions and changes; explicitly attest and approve the entire dated cycle. Save Draft never changes the patient program. A new approval appends history and invalidates stale sessions.

Occurrence edits offer one date, that cycle slot from a date onward, or the repeating slot template. Resolution is base snapshot → selected profile values → occurrence's profile (explicit date > latest future-slot rule > template) → dated numerical adjustments. Two overlapping dated rules for the same profile/exercise/parameter conflict even if their values match. Non-overlapping parameters may combine. Profile changes preserve exercise identity and existing approved videos. All final values are previewable before approval.

The review covers every explicit date, including scheduled later load/frequency/phase changes. Repetition of already approved prescriptions is allowed; the decision engine cannot invent or activate a new dose or unapproved phase.

## Patient and engine behavior

Suggested for Today and Weekly Overview show the approved profile and resolved numerical dose. Full rest requires no Done action. Other approved profiles can be inspected; performing alternatives requires approved flexibility. Fixed schedules enforce the date/profile; flexible schedules enforce maximum profile sessions in each seven-day window anchored to the approved start, allowed weekdays, High recovery spacing and per-profile rest hours. Windows at the end of the program use only the remaining approved days. Frequency counts represent sessions with individual activity reports, not inferred complete sessions; unrecorded activity remains unknown. The clinician must consider unknown exposure when reviewing these counts.

Only individual Done records activity. Actual dosage stays unknown unless reported; optional 10/8/8 remains completed reported activity within 3 × 8–12. Existing immutable snapshots retain the original prescription revision, suggested date and actual submission date. An actual dose report never edits the prescription. Future schedule approval does not rewrite historical logs or approval documents.

The existing Clinical Decision Engine compares available reported numerical values with known approved bounds (10/8/8 remains within 8–12; unknown Done remains unknown) and retains cycle evidence (revision/profile, planned snapshot, actual dose and per-set reps, difficulty, symptoms, recovery and dates) with its contextual review snapshot. Its current safety/response/functional pathways and approve/modify/reject controls remain authoritative. Unknowns do not become nonadherence. Numerical records alone never authorize escalation. Existing upper-range insights remain clinician-review prompts.

Unit changes convert exact values, both range limits and preferred targets for equivalent time, mass and distance units. Incompatible dimensions (for example RPE to heart-rate percentage or sessions/week to days/week) require clearing the old value and entering a new prescription.

## Migration and authorization

`20261025113512_periodization_cycle_builder.sql` is additive in behavior: no new tables, data rewrite, historical parsing/backfill, migration of existing plans or patient publication. It extends the document validator and date resolver, and adds an activity trigger. SECURITY INVOKER, fixed empty search paths, existing relationship RLS, clinician-only approvals, source-version checking, immutable revisions and individual activity guarantees are retained. The server validates inheritance, selected fields, dates, schedules, conflicts, exercise ownership and prerequisite ordering. Full rest bypasses exercise-dose requirements only in v2 documents. V1 plans preserve their previous validation and active-week restrictions.

Approved cycles hold base snapshots. Later base edits do not silently alter an approved day's dose; a further cycle approval explicitly incorporates new inherited values. Recovery and daily/frequency limits serialize on the existing patient lock and apply to direct database inserts as well as the confirmation RPC. Actual per-exercise frequency maxima (sessions/day, sessions/week, days/week), including dated changes, are enforced without inventing missing actual dose.

## Validation and release

Use `npm test`, `node tests/cycle-storage.mjs`, `node tests/progression-storage.mjs`, existing storage/authorization suites, TypeScript, lint, build and browser suites from CI. `cycle-browser.mjs` covers the four-step UI at mobile/desktop widths with synthetic memory-only data. `patient-directed-browser.mjs` extends the existing browser → simulated Auth/PostgREST → real local PostgreSQL/RLS suite with v2 approval, date resolution, individual confirmation, actual dose and snapshot assertions at 390/412/1280 widths.

The feature-branch Vercel preview disables database connection settings and server database secrets. `/workflow-preview` uses synthetic data and never writes a database. Production is unchanged. This migration is unapplied to production. No extra billed Supabase branch has been created or unrelated preview database reused.

Remaining acceptance gates: hosted isolated Supabase Auth/PostgREST with this migration and installed physical iOS/Android PWA behavior. Local PostgreSQL authorization tests do not establish hosted Auth or physical-device behavior. Existing identity/real-PHI/media pilot release gates remain separate. Review the exact CI head and preview before approving production release. Deploy the additive migration and compatible application only after the user's final approval; retain immutable history on rollback. Older clients must refresh before v2 plans are enabled, because they cannot enforce/display the new cycle's availability correctly.
