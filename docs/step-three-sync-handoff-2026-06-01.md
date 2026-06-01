# Step Three Sync Handoff

- Date: `2026-06-01`
- Branch: `dev-retro`
- Pushed head: `c65f3f89`
- Commit title: `Improve booking readiness and setup handoffs`
- Purpose: give one clean sync artifact for what actually shipped in the latest step-three pass, separate from broader branch noise and separate from the earlier status-board framing

## What this document is for

This document is the narrow handoff for the pushed step-three slice.

Use it when someone needs to know:

- what actually changed in the shipped pass
- why those changes belong together
- what was validated before push
- what is still open but intentionally not part of this commit

This should be treated as the authoritative sync note for `c65f3f89`, not as a general post-beta tracker.

## Relationship to the earlier status board

`docs/beta-feedback-status-board-2026-06-01.md` captured the step-three read before the final implementation pass was finished.

This handoff reflects the later state that was actually committed and pushed.

Most importantly:

- the Stripe reporting handoff is no longer only a known partial problem; the pushed slice now moves Stripe reporting into Integrations with a contextual setup note
- the People invites surface no longer relies only on transient toasts; it now keeps delivery-truth guidance visible in the page itself

## Included payload in `c65f3f89`

- `docs/beta-feedback-status-board-2026-06-01.md`
- `src/app/api/public/booking/u/[ownerId]/[calendarId]/book/route.ts`
- `src/app/api/public/booking/u/[ownerId]/[calendarId]/settings/route.ts`
- `src/app/api/public/booking/u/[ownerId]/[calendarId]/suggestions/route.ts`
- `src/app/book/[slug]/PublicBookingClient.tsx`
- `src/app/portal/app/people/users/PortalPeopleUsersClient.tsx`
- `src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx`
- `src/app/portal/app/services/reporting/stripe/PortalStripeSalesClient.tsx`
- `src/app/portal/app/settings/integrations/page.tsx`

## Why this payload moves together

This was not a random UI polish bundle.

It is one coherent trust-and-readiness pass across the same user journey:

1. Funnel Builder had a real booking-readiness failure that made a linked booking experience look broken.
2. Setup handoffs in reporting still made parts of the platform feel like dead ends even when the capability existed.
3. Invites still told the truth only in temporary toast messages, which left operators without durable feedback about delivery state.

Grouped together, the slice moves the platform from "feature technically exists" toward "user can tell what is ready, what failed, and what to do next."

## What changed

### 1. Funnel-linked booking readiness is now truthful

- Funnel-linked calendar booking paths now accept funnel context through the public booking client and calendar-based public booking APIs.
- Funnel preview no longer falls into the wrong readiness contract for the linked booking calendar.
- The practical effect is that a valid funnel-linked booking experience now reaches live date picking instead of showing `This booking link isn’t accepting bookings yet.` when the generic site toggle is off.

### 2. Funnel Builder shell friction was reduced

- The editor shell work already in this slice keeps the assistant and page-context UI cleaner and less misleading.
- This pass should be read as confidence cleanup, not a claim that the entire Funnel Builder is fully closed.

### 3. Stripe sales reporting now hands off into Integrations correctly

- `src/app/portal/app/services/reporting/stripe/PortalStripeSalesClient.tsx` no longer sends users toward a profile-style setup dead end.
- The route now points into Integrations with route context attached.
- The empty-state copy was updated so the next step is explicit: connect Stripe in Integrations, then come back to verify live data.

### 4. Integrations now explains the reporting handoff when reached from Stripe sales

- `src/app/portal/app/settings/integrations/page.tsx` now reads reporting context from the query string.
- When entered from Stripe sales setup, the page shows a focused payment-setup note instead of dropping the user into a generic settings surface with no explanation.

### 5. Invite delivery truth is now visible in the People surface

- `src/app/portal/app/people/users/PortalPeopleUsersClient.tsx` now keeps delivery guidance visible in-page instead of relying only on a toast.
- The page explains that `Pending` means the invite exists, not that email delivery necessarily succeeded.
- After send or resend, the UI can retain whether delivery succeeded or failed during the active session.
- The copy around manual link copying is now framed as fallback behavior instead of the default assumption.

## Validation already completed on this pushed slice

- `npx tsc --noEmit --project tsconfig.json --pretty false`
- Live browser proof on the shared authenticated portal pages confirmed:
  - Stripe reporting now shows `Open Integrations`
  - the `Open Integrations` action lands on Integrations with a contextual payment-setup note
  - the People / Users page shows the durable pending-state explanation in-page

## What this push does not claim

- It does not claim campaigns are fully resolved.
- It does not claim the whole Funnel Builder now feels perfect in user-mode.
- It does not claim every email path is fully trustworthy end to end.
- It does not include the unrelated local worktree changes still present after the push.

## Local worktree changes intentionally not included in `c65f3f89`

These were left out of the pushed sync payload on purpose:

- `scripts/journey-browser-smoke.js`
- `scripts/route-browser-smoke.js`
- `src/app/portal/PortalDashboardClient.tsx`
- `src/app/portal/page.tsx`
- temporary `tmp_*` scripts in the repo root

Those files should not be treated as part of this handoff unless they are grouped, reviewed, and committed separately later.

## Recommended use of this handoff

If another developer or future pass needs context, use this order:

1. Read this file for the exact shipped slice.
2. Read `docs/beta-feedback-status-board-2026-06-01.md` for the broader product read and open-manual-test priorities.
3. Test the pushed branch like a real operator, especially:
   - Stripe reporting to Integrations handoff
   - invite creation, resend, and actual mailbox arrival
   - campaign operator flow
   - Funnel Builder confidence after the booking fix

## Bottom line

`c65f3f89` is a real product pass, not just a report commit.

The pushed slice closes the strongest live booking blocker, improves the setup handoff story, and makes invite delivery truth more durable in the UI. The remaining work is now narrower and more product-specific than the earlier beta complaint set.