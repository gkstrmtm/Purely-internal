# dev-retro assessment - 2026-05-14

## Vercel deployment control

Repo-side fix applied:
- `vercel.json` now uses `git.deploymentEnabled` with `"*": false` and `"main": true`
- `mobile-app/vercel.json` now uses the same main-only deployment rule
- The old `ignoreCommand` only skipped `dev-retro`; it did not stop other non-main branches from auto-deploying

Important note:
- This repo-side change is the right file-based enforcement for auto-deploy behavior
- In Vercel project settings, the Production Branch should still be confirmed as `main` for each connected project

## Branch status

Local branch fetched:
- `dev-retro`

Relative to `main`:
- 12 commits ahead
- 592 files changed
- 78,964 insertions
- 178,377 deletions

Recent commit themes:
- `88220cd1` Validate portal auth access flows
- `85ebc55c` Polish portal service flows and add journey smoke coverage
- `ffa79b60` Polish business profile setup flow
- `ce62a480` Stabilize funnel builder beta readiness
- `0929aa2e` Checkpoint retro funnel builder shell and runtime handoff
- `ee71cff5` Checkpoint funnel builder and booking integration work
- `ae6e347e` Add funnel foundation, tracking, and design advisory groundwork
- `31249830` Fix funnel editor layout conversion flow
- `0a0306d3` Add funnel editor retro note
- `ab58c11f` Refactor funnel editor draft and preview flows
- `33bf5335` Add baseline-to-branch comparison report
- `37ea3b45` Polish portal behavior and dashboard defaults

## What dev-retro is mainly doing

### 1. Funnel builder becomes the branch center of gravity

This is the biggest part of the branch by far.

High-signal areas:
- 26 changed files under `src/app/api/portal/funnel-builder/**`
- 6 changed files under `src/app/portal/app/services/funnel-builder/**`
- 35 changed files under `src/lib/funnel*`
- new `funnel-stencils/` library with booking, lead-capture, multi-step, sales, tripwire, and webinar templates
- new funnel foundation, graph, mutation, prompt, publish-audit, tracking, and archetype libraries
- large rewrite of `src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx`

Net:
- this is not a small feature branch
- it is a major architectural branch for funnels
- merging it whole would be a product-track decision, not a routine code sync

### 2. Portal shell and dashboard polish

High-value areas:
- `src/app/portal/PortalShell.tsx`
- `src/app/portal/PortalDashboardClient.tsx`
- `src/app/portal/PortalFloatingTools.tsx`
- `src/lib/portalDashboard.ts`
- `src/lib/portalDashboardLayout.ts`
- supporting CSS and topbar/theme changes

Intent:
- less empty dashboard defaults
- calmer sidebar behavior
- better use of space when collapsed
- fewer jittery interactions

This looks like one of the better cherry-pick candidates because it is product-visible and conceptually separable from the giant funnel rewrite.

### 3. Booking integrations and business-profile pathing

Promising additions:
- `src/app/api/portal/booking/integrations/[provider]/callback/route.ts`
- `src/app/api/portal/booking/integrations/[provider]/connect/route.ts`
- `src/app/api/portal/booking/integrations/[provider]/route.ts`
- `src/lib/bookingMeetingIntegrations.server.ts`
- `src/lib/bookingMeetingIntegrations.shared.ts`
- `src/lib/businessProfilePath.ts`
- `src/lib/businessProfileContextHealth.ts`
- `src/lib/businessProfileRuntimeSnapshot.ts`
- `src/lib/businessProfileTemplateVars.ts`

Intent:
- stronger booking integration structure
- better business-profile-driven routing and context health
- more reusable profile-path infrastructure

This is another good candidate area for selective adoption.

### 4. AI outbound intelligence and service polish

Promising but needs careful merge review:
- `src/lib/portalAiOutboundIntelligence.ts`
- `src/app/portal/app/services/ai-outbound-calls/PortalAiOutboundCallsClient.tsx`
- several `src/app/api/portal/ai-outbound-calls/**` routes
- `src/lib/elevenLabsConvai.ts`

Intent:
- make outbound generation less prompt-fragile
- reuse profile and campaign context better
- improve preview and production alignment

This has value, but it overlaps live AI behavior and service runtime logic, so it should be merged after isolating current-main changes first.

## Best candidates to bring into main

### Strongest candidates

1. Portal shell and dashboard polish
- high user-visible value
- likely mergeable in a focused pass
- smaller semantic blast radius than funnel-builder core

2. Booking integration foundation
- clear infrastructure value
- adds new capability instead of only reskinning behavior
- aligns with existing portal feature patterns

3. Business-profile path/context helpers
- foundational and reusable
- likely valuable across onboarding, portal flows, and AI context building

