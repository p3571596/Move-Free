# Stage 1 workflow refinements

## Baseline and scope

Main and production were verified at `7ccdff062c41c16ed1e367f74405940363c5b287`, production deployment `dpl_7dwNy1kTpHjuUMLXqQ7J6bLnv3mn`. Active Stage 2 branches `feature/stage2-ai-fitt` (`130d8d8`) and `feature/stage2-personalized-video` (`2e517b8`) were inspected; neither is merged or modified by this work. This implementation does not include AI extraction, private video uploads, or Stage 2 storage changes.

## Patient flow

Too hard → Other reveals a required, trimmed explanation of up to 500 characters. Switching difficulty/reason clears the explanation, and only an applicable explanation is submitted. A conditional explanation is validated in the browser, data layer, and database. General exercise comments and session comments remain optional. The Patient Log and decision evidence show the explanation as authored feedback. The database records the authenticated actor, timestamp, and whether the author was the patient or clinician. Text is not interpreted into neurological findings, RPE, pain scores, or treatment instructions.

After a committed exercise-step change, the newly rendered title receives keyboard/screen-reader focus and an immediate scroll with clearance for the sticky app header. The effect cancels an obsolete animation frame. Back and review navigation use the same behavior. No motion animation is imposed. Existing video opt-in playback remains intact.

## Prescriptions

`prescription` / `default_prescription` store a typed JSON object of numeric value plus explicit unit for sets, reps, hold, rest, load, exercise duration, frequency, intensity, and distance. Absent keys are not prescribed; an applicable blank value remains null, never zero. Only the clinician selects applicability. Decimal loads/time/distance and integer counts/frequency are validated in UI, data layer, and SQL. RPE/10, percentages, and days/week have explicit bounds. Notes/key cues remain editable. Band colors, tempo, assistance, and other unstructured clinical nuance belong in cues.

Library defaults are copied into a patient draft. A program save never edits an existing library template. Patient-specific names and videos are stored as assignment overrides; an intentionally removed video stays removed. New personalized exercise definitions can be added to the clinician’s library, but patient dose and cues are stored on the assignment, not the standard. Standard library defaults are edited explicitly in Exercise Studio.

Program saves use a security-invoker RPC with relationship checks, a patient/program lock and expected version. A first program creates the initial episode atomically; closed episodes require explicit reactivation. All assignments update in one transaction. Existing assignment IDs remain stable, and invalid/stale/mismatched items reject the entire save. Program assignment time is preserved across ordinary edits, maintaining inactivity clock semantics.

## Migration and history

Migration: `20261009212333_stage1_structured_prescriptions.sql`. Additive columns and functions only. Original dosage_sets, dosage_reps, and frequency are archived verbatim in `legacy_prescription` before compatibility columns change. Exact integer counts and explicit supported frequency forms are converted. Ranges, combined instructions, and time in the legacy reps/time field remain unconverted because hold versus exercise duration is ambiguous. Originals remain patient-visible until the clinician reviews them and carries needed instructions into cues. Combined library defaults remain verbatim and are not parsed. There is no automatic clinically inferred backfill.

Existing immutable `engine_program_changes` captures typed before/after assignments, clinician identity, and timestamp. Current dose, review-window changes, and patient feedback evidence are supplied to decision-engine source snapshots. Patient Log can filter prescription changes. Founder analytics exposes counts of numeric/cue edits only; no patient IDs, comments, or individual clinical values. Unit changes are retained explicitly, not treated as arithmetic progression or evidence of benefit.

New exercise feedback gets a server-generated snapshot of the assignment **at submission**, separately from optional patient-reported actual sets/reps/time. It is not proof the patient performed the prescribed dose. Historical logs keep null snapshots: today’s prescription must not be invented as yesterday’s exposure. The engine still cannot infer prescribed adherence from frequency alone because planned session opportunities are not explicitly scheduled.

## Release and preview

User requested an isolated branch/PR and synthetic UI preview. **Do not apply this migration to production, merge, or promote a deployment without approval for this set of changes.** The preview at `/workflow-preview` reuses the production patient component and numeric fields with in-memory synthetic records. It is accessible only in Vercel preview environments (or a local `WORKFLOW_PREVIEW=1` server). It performs no clinical database writes. Real authenticated saving requires this migration in the target database; that remains unapplied by request.

For an eventual release: validate migrations on an isolated database, review advisors, run the required tests/build, then coordinate the additive migration before deploying the app. Keep the baseline application rollback deployment. New columns are compatible with older app reads; archive new structured records before any rollback that would delete columns. Existing hourly follow-up scheduler, cooldown, safety precedence, clinician approval, and relationship-based RLS remain in place.

## Validation

`npm test`, lint, TypeScript, production build; database suites for relationship authorization, clinical review storage, case lifecycle, scheduled follow-ups, and structured prescriptions. `tests/structured-prescriptions.mjs` replays the repository’s schema-only fixture in PostgreSQL-compatible PGlite and verifies backfills, transactional rollback, stable IDs, template isolation, trusted feedback provenance, immutable snapshots/audit, analytics privacy, unauthorized access, and revoked care relationships. No production patient data is needed.

`tests/workflow-browser.mjs` uses synthetic data at mobile portrait, desktop, and mobile landscape sizes to verify conditional input/validation, numeric units/applicability, patient-specific editing, title focus and scroll, immediately visible video, Back state retention, and evidence/history. This is Chromium emulation, not a physical iOS/Android installed-PWA test. Screenshots and result details are retained as review evidence.

## Dependency audit limitation

The audit on October 9, 2026 reports nine inherited advisories (eight high, one critical). Every affected package version matches main; the added Playwright dependency has no reported advisory. Next.js 16.3.5 includes GHSA-vcvr-r3jv-pc5j and other advisories fixed in newer releases. No Next.js/framework upgrade or production release is part of this feature PR. Review and resolve applicable dependency advisories before approving a production release. The synthetic preview is for workflow review, not a statement of production security certification.
