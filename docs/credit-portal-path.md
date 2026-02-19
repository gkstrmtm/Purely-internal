# Credit portal at /credit (independent)

Goal: serve an **independent** credit-repair portal at:
- `https://purelyautomation.com/credit/portal/...`

…but keep it fully independent from the main portal:
- separate accounts
- separate DB
- no links from funnels

## How this works (Vercel multi-zone)

You deploy a **second Vercel project** for the credit portal (pointing at this repo’s `credit-repair-portal` branch).

Then, in the **main** Vercel project, set:

- `CREDIT_PORTAL_ORIGIN=https://<your-credit-portal-deployment-domain>`

The main project rewrites:
- `/credit/:path*` → `${CREDIT_PORTAL_ORIGIN}/:path*`

So users see `purelyautomation.com/credit/...`, but the request is served by the separate credit portal project.

## Setup checklist

1) Create **Credit portal** Vercel project
- Repo: this repo
- Branch: `credit-repair-portal`
- Domain: use the default `*.vercel.app` domain (fine for the origin)

2) Credit portal env vars (separate values)
- `DATABASE_URL` / `DIRECT_URL` → separate Postgres DB
- `NEXTAUTH_URL` → the credit portal project’s URL (its `*.vercel.app` domain)
- `NEXTAUTH_SECRET` → new secret
- `SIGNUP_INVITE_CODE` → new code

3) Main portal env var
- `CREDIT_PORTAL_ORIGIN` → the credit portal project’s URL (e.g. `https://credit-repair-portal-xyz.vercel.app`)

## Notes
- `/credit` redirects to `/credit/portal`.
- Keep navigation unlinked by simply not adding links to `/credit` anywhere.
