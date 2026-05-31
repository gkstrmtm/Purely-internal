Use this exact prompt when syncing the current credit People/client-access work across branches or between developers.

```text
Please sync the current credit-side People and loading-state work from my branch into yours without redesigning or loosening the behavior.

Primary goal:
- Preserve the current credit People/client-access UX and the shared loading direction before commit/push.
- Do not reintroduce vague state labels, raw `Loading...` text, or bulkier contact modal layout patterns.

What must be preserved:

1. Contact/client access language
- Keep the owner-facing derived labels:
  - Lead
  - Needs access
  - Invite pending
  - Active
- Do not bring back `Setup` as a label.
- The labels are derived from existing truth, not a new stored lifecycle system.

2. Contact modal layout
- Keep the tighter credit contact modal layout.
- Tags should stay folded into the main top card, not a separate tall side rail.
- Client portal access should stay near the top of the modal.
- Do not restore the old bulky `Not sent` badge treatment.

3. Client access behavior
- Keep the contact-centered access flow.
- The contact drawer should continue to send/resend client access directly from the contact record.
- Keep the credit client experience restricted to the credit portal, not the broader workspace.

4. Loading-state contract
- Do not use raw `Loading...` or `Loading…` text in product UI for these surfaces.
- Preserve the restrained spinner-card treatment using the shared spinner.
- Match the existing neutral zinc visual language.
- Prefer shared loading presentation over one-off improvised loaders.

5. Shared loading direction
- Keep using the shared spinner language established by InlineSpinner.
- When touching loading states in these surfaces, prefer one of these patterns:
  - inline loading for small actions
  - card loading for panels/modal bodies/page sections
  - blocking loading only when the user truly cannot proceed
- Do not add a giant app-wide loading overlay for normal fetches.

Files to compare first:
- src/app/portal/app/people/contacts/PortalPeopleContactsClient.tsx
- src/lib/contactPortalAccess.ts
- src/app/api/portal/people/contacts/route.ts
- src/components/InlineSpinner.tsx
- docs/credit-people-client-access-summary.md
- docs/media-library-loading-spinner-sync-prompt.md

Important constraints:
- No redesign drift.
- No new manual workflow engine.
- No extra status toggles.
- No new bulky paneling in the contact modal.
- No regression from `Needs access` / `Invite pending` / `Active` back to vaguer language.

Acceptance checks before commit/push:
- `npx tsc --noEmit --project tsconfig.json --pretty false`
- Open `/credit/app/people/contacts`
- Open a contact drawer and verify:
  - the modal remains compact
  - access is shown near the top
  - tags are not consuming a separate tall side column
  - no raw `Loading...` text is shown while the page or modal fetches
- Open any touched loading surface and verify the spinner treatment still feels in-family with Media Library / People.

If your branch diverged:
- Preserve your logic changes where possible.
- But keep this branch’s UX contract for:
  - contact access wording
  - contact modal information hierarchy
  - loading-state presentation
- If there is a conflict, prefer the newer UX contract from this branch unless there is a hard functional blocker.
```