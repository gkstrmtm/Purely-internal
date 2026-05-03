# Funnel Builder 10/10 Audit - 2026-04-24

## Scope

This pass was run as a live system audit, not a speculative review. The goal was to exercise the current funnel-builder flow end to end, identify confirmed gaps, and separate real product defects from stale scripts or local environment noise.

## Checkpoint After Implementation Pass

After the initial audit, a follow-up implementation pass closed several immediate trust gaps:

- The funnel editor no longer performs unconditional AI receptionist and booking settings fetches on initial load. The prior authenticated `403` noise from those endpoints was eliminated for the audited editor load path.
- `npm run lint` now completes with warnings only; the failing dash-check and error-level lint issues were cleared.
- `npx tsc --noEmit` passes.
- `npm run build` now gets through the Windows Prisma engine rename lock case in [scripts/prisma-prebuild.mjs](scripts/prisma-prebuild.mjs) and completes the production build instead of stopping in prebuild.

That means the repo moved from "testable but with broken gates" to a much stronger checkpoint: editor load is cleaner, lint is non-blocking, typecheck passes, and production build completes in the current local environment.

## What I Ran

- `npx tsc --noEmit`
- `npm run pura:intent-smoke`
- `node tmp/probe_funnel_auth.mjs admin@purelyautomation.dev admin1234`
- `node tmp/validate_booking_system.cjs`
- `node tmp/inspect_funnel_builder_ui.cjs`
- live authenticated API create flow with a unique slug
- `npm run build`
- `npm run lint`
- workspace diagnostics via VS Code Problems

## Confirmed Working

- TypeScript typecheck passed.
- Intent smoke passed `8/8`.
- A fresh funnel can be created through the live API with a unique slug, and it starts with one page in `BLOCKS` mode.
- A fresh page can go through `generate-html` successfully and returns `draftHtml`.
- The visual-review route also returned `200` on that generated page.
- The authenticated funnel editor loaded without client-side exceptions in the Playwright probe.
- The new synced reviews path is wired through the shared block runtime, public review feed, builder controls, and AI insert guidance.

## Confirmed Gaps

### P0: Shipping and trust blockers

