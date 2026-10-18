# Pilot-only signup without verification email

Historical first-release design. The follow-up [incomplete-registration fix](pilot-incomplete-registration.md) adds password-proven resumption without changing passwords.

Prepared October 17, 2026, on isolated branch `feat/pilot-link-only-signup`. Not deployed. The user's previous release approval applied to the earlier verified-email flow; this security-model change is prepared for a new final review.

## Behavior

A clinician generates a new secure link with **Skip email verification — private pilot only** selected. The recipient opens the link and chooses an unused login email and a password of at least 12 characters. The server creates a fresh patient account without sending an email code, links it to the invitation's patient record, consumes the token, and the browser signs in. Existing accounts use sign-in instead; this route never changes an existing account's password or confirms an existing account.

The recipient's chosen email can differ from the clinician's contact email. It is a login address, not evidence of identity. A failed earlier signup may already have reserved an address; use an unused address, sign in if possible, or resolve that account separately. Password recovery still depends on the existing email system; this change addresses invitation signup, not recovery-email deliverability.

**Anyone holding an unused valid pilot link can create the linked account and access that patient's information.** Forwarded and incorrectly delivered pilot links are therefore intentionally no longer blocked by mailbox verification. The clinician warning makes this change explicit. Revoke a misdirected link before acceptance. Once an unintended person accepts, link revocation does not undo their account access; that requires separate account-access remediation.

## Scope and boundaries

- Server-only opt-in `PATIENT_INVITE_LINK_ONLY_ENABLED=true` is required for both issuance and signup. Default/example is false.
- Each invitation is explicitly opted in by a service-only RPC after authenticated clinician ownership checks. A forged `mode=pilot` fragment cannot convert an old verified invitation.
- Ordinary clinician signup and global Supabase email-confirmation settings are not changed. Existing invitations stay verified until regenerated with the pilot option.
- Seven-day expiry, hashed token storage, single-use acceptance, ownership/RLS, regeneration and revocation remain in force. Regeneration clears the prior opt-in and signup lease.
- An atomic two-minute reservation binds one fresh random Auth user ID and lease to the invitation. Competing signup requests cannot both consume it. Five signup reservations require clinician regeneration after failures.
- The server uses Supabase Admin `createUser` only, never `updateUser`. Supabase Auth is administratively confirmed solely to permit password sign-in. Trusted app metadata records `signup_assurance=invitation_link_only` and `email_ownership_verified=false`; do not treat this as verified mailbox ownership.
- Acceptance checks the reserved ID, lease, token, expiry, trusted metadata, chosen email and patient-only role. It prevents account reassignment, clinician/admin conversion and duplicate patient links.
- Cancellation locks the same patient before releasing the lease and permitting cleanup. It refuses cleanup of any linked or clinician account, including after a response whose success is uncertain. If cleanup cannot establish safety, an unlinked account may remain for support instead of risking deletion of a linked account.
- Audit metadata records link-only acceptance without passwords, token contents or message bodies. No SMS provider is involved.

Supabase Admin API reference: https://supabase.com/docs/reference/javascript/auth-admin-createuser

## Validation

54 automated tests pass; ESLint, TypeScript and the production build pass. New route tests simulate Auth Admin responses and verify the feature gate, input validation, no account creation before reservation, no existing-account mutation, failure cleanup and preservation of linked accounts after uncertain completion. PGlite executes the real migration/functions and tests service-only ACLs, forged opt-in rejection, competing reservations, stale leases, regeneration, revocation, expiry, privileged-account denial, accepted-token reuse, attempt limits and the acceptance audit.

The React review checked hook usage, server-secret boundaries, labeled inputs, button types and failure states in both changed components. Local browser review at 390×844 found no horizontal overflow, no email-code field in pilot mode, and the fragment removed from the address bar. The saved screenshot shows the new screen with a synthetic placeholder token; no patient information appears.

The former synthetic Supabase branch `xpfpnxlobjvtemoktjxg` was unavailable when inspected. No replacement paid branch was created. Real hosted Auth Admin creation/session establishment has not been exercised for this change. Before declaring a production release verified, run the new flow with disposable synthetic accounts in an available non-production project, then perform the corresponding deployment smoke check. No production settings, migrations, users or deployments were changed while preparing this branch.

## Approved-release steps

1. Apply the CLI-generated `*_pilot_link_only_signup.sql` migration in the selected test environment; run advisors and the synthetic signup/sign-in/claim and cleanup flow there.
2. After final release approval, apply that migration to production and set `PATIENT_INVITE_LINK_ONLY_ENABLED=true` in the server environment with the existing Supabase secret key.
3. Deploy the compatible application, regenerate invitations for pilot signup, and verify one disposable synthetic account end to end. Old links keep their original verification requirement.
4. To end the exception, set the flag false and redeploy. New verified links remain available by unchecking the pilot option. Existing accounts created under the exception remain usable; restoring mailbox verification for them is separate follow-up work.
