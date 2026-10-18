# Clinician-assisted patient password recovery

Prepared on `fix/patient-password-recovery`; not deployed. This implements the requested password-reset alternative instead of deleting account information when an invitation is revoked.

## Workflow

In an owned patient record, select **Generate Password Reset Link**. For an unfinished registration, first generate a current invitation with the private-pilot option enabled and the correct account email. For an active linked patient, no new invitation is needed. Copy, share, or text the neutral reset message using the existing manual sharing controls. No SMTP or paid messaging provider is used.

The patient opens `/recover`, supplies the account email, chooses and confirms a new password (12–128 characters), then submits. No old password or email code is needed. Reopen the patient invitation and select **Continue** with the same email and new password; existing accounts now attempt sign-in before signup. Active patients use normal sign-in. The account UUID and patient records are preserved.

Recovery links expire in 30 minutes, work once, and are stored only as SHA-256 hashes. Tokens travel in URL fragments, are removed from the address bar, remain only in component memory, and are submitted only to the first-party endpoint. Landing pages show no patient information and use no-referrer, no-store and noindex headers. Shared messages contain no patient name or health information. Anyone with a reset link and account email can change that password; clinicians must check the intended recipient before sharing.

## Revocation and email reuse

Revoking or replacing an invitation invalidates the associated pending password-reset link at the database level. A separate **Revoke Password Reset Link** action cancels recovery without changing invitation status. Regenerating a reset link supersedes the previous one. Issuance has a 60-second cooldown.

Revocation does not delete the Auth account, change its password, erase clinical history or disconnect an already accepted patient account. The same email can be used again with a new invitation by signing into the preserved account. If its password is unknown, the owning clinician supplies a reset link. Existing email-based recovery remains available.

## Authorization

Clinician issuance checks ownership inside a SECURITY DEFINER function in the private schema, called through a SECURITY INVOKER wrapper. Anonymous issuance is denied. Recovery is limited to the linked patient account, an unused unconfirmed email registration matching a current pilot invitation, or a previously recorded recovery/signup association for that same patient. It rejects unrelated established accounts, clinicians/admins, accounts linked elsewhere, SSO/non-email identities, anonymous users, banned users and MFA accounts. Eligibility, email, ownership and pending invitation state are checked again at redemption. NULL prior associations fail closed.

Only service_role can consume a reset token. The token is consumed atomically before the Auth Admin password update; concurrent or repeated requests cannot both change credentials. If Auth fails afterward, the UI asks for a new link. For an unconfirmed registration, the update enables password sign-in while trusted app metadata records `email_ownership_verified=false` and clinician-assisted assurance. Existing confirmed accounts retain their mailbox assurance.

Supabase Auth password updates revoke refresh sessions. Already-issued JWTs follow the application's existing expiry and session-validation behavior; this does not add a new global JWT blacklist. No real user's password was read or changed during preparation.

## Validation

57 automated tests passed, including the real SQL migration/functions in PGlite: unauthorized issuance/redemption, wrong email, expiry, single use, revocation, replacement, account-role guards, MFA denial, ownership changes and repeated-email invitation acceptance. Route tests check server gate, input validation, no password mutation before authorized token consumption, provider failure and preservation of mailbox assurance. Sharing tests verify the neutral 30-minute message. ESLint has no errors (one pre-existing warning); TypeScript and production build pass.

The runtime-adapted handler was exercised in the existing synthetic hosted Supabase branch. Eleven checks passed: anonymous issuance denied, authorized issuance, wrong-email denial, successful reset, reuse denial, new-password sign-in, old-password rejection, retained UUID, explicit unverified-mailbox assurance, same-email invitation acceptance and RLS visibility limited to the intended synthetic patient. The test endpoint was retired to 410 with JWT checking restored. Fixture accounts, sessions, profiles and patient records were removed; zero test users remained. The development schema remains available for testing.

The CI browser regression covers iPhone-sized, Android-sized and desktop screens, including both invitation buttons, shorter existing passwords, reset-password mismatch handling, successful completion, fragment removal and no horizontal overflow. Auth/API replies are mocked for UI testing; hosted Auth was tested separately.

Security advisors found only informational RLS-without-policy notices on intentionally restricted private tables, including the reset table. Table access is revoked from anon/authenticated and mutations pass through scoped functions. See https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy .

## Release after approval

Apply `20261018013008_patient_password_recovery_links.sql` to production, merge the tested PR, wait for production READY, and smoke-test clinician issuance, account reset, password sign-in, repeat-email invitation acceptance and revoked-link rejection using disposable synthetic patients. No additional secrets or environment changes are required; this uses the existing production private-pilot flag and server Auth key. The user's final approval is required after validation before production release.

Reference: https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid and https://github.com/supabase/auth/blob/master/internal/models/user.go .
