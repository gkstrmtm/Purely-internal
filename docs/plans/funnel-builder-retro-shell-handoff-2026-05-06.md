# Funnel Builder Retro Shell Handoff - 2026-05-06

Branch: `dev-retro`

## Scope

This pass moved the funnel builder closer to one coherent product instead of a loose set of disconnected builder, source, booking, and hosted-runtime behaviors.

The work in this branch clusters into five tracks:

- funnel editor shell redesign and workflow truth
- booking runtime integration and hosted-theme routing
- offer binding and commerce-path cleanup
- business profile context quality and prompt specificity
- thread normalization, targeted apply behavior, and agent/runtime guardrails

## What changed

### 1. Funnel editor shell and workflow truth

The editor shell was reworked so the page surface, source surface, assistant rail, and save/publish model read like one system.

Key changes:

- `FunnelEditorClient.tsx` now carries a heavier editor-shell redesign: calmer canvas framing, narrower preview toggles, a stronger assistant rail, explicit `Ask` vs `Apply` language, selected-target context, assistant diagnostic context, and clearer draft/live workflow labels.
- `funnelEditorPageWorkflow.ts` now treats block edits and source edits as draft work first. Save no longer implies live truth, and the live-link copy now reflects whether draft is newer than published.
- `funnelPageGraph.ts` now treats pages with structured blocks inside `CUSTOM_HTML` mode as managed structure instead of blindly assuming pure custom HTML.
- `funnelPageState.ts` added `isFunnelPageDraftNewerThanLive` so the editor can distinguish `saved draft` from `live matches draft`.
- `FunnelBuilderClient.tsx` now uses runtime-aware hosted URLs locally, and the create-funnel flow language was rewritten around `Guided scaffold` vs `Custom draft` instead of vague AI wording.

Why it mattered:

- the editor was previously overstating live truth
- the shell language was drifting between old builder vocabulary and the current draft/publish model
- preview/source/assistant needed to feel like one page-state system

### 2. Booking runtime moved from iframe thinking to native funnel shell thinking

This branch replaced several detached booking iframe assumptions with a reusable booking runtime surface that can live inside funnel HTML, block rendering, hosted pages, and booking routes.

Key changes:

- added `src/components/funnel/FunnelCustomHtmlRuntimeSurface.tsx` to mount booking runtime placeholders inside custom HTML while preserving page-shell control
- added `src/lib/funnelBookingSurface.ts` for booking shell posture, slot context, and booking runtime placeholder generation
- added `src/lib/funnelBookingTheme.ts` and `src/lib/funnelBookingRuntimeTheme.ts` for deriving funnel-owned booking themes and neutral runtime styling
- updated hosted funnel routes and public/domain render routes to use `FunnelCustomHtmlRuntimeSurface` instead of raw iframes when rendering HTML funnels
- updated `creditFunnelBlocks.ts` and `funnelBlocksToCustomHtmlDocument.ts` so calendar blocks and exported HTML generate native booking runtime placeholders instead of generic embedded iframes
- updated public booking settings routes so funnel-driven theme and funnel-specific booking context can override account-level booking theme when a funnel/page asks for it
- updated generated booking-page HTML fallback in `generate-html/route.ts` so the booking section has one dominant scheduler posture and a clearer shell/runtime split

Why it mattered:

- booking needed to behave like part of the funnel shell, not a separate detached product
- runtime theme and routing needed to stay attached to the funnel/page context
- booking pages were duplicating scheduler surfaces too easily and drifting into weak fallback patterns

### 3. Offer binding and commerce-path cleanup

This pass introduced funnel offers as a reusable source of truth instead of relying only on raw Stripe price ids scattered across blocks.

Key changes:

- added `src/lib/funnelOffers.ts`
- funnel route settings now read, write, and delete `offers`
- checkout session validation now resolves allowed price ids from both direct blocks and funnel offers
- pricing cards, checkout buttons, and add-to-cart buttons can now bind to `offerId`
- pricing grid rendering and editor copy now distinguish `checkout` behavior from plain link behavior
- the builder UI started shifting from raw Stripe-product wiring toward `create product and offer`, `bind offer`, and `package cards`

Why it mattered:

- the commerce path needed a page-level source of truth that survives editor, hosted runtime, and checkout validation
- raw `priceId` fields alone were too brittle for the builder shell the branch is moving toward

### 4. Business profile context health and prompt specificity

This branch made company context more explicit both to the user and to the AI system.

Key changes:

- added `businessProfileContextHealth.ts` and `businessProfileTemplateVars.ts`
- business profile UI now shows a `Company context health` score with smallest-next-step guidance
- `businessProfileAiContext.server.ts` now exposes context-health signals and uses shared template-var derivation
- `funnelPromptSynthesizer.ts` now detects thin business context, can return a clarifying question instead of pretending it has enough specificity, and down-ranks Exhibit to secondary design advisory
- custom-code generation and funnel page generation routes now surface clarifying questions directly when the prompt lacks enough business specificity

