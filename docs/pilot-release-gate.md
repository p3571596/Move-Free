# Stage 1 release gate — 2026-09-21

Status: BLOCKED. Do not merge or start Stage 2 until all required checks pass.

Candidate: PR #4, `feature/stage1-video-pwa`, starting commit `99ce53fd6eaf939536d52519c0137f0ac30cb86c`.

## Prior production rollback point

- Main commit: `2d70096902da67467ab521d0ee6c694e53f06064`.
- Vercel deployment: `dpl_6YPM127haqZw2x28wJEsKKMTC9rY`, READY when inspected.
- Deployment hostname: `move-free-k9urqesev-phmhhcynk5-2739s-projects.vercel.app`.
- Public origin: https://move-free.vercel.app

Rollback application code/deployment if necessary, but do not restore the vulnerable authorization policies. Database security hardening must remain in place.

## Confirmed blockers

1. Live profiles allowed authenticated users to update their own role to admin. Reproduced using one synthetic account in a rolled-back transaction; no existing patient records accessed.
2. Live clinical authorization helpers and policies granted unrelated administrators access. Application filters cannot secure direct API requests.
3. Saved engine evaluations and authored Messages require the prepared clinical-engine migration, which is not applied in the shared database.
4. Current inline Program Builder video editing needs a fresh hosted workflow test.
5. Physical phone acceptance remains to be confirmed by the user.

## Initial evidence

- Existing 18 tests pass, including 1,000 deterministic engine parity cases.
- GitHub Pilot readiness run 35548311469 succeeded for 99ce53f; existing CI did not run the unit tests.
- Vercel commit status succeeded for 99ce53f.
- Supabase security advisors reported no findings; custom authorization testing nevertheless reproduced the role escalation.
- New local PostgreSQL tests replay the live pre-release authorization functions/policies and reproduce then block self-promotion. They verify unrelated clinician/admin read, update and delete denial across 13 clinical tables, preserved patient/treating-clinician reads, protected clinical writes and relationship revocation. These local tests are not a substitute for live API/browser verification.

## Remediation

- Applied `20260921235753_enforce_pilot_relationship_authorization` to the shared Supabase project. Live rollback-only synthetic test confirmed denied role escalation and preserved contact edits. No existing patient records were accessed by that test.
- Applied `20260921235847_clinical_engine_pilot` after local PostgreSQL transaction/RLS tests. Enables authored message history, saved engine comparisons and program-change audit.
- Supabase security advisors returned no findings after both migrations.
- Updated Next.js and eslint-config-next to 16.3.5, and patched compatible tooling dependencies. Dependency audit now reports zero vulnerabilities. The previous 16.3.2 release was covered by [AVIF image optimization](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4) and [Windows-hosted server](https://github.com/advisories/GHSA-p293-qw3h-jr36) advisories. Do not restore vulnerable dependencies during rollback.
- CI now runs the 18 unit tests plus real PostgreSQL authorization and clinical-storage tests in addition to lint, type checking and production build.
- The hosted baseline workflow verified feedback, clinical review/disagreement persistence, approved guidance refresh and inline Program Builder video approval. A test locator initially expected “Play”; YouTube mobile exposes “Play video”. The corrected targeted test confirmed advancing video time and active playback.

The definitive updated-preview workflow and production smoke results will be recorded before release is declared complete. Physical-device behavior and email delivery are separate from browser emulation; they must not be reported as tested unless verified.
