# Critical Surface Invariants

This document marks the non-negotiable truths for the most fragile product surfaces and names the cheapest regression gate for each one.

## Funnel Builder

- Executable: Draft saves must not overwrite live HTML until publish runs.
- Executable: Reopening a page must prefer non-empty draft HTML over live HTML.
- Executable: Publish must promote the exact draft HTML to live and then clear the draft.
- Documented-only for now: Block-mode and source-mode switches must preserve content through a real conversion, not a UI relabel.

## Media Library Composer

- Executable: A local planned time does not count as provider queued or provider published.
- Executable: `Queued` must be backed by real provider queue evidence such as `providerQueuedAtIso`, `providerPendingAtIso`, or provider queue status.
- Executable: `Posted automatically` requires real provider proof such as `providerPostId` or `providerPublishedAtIso`.
- Executable: `Blocked` must surface the real provider blocker instead of a generic label.
- Executable: `Posted manually` must stamp a manual post time and keep provider state truthful.
- Journey smoke: The Media Library route must load in authenticated portal and credit sessions without collapsing into an error shell.

## External Booking Handoff

- Executable: `handoff_only`, `redirect_confirmed`, and `provider_confirmed` remain separate truths.
- Executable: Redirect-return guidance must explicitly stay below webhook or API-confirmed booking truth.
- Documented-only for now: Funnel CTAs that hand off to external booking should continue to use tracked handoff links instead of raw provider URLs.

## Gates

- `npm run test:critical-surface-invariants`
- `npm run test:journey-browser-smoke`