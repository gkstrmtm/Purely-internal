# Purely Automation agent notes

## Big picture
- The root app is a Next.js 16 App Router project; most feature logic lives in `src/lib/*`, while `src/app/*` mostly provides routes, pages, and thin API handlers.
- `mobile-app/` is a separate Expo app with its own package.json, build, and deployment target. Never import root `src/*`, `@/*`, `next/*`, or Prisma code into `mobile-app/`.
- Data lives in PostgreSQL via Prisma (`src/lib/db.ts`, `prisma/schema.prisma`). The schema is large and multi-product: internal ops, `/portal`, `/credit`, `/ads`, hosted funnels/forms, Connect, and Pura all share the same database.

## Routing and auth that are easy to break
- Middleware is delegated through `middleware.ts` -> `src/lib/proxy.ts`. Read that file before changing auth, redirects, or custom-domain behavior.
- `/portal` and `/credit` share most UI code, but they are separate session surfaces with different cookies (`pa.portal.session`, `pa.credit.session`) and an `x-portal-variant` header.
- `/credit/*` is internally rewritten onto `/portal/*`; when adding portal APIs or links, preserve variant-aware behavior with helpers like `portalBasePath()` and `normalizePortalVariant()` from `src/lib/portalVariant.ts`.
- `/ads` is a third auth surface with its own cookie (`pa.ads.session` in `src/lib/adsAuth.ts`). Do not collapse these session boundaries.
- Customer custom domains are handled in `src/lib/proxy.ts` by rewriting non-platform hosts to `/domain-router/*`. Changes to routing must preserve this rewrite path.

## Database and migration safety
- Use the shared Prisma client from `src/lib/db.ts`; imports should normally come from `@/lib/*` via the `@/*` alias in `tsconfig.json`.
- Do not assume the deployed DB matches `schema.prisma`. This repo intentionally uses drift-hardening helpers such as `src/lib/dbSchemaCompat.ts` and runtime schema ensures like `src/lib/connectSchema.ts`.
- Connect routes call `ensureConnectSchema()` before DB work so production does not break on partially applied migrations. Follow that pattern for schema-sensitive features.
- `npm run db:push`, `npm run db:migrate`, and `npm run db:deploy` are guarded by `scripts/db-guard.mjs`. Remote Supabase mutations require explicit `ALLOW_PROD_DB_MUTATIONS=1`.
- Many one-off schema updates are applied with idempotent scripts in `scripts/` rather than only with Prisma migrations. Reuse those patterns instead of adding unsafe ad hoc SQL.

## Feature organization patterns
- Portal service definitions live in `src/app/portal/services/catalog.ts`; service-specific permissions, billing, and credits logic are centralized in `src/lib/portal*` modules.
- Pura and portal AI behavior are implemented in `src/lib/pura*.ts`, `src/lib/portalSupportChat.ts`, and the very large `src/lib/portalAgentActionExecutor.ts`. Prefer extending shared planners/resolvers/executors over adding one-off route logic.
- For portal/credit signup and auth flows, use the existing helpers in `src/lib/portalAuth.ts`, `src/lib/portalAccounts.ts`, and `src/app/api/auth/client-signup/route.ts` rather than inventing parallel cookie or owner-resolution logic.
- Many API routes that mutate portal data export `runtime = "nodejs"`, `dynamic = "force-dynamic"`, and `revalidate = 0`; preserve those when editing request-time server logic.

## Workflows and validation
- Use Node 20.x. Root commands: `npm run dev`, `npm run build`, `npm run lint`, `npx tsc --noEmit`, `npm run pura:production-smoke`.
- `npm run lint` is not just ESLint: it also runs `scripts/check-no-em-dash.mjs`, which fails on em/en dashes inside tracked files under `src/` and `mobile-app/src/`.
- The repo relies heavily on VS Code tasks and targeted QA scripts under `tmp/` and `scripts/` for reproductions and smoke tests. Prefer the narrowest existing task/script that matches the area you changed.
- Mobile app commands are separate: `npm --prefix mobile-app run web`, `npm --prefix mobile-app run build`, `npm --prefix mobile-app run typecheck`.

## Project-specific rules
- Keep changes surgical. This repo mixes public marketing pages, employee ops, portal, credit, ads, hosted pages, and mobile in one workspace, so avoid “global cleanup” edits unless the user asks.
- Preserve discoverable compatibility code even if it looks redundant; many helpers exist specifically to support partially migrated or legacy data.
- Never add deterministic portal flows, hard-coded execution branches, or screen-reading style logic unless the user explicitly says the code word: screen read.
