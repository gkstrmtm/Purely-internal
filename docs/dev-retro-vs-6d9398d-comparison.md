# dev-retro vs 6d9398d3452a2925d8539e5df389d2be59729d44

## Comparison scope

- Baseline commit: `6d9398d3452a2925d8539e5df389d2be59729d44`
- Baseline timestamp: `April 12, 2026 at 2:28:48 PM (UTC-07:00)`
- Comparison branch: `dev-retro`
- Current branch head: `37ea3b4512ef934b71e8d6709b84c637b43e5583`
- Commit(s) since baseline:
  - `37ea3b45` `Polish portal behavior and dashboard defaults`

## Diff summary

- Files changed: `33`
- Insertions: `3535`
- Deletions: `865`
- New files added:
  - `src/lib/portalAiOutboundIntelligence.ts`
  - `src/lib/portalBlogsPreview.client.ts`
  - `src/lib/portalDashboardLayout.ts`
  - `src/lib/portalUiPreview.client.ts`

## Executive summary

This branch is a broad portal polish pass with four main tracks:

1. AI outbound calls were made more structured, less prompt-fragile, and more context-aware.
2. Dashboard defaults, layout behavior, shell interaction, and scrollbar behavior were reworked to reduce empty space, hover jitter, and sidebar instability.
3. Blog, reviews, and preview-side portal flows were expanded to better support local preview, editing, and embedded/sidebar-driven operation.
4. A set of runtime and interaction bugs were addressed during the session, including a billing runtime reference issue, a dashboard hooks-order issue, and a sidebar snap-back bug in blog post editing.

## Major change areas

### 1. AI outbound calls and messaging intelligence

Core intent of this work:

- reduce reliance on the user being unusually good at prompting
- make outbound behavior safer and more structured in pacing, replies, and next-step handling
- unify preview behavior and production behavior
- derive more intelligence from existing business profile and campaign context

Key implementation changes:

- Added `src/lib/portalAiOutboundIntelligence.ts` as a shared intelligence layer.
- Strengthened outbound prompt generation in:
  - `src/lib/elevenLabsConvai.ts`
  - `src/app/api/portal/ai-outbound-calls/campaigns/[campaignId]/generate-agent-config/route.ts`
  - `src/app/api/portal/ai-outbound-calls/campaigns/[campaignId]/preview-message-reply/route.ts`
  - `src/app/api/portal/ai-outbound-calls/cron/route.ts`
  - `src/app/api/portal/ai-outbound-calls/campaigns/[campaignId]/sync-agent/route.ts`
  - `src/app/api/portal/ai-outbound-calls/campaigns/[campaignId]/sync-chat-agent/route.ts`
  - `src/lib/portalAgentActionExecutor.ts`
- Added context-strength analysis and narrower prompt-blocking logic so the system only requires extra user input when both offer clarity and next-step clarity are missing.
- Updated `src/app/portal/app/services/ai-outbound-calls/PortalAiOutboundCallsClient.tsx` to surface context insight back to the user.

Net effect:

- preview and production behavior are closer to each other
- outbound generation is more opinionated and safer
- the system uses existing profile/context more aggressively before asking for more user input

### 2. Dashboard defaults, layout logic, and shell behavior

Core intent of this work:

- stop the dashboard from feeling sparse, left-heavy, and unfinished by default
- make the shell/sidebar behavior calmer and closer to Apple-style interaction patterns
- improve what happens when the sidebar collapses so content actually benefits from the released space

Key implementation changes:

- Added `src/lib/portalDashboardLayout.ts` as a shared dashboard layout engine.
- Reworked default dashboard configuration in `src/lib/portalDashboard.ts`.
- Rebuilt major portions of `src/app/portal/PortalDashboardClient.tsx`:
  - stronger default widget mix
  - richer widgets including `puraAttention` and `activityPulse`
  - sparse-dashboard fallback suggestions when a saved dashboard has too few widgets
  - calmer edit controls and card interactions
- Updated `src/app/portal/app/page.tsx` to widen the dashboard stage.
- Updated `src/app/globals.css`, `src/app/portal/PortalShell.tsx`, and `src/app/portal/PortalServiceSidebarIcons.tsx` to reduce hover jitter, sidebar chip movement, and Windows-like scrollbar intrusion.
- Updated `src/app/portal/PortalFloatingTools.tsx` and `src/app/portal/PortalThemeClient.tsx` as part of broader shell and portal polish.

Net effect:

- default dashboard behavior is less empty and less visually broken
- sidebar collapse has more meaningful payoff because the dashboard stage is wider
- portal scroll surfaces feel more consistent

### 3. Blogs, preview helpers, and editing flows

Core intent of this work:

- improve blog editing and preview behavior
- improve route-specific portal behavior during authoring/editing
- support better local preview handling

Key implementation changes:

- Added `src/lib/portalBlogsPreview.client.ts`
- Added `src/lib/portalUiPreview.client.ts`
- Updated blog-related routes and clients:
  - `src/app/portal/app/services/blogs/PortalBlogsClient.tsx`
  - `src/app/portal/app/services/blogs/[postId]/PortalBlogPostClient.tsx`
  - `src/app/[siteSlug]/blogs/[postSlug]/page.tsx`
  - `src/app/blogs/[slug]/page.tsx`
  - `src/app/domain-router/[domain]/blogs/[postSlug]/page.tsx`
  - `src/lib/blog.ts`
- Fixed the blog-post editor sidebar glitch by making force-collapsed sidebar state behave as a real lock in `src/app/portal/PortalShell.tsx`.

Net effect:

- blog editing behavior is more stable
- preview support is more explicit in shared helpers
- the portal shell no longer lies to the user by allowing an expand action that will instantly snap back

