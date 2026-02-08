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

Optional (Portal credits / top-ups):

- `STRIPE_PRICE_CREDITS_TOPUP` (Stripe Price ID for a one-time credits top-up package)
- `CREDITS_TOPUP_PER_PACKAGE` (defaults to 25 if unset)

If these are missing, the portal still works, but billing UI will show as not configured and entitlements will stay locked (unless using demo emails).

Stripe setup checklist:

1) In Stripe (test mode first), create 3 Products (or 1 product with 3 prices) with recurring monthly Prices.
2) Copy the Price IDs (they look like `price_...`) into the env vars above.
3) Create a restricted API key (recommended) or use your secret key for now and set it as `STRIPE_SECRET_KEY`.
4) (Optional) In Stripe → Settings → Billing → Customer portal, enable the customer portal.
	- This is only used for the Stripe-hosted screens (payment method updates, invoices).
	- Subscription cancellation is supported inside the portal UI (it calls Stripe from our backend).

Note: this repo currently reads subscription state live from Stripe; it does not require webhooks to unlock entitlements.

## Credits (portal)

The portal includes a lightweight credits system used by usage-based actions (e.g. “Generate with AI” in blogs).

- Billing UI: `/portal/app/billing`
- Credits API:
	- `GET /api/portal/credits` (balance + auto-top-up toggle)
	- `PUT /api/portal/credits` (update auto-top-up)
	- `POST /api/portal/credits/topup` (starts a Stripe Checkout session when configured)

Implementation note: credits state is stored in `PortalServiceSetup` (`serviceSlug = "credits"`) to avoid requiring DB migrations.

## Blog editor notes

- The portal blog post editor saves content as Markdown.
- Cover images can be generated on-the-fly via `GET /api/blogs/cover?title=...` (returns an SVG).

## Production schema drift hardening

This repo may be deployed to environments where DB migrations are not guaranteed to run (or schema changes roll out gradually).
For public/portal APIs, prefer narrow `select` clauses and avoid assuming optional columns always exist.

Portal Inbox note: the portal Inbox/Outbox APIs will attempt an idempotent runtime schema install for the inbox tables/types (see `ensurePortalInboxSchema()`), to avoid hard failures if migrations were skipped.
This requires the database role to allow `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX`, and `ALTER TABLE ... ADD CONSTRAINT` in the `public` schema.

Manual patches (when Prisma Migrate is unreliable):

- Media Library tables: `node scripts/apply-portal-media-library-db-patch.mjs`
- Lead scraping tables: `node scripts/apply-lead-scraping-db-patch.mjs`

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

## Blog automation cron (portal)

The customer portal has a per-client blog automation scheduler that generates drafts on a schedule.

- Endpoint: `GET /api/portal/blogs/automation/cron`
- Auth: set `BLOG_CRON_SECRET` (or `MARKETING_CRON_SECRET`) and call with header `x-blog-cron-secret: <secret>`

Configure Vercel Cron to hit that endpoint on a cadence (e.g., every hour). The endpoint will only generate when a client is due.

## Booking automation (portal)

Booking Automation gives each client a public booking link backed by their own availability blocks.

- Portal settings: `GET/PUT /api/portal/booking/settings`
- Portal bookings list: `GET /api/portal/booking/bookings`
- Owner cancel booking: `POST /api/portal/booking/bookings/[bookingId]/cancel`
- Public booking page: `/book/[slug]`
- Public booking APIs:
	- `GET /api/public/booking/[slug]/settings`
	- `GET /api/public/booking/[slug]/suggestions`
	- `POST /api/public/booking/[slug]/book`

## Follow-up automation (portal)

Follow-up Automation schedules email/SMS follow-ups after bookings.

- Portal page: `/portal/app/services/follow-up`
- Settings + queue: `GET/PUT /api/portal/follow-up/settings`
- Test send: `POST /api/portal/follow-up/test-send`
- Cron processor: `GET /api/portal/follow-up/cron`
  - If `FOLLOW_UP_CRON_SECRET` is set, the request must include header `x-follow-up-cron-secret: <secret>`.

Template notes:

- Templates support placeholders like `{contactName}`, `{businessName}`, `{bookingTitle}`, and custom variables defined in the Follow-up settings.
- Templates can be attached per booking calendar (multi-calendar mode) via the Follow-up settings screen.

Delivery notes:

- Email sender name uses the client’s Business Name (stored in `BusinessProfile`).
- SMS sends via the configured SMS provider credentials.

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