4. Small runtime fixes from the branch
- billing/runtime fixes
- blog editor/sidebar lock fixes
- auth/access validations
- targeted service-flow polish

### Maybe worth bringing later

5. AI outbound intelligence changes
- useful ideas and likely some real improvements
- should be merged in a dedicated review because current main has moved on in other AI surfaces

## What will conflict hard

### 1. Pura and AI chat

This is the most obvious semantic collision.

`dev-retro` changes or removes:
- `src/app/api/portal/ai-chat/threads/[threadId]/messages/route.ts`
- `src/lib/portalAgentActionExecutor.ts`
- `src/lib/portalAiChatSchema.ts`
- `src/lib/portalAiChatScheduled.ts`
- `src/lib/puraDirectIntentPlans.ts`
- `src/lib/puraDirectIntentSignals.ts`
- `src/lib/puraPlanner.ts`
- deletes `src/lib/puraReplyQuality.ts`
- deletes `docs/pura-ai-only-guardrail.md`

Why this is risky:
- current main already has newer Pura hardening and guardrail-sensitive work
- deleting `puraReplyQuality.ts` would remove the quality cleanup/rejection layer
- deleting `docs/pura-ai-only-guardrail.md` conflicts with the current repo rule that this doc must be followed before changing Pura behavior
- the diff stats show more deletion than improvement in this area, which strongly suggests `dev-retro` contains an older or alternate Pura line, not the newest safe state

Recommendation:
- do not merge the Pura files wholesale from `dev-retro`
- if any ideas are useful, port them manually and preserve current main guardrails and cleanup layers

### 2. Funnel builder core

Why this is risky:
- enormous surface area
- schema changes plus route changes plus giant client/editor rewrites
- very likely to conflict semantically with recent funnel fixes already made on main
- likely impossible to trust via naive merge resolution

Recommendation:
- treat funnel-builder adoption as a dedicated project
- review and port by subsystem, not by branch merge

### 3. Hosted-pages removals

`dev-retro` deletes multiple hosted-pages document routes and libraries:
- `src/app/api/portal/hosted-pages/documents/**`
- `src/lib/hostedPageDocuments.ts`
- `src/lib/hostedPageGeneration.ts`
- `src/lib/hostedPageKeys.ts`
- `src/lib/hostedPageRuntime.tsx`
- `src/lib/hostedPageTemplateIntents.ts`

Recommendation:
- do not accept these deletions blindly
- they may reflect a branch-local consolidation attempt, but on current main they are a high regression risk

### 4. Misc branch hygiene problems

The branch also carries obvious junk or stale artifacts:
- deletes/changes odd workspace artifacts like `chattranscriptfile`
- includes generated notes and one-off docs not suitable for direct production merge
- includes deletions of unrelated tutorial/page-editor files that need case-by-case review

Recommendation:
- keep merge scope disciplined
- ignore branch noise and one-off artifacts unless they are intentionally needed

## Recommended merge order

### Safe order

1. Cherry-pick the Vercel deploy restriction separately
- already done in current working tree

2. Review and port portal shell/dashboard polish
- `PortalShell`
- `PortalDashboardClient`
- `PortalFloatingTools`
- `portalDashboard*`
- CSS/supporting stage-width work

3. Review and port booking integration infrastructure
- booking integration routes
- booking meeting integration libraries
- business-profile path/context helpers

4. Review targeted runtime fixes
- billing runtime issue
- auth/access polish
- blog/sidebar lock behavior
- localized portal service fixes

5. Review AI outbound intelligence in a dedicated pass
- keep this separate from Pura
- compare branch logic against current main behavior before moving any prompts or runtime decisions

6. Treat funnel builder as its own migration project
- do not merge whole `dev-retro`
- inventory and port only the desired funnel-builder foundations deliberately

7. Do not import the Pura deletions or guardrail removals
- preserve current main Pura files unless a specific manual port is justified

## My recommendation

Do not merge `dev-retro` wholesale.

Instead:
- keep the Vercel main-only deploy fix
- selectively port shell/dashboard polish
- selectively port booking integration and business-profile infrastructure
- selectively port any clearly isolated runtime fixes
- review outbound intelligence carefully
- leave Pura and giant funnel-builder rewrites out of a direct merge

## Post-port validation checklist

After any selective merge from `dev-retro`:
- run `npx tsc --noEmit`
- run `npm run build`
- verify portal shell collapse/expand behavior
- verify dashboard width and widget defaults
- verify booking integration connect/callback flows
- verify auth/login still works across portal and credit variants
- re-run the targeted Pura QA prompts to ensure no regression in current hardening
- verify hosted-pages and funnel routes still behave on current main
