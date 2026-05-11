# Funnel Builder Tracking And Analytics Checklist

Date: 2026-05-08

This document is the working checklist for hosted funnel tracking, funnel analytics, and friction visibility. It is not a hype document. Nothing gets marked complete unless the event path or funnel readout actually exists.

## Operating model

- Hosted funnels should emit raw first-party events.
- Builder analytics surfaces should expose the useful summaries, not raw event dumps.
- Customer-facing hosted surfaces should stay visually clean.
- The first-party event table stays the source of truth for funnel behavior.
- Replay, heatmaps, and error monitoring are supplements, not replacements for the first-party model.

## Landed in this pass

- [x] Confirmed the existing first-party funnel event model and public ingestion path.
- [x] Confirmed page views, form submits, bookings, checkout starts, and add-to-cart events were already wired before this pass.
- [x] Added hosted CTA click tracking for rendered funnel pages.
- [x] Added hosted CTA click tracking for custom-HTML funnel pages.
- [x] Added a dedicated authenticated analytics route for funnel-level admin summaries.
- [x] Exposed tracked-session totals, event totals, page-level rates, and friction highlights in the builder Tracking panel.
- [x] Kept hosted/public funnel surfaces visually clean while adding funnel analytics to builder/admin views.

## Implementation checklist

### Event collection

- [x] Hosted page views are tracked.
- [x] Hosted CTA clicks are tracked on rendered block/markdown funnels.
- [x] Hosted CTA clicks are tracked on custom-HTML funnels.
- [x] Form submissions are tracked.
- [x] Booking creations are tracked.
- [x] Checkout starts are tracked.
- [x] Add-to-cart actions are tracked.
- [x] Form starts are tracked.
- [x] Validation failures are tracked.
- [x] Checkout failures are tracked.
- [x] Builder save failures are tracked.
- [x] Builder publish failures are tracked.

### Admin analytics

- [x] The portal has an authenticated funnel analytics endpoint.
- [x] The analytics endpoint returns a bounded time window instead of raw all-time dumps.
- [x] The analytics endpoint returns per-page totals.
- [x] The analytics endpoint returns simple rates for CTA, lead, and checkout progression.
- [x] The analytics endpoint returns friction highlights instead of only raw counts.
- [x] The builder Tracking panel surfaces the analytics summary.
- [ ] The builder has a dedicated analytics tab or screen for deeper analysis.
- [ ] Operators can switch time windows without editing the URL manually.
- [ ] Trend views exist for week-over-week or release-over-release comparisons.

### Funnel observability and debugging

- [ ] Client runtime errors are captured in a real error-monitoring tool.
- [ ] Replay or heatmap tooling exists for "show me where they got stuck" debugging.
- [ ] Slow or failing funnel endpoints are summarized in an operator-facing surface.
- [ ] Regression alerting exists for sudden drops in CTA rate or lead rate.

## Design decisions locked in

1. Raw event collection lives on the hosted/public side.
2. Interpretation and reporting for funnel behavior live on builder/admin analytics surfaces.
3. The default operator UI should answer clear questions: where traffic lands, where it clicks, where it drops, and where it converts.
4. The operator UI should not require reading raw rows from the event table to understand funnel health.
5. Customer-facing funnels stay clean while builder/admin views handle funnel reporting.

## Current implementation anchors

- Shared event model and analytics helpers: `src/lib/funnelEventTracking.ts`
- Public event ingestion route: `src/app/api/public/funnel-builder/events/route.ts`
- Hosted tracker for rendered funnels: `src/components/funnel/HostedFunnelTracker.tsx`
- Custom-HTML hosted runtime injection: `src/app/f/[slug]/[key]/page.tsx`
- Shared hosted route renderer: `src/app/f/[slug]/[key]/hostedFunnelRoute.tsx`
- Admin analytics route: `src/app/api/portal/funnel-builder/funnels/[funnelId]/analytics/route.ts`
- Builder failure event route: `src/app/api/portal/funnel-builder/funnels/[funnelId]/events/route.ts`
- Builder Tracking panel summary: `src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx`

## Validation status

- [x] File-level validation passed for the new analytics helper changes.
- [x] File-level validation passed for the new admin analytics route.
- [x] File-level validation passed for the hosted tracker and hosted runtime tracking changes.
- [ ] Live browser verification of the analytics route completed end-to-end.

Notes:

- The live browser fetch check was blocked by local dev-server instability during this pass, so it stays unchecked until the active local server responds consistently again.
- The giant funnel editor file still has many pre-existing warnings unrelated to this checklist item. They were not introduced by the tracking changes.
- A boundary grep confirmed no admin/operator diagnostics UI landed in hosted/public funnel surfaces during this pass.

## Next iteration order

1. Expand the funnel analytics readout from summary widgets into a deeper analytics view with time filters and trend lines.
2. Layer in replay and error monitoring after the first-party event model and funnel event taxonomy cover the critical failure paths.
3. Add regression alerting once the event taxonomy stabilizes enough to trust threshold-based warnings.