- The current full-audit task inventory is stale. The workspace task `Audit: full Pura suite` points at `tmp/portal-qa/capture_pura_audit.mjs`, but that file no longer exists. This means the repo advertises a whole-system audit command that cannot run.
- Production build reproducibility is currently weak on Windows. `npm run build` failed during the prebuild generate step in [scripts/prisma-prebuild.mjs](scripts/prisma-prebuild.mjs) because Prisma could not rename its Windows query engine DLL while the workspace was active. That is not a product bug in the funnel itself, but it is a release blocker because it makes build success depend on local process state.
- The lint gate is red. `npm run lint` failed because [scripts/check-no-em-dash.mjs](scripts/check-no-em-dash.mjs) found forbidden dash characters in active source files, including [src/app/api/portal/funnel-builder/funnels/[funnelId]/pages/[pageId]/generate-html/route.ts](src/app/api/portal/funnel-builder/funnels/[funnelId]/pages/[pageId]/generate-html/route.ts), [src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx](src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx), and [src/lib/funnelPromptSynthesizer.ts](src/lib/funnelPromptSynthesizer.ts).
- Plain terminal Prisma probes are not dependable right now. A direct Prisma script failed because `DATABASE_URL` was not present in that shell, even though the running app worked. That makes backend verification brittle outside the app runtime.
- Prisma workspace diagnostics are already warning that [prisma/schema.prisma](prisma/schema.prisma#L7) still uses a datasource `url` pattern that Prisma is treating as no longer supported for future config flow. That is a forward-compatibility risk, not an immediate user-facing failure.

### P1: Funnel-builder product-system gaps

- Whole-page generation still does not know how to emit the new structured proof and pricing blocks directly. No support was found for `syncedReviews`, `testimonialGrid`, or `pricingGrid` in [src/app/api/portal/funnel-builder/funnels/[funnelId]/pages/[pageId]/generate-html/route.ts](src/app/api/portal/funnel-builder/funnels/[funnelId]/pages/[pageId]/generate-html/route.ts). Right now those blocks are better integrated into block/runtime/custom-code flows than the whole-page generator.
- Builder editing parity is incomplete. `syncedReviews` has a palette entry and inspector controls in [src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx](src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx), but the same manual editing surface was not found for `testimonialGrid` or `pricingGrid`.
- The generator still needs stronger design-quality enforcement. A successful whole-page generation plus visual-review pass still returned three warnings, with the first one calling out weak CTA differentiation. That means the current quality loop can produce acceptable pages, but it is not yet consistently pushing them to a premium, obvious-conversion standard.
- The funnel editor is loading unrelated service endpoints during edit sessions. The authenticated editor triggered `403` responses from `/api/portal/ai-receptionist/settings`, `/api/portal/booking/settings`, and `/api/portal/booking/calendars`. The call sites are in [src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx#L6930](src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx#L6930) and [src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx#L8313-L8314](src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx#L8313). Even if those requests are non-fatal, they add permission noise and make the editor feel coupled to services the user may not have enabled.
- The editor audit capture surfaced no semantic headings in the loaded document, which is a weak accessibility and information-architecture signal for the current shell. That is not enough evidence to call the page broken, but it is enough to keep accessibility and semantic structure on the quality backlog.

### P2: Tooling and workflow gaps

- The current audit and repro scripts are fragmented across `tmp/` and some older task entries no longer map to live files. The repo needs one maintained, documented audit entry point instead of a mix of stale tasks and one-off probes.
- PowerShell automation still trips parsing prompts unless `-UseBasicParsing` is applied consistently. That makes scripted verification less deterministic than it should be on Windows.
- The funnel create probe in [tmp/probe_funnel_auth.mjs](tmp/probe_funnel_auth.mjs) uses a fixed slug (`test-probe`), so it reports a slug collision instead of the real create-path health unless the script is edited or wrapped.

## What This Means Right Now

- The system is beyond planning. It can create funnels, generate pages, review them, and load the editor without crashing.
- The system is not yet at a trustworthy 10/10 bar because the build and lint gates are not clean, the whole-page generator is behind the structured block system, and the editor still does extra unauthorized service fetching.
- The current state is good enough for active product testing, but not good enough for "trust the whole pipeline without supervision."

## 10/10 Definition

This repo should only be called a 10/10 funnel-builder system when all of the following are true:

- A new funnel can be created, generated, edited, previewed, published, and revisited without hidden state drift or manual repair.
- Whole-page AI generation and block-mode editing share the same proof, pricing, booking, and review primitives.
- Build, lint, and typecheck are green on a clean machine without process-order tricks.
- The editor only requests services that are relevant to the active page and user permissions.
- The audit harness is one command, not a scavenger hunt.
- Visual review warnings are either fixed automatically or surfaced as explicit blockers before the page is treated as done.

## Shortest Path To 10/10

### Phase 1: Restore engineering trust

- Replace or remove stale audit tasks so the advertised QA commands point to live files.
- Make the Windows build path deterministic around Prisma generate. The likely fixes are to avoid redundant client regeneration when the generated client is already current, or to ensure the build path does not fight with a running dev server for the same engine DLL.
- Clear the forbidden-dash lint failures in active source files and keep [scripts/check-no-em-dash.mjs](scripts/check-no-em-dash.mjs) as an enforced gate.
- Normalize terminal-side Prisma verification so backend probes can run with the same environment assumptions as the app.

### Phase 2: Close funnel generation parity

- Teach [src/app/api/portal/funnel-builder/funnels/[funnelId]/pages/[pageId]/generate-html/route.ts](src/app/api/portal/funnel-builder/funnels/[funnelId]/pages/[pageId]/generate-html/route.ts) to emit `syncedReviews`, `testimonialGrid`, and `pricingGrid` directly.
- Add builder inspector support for `testimonialGrid` and `pricingGrid` to match the new `syncedReviews` controls.
- Remove or gate unrelated endpoint fetching in [src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx](src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx) so the editor stops producing avoidable `403`s.

### Phase 3: Raise the page-quality floor

- Strengthen the visual-review response loop so repeated warnings like weak CTA hierarchy become enforced fixes or explicit retry conditions.
- Add semantic structure and accessibility checks to the page-quality audit, especially heading presence, CTA labeling, and source/preview parity.
- Add a deterministic end-to-end regression that creates a unique funnel, runs generation, loads the editor, captures network failures, and verifies publishable output.

## Recommended Next Pass

If the goal is to move the system measurably closer to 10/10 in the next implementation pass, the best order is:

1. Fix build and lint hygiene.
2. Remove the unauthorized cross-service fetches from the funnel editor.
3. Add whole-page generator support for `syncedReviews`, `testimonialGrid`, and `pricingGrid`.
4. Add builder inspector parity for the proof and pricing blocks.
5. Replace the stale audit task with one maintained end-to-end script.

That sequence gives the biggest trust increase fastest: green gates first, then lower-noise editing, then actual generation parity.