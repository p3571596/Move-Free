# Authentication audit

Audit date: 2026-07-19  
Supabase project: `tyhbfgdrvqwkpmenosta`

## Result

The observed cross-device failures reached Supabase Auth successfully and were rejected by `POST /token` with `grant_type=password`, HTTP 400, and `error_code=invalid_credentials`. This is not a device restriction, redirect failure, RLS failure, missing Auth user, unconfirmed email, or OTP-only account.

The linked pilot patient has an Auth user, an encrypted password, confirmed email, a patient profile, a valid `patients.patient_profile_id` link, and prior successful sign-ins. The current credentials entered at login therefore do not match the stored credentials. A password recovery flow was missing and has been added.

The audit also found a role-routing defect: `getProfile()` queried a nonexistent `profiles.user_id` column and discarded the resulting database error. It now queries the schema's actual primary key, `profiles.id`, and surfaces failures.

## Authentication lifecycle

```text
Clinician session
  -> POST /api/patient-invitations/email
  -> validate bearer token with auth.getUser()
  -> confirm clinician owns patient through RLS
  -> create hashed, expiring patient claim token
  -> unlinked email: auth.admin.inviteUserByEmail()
     existing email: auth.signInWithOtp()
  -> patient opens /invite
  -> Supabase restores the email-link session in the browser
  -> new invited user creates password with auth.updateUser()
  -> claim_patient_invite(token) links auth.uid() to patients.patient_profile_id
     and creates the patient profile
  -> /patient loads only rows allowed by RLS

Returning patient on any device
  -> /login
  -> auth.signInWithPassword(email, password)
  -> getProfile() / linked-patient lookup determines role
  -> /patient

Unknown password
  -> /forgot-password
  -> auth.resetPasswordForEmail()
  -> /reset-password
  -> auth.updateUser({ password })
  -> /login
```

## Auth calls and files

| File | Auth operation | Purpose |
| --- | --- | --- |
| `app/login/page.tsx` | `signInWithPassword`, `signUp` | Normal clinician/patient login and self-service clinician signup |
| `app/forgot-password/page.tsx` | `resetPasswordForEmail` | Sends recovery email without exposing account existence |
| `app/reset-password/page.tsx` | `getSession`, `onAuthStateChange`, `updateUser` | Accepts the recovery session and saves a new password |
| `app/invite/page.tsx` | `getUser`, `onAuthStateChange`, `updateUser` | Accepts email links, sets a new invitee's password, and claims the patient record |
| `app/api/patient-invitations/email/route.ts` | `getUser`, `admin.getUserById`, `admin.inviteUserByEmail`, `signInWithOtp` | Authenticated clinician invitation endpoint |
| `components/PatientInviteButton.tsx` | `getSession` | Supplies the current access token to the server invitation endpoint; the server independently validates it |
| `components/RequireAuth.tsx` | `getUser`, `onAuthStateChange` | Client route gate |
| `components/RoleGate.tsx` | `getUser` through `getCurrentUser` | Routes authenticated users by database-backed role/link |
| `components/AppShell.tsx` | `getUser`, `signOut` | Clinician shell identity and logout |
| `components/PatientShell.tsx` | `signOut` | Patient logout |
| `lib/supabase.ts` | browser client with `persistSession`, `autoRefreshToken`, `detectSessionInUrl` | Stores independent browser sessions and restores implicit email-link sessions |
| `lib/data.ts` | `getUser`, `claim_patient_invite` RPC | Verified identity, role lookup, and patient linking |

There is no `exchangeCodeForSession` or `verifyOtp` callback route in this version because the app currently uses Supabase's client-side implicit email-link flow. A future SSR migration should adopt `@supabase/ssr`, cookie-based clients, Proxy token refresh, and a PKCE callback as a single coordinated change.

## Live project checks

The production database contained:

- 3 Auth users; all 3 have encrypted passwords and confirmed email addresses.
- 4 patient records; 1 is linked to an Auth user.
- 0 linked patients referencing a missing Auth user.
- 0 linked patients missing a profile.
- The linked patient profile uses role `patient` and has previously signed in.

Three unlinked patient rows are not broken accounts; they have not completed an invitation claim yet.

Supabase Auth logs showed repeated `invalid_credentials` responses for password grants from the production Vercel app. Successful token refresh and user verification events in the same logs confirm that session persistence works when credentials are valid.

## Fixes made

- Kept normal email/password login on `signInWithPassword` and normalized email input.
- Added actionable, structured Auth errors while retaining Supabase error codes for troubleshooting.
- Added `/forgot-password` and `/reset-password` using Supabase's supported recovery flow.
- Corrected profile lookup to use `profiles.id = auth.uid()` and stopped swallowing query errors.
- Added an invitation guard so an already signed-in clinician/admin session cannot have its password changed by the patient invite screen.
- Kept invitation claim authorization inside the existing tokenized database function and preserved RLS.
- Documented the additional password-reset redirect URL.

## Security review

- The secret Supabase key remains server-only in the invitation API route.
- The invitation endpoint verifies the bearer token and patient ownership before using admin Auth APIs.
- Patient claim tokens are random, stored only as SHA-256 hashes, expire after seven days, and are cleared after use.
- `claim_patient_invite` is intentionally `SECURITY DEFINER` because it must link an authenticated user before that user has row access. Its execution is restricted to `authenticated`, its `search_path` is empty, and it validates the token, expiry, existing link, and role. Supabase's advisor still reports the expected warning for this design; keep the function narrowly reviewed.
- Supabase's leaked-password protection is currently disabled and should be enabled before a real-patient pilot.

## Required production configuration

1. Vercel `NEXT_PUBLIC_APP_URL` must be the public, stable production origin.
2. Supabase Auth Site URL must use the same origin.
3. Supabase Redirect URLs must include:
   - `<origin>/invite`
   - `<origin>/reset-password`
   - `http://localhost:3000/**` only for intentional local testing
4. Production must not be behind Vercel Authentication.
5. Invite and recovery email templates must preserve `{{ .RedirectTo }}`.
6. Enable leaked-password protection in Supabase Auth before the pilot.

## Release test

Use a fresh private browser for the invitation, then a second browser/device for normal login:

1. Clinician sends a new email invitation.
2. Patient opens it, creates a password, and reaches `/patient`.
3. Patient signs out.
4. Patient signs in through `/login` with the exact invited email and password.
5. Patient repeats step 4 on a second device.
6. If the password is uncertain, use `/forgot-password`, set a new password, and repeat steps 4-5.
7. Confirm another patient account cannot read this patient's data.
