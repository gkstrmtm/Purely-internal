# Credit People + Client Access Summary

This document summarizes the recent changes made to the credit-side People flow, client portal access flow, and related UX cleanup so another developer can understand the current direction quickly.

## Product intent

- The business-facing source of truth is the contact record.
- Unlinked leads are still a useful intake surface, but they should feed into a contact, not compete with it.
- Credit clients should receive a restricted credit portal, not the broader software workspace.
- The UI should explain what the owner needs to do without adding bulky lifecycle systems, extra toggles, or manual state management.

## What changed

### 1. Credit invite continuity is now variant-aware

- Credit portal invites carry the credit variant through the email link, invite acceptance page, session cookie, and post-accept redirect.
- This prevents credit invites from falling back into the generic portal experience.

Primary files:
- src/lib/portalAccountInviteEmail.ts
- src/app/portalinvite/[token]/page.tsx
- src/app/portal/invite/[token]/PortalInviteAcceptClient.tsx
- src/app/api/public/portal-invite/accept/route.ts

### 2. Contact-based client access is real

- Contact detail now exposes portal access state.
- Owners can send or resend client access directly from the contact record.
- The system creates the secure invite link and attempts email delivery.
- The client sets their own password through the secure flow; plain-text passwords are not emailed.

Primary files:
- src/lib/contactPortalAccess.ts
- src/app/api/portal/contacts/[contactId]/route.ts
- src/app/api/portal/contacts/[contactId]/client-access/route.ts

### 3. People now communicates state without adding a workflow engine

- No new stored lifecycle status was added.
- The row-level clarity layer is derived from existing truth.
- Current owner-facing labels are:
  - Lead
  - Needs access
  - Invite pending
  - Active
- The goal is to answer the question: what do I need to do next?

Primary file:
- src/app/portal/app/people/contacts/PortalPeopleContactsClient.tsx

### 4. Contacts and unlinked leads were unified more cleanly

- Desktop no longer depends on a separate mini-card for unlinked leads.
- The shared People shell switches between Contacts and Unlinked leads in one place.
- This follows the same simpler pattern already used on mobile.

Primary file:
- src/app/portal/app/people/contacts/PortalPeopleContactsClient.tsx

### 5. The contact details modal was tightened up

- The credit contact modal was reworked to make better use of vertical space.
- The tags rail was folded into the main top card instead of consuming a separate side column.
- Client portal access was moved higher in the modal so the owner does not need to scroll past too much unrelated detail.
- The old bulky `Not sent` treatment was replaced with a quieter inline access status presentation.

Primary file:
- src/app/portal/app/people/contacts/PortalPeopleContactsClient.tsx

### 6. Raw `Loading…` text was replaced with the shared spinner treatment

- The People page loading state and contact modal loading state now use the same restrained spinner card pattern used in the Media Library direction.
- The goal is to avoid blunt `Loading…` text and keep loading states visually in-family.

Primary files:
- src/app/portal/app/people/contacts/PortalPeopleContactsClient.tsx
- src/components/InlineSpinner.tsx

Related handoff prompt:
- docs/media-library-loading-spinner-sync-prompt.md

## Current owner-facing model

The intended operating model is:

- Lead: inbound person still not linked to a working client record.
- Needs access: client record exists, but portal access has not been sent yet.
- Invite pending: secure access email was already sent, and the client still needs to finish password creation.
- Active: the client can sign in.

This is intentionally lightweight. It is not a database-driven lifecycle engine.

## Current client-facing model

The credit client login is restricted to client-relevant surfaces, such as:

- Credit reports
- Dispute letters
- Read-only progress / status context

The client should not land in the full internal workspace.

## UX rule that drove these changes

- Avoid adding more toggles.
- Avoid manual stage management.
- Avoid separate systems that force the owner to infer the workflow.
- Prefer one clear label, one clear next action, and one contact-centered place to operate.

## Remaining worthwhile follow-up

- Add a cleaner owner-facing preview of exactly what the client will receive before access is sent.
- Consider a future one-click `Convert to client` flow from unlinked leads into the contact/access path.
- Keep report import, dispute drafting, and client access mentally tied to the same contact record so the credit team does not have to bounce between disconnected concepts.