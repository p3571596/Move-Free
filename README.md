# Move Free MVP v1.0

Move Free is a clinician-led home exercise and recovery companion built with Next.js 15, TypeScript, and Supabase JS.

## Setup

Copy `.env.local.example` to `.env.local` and add the project publishable Supabase values:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

The application intentionally does not commit Supabase keys or secrets. All data access is performed through the authenticated Supabase client so existing Row Level Security policies remain the source of truth.

## Commands

```bash
npm install
npm run dev
npm run build
```
