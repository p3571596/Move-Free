# Stage 2 private pilot integration

The existing Patient → Program → Program Builder now offers existing exercise video, clinician recording/upload, and AI-generated demonstration sources inline. Structured prescriptions and editable clinical notes remain patient-specific; shared library templates are preserved. No production release has been approved or performed.

## Provider and current release status

Actual video creation uses Google Veo 3.1 Fast through Vercel AI Gateway (`google/veo-3.1-fast-generate-001`). OpenAI video generation was removed on September 24, 2026; the existing OpenAI key is retained only for separately gated self-demonstration analysis. Generation uses server-side Vercel OIDC request context or an explicitly configured Gateway credential, never browser credentials. No new OpenAI key is required for generation.

Verified Gateway catalog pricing: silent 720p, four seconds, one sample at $0.10/second = estimated $0.40 per attempt. The server verifies current price and duration support before each new reservation, fails closed on changes, uses no automatic provider start retries, and atomically reserves at most $5 per clinician per UTC day (12 attempts, $4.80). Failed/uncertain attempts retain reservations. This is an application spending guard, not a statement about the user's Gateway balance. No credits or paid plan have been purchased.

Live isolated preview authentication works. A real Veo start request was rejected by Gateway with HTTP 403/access denied. Account video entitlement remains a release blocker. The user is enabling Gateway video access; a successful playable clip and its complete review/assignment round-trip are still required before requesting production approval.

References:
- [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations)
- [Vercel video generation and access](https://vercel.com/docs/ai-gateway/modalities/video-generation)
- [Veo 3.1 Fast catalog](https://vercel.com/ai-gateway/models/veo-3.1-fast-generate-001)
- [Vercel runtime OIDC](https://vercel.com/docs/oidc/reference)

## Independent server gates

Operator-managed `private.clinician_feature_grants` has no browser write access. Each gate requires a verified authenticated clinician identity, an enabled unexpired grant, and the UUID of the intended account. Migrations enable nobody.

- `personalized_exercises`: private demonstrations and assignment, including recordings.
- `ai_video_generation`: fictional generated clips, private drafts, review and explicit publication. Does not depend on analysis.
- `ai_video_assistance`: optional OpenAI analysis of a clinician's own demonstration, editable exercise draft and evidence-grounded spoken dosage. Does not enable generation or comparison.

All API calls validate Auth server-side. Database RPCs, RLS, storage policies and write triggers enforce the gates independently of UI visibility. Comparison and patient movement analysis have no enabled workflow. The proposed initial production release enables only personalized demonstrations and generation for the verified pilot clinician; analysis remains independently disabled unless separately enabled.

## Creation and review

The first pilot supports four fixed movement prompts: squat, heel raise, sit to stand and wall push-up. Requests describe a fictional adult in a neutral studio; they contain no patient IDs, names, chart text, free clinical prompts, prescriptions, photographs or reference media. More movements use clinician recording/upload during this pilot. Four-second clips can be incomplete or anatomically inaccurate and are not clinical evidence.

Jobs persist an opaque provider operation on the server, allowing explicit status checks and resumption after reload. Provider operations and URLs are not readable by browsers. Ready clips are copied into a private clinician-only bucket (`exercise-generation-private`), limited to 25 MiB MP4, then shown using short-lived signed URLs. Generation/transport/storage failure leaves the program unchanged and offers status retry without a new generation. A new paid attempt requires a new estimate acceptance.

Clinicians preview the clip, edit exercise name, instructions, cues, type/equipment and numerical prescription, and attest to movement accuracy, instructions and FITT review. Draft approval only applies local Program edits. The clinician saves Program and separately presses Publish and assign reviewed video. The assignment RPC verifies the exact saved exercise name and numerical prescription, locks that exercise, validates the current care relationship and active program, and approves only the privately copied generated asset. Generic manual approval cannot bypass generated-video review. Clients cannot upload substituted bytes into a generated asset. Approved videos are visible only to the assigned patient and treating clinician; patients cannot read generation drafts.

Manual recordings remain privately uploaded drafts until separate review and assignment. Existing approved demonstrations can be replaced or withdrawn and deleted. Generated provenance remains immutable. Revoking generation access prevents new generation/review/approval but does not prevent withdrawing an existing video through authorized personalized-video controls.

## Database deployment and coordination

Production already contains the private exercise-video schema and Stage 1 numerical program saving. Do not reapply or overwrite either. New production migrations, in order:
1. `20261013133128_stage2_private_pilot_gate.sql`
2. `20261013140019_clinician_ai_exercise_drafts.sql`
3. `20261013163303_generated_exercise_video_pilot.sql`

The existing isolated Stage 2 database received these migrations plus preview-only additive numerical-save compatibility, retaining its older prescriptions without converting/backfilling existing rows. Synthetic fixtures are restricted by temporary expiring grants. The original Stage 2 branches are preserved. Integration remains on draft PR #14; the related workflow/invitation Work chats were inspected and are idle. Main baseline remains `7a83f9976447370aff8573d16878c19b6bc62332`.

A credential-enabled preview uses the existing Stage 2 environment scope with the exact integration commit. The old branch code is not overwritten; preview aliases may advance. The ordinary integration preview deliberately disables clinical connections.

## Validation and outstanding work

Passed synthetic tests cover generation gate independence, denied outsiders/patients, private storage, provider-reference secrecy, idempotency, active-job serialization, mandatory clinical review, numeric validation, saved-dose matching, generic-approval bypass denial, substituted-media denial, approved patient playback, revocation and the daily cap. API tests cover rejected patient/chart/comparison input, preset-only provider requests, fixed paid settings, zero start retries, idempotent resume and catalog price failure. Existing Stage 1 and private-video tests are retained.

Hosted browser testing verified the actual Patient → Program → Add Exercise flow, all three inline source choices, numerical sets/reps/cues saving without navigation, and a synthetic upload stored as a private ready draft rather than auto-assigned. CI run #44 passed unit/database tests, lint, TypeScript, build and synthetic browser suites at commit `4bca6686c3bab3bdec73ea2bc2a862463c8c9ff9`; subsequent runtime hardening must pass final CI before release.

Remaining: enable account video access; produce and play one actual Veo clip; test editable review → Program save → explicit assignment with synthetic records; recheck final commit CI, mobile overflow and permissions; obtain the user's final production approval. Physical installed iOS/Android PWA testing is not yet verified. Runtime dependency audit reports zero vulnerabilities; five inherited developer lint-toolchain advisories remain. Unapproved private draft retention/cleanup is operator-managed during this short pilot; no automatic clinical deletion is implemented.
