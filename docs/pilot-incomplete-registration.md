# Resume incomplete patient registrations

Prepared on isolated branch `fix/pilot-incomplete-registration`; awaiting final production approval.

An email address registered through the earlier email-confirmation flow can be stuck: Auth refuses sign-in until confirmation, while the pilot fresh-account endpoint rejects its duplicate email. The pilot endpoint now reserves either a fresh identity or an eligible incomplete registration. Both invitation buttons can finish the incomplete registration without an email code.

Resumption requires an opted-in, pending, unexpired invitation and the ORIGINAL password. Supabase Auth validates the password before returning `email_not_confirmed`; only that exact error allows the server to administratively confirm the reserved identity. Invalid credentials, network failures and unexpected successful sessions never count as proof. The server never sets or replaces an existing password. Short original passwords remain usable; newly created accounts still require at least 12 characters.

The service-only reservation excludes confirmed, previously signed-in, linked, clinician/admin, SSO, anonymous, banned, non-email-provider, session-backed and MFA accounts. Existing confirmed accounts continue through ordinary sign-in and the recipient-bound invitation claim. Completion retains the existing UUID, consumes the invitation, checks patient-only authorization and records link-only assurance with mailbox ownership explicitly unverified. Resumed accounts are never deleted by failure cleanup.

The updated UI explains original-password reuse and gives a useful mismatch message. If the original password is forgotten, use a different unused email with the invitation or the existing password-recovery process; this change does not repair email delivery or add password reset through a link.

## Validation

54 automated tests pass, including real SQL execution against PGlite for service-only access, protected identity classes, token expiry/revocation/reuse and lease races. Handler tests verify password proof and no password mutation or deletion for resumed users. ESLint has no errors (one pre-existing unused-parameter warning); production build and TypeScript pass.

The runtime-adapted handler was exercised against hosted Supabase Auth in the existing synthetic development branch. All eight checks passed: wrong password denied, wrong password did not confirm, correct original password resumed signup, token reuse denied, original identity retained, original password signed in, mailbox assurance stayed unverified, and RLS exposed only the correct synthetic patient. The temporary endpoint was retired to HTTP 410 with JWT verification restored; synthetic users, sessions, profiles and patient were removed, with zero test users remaining. No real account was modified.

The browser regression covers both buttons, short original passwords, clear errors, fragment removal and no overflow at iPhone-sized, Android-sized and desktop viewports. Auth/API replies are mocked for this UI test; hosted Auth is checked separately. The local Mac sandbox cannot launch Playwright Chrome; the page rendered successfully through the in-app browser, and CI runs the browser regression on Linux.

## Release

After final approval, apply `20261018005743_recover_incomplete_pilot_registration.sql` to production, merge the tested branch, wait for the production deployment, and run a disposable synthetic signup/sign-in smoke check before declaring the fix live. Keep global email confirmation and the pilot gate as currently configured. No paid SMS provider is involved.

References: [Supabase Admin updateUserById](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid), [Auth password-before-confirmation implementation](https://github.com/supabase/auth/blob/master/internal/api/token.go).