### 4. Billing, reviews, profile, and supporting portal fixes

Core intent of this work:

- remove runtime/interaction failures uncovered during the session
- strengthen adjacent portal surfaces touched by the dashboard and outbound work

Key implementation changes:

- Fixed a runtime reference-order issue in `src/app/portal/billing/PortalBillingClient.tsx` by hoisting `setupHrefForService`.
- Updated `src/app/portal/profile/BusinessProfileForm.tsx`.
- Updated `src/app/portal/app/services/reviews/setup/PortalReviewsClient.tsx`.
- Updated `src/app/api/portal/engagement/active-time/route.ts`, `src/lib/portalActiveTime.client.ts`, and `src/app/api/portal/media/stats/route.ts`.
- Updated `src/app/(auth)/login/PortalLoginClient.tsx`.

Net effect:

- the portal is less brittle in a few runtime-sensitive areas that surfaced during iterative testing

## Exact changed files

### Modified files

- `src/app/(auth)/login/PortalLoginClient.tsx`
- `src/app/[siteSlug]/blogs/[postSlug]/page.tsx`
- `src/app/api/portal/ai-outbound-calls/campaigns/[campaignId]/generate-agent-config/route.ts`
- `src/app/api/portal/ai-outbound-calls/campaigns/[campaignId]/preview-message-reply/route.ts`
- `src/app/api/portal/ai-outbound-calls/campaigns/[campaignId]/sync-agent/route.ts`
- `src/app/api/portal/ai-outbound-calls/campaigns/[campaignId]/sync-chat-agent/route.ts`
- `src/app/api/portal/ai-outbound-calls/cron/route.ts`
- `src/app/api/portal/engagement/active-time/route.ts`
- `src/app/api/portal/media/stats/route.ts`
- `src/app/blogs/[slug]/page.tsx`
- `src/app/domain-router/[domain]/blogs/[postSlug]/page.tsx`
- `src/app/globals.css`
- `src/app/portal/PortalDashboardClient.tsx`
- `src/app/portal/PortalFloatingTools.tsx`
- `src/app/portal/PortalServiceSidebarIcons.tsx`
- `src/app/portal/PortalShell.tsx`
- `src/app/portal/PortalThemeClient.tsx`
- `src/app/portal/app/page.tsx`
- `src/app/portal/app/services/ai-outbound-calls/PortalAiOutboundCallsClient.tsx`
- `src/app/portal/app/services/blogs/PortalBlogsClient.tsx`
- `src/app/portal/app/services/blogs/[postId]/PortalBlogPostClient.tsx`
- `src/app/portal/app/services/reviews/setup/PortalReviewsClient.tsx`
- `src/app/portal/billing/PortalBillingClient.tsx`
- `src/app/portal/profile/BusinessProfileForm.tsx`
- `src/lib/blog.ts`
- `src/lib/elevenLabsConvai.ts`
- `src/lib/portalActiveTime.client.ts`
- `src/lib/portalAgentActionExecutor.ts`
- `src/lib/portalDashboard.ts`

### Added files

- `src/lib/portalAiOutboundIntelligence.ts`
- `src/lib/portalBlogsPreview.client.ts`
- `src/lib/portalDashboardLayout.ts`
- `src/lib/portalUiPreview.client.ts`

## Runtime and regression fixes applied during the session

These were not just broad feature changes; they also included targeted corrections found while iterating:

- Fixed React hook-order violation in `src/app/portal/PortalDashboardClient.tsx`.
- Fixed blog editor sidebar snap-back caused by force-collapsed override behavior in `src/app/portal/PortalShell.tsx`.
- Fixed billing runtime reference issue at `setupHrefForService` in `src/app/portal/billing/PortalBillingClient.tsx`.

## Recommended agent prompt for branch-aware merge analysis

Use this prompt if you want another agent to review, conceptualize, or merge this branch properly against a different branch:

```text
You are reviewing and merging work from the branch `dev-retro` against a target branch that may have diverged from commit `6d9398d3452a2925d8539e5df389d2be59729d44`.

Your job is to analyze the changes conceptually first, not just mechanically.

Requirements:
1. Treat `6d9398d3452a2925d8539e5df389d2be59729d44` as the baseline snapshot that originally entered the environment.
2. Treat `dev-retro` head as the full set of session-produced changes.
3. Compare the branches in terms of product intent, architecture changes, UX changes, runtime fixes, and new shared abstractions.
4. Identify which changes are foundational/shared infrastructure versus route-specific or UI-only adjustments.
5. Call out any merge risks where target-branch work might conflict semantically even if files merge cleanly.
6. Preserve branch separation discipline:
   - do not flatten or overwrite target-branch logic blindly
   - do not assume the latest edit is automatically correct
   - reason about intent and choose the right merge outcome file by file
7. Produce:
   - a high-level summary of what `dev-retro` changes
   - a grouped file inventory by subsystem
   - likely semantic conflicts
   - recommended merge order
   - any post-merge validation checklist

Important focus areas in `dev-retro`:
- outbound AI intelligence and prompt/runtime alignment
- dashboard layout/default widget behavior
- portal shell/sidebar/scroll behavior
- blogs preview/editor behavior
- runtime bug fixes in billing and dashboard

Do not just say "merge succeeded". Explain what the branch is trying to accomplish and how to merge it without losing intent.
```

## Suggested validation after merge

- Re-run `npx tsc --noEmit`
- Open dashboard with sidebar expanded and collapsed
- Open a blog post editor and verify sidebar lock behavior is stable
- Verify outbound config generation, preview reply, and cron behavior still align
- Verify billing service overview no longer hits the `setupHrefForService` reference-order runtime failure
