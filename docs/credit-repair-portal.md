# Credit Repair Portal (independent clone)

Goal: run a **separate** portal for the credit repair niche that:
- does **not** share user accounts with the main portal
- is not linked from existing funnels
- can evolve independently without risking the main portal

## Best setup (recommended)

Create a **separate Vercel project** pointing at a **separate git branch** (this branch) and use a **separate database**.

Why this is best:
- independent accounts/data = different `DATABASE_URL`
- independent changes = separate branch/repo and separate Vercel project
- main portal stays untouched and stable

## Deploy steps (Vercel)

1) Create a new Vercel project
- Repo: this repo
- Branch: `credit-repair-portal`

2) Set a separate domain/subdomain
- Example: `credit.purelyautomation.com`
- Keep the app paths the same (e.g. `/portal/app/...`).
  - This avoids needing a risky repo-wide rewrite of hardcoded `/portal/*` links.

3) Environment variables (IMPORTANT: use separate values)
Set these to values for the **credit** environment only:
- `DATABASE_URL` (point at a separate Postgres DB)
- `DIRECT_URL` (same separate DB)
- `NEXTAUTH_URL` (the credit portal domain)
- `NEXTAUTH_SECRET` (new secret; do not reuse)
- `SIGNUP_INVITE_CODE` (new value; do not reuse)

Also set any optional integrations (Stripe, Postmark/SMTP, Twilio, cron secrets) to separate values if you want them isolated.

## Keeping it unlinked

Do not add links to the credit portal domain in the marketing site or portal nav.
If you want extra safety, we can also add an allowlist gate (e.g. require a secret header or password) until you’re ready to launch.

## Future: credit-repair specific changes

All credit-repair-only work should be merged into `credit-repair-portal` (or a separate repo fork), not `main`.
