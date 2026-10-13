# Move Free private pilot integration — October 13, 2026

## Release status

Draft integration candidate. **Not ready for production or real-patient use.** No production migration, account grant, merge or promotion was performed. Production remains main `7a83f9976447370aff8573d16878c19b6bc62332`, rollback deployment `dpl_HtLVDpcJJRmDd3NZGQwTgdFT5Q14` (READY, marked rollback candidate).

Branch: `integration/stage2-private-pilot`. The hosted branch preview is deliberately synthetic with database connection settings disabled, even if general Preview variables exist. `/private-pilot-preview` offers local recording/file preview, numeric editing and cues with no database writes. `/workflow-preview` retains existing synthetic Stage 1 workflows. Both preview routes return 404 in production. This review preview is not the clinical integration environment.

## Audit

Main and production commit match. No open repository PRs were returned by GitHub issue search. Stage 2 branches remain intact: personalized video tip `2e517b8`, AI/FITT tip `130d8d8`. Wholesale merging has conflicts in data, types, prescription validation, Program Builder and patient workflows; its older FITT model uses strings whereas current main uses numeric value/unit entries. The attempted local merge was discarded; current main is the implementation base. Selected video components and its existing migration were recovered without overwriting parallel branches.

| Earlier fix | Code/deployment/database evidence | Qualification |
| --- | --- | --- |
| Three-day inactivity | Main; production follow-up migrations; hourly cron active at `0 * * * *` | In-app delivery; no email/push reminder; 72 hours plus next hourly run |
| Insufficient-data questions | Main; production adaptive-followup migrations | Clinician examination unknowns remain review items |
| Too hard / Other explanation | Main; structured-prescription migration applied | Conditional validation and immutable provenance |
| Scroll to next exercise | Main PatientProgramFlow | Existing focus/scroll behavior preserved |
| Numerical prescriptions | Main; production `stage1_structured_prescriptions` applied | Numeric value/unit pairs; ambiguous originals archived |
| Editable notes/cues | Main Program Builder and library editing | Patient-specific edits retain template isolation |
| Invitation correction/resending | Main PR #13; production `secure_patient_invitation_replacement` applied | SMTP repair, sender-domain status and actual inbox receipt are NOT independently verified in this audit |

Production public tables all have RLS enabled. Existing `exercise-video-preview` bucket is private, 25 MiB, MP4/WebM/MOV only. Its migration had already been applied in production despite the video UI remaining on a feature branch. Existing policies permit optional patient recordings and do not restrict clinicians by feature grant. This candidate adds those restrictions; production is unchanged until coordinated release.

Security advisors returned one INFO item for private invitation storage with RLS/no policies (intentionally operator/RPC controlled), no warning/error in this response. An advisor response is not a complete security or HIPAA certification.

The isolated Stage 2 Supabase branch `hmebkyjnfawbdthiyayg` contains old draft schemas and recent Stage 1 lifecycle/followup/invitation migrations, but lacks the current numeric-prescription migration. Applying that migration without reconciling old string prescriptions would overwrite synthetic draft assignments. It has NOT been modified. A fresh isolated database or an explicitly reconciled migration preserving those existing records is required for hosted full-stack verification.

## Changes

Patient workspace keeps Summary, Progress, Patient Log and Program. Program Builder retains the current numeric fields, clinical cues, stable assignment IDs and atomic/version-checked save. Private recording/upload/review appears inline per saved exercise for a flagged clinician. A new exercise is first saved with its structured prescription, then its private video is uploaded and separately approved. This intermediate exercise is already assigned; there is no unpublished whole-exercise draft implementation in this increment.

Supported: phone camera/file capture fallback, desktop MediaRecorder with audio, local preview/discard/re-record, immutable private upload, signed playback, editable title/instructions/cues, explicit watch/review/approve, replacement, withdrawal and storage deletion. The old approved video remains available while a replacement is a private draft. Approval replaces only the same patient assignment; library and numerical prescription are preserved. Approved media appears in clinician Program and patient exercise flow. Existing public standard-library video links remain Stage 1 functionality; private uploads never use public URLs.

Deletion first withdraws access, then calls Storage removal. A failed removal retains a withdrawn row and a retry button. Approved replacement withdraws old metadata but does not automatically delete old bytes: retention/cleanup policy is an outstanding release requirement. Assignment deletion is blocked while active media or remaining storage bytes would be orphaned. Previously signed links can persist for 60 seconds; downloaded bytes cannot be recalled. No private media is added to offline caching.

