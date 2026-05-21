# Final Dev-Retro Merge Sync Handoff

- Handoff date: `2026-05-20`
- Branch: `dev-retro`
- Validation baseline: clean build and smoke pass completed after the Prisma media-growth fix and the funnel tracking client/server split.

## Current git state

- Current branch: `dev-retro`
- Current worktree is dirty. Latest snapshot showed `16` modified files and `25` untracked files.
- Treat the untracked additions as part of the post-beta line. Do not sync only the modified files and leave the new route/helper clusters behind.

## Recent commit anchors

- `0fecb027` Land post-beta communication guidance on dev-retro
- `e30d6635` Add recoverability controls and admin portal updates
- `b3efa3ab` Port platform improvement cycle onto dev-retro
- `88220cd1` Validate portal auth access flows
- `85ebc55c` Polish portal service flows and add journey smoke coverage
- `ce62a480` Stabilize funnel builder beta readiness
- `ae6e347e` Add funnel foundation, tracking, and design advisory groundwork

## Validated implementation areas

- Auth and account access validation passed through `npm run test:auth-access-validation`.
- Route and browser smoke coverage passed through `npm run test:route-browser-smoke`.
- Journey smoke coverage passed through `npm run test:journey-browser-smoke`.
- Post-beta beta-feedback, recoverability, and admin surfaces are in the validated dev-retro line.
- Provider setup and no-silent-failure states are surfaced through services, reporting, and dashboard guidance instead of disappearing silently.
- Growth readiness, revenue playbooks, and dashboard guidance are validated on portal and credit.
- Media-to-campaign and social continuity remain soft-gated and manual-post only; no direct Meta publishing validation was claimed.
- Booking external-link and confirmation continuity landed with separate handoff/confirmation truth instead of inflating native booking totals.
- Recoverability archive, restore, and purge flows are part of the validated post-beta cycle.
- Platform-admin role boundary work is part of the validated post-beta cycle.
- Prisma/build integrity is validated after the `PortalMediaGrowthProfile.owner` relation fix.
- Final clean deployment validation passed: `prisma validate`, `tsc`, `build`, auth smoke, route smoke, and journey smoke.

## Must-keep merge clusters

- Prisma and build integrity cluster:
  `prisma/schema.prisma`, `scripts/prisma-prebuild.mjs`, `prisma.config.ts`, and any code depending on `PortalMediaGrowthProfile` owner relations.
- Growth readiness and provider-guidance cluster:
  `src/lib/portalGrowthReadiness.ts`, `src/lib/portalGrowthReadiness.server.ts`, `src/app/api/portal/growth/readiness/route.ts`, `src/app/portal/PortalDashboardClient.tsx`, `src/app/portal/app/services/PortalServicesClient.tsx`, `src/app/portal/app/services/reporting/PortalReportingClient.tsx`, `src/lib/portalGuidance.ts`, `src/lib/portalReportingSummary.server.ts`.
- Media growth schema, API, and UI cluster:
  `src/lib/portalMediaGrowth.ts`, `src/lib/portalMediaGrowthSchema.ts`, `src/app/api/portal/media/items/[id]/route.ts`, `src/app/api/portal/media/list/route.ts`, `src/app/api/portal/media/stats/route.ts`, `src/app/portal/app/services/media-library/PortalMediaLibraryClient.tsx`.
- Booking external-link and confirmation continuity cluster:
  `src/lib/externalBookingLink.ts`, `src/lib/externalBookingHandoff.ts`, `src/lib/externalBookingHandoff.shared.ts`, `src/lib/externalBookingConfirmation.ts`, `src/lib/externalBookingHandoffReporting.ts`, `src/lib/externalBookingProviderCapabilities.ts`, `src/lib/externalBookingProviderConnection.server.ts`, `src/lib/externalBookingProviderEvents.server.ts`, `src/lib/portalBookingExternalLinkEventsSchema.ts`, `src/lib/portalBookingExternalConfirmationEventsSchema.ts`, `src/app/api/portal/booking/external-link/`, `src/app/api/portal/booking/external-provider/`, `src/app/api/public/booking/[slug]/handoff/`, `src/app/api/public/booking/providers/`, `src/app/api/public/booking/[slug]/settings/route.ts`, `src/app/api/public/booking/u/[ownerId]/[calendarId]/settings/route.ts`, `src/app/book/[slug]/PublicBookingClient.tsx`, `src/app/book/[slug]/confirmed/`, `src/app/portal/app/services/booking/PortalBookingClient.tsx`.
- Funnel tracking shared/browser split cluster:
  `src/lib/funnelEventTracking.ts`, `src/lib/funnelEventTracking.shared.ts`, `src/lib/creditFunnelBlocks.ts`, `src/components/funnel/clientFunnelTracking.ts`.
- Docs, tracker, and prompt cluster:
  `docs/post-beta-platform-improvement-tracker.md`, `docs/platform-improvement-final-dev-retro-handoff.md`, `docs/future-growth-booking-confirmation-integrations.md`, `docs/plans/external-booking-growth-wrapper-phase-1-spec-2026-05-19.md`, and any local prompt or handoff notes tied to `FG-009` / `P-039B` validation.

## Known risks to keep in mind

- Services can still show truthful loading or fallback states under noisy local dev reloads even though build and smoke validation passed.
- Meta, Facebook, and Instagram direct publishing remain postponed and soft-gated; continuity is manual-post only.
- Provider setup wizard depth is still future work; current guidance is honest blocker surfacing, not a full guided installer.
- No live outbound calls, texts, emails, scraping runs, purchases, or social execution were validated in this merge handoff.

## Post-sync validation commands

- `npx prisma validate`
- `npx tsc --noEmit --project tsconfig.json --pretty false`
- `npm run build`
- `npm run test:auth-access-validation`
- `npm run test:route-browser-smoke`
- `npm run test:journey-browser-smoke`

## Sync recommendation

- Sync from `dev-retro` only after bringing over the full file clusters above.
- Do not cherry-pick the Prisma relation fix, growth readiness UI, media-growth helpers, or funnel tracking split in isolation.
- If a post-sync issue appears, first re-run the validation commands above before widening scope.