Why it mattered:

- prompt quality was too dependent on the user over-specifying every pass
- the system needed to know when to ask one sharp question instead of generating generic work

### 5. Thread stability, targeted apply behavior, and agent guardrails

This branch tightened thread storage, selected-target behavior, booking-runtime reasoning, and deterministic apply execution.

Key changes:

- `funnelThreads.ts` now normalizes thread records, truncates oversize message content, and narrows stored context so long threads stop becoming unstable junk drawers
- `pages/[pageId]/route.ts` and `pages/route.ts` now normalize stored `customChatJson` on write and read
- `pages/[pageId]/chat/route.ts` gained stronger observed-structure vetting, booking runtime slot observation, selected-target coercion, strict local-target reply planning, and assistant-context formatting
- `funnelSourceActionMutationDeriver.ts` now supports direct headline rewrite extraction and explicitly treats `top page headline` style requests as first-section work
- `FunnelEditorClient.tsx` now passes an explicit `sourceActionPlan` through `Apply this pass`, so a clicked plan can enter the deterministic mutation branch instead of falling back to a generic structural prompt
- `AiReceptionistWidget.tsx` now stays hidden inside funnel-builder paths

Why it mattered:

- `Apply this pass` was not trustworthy when the plan object got dropped on the way into draft application
- assistant scope needed to stay local when the user had selected an exact card, heading, CTA, or block
- stored thread state needed to be bounded and normalized before it became another source of prompt drift

## Most important files

If another developer or agent pulls this branch and needs the core surfaces first, start here:

- `src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx`
- `src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/funnelEditorPageWorkflow.ts`
- `src/app/api/portal/funnel-builder/funnels/[funnelId]/pages/[pageId]/chat/route.ts`
- `src/app/api/portal/funnel-builder/funnels/[funnelId]/pages/[pageId]/generate-html/route.ts`
- `src/components/funnel/FunnelCustomHtmlRuntimeSurface.tsx`
- `src/lib/creditFunnelBlocks.ts`
- `src/lib/funnelBookingSurface.ts`
- `src/lib/funnelOffers.ts`
- `src/lib/funnelPromptSynthesizer.ts`

## Agent continuation rules

If an agent continues from this branch, it should preserve these rules:

- Treat the funnel page shell and the booking runtime as separate layers. The shell owns framing, proof, CTA rhythm, slot posture, and reassurance. The runtime owns scheduler mechanics.
- On standard booking pages, default to one dominant scheduler. A later fallback beat should usually be objection-handling plus a quieter return-to-booking CTA, not a second full calendar.
- Treat offers as the preferred commerce binding layer. Raw Stripe `priceId` fields are compatibility fallback, not the intended long-term editor source of truth.
- Do not let Exhibit override stronger local context such as business profile detail, current page truth, live runtime truth, or the newest user direction.
- Keep `Apply this pass` deterministic when a real `sourceActionPlan` exists. Do not regress that path back into generic prompt reinterpretation.
- When the user has selected a specific block, card, heading, or CTA, prefer bounded local edits over page-wide redesign language unless the user explicitly widens scope.
- Keep draft/live language truthful. Saved draft is not published live.

## Current known gaps

This branch is materially better, but it is not a finished funnel-builder endpoint.

Open items still worth focused follow-up:

- `FunnelEditorClient.tsx` still carries a large number of existing unused-symbol and hook-dependency diagnostics. They predate the final packaging step here and were not cleaned in this pass.
- the page `/testing/test` on the local validation funnel still contains an older stray secondary heading from a pre-fix broken apply run; the apply path is fixed, but that stale content still needs cleanup in page data
- pricing/offer flows are now better grounded, but they still need a more final product model around package creation and editing
- the funnel builder shell is more coherent, but tomorrow's pass still needs targeted precision work and validation on a few focused interaction paths

## Validation status

Confirmed during this pass:

- the real `Apply this pass` flow on the page assistant now preserves the selected `sourceActionPlan` and can update the intended top headline instead of mutating the wrong later section
- hosted and public funnel routes now render booking runtime content through the shared runtime surface instead of only through detached iframe assumptions
- booking theme/settings routes can resolve funnel-aware theme input instead of only account-level booking theme

Build note:

- a fresh `npm run build` was restarted after clearing a stale `.next/lock` file from an abandoned earlier build
- Windows Prisma engine rename warnings still occur during prebuild, but the repo's prebuild script is already written to continue when the existing engine is present
- if the next developer sees a `.next/lock` failure again with no active `next build` process, treat it as stale local build state rather than as branch-specific application breakage

## Recommended next-pass focus

Tomorrow's precision pass should stay narrow:

1. remove stale content left behind by earlier broken apply runs so the validation funnel is clean again
2. keep validating same-thread `Ask -> Suggested pass -> Apply this pass -> preview/source/page state` on real pages
3. pressure-test the offer/package model now that offer binding exists
4. decide which editor-shell diagnostics are dead code versus intentionally staged work, then do a cleanup pass without reopening product scope