## Access controls

Two independently managed flags: `personalized_exercises` and `ai_video_assistance`. Grants live in private.clinician_feature_grants with no authenticated/anonymous read/write grants and RLS enabled. No user can self-enable. An accessor checks the current authenticated UUID, confirmed Auth email, trusted clinician profile or existing clinician relationship, enabled state and optional expiry. Missing migration, missing grant or RPC error fails closed in the UI.

No account is enabled by the migration. The user-specified email was matched to confirmed Auth users, not guessed from a display name. Production UUID and isolated Stage 2 UUID differ. Production has a legacy clinician identity; the grant checker preserves that architecture. Before eventual activation, reverify identity in the target environment and insert the specific UUID only through an operator-controlled action. Selected therapists can receive grants later without code changes. Do not enable all clinicians.

Restrictive RLS policies combine with existing relationship policies for metadata and therefore Storage access. A write trigger also gates SECURITY DEFINER RPC writes, including direct calls to private implementations. Patient uploads/performance recordings are denied. Linked patients need no clinician feature grant for currently assigned approved demonstrations. Revocation blocks clinician draft/media access and mutation while preserving assigned patient playback. Direct AI route requests verify Auth and the independent AI flag; an allowed caller still receives 503 because inference is disabled.

## AI

No provider calls, key setup, patient chart transmission, autonomous treatment decisions or experimental patient analysis were added. AI/FITT branch remains unmerged. Its draft correction history and quoted dosage evidence are implemented in that branch, but use the incompatible string prescription model. Adapt those to current numeric prescriptions, add a server-enforced self-demonstration/synthetic-context eligibility policy, and verify provider retention/BAA arrangements before enabling Flag B. Do not use an editable checkbox alone as a real-patient privacy boundary.

## Migrations

Recovered existing `20260922090316_stage2_private_exercise_video.sql` for repository/local reproducibility; it is already installed in production and must not be reapplied there under a new name. New `20261013133128_stage2_private_pilot_gate.sql` adds only grant storage/functions, restrictive policies and triggers. No historical prescription conversion or feature-grant seed is performed. It has been tested locally against the schema-only PostgreSQL fixture; not applied remotely. Keep additive metadata/audit on rollback and revoke flags. Do not delete columns/history to roll back.

## Verification

Passed locally: 41 unit tests; lint; production build/type checking (including the synthetic preview additions); current structured-prescription, relationship, clinical-storage, case-lifecycle and followup PostgreSQL-compatible PGlite suites; new private-pilot database suite. New suite tests no self-enable, unflagged treating clinician denial, revoked flag/direct RPC denial, patient recording denial, private drafts, upload MIME/size/finalization, immutable storage, replacement, authorized patient playback independent of grants, unrelated patient/clinician/admin boundaries, revoked relationships and assignment retention. PGlite storage tables simulate authorization; they do not establish hosted Storage transport/codec behavior.

Browser scripts for Stage 1 and new mobile/desktop synthetic preview are included in CI. Local Chromium launch was blocked by macOS sandbox Mach-port permissions; no passing local browser claim is made. Physical iPhone/Android recording, codecs, interruption/backgrounding and camera permissions require device acceptance. Live auth → Storage → approval → patient playback, invitation inbox receipt/onboarding and AI accuracy tests remain outstanding.

Dependency audit: 17 inherited advisories (16 high, 1 critical), including Next.js. None are resolved by this candidate. Review applicable advisories and update/test dependencies before release.

## Release gates and next step

1. Reconcile numeric prescription and old Stage 2 draft schemas in an isolated database while preserving all existing data; validate migration replay and database advisors.
2. Resolve inherited dependency advisories. Validate recording and media lifecycle on physical phones and desktops.
3. Run full synthetic authenticated clinician/patient workflow including invitations and actual inbox receipt; confirm SMTP sender authentication.
4. Establish retention/cleanup and confirm signed BAAs, covered service plans/settings and actual service data flows. Supabase HIPAA guidance requires a BAA and HIPAA add-on; no contract/plan verification was available here: https://supabase.com/docs/guides/platform/hipaa-projects. Storage policy guidance: https://supabase.com/docs/guides/storage/security/access-control.
5. Complete AI numeric draft integration and privacy controls before granting Flag B. Manual video can be considered independently after its own gates pass.
6. Only after validation, present the concrete release results and request final user approval for production migration, identity-specific grant, merge and deployment. Preserve the recorded rollback point.
