# Clear patient registration and recovery errors

Prepared on isolated branch `fix/patient-registration-errors`; not deployed.

The account flows now translate known Auth error codes into plain-language reasons and next steps. Weak/easy-to-guess passwords, reusing the current password, existing accounts, invalid details, excessive attempts, disabled signup and unavailable accounts have dedicated messages. Unknown provider errors use a safe service-unavailable message instead of raw provider responses. Normal sign-in, clinician signup and email-based password update also benefit from the shared messages.

Patient invitation signup returns the actual mapped creation/confirmation failure instead of mislabeling every failure as an existing email. Unfinished signups explain that a password may never have been set and direct the patient to clinician-assisted reset. Existing-account and link messages stay scoped to the existing authorization checks; no account or patient information is exposed on a public landing page.

Password reset still consumes its token before changing credentials. A rejected password now shows the rejection reason AND explains that a fresh reset link is required. The server returns `linkUsed=true`, and the recovery form clears the password fields and token and removes the submit form, preventing a doomed retry with an already consumed link. This change does not restore consumed tokens or alter the single-use security model.

Clinicians receive separate messages for the 60-second issuance cooldown, a missing current pilot invitation, unavailable/unauthorized patient records and ineligible account associations. Network errors explain the connection problem and how to check a previously submitted reset link. No raw provider message, password, token, email address or patient information is added to these API error responses.

## Validation

58 automated tests passed. The regression tests feed the real handlers synthetic Auth failures, including the `weak_password` condition observed during production diagnosis, and verify reason text, response status, no raw-provider disclosure, no unauthorized credential mutation and the consumed-link signal. Existing SQL/RLS, ownership, revocation and token tests remain in place. The browser regression includes the weak-password error and fresh-link instructions at iPhone-sized, Android-sized and desktop viewports, and checks the consumed form cannot be resubmitted. Browser responses are mocked; no real account or password is changed.

No database migration, paid service, environment or global password-policy change is needed. The account service still enforces password strength. ESLint retains one existing unused-parameter warning unrelated to this change. Final CI runs TypeScript, production build and browser verification before release approval.

## Release

After final user approval, merge the reviewed PR and verify the production deployment. This is an application-only change; do not modify real-account state or generate/reset a user's password as part of release.
