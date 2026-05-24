# DEV-JAY handoff for teammate sync

## What this branch is
- This branch packages the current local workspace state on top of the shared `origin/dev-retro` baseline.
- The merge-base against `origin/dev-retro` is `6d9398d3452a2925d8539e5df389d2be59729d44`.
- This is not a tiny patch. The current diff versus `origin/dev-retro` is broad and includes both feature work and premium-UX cleanup.

## Scope at a glance
- Total diff versus `origin/dev-retro`: `572 files changed`, about `189108 insertions` and `37677 deletions`.
- Subsystem spread:
  - `portal_ui`: 113 files
  - `portal_api`: 108 files
  - `shared_lib`: 97 files
  - `credit`: 23 files
  - `components`: 30 files
  - `docs`: 40 files
  - `scripts`: 16 files
  - `prisma`: 3 files
  - `mobile`: 4 files
  - `other`: 138 files

## Highest-signal changes since dev-retro
- Reporting and growth-readiness expanded significantly:
  - `src/app/portal/app/services/reporting/PortalReportingClient.tsx`
  - `src/lib/portalReportingSummary.server.ts`
  - `src/lib/portalGrowthReadiness.ts`
  - `src/lib/portalGrowthReadiness.server.ts`
  - `src/app/api/portal/growth/readiness/route.ts`
- Provider setup now has a dedicated wizard and stronger readiness modeling:
  - `src/app/portal/app/settings/integrations/ProviderSetupWizardPanel.tsx`
  - `src/app/portal/app/settings/integrations/page.tsx`
  - `src/app/api/portal/provider-setup/route.ts`
  - `src/lib/providerSetupWizard.ts`
  - `src/lib/providerSetupWizard.server.ts`
  - `src/lib/portalServicesStatus.ts`
- External booking handoff / provider confirmation was reworked:
  - old files removed:
    - `src/lib/externalBookingConfirmation.ts`
    - `src/lib/externalBookingHandoff.shared.ts`
    - `src/lib/externalBookingHandoff.ts`
    - `src/lib/externalBookingProviderEvents.server.ts`
  - replacement / new path:
    - `src/lib/externalBookingLink.ts`
    - `src/lib/externalBookingHandoffReporting.ts`
    - `src/lib/externalBookingProviderCapabilities.ts`
    - `src/lib/externalBookingProviderConnection.server.ts`
    - `src/lib/portalBookingExternalLinkEventsSchema.ts`
    - `src/lib/portalBookingExternalConfirmationEventsSchema.ts`
- Media / Meta / growth workflow groundwork was added:
  - `src/lib/portalMediaGrowth.ts`
  - `src/lib/portalMediaGrowthSchema.ts`
  - `src/lib/portalMetaIntegration.server.ts`
  - `src/lib/portalMetaProviderReadiness.ts`
  - `src/app/api/portal/media/providers/meta/readiness/route.ts`
  - `src/app/api/portal/media/providers/meta/publish/route.ts`
  - `src/app/api/portal/media/stats/route.ts`
  - `src/app/portal/app/services/media-library/PortalMediaLibraryClient.tsx`
- Portal polish / customer-facing UX cleanup touched many high-traffic surfaces:
  - `src/app/portal/PortalDashboardClient.tsx`
  - `src/app/portal/PortalShell.tsx`
  - `src/app/portal/app/ai-chat/PortalAiChatClient.tsx`
  - `src/app/portal/app/services/inbox/PortalInboxClient.tsx`
  - `src/app/portal/app/services/ai-receptionist/PortalAiReceptionistClient.tsx`
  - `src/app/portal/app/services/ai-outbound-calls/PortalAiOutboundCallsClient.tsx`
  - `src/app/portal/app/services/booking/PortalBookingClient.tsx`
  - `src/app/portal/app/services/blogs/PortalBlogsClient.tsx`
  - `src/app/portal/app/services/newsletter/PortalNewsletterClient.tsx`
  - `src/app/portal/app/services/follow-up/PortalFollowUpClient.tsx`
  - `src/app/portal/app/services/nurture-campaigns/PortalNurtureCampaignsClient.tsx`
  - `src/app/portal/app/people/contacts/PortalPeopleContactsClient.tsx`
  - `src/app/portal/app/services/reviews/setup/PortalReviewsClient.tsx`
  - `src/app/portal/app/tasks/PortalTasksClient.tsx`
