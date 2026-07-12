# Move Free MVP v1.0

Move Free is a clinician-led home exercise and recovery companion built with Next.js 15, TypeScript, and Supabase JS.

## Setup

Copy `.env.local.example` to `.env.local` and add the Supabase and application values:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

`SUPABASE_SECRET_KEY` is used only by the server-side patient email invitation route. Never prefix it with `NEXT_PUBLIC_` or expose it in browser code. All routine application data access continues through the authenticated Supabase client, so Row Level Security remains the source of truth.

For Vercel, add the three values above under Project Settings → Environment Variables. Invitation links derive their destination from the live Move Free request URL rather than a manually entered site URL.

In Supabase Auth → URL Configuration:

- Set **Site URL** to `https://move-free.vercel.app`.
- Add `https://move-free.vercel.app/invite` under **Redirect URLs**.
- During preview testing, optionally allow `https://*-phmhhcynk5-2739s-projects.vercel.app/invite` as well.

Supabase ignores an invitation `redirectTo` value that is not allow-listed and falls back to Site URL, so both settings must point to the application rather than `https://vercel.com`.

## Commands

```bash
npm install
npm run dev
npm run build
```
