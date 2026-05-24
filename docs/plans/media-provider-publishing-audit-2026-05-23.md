# Media provider publishing audit

## What is actually present in this checkout
- Current `main` is at `f01b04ad`.
- Referenced commits `7129affe` and `8631c8ac` are not present in this local git history.
- A local `.worktrees/dev-retro-e30d6635/` checkout exists, but its `PortalMediaLibraryClient` and media API routes still stop at asset CRUD.
- Both the current checkout and the local `dev-retro` worktree lack a real provider-publishing backend.

## Current media-library reality
### UI
- The shared portal and credit media surface is `src/app/portal/app/services/media-library/PortalMediaLibraryClient.tsx`.
- Credit reuses that same client through `src/app/credit/app/[[...slug]]/page.tsx`.
- Route-prefix handling must continue to respect `portalVariantFromPathname()` and `portalBasePath()` patterns.

### Persistence
- `prisma/schema.prisma` only defines:
  - `PortalMediaFolder`
  - `PortalMediaItem`
- Those models currently store only:
  - folder tree and color
  - file identity, bytes/storage URL, tags, and public token
- There are no persisted fields or tables yet for:
  - provider connections
  - provider account/page/channel selection
  - workflow calendar state
  - publish queue records
  - publish status / last error
  - provider post IDs
  - reporting rollups for outbound publishing

### API surface
- Current media routes are asset CRUD only:
  - `src/app/api/portal/media/list/route.ts`
  - `src/app/api/portal/media/folders/route.ts`
  - `src/app/api/portal/media/folders/[id]/route.ts`
  - `src/app/api/portal/media/items/route.ts`
  - `src/app/api/portal/media/items/[id]/route.ts`
  - `src/app/api/portal/media/items/from-blob/route.ts`
  - `src/app/api/portal/media/blob-upload/route.ts`
  - `src/app/api/portal/media/import-remote/route.ts`
- None of these routes currently read or write provider-publishing workflow state.

### Reporting and dashboard
- Dashboard and reporting currently only read media counts (`itemsCount`, `foldersCount`).
- There is no existing reporting payload for:
  - scheduled publishes
  - published vs failed posts
  - provider/channel breakdowns
  - provider post IDs / recent publish errors

## Best reusable pattern already in repo
- The closest truthful OAuth/storage implementation is booking meeting integrations:
  - `src/lib/bookingMeetingIntegrations.server.ts`
  - `src/app/api/portal/booking/integrations/[provider]/connect/route.ts`
  - `src/app/api/portal/booking/integrations/[provider]/callback/route.ts`
- That flow already demonstrates:
  - encrypted token storage
  - provider-specific connect URLs
  - callback completion
  - refresh-token based access-token renewal
  - status reporting back to the portal UI

## Honest conclusion
There is no safe hidden provider-publishing path to "finish" in this checkout. A truthful implementation now requires new persistence, new API routes, queue execution, and reporting.

## Recommended first real end-to-end slice
Implement **one provider only** first, and make it fully real.

### Recommended provider
- Start with **YouTube** only because the product already mentions video-only YouTube gating.
- Keep it real only if the environment has working Google OAuth credentials and YouTube Data API access.

### Minimum truthful scope for that first slice
1. **OAuth connection**
   - Connect/disconnect flow
   - encrypted refresh-token storage
   - access-token refresh
2. **Channel selection**
   - fetch available YouTube channel(s)
   - persist selected publishing target
3. **Permission validation**
   - verify the token can list channels and upload videos
   - surface concrete permission/config errors
4. **Publish queue**
   - schedule a publish job against a media item
   - execute it through a real server-side job/cron path
5. **Status + IDs**
   - store queued / publishing / published / failed states
   - store provider video/post IDs
   - store last provider error message and timestamps
6. **Reporting**
   - add workflow-level metrics to dashboard/reporting only after the above exists

## Recommended data model additions
Use dedicated Prisma models rather than hiding publish state inside `PortalMediaItem` tags or a loose `portalServiceSetup` blob.

### Suggested models
- `PortalMediaPublishConnection`
  - `ownerId`
  - `provider`
  - encrypted token envelope
  - connected account/channel metadata
  - timestamps
- `PortalMediaWorkflow`
  - `ownerId`
  - `mediaItemId`
  - planning fields (`title`, `caption`, `scheduledFor`, etc.)
  - chosen provider / channel
  - workflow status
  - last validation error
- `PortalMediaPublishJob`
  - `ownerId`
  - `workflowId`
  - `provider`
  - `status`
  - `attemptCount`
  - `scheduledFor`
  - `startedAt`, `finishedAt`
  - `providerPostId`
  - `error`

## Route-prefix safety notes
- Any new UI links must derive paths from `portalBasePath()` or the active portal variant.
- Any API calls issued from shared portal/credit UI must continue sending `x-portal-variant`.
- Do not hardcode `/portal/...` inside new shared client-side publishing flows.

## Do-not-touch reminders from the handoff
- Do not restore or reintroduce removed Meta snapshot / growth-loop UI.
- Do not fake provider states, scheduled publish success, analytics, or publish IDs.
- Do not widen into Pura/chat behavior unless explicitly scoped.
- Do not claim YouTube is live until OAuth, channel selection, queue execution, and provider IDs are all real.

## Suggested implementation order
1. Add Prisma models for provider connection + workflow + publish job.
2. Add drift-hardening / ensure-schema helper if rollout safety is needed.
3. Add YouTube OAuth connect/callback/status/disconnect routes.
4. Add channel-list route and persist selected channel.
5. Add workflow create/update routes for a media item.
6. Add publish queue creation route.
7. Add a real executor route/task for scheduled jobs.
8. Add dashboard/reporting metrics once the queue and statuses are real.

## Files most likely to be involved
- `prisma/schema.prisma`
- `src/lib/dbSchemaCompat.ts` or a new ensure-schema helper
- `src/lib/portalEncryption.server.ts`
- `src/lib/portalVariant.ts`
- `src/app/portal/app/services/media-library/PortalMediaLibraryClient.tsx`
- new `src/app/api/portal/media/publishing/**` routes
- `src/app/portal/PortalDashboardClient.tsx`
- `src/app/portal/app/services/reporting/PortalReportingClient.tsx`

## Blockers before coding the full slice
- Confirm which provider is first-class for the first launch slice.
- Confirm required OAuth env vars are available in the target environment.
- Confirm where scheduled job execution should run in this repo (cron/task/route trigger).
