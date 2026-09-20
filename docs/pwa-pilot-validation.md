# Move Free PWA pilot

## Scope and branch reconciliation

- Main baseline: `2d70096902da67467ab521d0ee6c694e53f06064`.
- PR #1 is merged. `login-troubleshooting` is already contained in main.
- PR #2 remains open; all eleven v0.2 shell commits through `54011de` are included in this feature branch without changing main.
- This PR supersedes PR #2's implementation for review. No PR was merged or closed automatically.

## Functional

Both roles share the install manifest, icons, standalone display, safe areas, installation guidance, and persistent Supabase cookie session. Launching the installed app resumes a verified session via login. The service worker stores only public icons and an offline notice, never clinical HTML, API responses, or authentication data. Internet is required for clinical work; there is no offline submission queue.

Clinician navigation is Today, Patients, Messages, More. More includes Programs, Exercise Library, Schedule, Analytics, Care Team, Settings. Outcomes redirects to Analytics. Clinical progress is available per authorized patient; existing founder analytics remain admin-only at `/analytics/pilot`.

Patients record completed/partial/skipped exercises, optional difficulty and actual dosage, then Better/Same/Worse, optional pain and a comment. Exercise logs and the check-in are two existing database writes. If the second fails, the same screen can retry it without duplicating exercise logs. Closing the page during a failed submission does not preserve unsaved feedback.

Clinician Today flags new patient activity. The Patient Workspace sequence is retained, including a Since Last Visit summary based on the latest recorded visit, or an explicitly labeled 14-day fallback. Clinicians write guidance and explicitly approve publication to the current program. Concurrent program changes reject stale guidance. Recording the clinical review is a separate explicit action; it never sends patient advice. Clinical alert reasons can remain after review.

Connected patient Today/Care and clinician Today refresh on focus/visibility and every 30 seconds while visible. This is refresh while using the app, not push notification or a promise of clinician response time. Program screens load current assignments on entry and do not overwrite an exercise session in progress.

Messages links patient comments to review and program guidance. Care Team shows existing treating-clinician assignments. No new access grants or broad patient queries were introduced.

## Preview or not implemented

- AI/algorithm assistance is an explicitly labeled, non-autonomous review surface. No AI model is connected.
- Live chat threads, delivery/read receipts, push notifications, scheduling, video visits, additional care-team grants, and advanced settings remain unavailable/preview.
- Guidance uses the existing current-program explanation. It is not a versioned message history.

## Security constraint before wider rollout

Live RLS was inspected read-only. Existing policies and private helpers include administrator-wide clinical access (`is_admin()` / `profile.role = 'admin'`). This predates this PR and is inconsistent with a universal care-relationship-only policy. Ordinary unrelated clinicians are denied access in synthetic RLS tests. The UI continues to scope patients to the treating clinician, including for admin users, but UI filtering is not a substitute for RLS.

**No database policies were changed. Do not represent the stricter care-relationship architecture as fully enforced for administrators yet.** Before wider rollout, remove the administrator bypass from clinical-table policies and `can_access_patient`/`can_access_episode` in an isolated database, test the complete authorization matrix, then separately approve the production migration. Retain admin-only aggregate pilot analytics deliberately; do not grant clinical access merely through clinic membership or a client-editable role.

## Test method

Build, lint, and Node regression tests run locally. Browser tests use real Supabase authentication, invitations, persisted synthetic exercise/check-in records, and RLS through public clients. No mock backend or simulated production feature was used. Synthetic accounts and records were expressly authorized in the existing project. Existing patient records and production code were not modified.

Email delivery, brand-new emailed OTP/password setup, physical iOS/Android installation, OS background behavior, long-duration refresh-token expiry, and browser-specific push behavior are not covered by desktop Chromium sessions. No push behavior is implemented.

See the final test report for exact run results. Diagram PDFs are in `docs/workflows/`.

## Preview connection

The existing Vercel preview environment had no Supabase public connection values. `next.config.ts` supplies the project URL and publishable (public, RLS-constrained) key only when both `VERCEL_ENV=preview` and the feature branch name match. This preview shares the live project's database as authorized for synthetic testing; it is not an isolated sandbox. Production configuration is unaffected. Secret invitation-email credentials are not embedded; email delivery remains unverified on the preview. Replace this temporary branch-scoped configuration with Vercel preview environment variables when a separate test project is available.

The browser regression runner is `tests/e2e.mjs`. It requires Playwright (or `PLAYWRIGHT_MODULE` pointing to an installed module), Chrome, the two public Supabase environment variables, and an untracked `TEST_FIXTURE_PATH` JSON containing synthetic credentials and record IDs. It mutates only those supplied test records. Never supply real patient fixtures.
