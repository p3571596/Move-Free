# Production authentication setup

Move Free uses Supabase Auth with cookie-based Next.js SSR. RLS remains the data authorization boundary. Complete this checklist before inviting external patients.

## 1. Canonical production origin

Set the same public HTTPS origin in both systems, without a trailing slash:

- Vercel `NEXT_PUBLIC_APP_URL=https://your-domain.example`
- Supabase Authentication → URL Configuration → Site URL
- Supabase Redirect URLs: `https://your-domain.example/**`

Add `http://localhost:3000/**` only for local development. Do not send preview-deployment URLs to patients, and keep the production deployment free of Vercel Authentication.

## 2. Custom SMTP

Supabase's default mail service has low development limits and is not appropriate for a patient pilot. Configure a transactional provider such as Resend, Postmark, Amazon SES, or SendGrid in Supabase Authentication → SMTP Settings.

Use a verified domain and a recognizable sender such as `Move Free <support@your-domain.example>`. Configure SPF and DKIM with the provider. Disable click tracking and link rewriting for authentication emails because automated scanners and tracking redirects can consume one-time links.

After custom SMTP is active, set reasonable Supabase Auth rate limits. Keep the recovery resend interval at 60 seconds or longer. The app also enforces a 60-second client cooldown.

## 3. Email templates

Use one-time links once and always use the newest email. For recovery links that can be opened on a different device, use Supabase's token-hash template:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">
  Reset your Move Free password
</a>
```

For clinician email confirmation:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/dashboard">
  Confirm your Move Free clinician account
</a>
```

The patient invitation template must preserve the application `redirectTo`, which contains the secure patient claim token. Keep `{{ .ConfirmationURL }}` in that template unless the invitation implementation is changed together with the template. Do not replace it with `{{ .SiteURL }}`. Disable provider click tracking for this message.

## 4. Auth settings

- Enable email/password authentication.
- Require email confirmation for self-service clinician signup.
- Enable leaked-password protection before real-patient onboarding.
- Keep refresh-token rotation enabled.
- Do not enable single-session-per-user; pilot users must be able to sign in on multiple devices.
- Review password minimum length and use at least eight characters.

## 5. Application behavior

- `/login` uses `signInWithPassword` only.
- `/signup` is clinician-only; invited patients never self-register there.
- `/forgot-password` sends recovery email and throttles repeats.
- `/auth/callback` exchanges PKCE codes for cookie sessions.
- `/auth/confirm` verifies token-hash email links server-side.
- `/reset-password` requires a valid recovery session and calls `updateUser`.
- `/invite` creates the invited patient's password, claims the patient link, then opens `/patient`.
- Returning patients use `/login`, not the original invitation.

## 6. Production checklist

- [ ] Canonical domain is public in an incognito browser.
- [ ] Vercel environment variables are configured for Production and the deployment was rebuilt.
- [ ] Supabase Site URL and redirect allowlist use the canonical domain.
- [ ] Custom SMTP sends from a verified domain.
- [ ] Email-provider click tracking is disabled for auth emails.
- [ ] Recovery and confirmation templates use `/auth/confirm`.
- [ ] Patient invite template preserves `{{ .ConfirmationURL }}`.
- [ ] Leaked-password protection is enabled.
- [ ] The manual QA checklist in `docs/auth-qa-checklist.md` passes.
