# Patient invitation correction release

## Diagnosis (October 10, 2026)

Production `move-free.vercel.app` runs main commit `1bb74a454f8c933ba831fdc7531b491b62a5ee30`.
The live Supabase migration inventory includes Stage 1 structured prescriptions and the existing Stage 2 authorization migrations. It does not yet include this invitation migration.
A privacy-preserving Auth log aggregate confirmed two SMTP 535 authentication failures on October 10. The dashboard shows custom SMTP enabled with Resend (`smtp.resend.com`, port 465), a 60-second minimum interval, and a hidden stored password. The credential and sender identity were not retrieved. A 535 response means SMTP authentication was rejected; it does not verify which credential field is wrong or inbox delivery.

The administrator must set SMTP Username to `resend`, replace Password with an active Resend API key authorized to send from the configured sender domain, and save directly in Supabase. Verify the sender domain in Resend. Never paste the key into chat or commit it. Reference: https://resend.com/changelog/smtp-service.

## Behavior

- One recipient per unlinked patient. Correct Email / Replace Invitation atomically replaces and revokes the previous unclaimed link before sending. Revoke is explicit and requires no mail secret.
- Only a confirmed Auth email matching the intended recipient can claim a pending, unexpired invitation. Roles, treating relationships, existing patient links, and ownership are checked in the database. Account-level locking prevents simultaneous links to different patients.
- SMTP/provider errors mark the attempt failed and clear its token hash. Incomplete sends remain unclaimable; stale sending attempts display failed after two minutes. Late callbacks cannot revive a revoked/replaced attempt.
- API acceptance is shown as pending, never as verified receipt. Accepted means the patient account is linked. Expired comes from server expiration data.
- Same-recipient attempts have a database 60-second cooldown; active sending attempts serialize for two minutes. A correction can bypass the same-recipient cooldown after the previous send finishes. Provider limits still apply.
- Already-linked patients use normal sign-in and password recovery; this flow cannot relink them.
- Existing eligible Auth accounts receive a magic link with `shouldCreateUser: false`; clinician/admin accounts and other patient links are rejected.
- Auth metadata uses onboarding booleans instead of new patient IDs. Application logs contain fixed event names/codes, no addresses, claim tokens, patient identifiers, or provider messages.
- Unbound copy-for-text invitation creation is disabled. Existing legacy unclaimed links are deliberately revoked at migration time. Patients need new email invitations; linked patients retain access.
- Stage 1 prescriptions/followups and Stage 2 engine logic are unchanged.

## Release sequence

1. Review this branch, tests, and migration. Repair SMTP and verify sender domain through the dashboards.
2. Use an isolated Supabase test environment with the migration and matching preview configuration. Do not point an unconfigured preview at production or send real patient invitations.
3. With synthetic clinician and patient records only, verify receipt in a controlled inbox, open the newest link in a private browser, confirm email, set password, and verify `/patient` shows only the synthetic assigned program.
4. Verify wrong-address link failure after correction, corrected resend and existing-user setup, failed SMTP invalidation, expiration, repeat claim rejection, already-linked refusal, outsider RLS, and no account-to-other-patient linking. Provider acceptance alone is insufficient for this check.
5. Obtain explicit approval for the production migration and merge/deployment. Apply the migration and release the code together in a short invitation maintenance window: the previous endpoint depends on the now-disabled legacy RPC. Existing clinical workflows remain available.
6. Verify production with synthetic records and controlled receipt; monitor aggregate failure codes without logging sensitive fields. Run Supabase security advisors again after applying the migration.

Rolling back the application alone does not restore legacy invitations. Do not restore unbound tokens or re-enable the old RPC. Roll forward with a corrected compatible endpoint.

## Validation status

The migration is exercised against PostgreSQL via PGlite with real role grants, RLS, trigger protection, and RPCs. Delivery tests exercise the actual route with simulated Supabase/provider responses. Neither proves SMTP repair or inbox receipt. Production migration, live SMTP receipt, and onboarding verification remain release gates until recorded explicitly.
