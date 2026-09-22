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

Hosted mobile/browser results are recorded separately after preview deployment. Physical iOS/Android camera capture, codec compatibility, interrupted cellular uploads, backgrounding and Home Screen behavior require device testing; browser emulation is not a substitute.

## Next increments (not implemented)

AI-assisted exercise drafts with clinician editing/approval; optional desired-versus-patient comparison; explicit unable-to-assess outcomes; structured observation/clinician agreement, disagreement and correction; only clinician-validated movement observations entering decision support. No AI provider calls or autonomous clinical decisions exist in this increment. Define evaluation criteria and consent/retention before adding analysis.
