# Move Free MVP v1.0

Move Free is a clinician-led home exercise and recovery companion built with Next.js 15, TypeScript, and Supabase JS.

## Setup

Copy `.env.local.example` to `.env.local` and add the Supabase and application values:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
NEXT_PUBLIC_APP_URL=https://your-production-domain.example
```

`SUPABASE_SECRET_KEY` is used only by the server-side patient email invitation route. Never prefix it with `NEXT_PUBLIC_` or expose it in browser code. All routine application data access continues through the authenticated Supabase client, so Row Level Security remains the source of truth.

`NEXT_PUBLIC_APP_URL` is required and must be the one public production origin patients can open without Vercel authentication. Do not use a preview deployment, team alias, path, query string, or trailing slash. Invitation creation fails clearly when this variable is missing or invalid instead of falling back to another deployment.

For Vercel, add all four values above under Project Settings → Environment Variables for **Production**, then redeploy. The expected production domain for the current deployment is `https://move-free.vercel.app`; confirm that exact URL opens Move Free in an incognito window before using it for `NEXT_PUBLIC_APP_URL`.

In Supabase Auth → URL Configuration:

- Set **Site URL** to the exact value of `NEXT_PUBLIC_APP_URL`.
- Add the exact production origin pattern `<NEXT_PUBLIC_APP_URL>/**` under **Redirect URLs**.
- Password recovery uses `/auth/callback?next=/reset-password`; token-hash email templates can use `/auth/confirm`.
- Add `http://localhost:3000/**` only when local invitation testing is required.
- Keep preview deployments out of patient invitation emails. If previews are intentionally tested, allow only the necessary preview pattern and remember that Vercel Deployment Protection may block patients.

Supabase ignores an invitation `redirectTo` value that is not allow-listed and falls back to Site URL, so both settings must point to the application rather than `https://vercel.com`.

If the customized Supabase **Invite user** email template builds its own confirmation link, ensure it uses `{{ .RedirectTo }}` rather than `{{ .SiteURL }}` so the invitation token and mode remain attached to the `/invite` destination.

Returning patients should use `/login`, not reuse the one-time invitation. If their password is unknown, `/forgot-password` sends a recovery link to `/reset-password` and the user can then sign in normally from any browser or device.

Before external pilot use, follow [SETUP_AUTH.md](SETUP_AUTH.md) to configure custom SMTP, email templates, redirect settings, and the authentication release checklist.

In Vercel → Project Settings → Deployment Protection, Production must be publicly accessible. Disable **Vercel Authentication** for Production (preview deployments may stay protected). If `https://move-free.vercel.app` is not the project's public production domain, replace it everywhere above with the exact domain shown under the production deployment.

## Commands

```bash
npm install
npm run dev
npm run build
```
