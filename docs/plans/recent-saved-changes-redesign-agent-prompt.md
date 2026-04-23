# Recent Saved Changes Sidebar Redesign Prompt

Use this prompt when handing the recent-saved-changes redesign to another agent or reviewer.

## Goal

Redesign the funnel builder's "Recent saved changes" UI so it feels premium, deliberate, compact, and readable. The current design uses cheap-looking oval status pills, weak hierarchy, and too much repeated information. The result should feel like a polished change journal inside a high-end builder, not a default activity feed.

## Target Surface

- File: `src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx`
- Primary area: the custom-code audit trail cards under the AI/sidebar surface
- Secondary area: the Activity rail's "Recent saved changes" cards so both surfaces share the same design language

## What Is Wrong With The Current UI

- The rounded status pills like "Change saved" and "No new page change" look cheap and visually noisy.
- The vertical timeline dots feel generic and low-effort.
- The cards repeat themselves too much between status, headline, detail, request, and action.
- Prompt text is over-exposed even though the person who sent the prompt already knows what they asked for.
- The whole module feels heavier than it needs to.

## Design Direction

- Remove capsule/pill status chips entirely.
- Replace them with sleeker cards that use:
  - a slim accent rail or similarly restrained marker
  - a small uppercase status eyebrow
  - a confident headline
  - at most one supporting detail line when it adds new information
  - a very quiet action affordance such as "Open on canvas"
- Keep the visual language clean and premium, not playful.
- Favor structure, spacing, and contrast over badges, gradients, and decorative weight.
- The UI should still work inside a narrow sidebar width.
- Do not bulk it up with extra color or extra modules.

## Functional Requirements

- Preserve all existing behavior.
- Clicking an audit entry must still open the associated canvas area.
- Status states still need to communicate differences between:
  - saved update
  - no saved update
  - pending answer
  - version restored
- Timestamps still need to be visible.
- Do not restate the entire prompt in the visible card body. If prompt context is needed, keep it secondary and minimal.

## Implementation Notes

- Keep changes focused to the owning sidebar/activity UI.
- Do not add a new design system abstraction unless it clearly reduces duplication.
- Reuse tone classes or small helpers only if they make both audit surfaces more consistent.
- Validate with file diagnostics and `npx tsc --noEmit`.

## Quality Bar

The redesigned module should look like something a product designer intentionally composed. If the result still looks like generic admin UI with new colors, it is not good enough.