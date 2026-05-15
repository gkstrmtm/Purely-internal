# Manager Portal Overrides UI Contract

This page is easy to regress during sync or partial file restores because it now depends on a few linked decisions rather than one isolated layout tweak.

Current intent:

- The main surface is a full-width account list, not a split-pane table with a persistent right-side detail stage.
- Account details open in a modal after clicking the row or the row-level Open account action.
- The row header owns account identity: login email, business name, owner name, lifecycle, billing state, and Twilio state.
- The row contact card is compact metadata only. It should not repeat a second headline-style raw email that competes with the login email above it.
- Important contact values must be easy to copy from both the row and the modal.
- Filter selects should use shared styled controls, not browser-default raw selects.
- Current list loading cap is 500 accounts. If the account count grows beyond that, extend this with pagination or windowing instead of reintroducing an overloaded table.

Do not regress to:

- persistent side detail panes
- narrow multi-column pseudo-table rows that truncate or overlap core account data
- raw, unstyled select controls
- row summaries that duplicate raw email data in multiple competing places

If this page changes during sync, verify these files together:

- src/app/app/manager/portal-overrides/PortalOverridesClient.tsx
- src/app/api/manager/portal/overrides/route.ts
- src/app/globals.css