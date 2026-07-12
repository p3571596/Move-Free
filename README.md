# Move Free MVP v1.0

Move Free is a clinician-led home exercise and recovery companion built with Next.js 15, TypeScript, and Supabase JS.

## Setup

Copy `.env.local.example` to `.env.local` and add the Supabase and application values:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`SUPABASE_SECRET_KEY` is used only by the server-side patient email invitation route. Never prefix it with `NEXT_PUBLIC_` or expose it in browser code. All routine application data access continues through the authenticated Supabase client, so Row Level Security remains the source of truth.

For Vercel, add all four values under Project Settings → Environment Variables and set `NEXT_PUBLIC_SITE_URL` to the production URL. In Supabase Auth → URL Configuration, add the production `/invite` URL to the redirect allow list so invitation links return to Move Free correctly.

## Commands

```bash
npm install
npm run dev
npm run build
```
