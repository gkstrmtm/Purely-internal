# Purely Automation (Internal Ops)

Internal ops dashboard for dialers/closers/managers: leads, calls, appointments, outcomes, docs, uploads.

This repo now also includes a public marketing landing page at `/` with a demo request form and a public booking flow.

## Local dev

1) Create `.env` based on `.env.example`.
2) Apply schema:

```bash
npm run db:push
```

Optional: seed demo users/sample data (opt-in):

```bash
SEED_DEMO_DATA=1 npm run db:seed
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

Optional (Portal billing + entitlements):

- `STRIPE_SECRET_KEY` (Stripe secret key; enables billing actions)
- `STRIPE_PRICE_BLOG_AUTOMATION` (Stripe Price ID for Automated Blogs)
- `STRIPE_PRICE_BOOKING_AUTOMATION` (Stripe Price ID for Booking Automation)
- `STRIPE_PRICE_CRM_AUTOMATION` (Stripe Price ID for Follow-up Automation)

If these are missing, the portal still works, but billing UI will show as not configured and entitlements will stay locked (unless using demo emails).

3) In Vercel → Project → Settings → Build & Development Settings:

- Build Command: `npm run vercel-build`

Deploy the DB schema separately (recommended):

```bash
npm run db:push
```

If you explicitly want demo seed data in a non-production environment:

```bash
SEED_DEMO_DATA=1 npm run db:seed
```

Vercel builds do not require direct DB connectivity.

## Public marketing landing

- `/` is the public landing page.
- `/dashboard` is the internal app entry (rewrite to `/app`, auth-gated).

### Demo request + follow ups

The public form posts to `POST /api/marketing/demo-request` and stores:

- a new `Lead`
- a `MarketingDemoRequest`
- queued `MarketingMessage` rows (immediate + 5 minutes)

Sending is performed by `GET /api/marketing/cron`:

- If SendGrid/Twilio env vars are missing, messages are marked as `SKIPPED`.
- If `MARKETING_CRON_SECRET` is set, the cron request must include header `x-marketing-cron-secret`.

### Public booking

- `GET /api/public/appointments/suggestions` returns available slots from closer availability.
- `POST /api/public/appointments/book` books the slot and auto-assigns an available closer.

`POST /api/public/appointments/book` requires `MARKETING_SETTER_EMAIL` (or it will fall back to the earliest active MANAGER/ADMIN/DIALER user).

## Demo users (seed)

Seeding creates demo users if missing:

- Admin: `admin@purelyautomation.dev` / `admin1234`
- Dialer: `dialer@purelyautomation.dev` / `dialer1234`
- Closer: `closer@purelyautomation.dev` / `closer1234`
- Manager: `manager@purelyautomation.dev` / `manager1234`

### Portal demo users (optional)

The customer portal can unlock demo entitlements by email (see `DEMO_PORTAL_FULL_EMAIL` / `DEMO_PORTAL_LIMITED_EMAIL`).
