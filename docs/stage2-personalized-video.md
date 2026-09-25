# Stage 2: private video preview — first increment

Stage 1 pilot-v1 is live and production verified. This branch must remain separate from main until the user explicitly approves another release.

## Implemented

- Patient-specific clinician demonstration recording/file selection, private upload and playback.
- Clinician watches playback, edits the exercise name/instructions/cues and explicitly approves publication. One approved demonstration per assigned exercise; replacement withdraws the previous one. Prescribed dosage and the shared library stay intact.
- Optional patient recordings with explicit sharing consent and consent-version capture; no automatic movement assessment.
- Access follows the current treating clinician and linked patient. Unrelated clinicians and administrators have no access. Draft demonstrations are hidden from patients. Patients cannot approve demonstrations, edit instructions or overwrite approved files.
- Private bucket, random object paths, 25 MB limit, MP4/WebM/MOV allowlist, verified upload metadata, short-lived 60-second playback links, no offline video cache. MIME checks do not establish codec compatibility or malware scanning; use synthetic clips for preview review.
- Withdrawal denies new playback links. Already issued links may work for up to one minute, and downloaded content cannot be recalled. Owners may delete their withdrawn/incomplete files through the Storage API; withdrawn metadata remains as history. Establish retention/cleanup policy before Stage 2 production use.

## Database and preview isolation

Migration `20260922090316_stage2_private_exercise_video.sql` adds a dedicated table, bucket, policies and narrowly scoped RPCs to the shared database. It does not change Stage 1 tables, policies or engine inputs. Application UI remains on this feature branch. Security advisors returned no findings after migration. Preview and production share the database, so use synthetic accounts only during this experiment.

## Validation

Local PostgreSQL tests replay the existing authorization schema and test the actual new migration: drafts, approval publication, consent, file constraints, missing/mismatched uploads, overwrite denial, replacement, withdrawal, unrelated clinician/admin isolation, relationship revocation and owner cleanup. CI runs these alongside Stage 1 regression tests, lint, type checking and build.

Hosted preview verification passed all 13 synthetic browser/API checks: actual Storage upload, private draft denial, clinician playback/approval, patient program playback and instructions, public/overwrite denial, consented patient submission, clinician playback of the submission, unrelated clinician/admin isolation, 390px mobile layout, withdrawal and actual Storage API cleanup. GitHub Pilot readiness run 35708410281 passed. The browser test is reproducible via `tests/video-e2e.mjs` with a synthetic fixture and `TEST_BASE_URL`; credentials are never committed. Physical iOS/Android camera capture, codec compatibility, interrupted cellular uploads, backgrounding and Home Screen behavior require device testing; browser emulation is not a substitute.

## Next increments (not implemented)

AI-assisted exercise drafts with clinician editing/approval; optional desired-versus-patient comparison; explicit unable-to-assess outcomes; structured observation/clinician agreement, disagreement and correction; only clinician-validated movement observations entering decision support. No AI provider calls or autonomous clinical decisions exist in this increment. Define evaluation criteria and consent/retention before adding analysis.

## Video visibility correction

Recorded demonstrations now appear with draft/approved status in Program Builder, and approved demonstrations appear in the clinician's patient preview and a patient Program disclosure before the session starts. Patient video data refreshes while the page is visible and when returning to it. Upload and approval confirmations distinguish a private draft from publication. Saving a program updates retained assignment rows instead of deleting/recreating them, preserving video IDs and adherence links. Removing an assignment with recordings is blocked with an explanation to avoid losing its media association. This correction is preview-only; production Stage 1 still uses its prior program-save implementation, so do not edit a Stage 2 test program through production.
