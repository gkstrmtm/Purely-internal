# Codex Startup Beta Cleanup - 2026-08-18

## Purpose

Use this file as the startup handoff for a new Codex agent on another device.

The goal is not to re-explore the repo from scratch. The goal is to continue from the current Funnel Builder and Stripe readiness state, then move into the next beta cleanup items in priority order.

## Current product call

Funnel Builder is strong enough to stop treating it as the main beta blocker for the moment.

That does not mean it is complete.

It means the biggest current risks are now operational follow-through and setup truth, not the core builder concept.

## What changed in this slice

### Funnel Builder starter quality

- Fresh-start funnels now provision more functional first-run scaffolds instead of weak placeholder-only starts.
- Relevant starts can now create real starter forms and linked booking routes during funnel creation.
- Assistant-first and source-first framing was preserved as the intended product model.

Primary files:

- `src/app/api/portal/funnel-builder/funnels/route.ts`
- `src/lib/funnelStencilRegistry.server.ts`

### Stripe readiness

- Stripe checkout already existed.
- A verified inbound Stripe webhook path was added so the app can now accept Stripe webhook payloads.
- Owner-scoped encrypted Stripe webhook signing secret support was added.
- Funnel analytics now track `checkout_completed` in addition to checkout start/failure.
- Profile and funnel-builder setup surfaces now show the webhook endpoint and whether webhook signing setup is still missing.

Primary files:

- `src/app/api/public/stripe/webhook/route.ts`
- `src/app/api/public/funnel-builder/checkout-session/route.ts`
- `src/lib/stripeIntegration.server.ts`
- `src/app/api/portal/integrations/stripe/route.ts`
- `src/app/api/portal/integrations/sales-reporting/route.ts`
- `src/lib/salesReportingIntegration.server.ts`
- `src/lib/salesReportingReport.server.ts`
- `src/lib/funnelEventTracking.ts`
- `src/lib/funnelEventTracking.shared.ts`
- `src/app/api/portal/funnel-builder/funnels/[funnelId]/analytics/route.ts`
- `src/app/portal/profile/PortalProfileClient.tsx`
- `src/app/portal/app/services/funnel-builder/FunnelBuilderClient.tsx`
- `src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx`

## What is still open

Work these in this order unless product direction changes:

1. Auth/session bounce across portal and credit tabs.
2. Stripe final QA: save webhook signing secret, send a real test event, confirm `checkout_completed` lands in analytics.
3. Sales/tripwire starts: ensure real Stripe products/prices are attached, not only checkout-capable shells.
4. Error truthfulness: preserve backend `422` and structured failures instead of flattening them into generic UI errors.
5. Assistant-first path QA: re-run source import, bring-your-own-page, and fresh-start assistant flows end to end.
6. Publish/live sanity: final pass on domain assignment, live links, and publish state truth.
7. Credit-side polish after auth cleanup.

## Important current caveats

- The visible shared `/portal/login` tab was unauthenticated during the last pass.
- A separate shared funnel editor tab still had a loaded builder surface, so this did not look like a total platform auth failure.
- Auth/session behavior was not fixed in this slice.
- Stripe webhook support is now in code, but the account still needs the Stripe webhook endpoint created and the signing secret saved in-app before that flow is truly complete.

## Validation already completed

- File-scoped diagnostics were clean for the touched Stripe and funnel files.
- ESLint passed on the touched Stripe and funnel files.

Command used:

- `npx eslint "src/app/api/public/stripe/webhook/route.ts" "src/app/api/portal/integrations/stripe/route.ts" "src/app/api/portal/integrations/sales-reporting/route.ts" "src/lib/stripeIntegration.server.ts" "src/lib/salesReportingIntegration.server.ts" "src/lib/salesReportingReport.server.ts" "src/app/portal/profile/PortalProfileClient.tsx" "src/app/portal/app/services/funnel-builder/FunnelBuilderClient.tsx"`

## How the next Codex agent should start

Start narrow.

Do not reopen broad Funnel Builder redesign work.

Assume the current objective is beta cleanup and operational truth, not new product invention.

### Suggested startup prompt

Use this framing:

> Continue from `docs/codex-startup-beta-cleanup-2026-08-18.md`.
> Funnel Builder is no longer the main beta blocker, but it still has cleanup work.
> Work the open items in priority order, starting with auth/session bounce and Stripe webhook completion QA.
> Preserve assistant-first and source-first product behavior.
> Avoid broad redesign unless a local validation proves the current path is wrong.

## Bottom line

The repo is now at a point where Funnel Builder can pause as the main emergency surface.

The next Codex pass should focus on cleanup, setup completion, and flow truth, not rebuilding the funnel system again.