- Tracker / audit docs added for the portal hardening work:
  - `docs/plans/portal-perfection-master-2026-05-23.md`
  - `docs/plans/portal-burndown-audit-2026-05-22.md`
  - `docs/plans/media-provider-publishing-audit-2026-05-23.md`

## What is different from the last dev-retro pull
- The branch is not just one feature. It combines:
  - a large reporting and guidance expansion
  - provider setup readiness and integration posture work
  - external booking handoff / confirmation refactor
  - media-growth and Meta integration scaffolding
  - broad portal UX and empty-state hardening
- Some old external-booking implementation files were deleted and replaced with a new set of server-side readiness / reporting helpers. If anyone still has local edits against the deleted files, those need manual reconciliation.
- There are also broad non-portal repo changes in the full diff. The safest sync path is to inspect the branch first and then merge or cherry-pick intentionally.

## Important current local-state note
- This workspace has local modifications beyond the old `dev-retro` checkout, and many of them are not committed on the current branch yet.
- The pushed `DEV-JAY` branch is intended to capture that current local state exactly as packaged here.
- Do not assume the change set maps 1:1 to a single previous `dev-retro` pull; it includes work added after that point.

## Safe sync instructions for the other developer
- If they already have local work on top of `dev-retro`, tell them **not** to pull `DEV-JAY` directly into their working branch.
- Safest process:
  1. Save their current work first:
     - either commit it to a safety branch
     - or stash it with untracked files
  2. Fetch the new branch
  3. Review `origin/DEV-JAY` against `origin/dev-retro`
  4. Merge or cherry-pick by subsystem instead of blindly smashing trees together

### Safe command sequence
```bash
# from their repo
 git status
 git checkout -b safety/<their-name>-before-dev-jay
 git add -A && git commit -m "safety checkpoint before DEV-JAY sync"
 git fetch origin
 git checkout -b review/dev-jay origin/DEV-JAY
 git diff --stat origin/dev-retro..HEAD
 git diff --name-status origin/dev-retro..HEAD
```

### If they want to preserve local uncommitted work instead of committing
```bash
 git stash push -u -m "pre DEV-JAY sync"
 git fetch origin
 git checkout -b review/dev-jay origin/DEV-JAY
```

## How to synchronize without blowing up their work
- Recommended rule: sync by subsystem, not by emotion.
- Start with these chunks in order:
  1. reporting + growth readiness
  2. provider setup wizard + service readiness
  3. external booking handoff/provider confirmation
  4. media/meta growth scaffolding
  5. UI polish / empty-state text cleanup
- If they already changed the same portal clients locally, they should diff file-by-file before merging because many of the UI files were edited for copy polish at the same time as broader feature work.

## Suggested file-review buckets

### Bucket 1: reporting / readiness
- `src/app/portal/app/services/reporting/PortalReportingClient.tsx`
- `src/lib/portalReportingSummary.server.ts`
- `src/lib/portalGrowthReadiness.ts`
- `src/lib/portalGrowthReadiness.server.ts`
- `src/app/api/portal/growth/readiness/route.ts`

### Bucket 2: provider setup
- `src/app/portal/app/settings/integrations/ProviderSetupWizardPanel.tsx`
- `src/app/portal/app/settings/integrations/page.tsx`
- `src/app/api/portal/provider-setup/route.ts`
- `src/lib/providerSetupWizard.ts`
- `src/lib/providerSetupWizard.server.ts`
- `src/lib/portalServicesStatus.ts`

### Bucket 3: external booking refactor
- deleted old path:
  - `src/lib/externalBookingConfirmation.ts`
  - `src/lib/externalBookingHandoff.shared.ts`
  - `src/lib/externalBookingHandoff.ts`
  - `src/lib/externalBookingProviderEvents.server.ts`
