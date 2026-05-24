# Portal burn-down audit

## Goal
- Capture the remaining portal backlog from live code and diagnostics only.
- Work from highest-confidence customer-facing/runtime items downward.
- Keep large-editor lint/style debt separate from direct customer flow fixes.

## Status legend
- `doing`: actively being fixed now
- `next`: queued for the next patch batch
- `debt`: real follow-up work, but not the best immediate production-risk target
- `watch`: not necessarily broken, but worth verifying after the main burn-down

## Current burn-down list

### 1. Auth and account recovery
- `done` Reset-code request copy parity across portal and credit auth surfaces
  - `src/app/(auth)/login/PortalLoginClient.tsx`
  - `src/app/portal/api/forgot-password/request/route.ts`
  - `src/app/credit/api/forgot-password/request/route.ts`
- `done` Invite acceptance failure copy hardened
  - `src/app/portal/invite/[token]/PortalInviteAcceptClient.tsx`

### 2. Core portal tasking and lightweight actions
- `done` Task creation no longer falls back to generic create errors
  - `src/app/portal/app/tasks/PortalTasksClient.tsx`
- `done` AI chat thread creation no longer falls back to `Failed to create chat`
  - `src/app/portal/app/ai-chat/PortalAiChatClient.tsx`

### 3. Portal API response hardening
- `done` Billing summary API no longer returns generic failure copy
  - `src/app/api/portal/billing/summary/route.ts`
- `done` Suggested setup preview API no longer returns generic failure copy
  - `src/app/api/portal/suggested-setup/preview/route.ts`
- `done` Voice-agent voices API no longer returns generic failure copy
  - `src/app/api/portal/voice-agent/voices/route.ts`
- `done` Credit dispute PDF generation no longer returns generic save failure copy
  - `src/app/api/portal/credit/disputes/[letterId]/pdf/route.ts`

### 4. People and contacts residual cleanup
- `done` Contacts flow no longer uses generic fallbacks for delete, update, image import, and quick-add contact
  - `src/app/portal/app/people/contacts/PortalPeopleContactsClient.tsx`
- `done` Local file-reader fallback now uses action-aware copy
  - `src/app/portal/app/people/contacts/PortalPeopleContactsClient.tsx`
- `done` Contacts loader fallback was verified to stay calm and action-aware during the sweep
  - `src/app/portal/app/people/contacts/PortalPeopleContactsClient.tsx`
- `done` Contact-tag save, attach, remove, and create flows now use action-aware recovery copy in both UI and API layers
  - `src/components/PortalContactDetailsModal.tsx`
  - `src/components/ContactTagsEditor.tsx`
  - `src/components/CreateContactTagDialog.tsx`
  - `src/app/api/portal/contact-tags/route.ts`
  - `src/app/api/portal/contacts/[contactId]/tags/route.ts`
  - `src/lib/portalAgentActionExecutor.ts`

### 5. Invite and onboarding residuals
- `done` Login route temporary-unavailable response now uses action-aware recovery wording
  - `src/app/portal/api/login/route.ts`

### 6. Shared/agent follow-up work
- `debt` `portalAgentActions` still has unresolved implementation TODOs for `$ref` resolution and entity lookup
  - `src/lib/portalAgentActions.ts`
- `done` `portalAgentActionExecutor` mirrors were aligned with the updated billing summary, suggested setup, voice options, and dispute PDF route responses
  - `src/lib/portalAgentActionExecutor.ts`

### 7. Funnel form residuals
- `done` Funnel form editor and responses clients no longer use the remaining generic load/save/delete/read defaults from the residual sweep
  - `src/app/portal/app/services/funnel-builder/forms/[formId]/edit/FormEditorClient.tsx`
  - `src/app/portal/app/services/funnel-builder/forms/[formId]/responses/FormResponsesClient.tsx`

### 8. Large-editor diagnostics backlog
- `done` Funnel editor targeted lint backlog was reduced to zero live file-scoped ESLint warnings without behavior changes
  - `src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx`
- `done` Automations editor Tailwind canonicalization warnings were cleaned up without behavior changes
  - `src/app/portal/app/services/automations/PortalAutomationsClient.tsx`

## Notes from the sweep
- The initial grep results were heavily polluted by old transcript `.md` files inside portal folders; this burn-down excludes those and is based on current `.ts` / `.tsx` code plus diagnostics.
- The most valuable immediate work is still customer-facing fallback copy and route-response hardening in small focused files.
- The huge funnel-builder diagnostics bucket was noisy and stale in editor diagnostics, so the cleanup pass switched to direct file-scoped ESLint as the source of truth.

## Active pass
- Completed auth recovery, invite acceptance, task creation, small API response hardening, contacts residual cleanup, funnel form residual cleanup, shared executor mirror alignment, the automations-editor canonicalization pass, and a targeted funnel-editor lint cleanup.
- `portalAgentActions` remains tracked debt because its `$ref` TODOs appear to belong to the broader `puraPlanner` / `puraResolver` architecture rather than a safely isolated one-file fix.
- Remaining direct burn-down work is now mostly limited to tracked architectural debt in `portalAgentActions` plus a shrinking set of fresh high-confidence portal-facing parity issues found in the follow-up sweep.
