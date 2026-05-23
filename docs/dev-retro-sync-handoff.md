# Dev-Retro Sync Handoff

- Branch: `dev-retro`
- Sync anchor commit: `8631c8ac` (`chore: sync media workflow and post-beta readiness`)
- Remote: `origin/dev-retro`

## What Changed

- Media Library workflow and calendar were cleaned up into a calmer content-planning surface in the shared portal/credit client.
- Dashboard and reporting now show content workflow guidance grounded in stored media workflow data instead of speculative/live provider behavior.
- Content continuity now treats YouTube as a soft-gated, manual-only future lane for video-capable assets.
- Provider setup progress no longer surfaces Meta in this slice, which keeps the product aligned with the removed Meta snapshot/growth-loop direction.

## Current Validated Capabilities

- Shared portal and credit Media Library surfaces respect route prefixes while using the same core workflow client.
- The calendar view hides zero-count sections, prioritizes actual planned/media cards, and uses quieter workflow labels such as `Ready to plan`, `Needs copy`, `Review before posting`, `Manual posting only`, and `Posted manually`.
- Asset modal workflow fields remain active for workflow state, planned date, caption/copy draft, notes, CTA link, and posted URL.
- Reporting and dashboard guidance are based on persisted workflow/media state only.
- YouTube planning appears only for video-capable assets and stays manual/future-only.

## UX And Product Decisions

- Meta snapshot and growth-loop display were intentionally removed and should not be reintroduced casually.
- The Media Library workflow view should feel like an in-product planning surface, not an ops dashboard.
- Provider limitations should stay truthful but quiet: manual posting is the live path, provider continuity is record-keeping only in this slice.
- Portal and credit share the same surfaces, with copy differences handled by route-aware logic rather than diverging implementations.

## Intentionally Not Live Yet

- No direct YouTube upload, scheduling, analytics sync, or live publishing.
- No live Meta/Facebook/Instagram posting path from Media Library.
- No live external posting, email, SMS, booking, payment, or provider actions should be triggered during validation.
- Pura/chat behavior remains untouched and should stay untouched unless explicitly scoped.

## Risks And Caveats

- `localhost:3000` has shown stale-bundle behavior; isolated validation has been more reliable for browser proof when runtime output looks inconsistent.
- `npm run build` can hit the known Windows Prisma engine rename lock during prebuild, but the existing script continues when a usable engine is already present.
- `tsconfig.json` is currently dirty locally and was intentionally excluded from the sync commit.

## Recommended Next Work

1. Keep validating Media Library changes on fresh isolated Next dev output when UI behavior looks stale.
2. If provider continuity expands later, preserve the manual-first truthfulness and avoid fallback-heavy pseudo-live states.
3. Add follow-up browser proof if new workflow states or provider lanes are introduced.
4. Keep dashboard/reporting guidance tied to stored workflow records rather than inferred growth narratives.

## Validation

- `npx tsc --noEmit --project tsconfig.json --pretty false` -> passed.
- `npm run build` -> passed.
- Browser proof previously confirmed shared portal/credit Media Library workflow cleanup, modal fields, route-aware copy, YouTube video-only gating, and no Meta snapshot/growth-loop return.

## Merge And Sync Notes

- Pull `origin/dev-retro` and start from commit `8631c8ac` for the validated product changes in this slice.
- Expect shared edits in:
  - `src/app/api/portal/media/stats/route.ts`
  - `src/app/portal/PortalDashboardClient.tsx`
  - `src/app/portal/app/services/media-library/PortalMediaLibraryClient.tsx`
  - `src/app/portal/app/services/reporting/PortalReportingClient.tsx`
  - `src/app/portal/app/settings/integrations/ProviderSetupWizardPanel.tsx`
  - `src/lib/portalMediaGrowth.ts`
- Do not reintroduce Meta snapshot/growth-loop UI, live provider posting assumptions, or Pura/chat changes while syncing this branch unless the scope explicitly changes.