- new path:
  - `src/lib/externalBookingLink.ts`
  - `src/lib/externalBookingHandoffReporting.ts`
  - `src/lib/externalBookingProviderCapabilities.ts`
  - `src/lib/externalBookingProviderConnection.server.ts`
  - `src/lib/portalBookingExternalLinkEventsSchema.ts`
  - `src/lib/portalBookingExternalConfirmationEventsSchema.ts`

### Bucket 4: media / meta / growth scaffolding
- `src/lib/portalMediaGrowth.ts`
- `src/lib/portalMediaGrowthSchema.ts`
- `src/lib/portalMetaIntegration.server.ts`
- `src/lib/portalMetaProviderReadiness.ts`
- `src/app/api/portal/media/providers/meta/readiness/route.ts`
- `src/app/api/portal/media/providers/meta/publish/route.ts`
- `src/app/api/portal/media/stats/route.ts`
- `src/app/portal/app/services/media-library/PortalMediaLibraryClient.tsx`

### Bucket 5: portal UX polish
- `src/app/portal/PortalDashboardClient.tsx`
- `src/app/portal/PortalShell.tsx`
- `src/app/portal/app/ai-chat/PortalAiChatClient.tsx`
- `src/app/portal/app/services/inbox/PortalInboxClient.tsx`
- `src/app/portal/app/services/ai-receptionist/PortalAiReceptionistClient.tsx`
- `src/app/portal/app/services/ai-outbound-calls/PortalAiOutboundCallsClient.tsx`
- `src/app/portal/app/services/booking/PortalBookingClient.tsx`
- `src/app/portal/app/services/blogs/PortalBlogsClient.tsx`
- `src/app/portal/app/services/newsletter/PortalNewsletterClient.tsx`
- `src/app/portal/app/services/follow-up/PortalFollowUpClient.tsx`
- `src/app/portal/app/services/nurture-campaigns/PortalNurtureCampaignsClient.tsx`
- `src/app/portal/app/people/contacts/PortalPeopleContactsClient.tsx`
- `src/app/portal/app/services/reviews/setup/PortalReviewsClient.tsx`
- `src/app/portal/app/tasks/PortalTasksClient.tsx`

## What I would tell the other developer directly
- `DEV-JAY` is a packaging branch of the current local state, not a tiny surgical patch.
- The biggest risky overlap areas are reporting, media library, provider setup, external booking, and the large portal client files.
- If you already changed any of those locally, do a side-by-side diff before merging.
- If you only need the premium portal polish, you can cherry-pick the portal client files and the tracker docs without taking the bigger reporting/provider stack in the same move.
- If you need the bigger reporting/provider/media work, take those foundational server/lib files first, then reconcile the UI layer second.

## Branch review commands for them after fetch
```bash
 git diff --stat origin/dev-retro..origin/DEV-JAY
 git diff --name-status origin/dev-retro..origin/DEV-JAY
 git diff origin/dev-retro..origin/DEV-JAY -- src/lib/providerSetupWizard.server.ts
 git diff origin/dev-retro..origin/DEV-JAY -- src/lib/portalGrowthReadiness.ts
 git diff origin/dev-retro..origin/DEV-JAY -- src/app/portal/app/services/reporting/PortalReportingClient.tsx
```

## Build / validation status
- `next build --webpack` now passes successfully.
- Packaging-time fixes that were required to get green:
  - `src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx`
    - changed preview image creation to `new window.Image()` to avoid the `next/image` import shadowing the browser constructor
    - restored a local `clamp(...)` helper used by the chat rail sizing logic
    - fixed callback and memo declaration-order issues around `requestPageSelection` and assistant context wiring
  - `src/app/portal/app/services/PortalServiceGate.tsx`
    - removed an unsupported `serviceSlugs` argument from `getPortalServiceStatusesForOwner(...)`
- Remaining build-time caveat:
  - Next.js still warns that `/api/portal/credit/reports/import/route` exports `runtime`, `dynamic`, and `revalidate` through a pattern it cannot statically recognize, but the build completes successfully.
