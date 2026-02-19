# Credit portal at /credit (same Vercel project)

Goal: serve a **separate** credit-repair client portal at:
- `https://purelyautomation.com/credit/...`

…while keeping it separate from the main portal at:
- `https://purelyautomation.com/portal/...`

## How this works

This repo now supports a **portal variant** concept:
- `portal` (main) → base path `/portal`
- `credit` → base path `/credit`

Requests to `/credit/*` are handled by the **same Next.js routes** as `/portal/*` via the edge proxy rewrite in [src/proxy.ts](../src/proxy.ts), but the request is tagged with `x-portal-variant: credit`.

Auth separation is handled by:
- Separate session cookies:
	- main: `pa.portal.session`
	- credit: `pa.credit.session`
- A user-level field `User.clientPortalVariant` (enum: `PORTAL` or `CREDIT`) so a user created for one portal **cannot log into the other**.

## What you need to do in production

1) Apply the DB migration in production
- New migration: [prisma/migrations/20260218193000_client_portal_variant/migration.sql](../prisma/migrations/20260218193000_client_portal_variant/migration.sql)
- This adds `User.clientPortalVariant` with default `PORTAL`

2) Create credit-portal users
- Any user created through `/credit/get-started` will be created as `clientPortalVariant=CREDIT`.

## Notes / tradeoffs

- This keeps everything in one Vercel project and one database.
- If you ever want *hard* isolation (separate DB + no shared tables), you still need a second database (and typically a second Vercel project / multi-zone).
