# Manual patient invitations — private pilot

Branch: `feat/manual-patient-invitations`. Based on the previous SMS invitation branch at `25e5f1e`; this supersedes its paid-provider delivery UI. Do not deploy or merge without the user's approval. No production changes have been made.

## Workflow and separation

Invite Patient defaults to Share secure link. Clinician confirms the patient's independently established email, generates a link, then chooses Copy Link, Share Link (system share sheet), or Share via Text (native `sms:` composer, empty recipient and neutral prefilled body). The clinician selects the recipient and sends manually. Desktop without a share sheet or SMS handler can copy the selectable link into an appropriate app. A canceled or failed share leaves the link Pending, with a copy fallback. No Sent or Delivered status is inferred from opening another app.

The copy issuance API uses authenticated Supabase RPCs and does not require the service secret, SMTP, a mobile number, SMS consent fields, or any delivery provider. Twilio and phone-normalization dependencies and implementation have been removed. The old callback returns 410. Requests for automated SMS are rejected before issuance. Existing email sending remains a separate route with its existing error handling. Future automated delivery can call the same issuance lifecycle without changing verified-email claim or onboarding.

## Security retained after review

Reuse the prior migrations, in order:
- `20261010220722_secure_patient_invitation_replacement.sql`
- `20261016221136_sms_patient_invitations.sql`
- `20261016221539_finalize_copy_invitation_atomically.sql`

No additional schema migration is required for this change. If releasing from main, include these prerequisite migrations and compatible app changes from the prior branch. Never apply these merely to inspect the feature; they must be part of the separately approved release.

Tokens use two cryptographically random PostgreSQL UUIDs; only SHA-256 hashes are stored. Tokens expire in seven days, are atomically consumed once, and cannot link an already linked record or reassign a linked account. Issuance locks the owned patient record and enforces cooldowns and attempt limits. Private invitation storage is inaccessible to ordinary authenticated/anonymous callers. RPCs check clinician ownership; patient claims separately check authenticated account, confirmed email matching the invitation, patient role, expiry and current token. Existing patients RLS and column-update guards protect record authorization independently of UI controls.

The link's fragment stays out of HTTP request URLs and referrers. The join page removes the fragment and keeps the token in memory; no analytics, shorteners, token logging or third-party scripts were added. Sharing necessarily passes the link to the clinician's chosen app. Join page headers request no caching, no referrer and no indexing. Its content is neutral and exposes no patient record before verification. Shared text has no names, clinical details or patient identifiers beyond the random link.

Pending, Accepted, Expired and Revoked are retained; email failures retain their existing failed state. Regenerate replaces the old token; Revoke immediately makes an existing link unusable. Refresh hides locally held links when the server reports any state other than Pending. A lost response or closed page requires regeneration; raw tokens are not retrieved from storage.

## Identity and SMTP limitation

The clinician must establish the correct patient email through an existing trusted contact or in person. A wrong recipient or someone with a forwarded link cannot claim with a different confirmed email. Email-account control plus clinician-established contact is the pilot's verification model; it is not formal identity proofing and does not address a compromised mailbox.

Link issuance and sharing work during SMTP failure. New account setup still requires successful verification-email delivery. Existing confirmed patient accounts can sign in and accept without a new invitation email. Do not disable email confirmation or substitute link possession to work around SMTP failure. Before enrolling new patients, repair the prior SMTP 535 error and verify an actual controlled inbox, signup code, and acceptance with confirmation enabled. Supabase's signup confirmation template must include its code (`{{ .Token }}`). No credentials were retrieved or changed here.

## Validation and remaining release checks

Automated tests execute with synthetic patients in PGlite and mocked external services. They exercise wrong account/forwarded link, corrected contact, revocation, regeneration, expired and reused tokens, unconfirmed account, clinician claiming as patient, unauthorized access, protected storage and stale delivery callbacks. Route tests establish that issuance works without the service secret and that SMS is rejected. Sharing tests verify a neutral message and exact preservation of the fragment token through URI encoding. No automated SMS was sent and no paid provider was configured.

Physical iPhone and Android Messages handoff, recipient selection, prefilled complete link and return/cancel behavior must be checked on devices before pilot release. Desktop copy is the fallback if no native handler exists. Browser viewport checks alone do not prove native-app behavior. Do not use real patient data for these checks.

Observed October 17, 2026: final automated suite 50/50 pass; lint passes. Local browser against the existing synthetic-only database (`xpfpnxlobjvtemoktjxg`) confirmed clinician login, default Share secure link, issuance with Pending state and all three controls, neutral join page, verified synthetic patient sign-in/claim, patient app access, and clinician Patient account linked after refresh. The fragment disappeared from the join address bar. iPhone-size 390×844 and Android-size 412×915 checks found no horizontal page overflow. Native Messages launching was not exercised. The screenshot in the outputs folder shows the consumed synthetic invitation; the token is no longer usable. Synthetic demo patient `92600000-0000-0000-0000-000000000002` is now linked; future tests need a fresh unlinked fixture.

The branch remains local to avoid any Git-triggered preview deployment before approval. No production database migrations, provider setup, messages, or deployments were performed. Browser screenshot capture was recovered using the native browser screenshot API after the DOM screenshot method failed. A local watcher file-limit error was resolved with polling and webpack for browser checks; the production build uses the normal Turbopack build.

Final validation: 50 tests pass, ESLint passes, normal production Turbopack build and TypeScript checks pass. `git diff --check` passes. npm removed 31 provider-related packages and reported zero audit vulnerabilities.
