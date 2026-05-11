# Path Consultation Beta Functional Checklist

This is the working trust checklist for the fixed beta asset, not the future scratch-generation pass.

Validation asset

- Funnel: `cmouaqirr0057lrngqzqe018a`
- Page: `cmouaqirr0058lrngw0aj3m0b` (`/path-consultation-beta-2026-05-06`)
- Editor: `http://localhost:3001/portal/app/services/funnel-builder/funnels/cmouaqirr0057lrngqzqe018a/edit`
- Live: `/f/path-consultation-beta-2026-05-06/qzqe018a`
- Rule: stay on this funnel/page while checking items off unless a specific item explicitly requires a different page in this same funnel.

How to use this file

- Check an item only after the behavior is executed on this beta asset or its live route.
- If something is only source-mapped but not behavior-tested yet, leave it unchecked.
- When something fails, add the exact failure under Known open issues instead of papering it over.
- Do not mix results from older funnels, stale port 3000 sessions, or unrelated test pages.

Primary owner files

- `src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx`: editor shell, page context rail, page/source/assistant toggles, save state, pricing modal, thread rail, selected-block tools.
- `src/lib/creditFunnelBlocks.ts`: shared block renderer, selection chrome, pricing-card selection, booking/runtime truth in preview and hosted surfaces.
- `src/app/api/portal/funnel-builder/funnels/[funnelId]/pages/[pageId]/route.ts`: draft save, block snapshot persistence, delete page path.
- `src/app/api/portal/funnel-builder/funnels/[funnelId]/pages/[pageId]/publish/route.ts`: publish contract validation and draft-to-live promotion.

Already cleared on this beta

- [x] The fixed funnel opens in the correct editor route on port 3001 and is stable enough to use as the single validation asset.
- [x] The page context rail now has a real Commerce section driven by transaction readiness instead of generic filler copy.
- [x] The Commerce rail truthfully reports the current state of this page: commerce blocks exist, but no active offer is bound yet.
- [x] A real `pricingGrid` block was added to this page and renders in the editor preview.
- [x] Clicking a pricing card in Edit mode opens the pricing editor reliably.
- [x] Pricing modal state stays aligned with the selected pricing card instead of feeling detached or hidden.
- [x] Editing a pricing value, saving draft, and reloading persists the change on this page. Current proof point: `Starter Plan` now persists at draft value `$155` while published live remains at `$95` until publish.
- [x] Managed draft/live separation is repaired again for this page. Saving BLOCKS-mode draft changes no longer leaks into the hosted live route.
- [x] Page chat now returns a single bounded selected-target micro-edit plan for local spacing/surface complaints on this beta page instead of widening straight into a broader fallback pass.

Top-to-bottom checklist for this page

## 1. Shell and page routing

- [ ] Page picker changes pages without losing the current valid selection after reload.
- [ ] `+ Page` creates a new page in this funnel and lands back in a coherent editor state.
- [ ] Delete page removes the page cleanly and does not leave the editor on a dead route.
- [x] `Open live page` opens the published page for this same funnel on the correct local origin.
- [ ] `Copy URL` copies the correct live URL for this same funnel.
- [ ] Undo/redo works for direct page edits on this page and does not desync the right rail.

## 2. Page context rail

- [x] Commerce rail renders on this page and reflects real payment readiness.
- [ ] Commerce rail updates immediately after an offer is bound to a pricing card or commerce button.
- [ ] Commerce rail updates again after a true checkout path exists, not just after blocks are present.
- [ ] Booking rail stays truthful when no funnel calendar is linked.
- [ ] Search/SEO changes save and persist from the rail.
- [ ] Tracking Pixel changes save and reflect the correct runtime status label.
- [ ] Advanced page defaults visibly affect the canvas and persist after reload.

## 3. Page, Source, and Assistant lenses

- [x] `Page` and `Source` switch between views of the same draft without resetting the selected page.
- [ ] On this managed page, `Source` behaves as the intended read-only compiled snapshot surface and its copy action is behavior-verified end to end.
- [x] `Assistant` opens and closes without disrupting the current page lens.
- [x] Mobile/desktop preview toggle changes the viewport only and does not mutate page state.
- [x] `View` and `Edit` switch the page between passive preview and direct selection mode without stale UI.

## 4. Canvas and direct editing

- [x] Selecting a block updates the assistant context line to the correct block target.
- [x] Move up and move down controls work on the selected block and persist after save/reload.
- [ ] Drag-reorder works for top-level blocks and persists after save/reload.
- [ ] Empty-page preset insertion still works if this page is cleared back to empty state.
- [ ] Direct content edits on visible blocks persist after save/reload.
- [ ] Deleting a selected block persists after save/reload and does not reappear from stale draft data.

## 5. Pricing section and commerce path

- [x] Pricing section renders on this page.
- [x] Clicking a pricing card focuses the selected card and opens the pricing editor.
- [x] Manual tier edits persist after draft save and reload.
- [ ] Reordering tiers in the pricing editor persists after save/reload.
- [ ] Adding a new tier persists after save/reload.
- [ ] Removing a tier persists after save/reload.
- [ ] Binding an offer to a tier updates both the pricing UI and the Commerce rail truth.
- [ ] A bound pricing CTA can actually start a valid checkout/cart path instead of failing at runtime.

## 6. Assistant and thread behavior

- [x] `New thread` creates a clean alternate thread on this same page without losing page context.
- [ ] Thread switching honors unsaved-change handling instead of yanking the editor silently.
- [ ] `Apply this pass` mutates the intended target on this page and updates the current draft.
- [ ] Page-level asks stay page-scoped even if a child block is currently selected.
- [ ] Block-level asks stay block-scoped when that is the explicit user intent.
- [ ] Assistant result summaries describe what changed instead of echoing the prompt.

## 7. Draft, live, and publish loop

- [x] Draft save persists page edits on reload.
- [x] Draft save keeps live unchanged until publish.
- [x] `Open live page` confirms draft/live separation truthfully.
- [x] Publish rejects invalid pages with a clear contract failure instead of silent drift.
- [ ] Publish moves the saved draft to live for this page.
- [ ] After publish, the editor returns to a truthful non-dirty state.

Current publish blocker on this beta

- Publish currently returns `422 This sales page is not ready to publish yet.` with `Checkout handoff is missing. Add a real checkout surface before publish.` That is the correct blocker for the current page state.

## 8. Runtime truth on the hosted page

- [ ] Hosted page shows the same pricing section content as the saved draft after publish.
- [ ] Hosted page keeps Commerce truth aligned with the editor state.
- [ ] If a booking block is added later, hosted booking state must stay truthful for missing route, linked route, and duplicate-route cases.
- [ ] Runtime CTA clicks should fail only for real contract/setup reasons, not because the editor lied about readiness.

Known open issues

- [ ] Page assistant scope routing is still wrong when a page-level request is made while a child block is selected. Repro seen on this beta: a request to add a pricing section turned into a heading-only suggested pass because the canvas selection hijacked scope.
- [ ] Commerce truth is now visible, but the operator path from `Needs offers` to actually binding an offer is still too indirect.
- [ ] `Copy URL` is still unchecked. The live href is correct, but clipboard write itself has not been behavior-verified yet.
- [ ] Managed-page `Source` is read-only by design on this page. The UI reports `HTML copied`, but clipboard contents could not be independently read back from automation because the browser denied clipboard-read permission.

Next checklist that should exist after this one

- Scratch generation trust checklist for creating a new funnel/page from nothing through the current algorithm, prompt synthesis, and ecosystem flow.