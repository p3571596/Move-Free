# Authentication audit

Audit updated: 2026-07-21
Supabase project: `tyhbfgdrvqwkpmenosta`

## Root causes

1. `createSupabaseBrowserClient()` created a new client for every component. Several mounted auth guards and shells could refresh the same rotating token concurrently. Production logs confirmed simultaneous `refresh_token_not_found` responses.
2. Login and signup shared one toggle and route. Existing users could accidentally call `signUp`, matching the repeated-signup events in Auth logs.
3. Password recovery depended on a client-only implicit session and had no callback exchange or resend cooldown. Repeated requests reached Supabase's development email limit, and newer requests invalidated older one-time links.
4. Invite and recovery errors were not consistently distinguished from missing sessions. Users could see a generic failure instead of an expired, used, rate-limited, or invalid-credentials explanation.
5. The default Supabase email service and link-tracked mail are not reliable enough for an external pilot.

Invalid-password attempts are still valid Supabase rejections: a correct confirmed account cannot log in when the submitted password differs from its stored password. Recovery is the correct remedy.

## Stabilized flow

```text
New clinician
  /signup -> signUp(role=clinician) -> email confirmation -> /dashboard

Returning clinician or patient
  /login -> signInWithPassword -> database-backed role check
         -> clinician: /dashboard
         -> patient: /patient

New patient
  clinician invite API -> verify clinician + patient ownership
  -> inviteUserByEmail -> /invite
  -> updateUser(password) -> claim_patient_invite(token) -> /patient

Password recovery
  /forgot-password -> resetPasswordForEmail
  -> /auth/confirm (token hash) or /auth/callback (PKCE code)
  -> verified cookie session -> /reset-password
  -> updateUser(password) -> local sign-out -> /login
```

## Implementation changes

- Added `@supabase/ssr`, a singleton browser client, a server client, and middleware cookie refresh.
- Added server-side `/auth/callback` and `/auth/confirm` handlers with same-origin redirect validation.
- Made `/login` password-login only and moved clinician registration to `/signup`.
- Added a 60-second local recovery-email cooldown and duplicate-submit protection.
- Added explicit expired/used-link, rate-limit, invalid-credential, and missing-session messages.
- Added structured auth diagnostics that omit identity, credentials, and tokens.
- Preserved the existing RLS policies, clinician ownership check, patient claim RPC, and server-only secret key.

## Authorization and security

Middleware refreshes cookies but is not the authorization boundary. Server API verification, database ownership checks, and RLS remain authoritative. Patient invitation claim tokens remain hashed, expiring, single-use values handled by the existing database function.

Required manual configuration is in `SETUP_AUTH.md`. Release tests are in `docs/auth-qa-checklist.md`.
