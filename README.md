# Purely Automation (Internal Ops)

Internal ops dashboard for dialers/closers/managers: leads, calls, appointments, outcomes, docs, uploads.

## Local dev

1) Create `.env.local` based on `.env.example`.
2) Apply schema + seed demo data:

```bash
npm run db:deploy
```

3) Start:

```bash
npm run dev
```

Open http://localhost:3000

## Deploy (Vercel + Supabase)

1) Create a Vercel project from this repo.
2) In Vercel → Project → Settings → Environment Variables, add:

- `DATABASE_URL` (Supabase Transaction Pooler connection string)
- `DIRECT_URL` (Supabase Direct connection string)
- `NEXTAUTH_URL` (your Vercel production URL)
- `NEXTAUTH_SECRET` (generate with `openssl rand -base64 32`)
- `SIGNUP_INVITE_CODE` (required; choose any value)

3) In Vercel → Project → Settings → Build & Development Settings:

- Build Command: `npm run vercel-build`

First deploy will run `prisma db push` and create tables.

## Demo users (seed)

Seeding creates demo users if missing:

- Admin: `admin@purelyautomation.dev` / `admin1234`
- Dialer: `dialer@purelyautomation.dev` / `dialer1234`
- Closer: `closer@purelyautomation.dev` / `closer1234`
- Manager: `manager@purelyautomation.dev` / `manager1234`
