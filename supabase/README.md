# Supabase · Latch

Database, auth and file storage for Sprint 1 (`SPRINT-1.md`). Fictional data only.

## Apply the migration (once per project)

**Option A · Dashboard (no tools needed)**
1. Supabase dashboard → your project → **SQL Editor** → New query.
2. Paste all of `migrations/20261011000000_sprint1_schema.sql` and **Run**. It runs in one transaction: either everything is created or nothing is.
3. Check: **Table Editor** shows 8 tables, each with "RLS enabled"; **Storage** shows a private `documents` bucket.

**Option B · Supabase CLI**
```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

The migration is not re-runnable (it creates types and tables). To start over on a test project, drop the tables first; ask before doing that on a shared one.

## Seed the three fictional families

Needs the service_role key in your shell only (never in a file or in browser code):

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service_role key> node supabase/seed.mjs
```

Creates Ana → María (active), Roberto (self) and Luis → Carmen (pending, prints a one-time approval link). Users have `@latch.test` emails, which can't receive mail; tests sign in as them through the admin API. Safe to re-run.

## Auth settings (dashboard, for phase 2)

- Authentication → Providers → **Email**: enabled; **Email OTP Length** = 6.
- Authentication → Email Templates → **Magic Link**: replace `{{ .ConfirmationURL }}` with `{{ .Token }}` so the email carries the 6-digit code instead of a link.
- Authentication → URL Configuration: add the Netlify site URL and `http://localhost:5173`.
