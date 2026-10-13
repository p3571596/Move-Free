# Stage 2 private pilot — live release

The tested integration is deployed in the main Move Free application. The user gave explicit final production approval after live synthetic validation on October 13, 2026. PR #14 merged to main at `1837712bf6a763a494ab71efc26739e26a573aa4`. Deployment `dpl_J87SfmqsA2eAc26KauzvwCNmFkKB` is READY at that commit and serves https://move-free.vercel.app and https://movefree.pyhlabs.com. Documentation-only follow-up commits may advance main without changing the tested application code.

## Workflow and access

Patient → Program → Add/Modify Exercise → Choose Video Source offers existing exercise video, record/upload a clinician demonstration, and generate an exercise demonstration using AI. All options remain inside the existing Program Builder.

Operator-managed server grants enable only `personalized_exercises` and `ai_video_generation` for the verified pilot clinician. Production checks confirmed exactly one enabled account, zero other enabled accounts and zero enabled analysis grants. `ai_video_assistance` is independent and disabled. Comparison and patient movement analysis remain disabled. Auth verification, database RPCs, RLS, storage policies and write triggers enforce access; browsers cannot self-enable or forge provider output.

Generation uses a fictional adult and one of four preset movements: squat, heel raise, sit to stand or wall push-up. No patient IDs, chart text, names, numerical prescriptions, photographs, uploaded recordings or reference media are included in generation requests. Other exercises use clinician recording/upload during this pilot.

Generation creates a private draft, never an automatic patient assignment. Clinicians preview the clip, edit name/instructions/cues/type/equipment and numerical FITT, and attest to movement, instruction and FITT review. Approving the draft only applies local Program edits. Save Program, then explicitly Publish and assign reviewed video. The server checks the exact saved exercise name/dose, current care relationship and active assignment. Generic manual approval cannot bypass generated review and browser uploads cannot substitute generated media. Original assignment cues remain visible alongside reviewed video cues without repetition; shared library templates are preserved.

## Provider, credentials, cost and limitations

Actual video generation uses Google Veo 3.1 Fast through Vercel AI Gateway (`google/veo-3.1-fast-generate-001`). The user added Gateway credits; project OIDC authentication and a real generation were verified. No new provider key was created or exposed. The existing OpenAI configuration is retained only for separately gated self-demonstration analysis in its prior preview environment. OpenAI's video API was removed September 24, 2026 and is not used.

One silent four-second 720p clip is estimated at $0.40. The server verifies current catalog price and supported duration before each new reservation and pauses if they cannot be verified or change. Atomic reservations cap generation at $5 per clinician per UTC day: 12 attempts, $4.80. Failed or uncertain attempts keep their reservations. Provider starts have no automatic retries; a new paid attempt requires accepting its estimate. Persistent opaque job references allow status retries and resumption after reload without creating another generation.

Draft MP4 files are stored in the private `exercise-generation-private` bucket, up to 25 MiB, with clinician-only signed playback. Approved copies use the existing private demonstration bucket and are readable only within the assigned care relationship. Patients cannot read generation drafts. Provider operations and URLs are server-only. Approved media is immutable; replacement and withdrawal remain explicit. During this short pilot, unapproved-draft retention/cleanup is operator-managed rather than automatically deleting clinical assets.

Generated movement, anatomy or framing may be inaccurate or incomplete. Four-second clips are illustrations requiring clinician review, not clinical evidence or validated treatment instructions. Physical installed iOS/Android PWA testing is still unverified. Runtime dependency audit reports zero vulnerabilities; five inherited developer lint-toolchain advisories remain.

## Validation and release

A real Veo job produced a four-second 1280×720 MP4 (420,863 bytes). Hosted tests used synthetic records only: clinician playback completed without errors; edits to instructions/cues/name and reps 8→10 persisted; review alone did not publish; premature assignment with an unsaved dose was rejected; Save Program retained prior and reviewed cues; explicit assignment succeeded for the correct exercise/patient; the authenticated synthetic patient played the approved clip with 2 sets × 10 reps and both cue sets displayed once. Test instructions explicitly prohibit clinical use. This validates software behavior, not the clinical accuracy of AI movement.

Actual authenticated patient checks: generation drafts returned zero rows, draft signing was denied, approved assigned-video signing succeeded, generation POST was denied (403), and anonymous generation was denied (401). Mobile content width matched the 390 px viewport. CI #48 passed before merge: 47 unit tests, all database authorization/storage/lifecycle/prescription/generation suites, lint, TypeScript, build and synthetic mobile/desktop workflows.

Production smoke tests: login200, both synthetic-only preview routes404, unauthenticated/dummy invalid-token generation401. Production database evaluation confirmed personalized=true, generation=true, analysis=false for the verified clinician. Private bucket, worker permissions, no browser job-forging privilege and anonymous assignment denial were verified. Security advisors found no warning/error findings; two INFO entries reflect deliberately policy-free deny-by-default private operator tables. A production clinician-authenticated round trip was not impersonated; it requires the user's own session. No real-patient AI input or production synthetic account was created. Temporary synthetic preview clinician flags were disabled after testing.

The three new production migrations applied successfully:
1. `20261013133128_stage2_private_pilot_gate.sql`
2. `20261013140019_clinician_ai_exercise_drafts.sql`
3. `20261013163303_generated_exercise_video_pilot.sql`

The existing production private-video schema and Stage 1 numerical program saving were preserved and not reapplied. The isolated Stage 2 database received additive preview-only numerical-save compatibility without converting existing older prescriptions. Original Stage 2 branch tips are unchanged; related Work changes were inspected and preserved.

Rollback: disable the two pilot grants first, then restore baseline deployment `dpl_HtLVDpcJJRmDd3NZGQwTgdFT5Q14`. Retain additive schemas and approved private media. Do not overwrite Stage 1 prescriptions or existing clinical programs.

References: [PR #14](https://github.com/p3571596/Move-Free/pull/14), [final CI](https://github.com/p3571596/Move-Free/actions/runs/38480985045), [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations), [Veo catalog](https://vercel.com/ai-gateway/models/veo-3.1-fast-generate-001), [Gateway video documentation](https://vercel.com/docs/ai-gateway/modalities/video-generation), [OIDC](https://vercel.com/docs/oidc/reference), [private-table advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
