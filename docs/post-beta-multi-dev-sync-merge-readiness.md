# Post-Beta Multi-Dev Sync And Merge Readiness

- Prompt ID: `P-037`
- Post-beta issue: `PB-004`
- Audit date: `2026-05-18`
- Audit mode: read-only branch and file audit plus documentation only
- Current branch: `dev-retro`
- Current head: `ee71d59d` `chore: snapshot for audit`

## 2026-05-18 Incremental Sync Payload For `registrar-dev`

This document also tracks the current uncommitted post-beta implementation slice that should be carried from `dev-retro` onto `registrar-dev` as one grouped sync unit.

The current payload is the result of the recent prompt-driven post-beta workflow and should be treated as three linked sub-passes, not as isolated file edits.

### Included prompt slices

- `P-040 / PB-007` trustworthy setup guidance and beta complaint closure follow-through
- `P-041 / PB-008` newsletter UI language and user-friendliness cleanup
- `P-042 / PB-009` provider setup guidance and no-silent-failure states

### Why this payload should move together

- The provider-blocker helper, route blockers, and UI readiness states are designed as one contract.
- The credit-variant routing fix is required so server-returned setup links point to `/credit/app/*` instead of incorrectly falling back to `/portal/app/*`.
- The newsletter copy cleanup and the provider-blocker work touch adjacent communication surfaces; splitting them increases the chance of sync drift in the same user journey.

### Target branch for this sync

- `registrar-dev`

### Files in the current incremental sync payload

- `docs/post-beta-multi-dev-sync-merge-readiness.md`
- `src/lib/providerSetupGuidance.ts`
- `src/lib/portalVariant.server.ts`
- `src/app/api/portal/newsletter/newsletters/[newsletterId]/send/route.ts`
- `src/app/api/portal/newsletter/automation/generate-now/route.ts`
- `src/app/api/portal/newsletter/automation/cron/route.ts`
- `src/app/api/portal/booking/bookings/[bookingId]/contact/route.ts`
- `src/app/api/portal/booking/reminders/settings/route.ts`
- `src/app/api/portal/ai-outbound-calls/campaigns/route.ts`
- `src/app/api/portal/ai-outbound-calls/campaigns/[campaignId]/manual-call/route.ts`
- `src/app/api/portal/ai-outbound-calls/campaigns/[campaignId]/enroll-message/route.ts`
- `src/app/portal/app/services/ai-outbound-calls/PortalAiOutboundCallsClient.tsx`
- `src/app/portal/app/services/booking/PortalBookingClient.tsx`
- `src/app/portal/app/services/reporting/sales/PortalSalesReportingClient.tsx`
- `src/app/portal/app/services/newsletter/PortalNewsletterClient.tsx`
- `src/app/portal/app/services/ai-receptionist/PortalAiReceptionistClient.tsx`
- `src/app/portal/app/services/missed-call-textback/PortalMissedCallTextBackClient.tsx`
- `src/app/portal/profile/PortalProfileClient.tsx`

### What changed in this payload

#### 1. Trustworthy setup guidance for provider-backed communication

- Added a shared provider-blocker formatter in `src/lib/providerSetupGuidance.ts`.
- Newsletter manual send, generate-now, and scheduled send now preflight provider setup before any live send or `SENT` mutation.
- Booking follow-up contact send now blocks with explicit setup guidance instead of surfacing vague downstream failures.
- AI outbound manual call and message enrollment now return provider-aware blockers that explain the provider, the blocked action, and the next setup route.

#### 2. Proactive readiness state in UI, not only reactive failures

- AI outbound now shows `Live`, `Blocked`, and `Needs credentials` states for voice, SMS, and email readiness.
- Booking reminders now show channel readiness for SMS and email with a direct Integrations handoff.
- Sales reporting wording was aligned to the current Integrations setup surface.
- AI Receptionist and missed-call text back continue the same setup-path language toward Integrations.

#### 3. Newsletter language cleanup

- The newsletter composer copy was rewritten in-place for clarity without changing the workflow shape.
- This is user-facing cleanup only; it does not redesign scheduling, approval, or send behavior.

#### 4. Credit-variant setup-route correctness

- `src/lib/portalVariant.server.ts` now falls back to the request `referer` when the explicit portal-variant header is absent.
- This keeps server-generated setup links truthful for credit users during blocked-action responses.

### Sync notes for the other developer

- Sync this payload as one branch move onto `registrar-dev`; do not cherry-pick only the UI files without the API blockers.
- Do not drop `src/lib/providerSetupGuidance.ts`; the new route responses depend on it.
- Do not drop `src/lib/portalVariant.server.ts`; without it, credit-route blockers can point to the wrong setup surface.
- If there is any local divergence on booking, newsletter, or AI outbound surfaces, re-run the provider-blocker proof on a Twilio-missing credit account after merge.

### Safe validation already completed on this payload

- `npx tsc --noEmit --project tsconfig.json`
- Credit AI outbound readiness screen verified with correct `/credit/app/profile` and `/credit/app/settings/integrations` links.
- Credit booking reminders readiness banner verified.
- Safe blocked-action proof verified with a `409` response before any outbound call could start.

### Remaining validation gap

- Missing-email runtime proof was not forced in the seeded credit environment because that environment currently reports email delivery as configured and forcing a failure could risk a real outbound email.

## Scope

This report checks merge readiness for the current post-beta work across the branch lines that are actually available in this repo state.

The practical comparison set is:

- `dev-retro` and `origin/dev-retro`
- `registrar-dev` and `origin/registrar-dev`
- `origin/main`
- `origin/wip/portal-qa-fixes-env-diagnostics` because it points to the same tip as `origin/main`
- surviving prompt/task branches such as `p022a-webhook-protection`, `p022b-public-intake-protection`, `p022c-credits-immutable-ledger`, `p022e-file-media-privacy`, `p022f-route-auth-matrix`, `p022g-security-audit-event-trail`, and `p023a-beta-feedback-intake`

## Branch State

### Current branch and nearby ancestry

- `dev-retro` is the checked-out branch and matches `origin/dev-retro`
- `dev-retro` is ahead of `registrar-dev` by 7 commits and behind by 0 commits
- `dev-retro` is ahead of `p023a-beta-feedback-intake` by 6 commits and behind by 0 commits
- `p022a-webhook-protection` and `p023a-beta-feedback-intake` are ancestors of `dev-retro`
- `dev-retro` and `origin/main` have materially diverged: `dev-retro` has 18 unique commits and `origin/main` has 11 unique commits
- `origin/wip/portal-qa-fixes-env-diagnostics` currently points to the same commit as `origin/main`, so it does not add a separate delta for this audit

### Commits that landed in `dev-retro` relative to `registrar-dev`

- `ee71d59d` `chore: snapshot for audit`
- `e30d6635` `Add recoverability controls and admin portal updates`
- `2ca2c72b` `Default portal overrides to active accounts`
- `f18fabdf` `Fix invite role enforcement and restore portal overrides nav`
- `b3efa3ab` `Port platform improvement cycle onto dev-retro`
- `9d37d160` `Harden auth and public webhook flows`
- `88220cd1` `Validate portal auth access flows`

### Commits that exist on `origin/main` but not on `dev-retro`

- `8e85b61b` `Import dev-retro funnel builder and clear validation blockers`
- `1a37c1b8` `Fix Pura active state and weekly scheduling`
- `d87c7c10` `Fix production TypeScript build regressions`
- `cd2761cc` `Improve Pura non-funnel routing and reply quality`
- `7e52becd` `Polish credit dispute styling and Pura offline copy`
- `79be41d7` `WIP: portal QA fixes and env diagnostics`
- `6a3fcc87` `Fix nullable run trace access in AI chat`
- `f63f9160` `Polish portal business settings and glass UI`
- `d9779c1c` `Ship latest portal and funnel builder updates`
- `b9bce558` `checkpoint: before selective dev-retro import`
- `40295aac` `Add hosted page editor flows and portal/connect polish`

## Tracker And Documentation Drift

### Missing source-of-truth files

- `docs/post-beta-platform-improvement-tracker.md` is missing
- `docs/platform-improvement-prompt-tracker.md` is missing

### Documentation and prompt drift that is not in `dev-retro`

These items exist on `origin/main` and are missing from `dev-retro`:

- `.github/agents/exhibit-funnel-designer.agent.md`
- `.github/agents/full-force-redesign.agent.md`
- `.github/instructions/funnel-intelligence.instructions.md`
- `docs/platform-guide/README.md`
- `docs/platform-guide/funnel-builder-data-retention.md`
- `docs/platform-guide/funnel-builder-secret-rotation.md`
- `docs/prompts/funnel-exhibit-archetype-seed.md`
- `docs/plans/hosted-page-editor-unification-plan.md`
- `docs/plans/pura-non-funnel-perfection.md`
- `docs/plans/pura-onboarding-multitask-plan.md`
- `docs/plans/pura-planner-first-execution.md`
- `docs/pura-ai-only-guardrail.md`

### Documentation that is present in `dev-retro` but not on `origin/main`

- `docs/internal-role-boundary-platform-admin-access-audit.md`
- `docs/manager-portal-overrides-ui.md`
- `docs/operator-guidance-friction-scorecard.md`
- `docs/platform-improvement-implementation-synthesis-and-merge-handoff.md`
- `docs/recoverability-deletion-safety-audit.md`
- `docs/recoverability-retention-policy.md`

## Missing-Change Map

Status meanings:

- `present in dev-retro`: landed on the current integration line
- `missing from dev-retro`: only visible on another branch in this repo state
- `conflicting`: both lines changed the same surface and a semantic merge is likely required
- `unknown`: not recoverable from local branch evidence alone

| Improvement area | Key evidence | Status | Notes |
| --- | --- | --- | --- |
| Route auth and public webhook hardening | `src/lib/apiAuth.ts`, `src/lib/portalAuth.ts`, `src/lib/publicIntakeSecurity.ts`, `src/lib/twilioWebhookSecurity.ts`, `src/app/api/auth/signup/route.ts`, `src/app/api/public/twilio/**`, `scripts/auth-access-validation.js` | present in dev-retro | This is part of the 7-commit `registrar-dev..dev-retro` delta and should be treated as foundational |
| Recoverable delete foundation and recovery controls | `src/lib/recoverability.ts`, `src/app/api/manager/recoverability/{archived,purge,restore}/route.ts`, `src/app/app/manager/admin/recovery/*`, `docs/recoverability-deletion-safety-audit.md`, `docs/recoverability-retention-policy.md` | present in dev-retro | Must stay grouped with platform-admin capability updates |
| Platform-admin and manager access controls | `src/lib/internalCapabilities.ts`, `src/lib/platformAdminGrants.ts`, `src/app/api/hr/employees/[employeeId]/platform-admin/route.ts`, `src/app/app/hr/employees/*`, `src/app/app/manager/admin/page.tsx` | present in dev-retro | Security and capability work landed on `dev-retro` and should merge before dependent admin UI |
| Manager invites and role enforcement | `src/lib/employeeInviteRoles.ts`, `src/lib/employeeInvitesSchema.ts`, `src/app/api/manager/invites/route.ts`, `src/app/api/manager/invites/send/route.ts`, `src/app/app/manager/invites/ManagerInvitesClient.tsx` | present in dev-retro | Includes the latest beta-triage handoff improvement that surfaces provider message ids |
| Beta feedback intake and manager triage | `src/lib/betaFeedback.ts`, `src/app/api/portal/bug-report/route.ts`, `src/app/api/manager/portal/beta-feedback/route.ts`, `src/app/api/manager/portal/beta-feedback/export/route.ts`, `src/app/portal/PortalFloatingTools.tsx`, `src/app/app/manager/portal-overrides/PortalOverridesClient.tsx` | present in dev-retro | This is a merge-together unit; UI and APIs depend on the shared feedback model |
| Reporting, dashboard, services index, credit workflow guidance | `src/lib/portalReportingSummary.server.ts`, `src/lib/portalGuidance.ts`, `src/app/portal/PortalDashboardClient.tsx`, `src/app/portal/app/services/PortalServicesClient.tsx`, `src/app/portal/app/services/reporting/PortalReportingClient.tsx`, `src/app/portal/app/services/credit-reports/CreditReportsClient.tsx`, `src/app/credit/app/disputes/DisputeLettersClient.tsx`, `src/app/portal/app/tasks/PortalTasksClient.tsx` | present in dev-retro | Merge reporting server and reporting/dashboard clients together |
| Public hosted-form continuity and submit guards | `src/lib/publicFormResolution.ts`, `src/lib/publicFormSubmitGuards.ts`, `src/lib/publicHostedOrigin.ts`, `src/app/api/public/credit/forms/[slug]/*`, `src/app/api/public/portal/forms/[slug]/*`, `src/app/forms/[slug]/[key]/page.tsx`, `src/app/f/[slug]/[key]/**`, `src/app/domain-router/[domain]/[[...path]]/page.tsx` | present in dev-retro | A shared helper first merge is required; route and page surfaces depend on the same resolution rules |
| Funnel Builder and booking continuity already on `dev-retro` | `src/app/portal/app/services/funnel-builder/FunnelBuilderClient.tsx`, `src/app/portal/app/services/funnel-builder/forms/[formId]/edit/FormEditorClient.tsx`, `src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx`, `src/app/api/public/booking/[slug]/book/route.ts`, `src/app/portal/app/services/booking/PortalBookingClient.tsx` | conflicting | `dev-retro` has continuity and beta fixes here, but `origin/main` also has heavy funnel and booking work on the same surfaces |
| Hosted page editor and hosted-page document routes | `prisma/migrations/20260412130000_add_hosted_page_documents/migration.sql`, `src/app/api/portal/hosted-pages/documents/**`, `docs/plans/hosted-page-editor-unification-plan.md` | missing from dev-retro | This is currently only on `origin/main`; migration and route set should be merged together or not at all |
| Pura routing and AI chat quality work | `src/app/api/portal/ai-chat/threads/**`, `src/app/api/portal/ai-chat/actions/execute/route.ts`, `src/app/portal/app/ai-chat/PortalAiChatClient.tsx`, `docs/pura-ai-only-guardrail.md`, `docs/plans/pura-*.md` | conflicting | `dev-retro` has the recent beta send-state fix; `origin/main` has broader routing and reply-quality changes |
| Credit dispute polish and styling | `src/app/api/portal/credit/disputes/**`, `src/app/credit/app/disputes/DisputeLettersClient.tsx` | conflicting | `origin/main` has styling and flow polish while `dev-retro` has dispute-letter placeholder and workflow updates |
| Manager/admin docs and audits | `docs/internal-role-boundary-platform-admin-access-audit.md`, `docs/manager-portal-overrides-ui.md`, `docs/operator-guidance-friction-scorecard.md` | present in dev-retro | Documentation is on `dev-retro`; keep it with the routes and UI it describes |
| Prompt tracker and post-beta tracker | `docs/post-beta-platform-improvement-tracker.md`, `docs/platform-improvement-prompt-tracker.md` | unknown | Both files are missing locally, so prompt-level completeness cannot be proven from repo artifacts |
| Prisma seed changes | `prisma/seed.ts` | conflicting | `prisma/seed.ts` differs on both `dev-retro` and `origin/main`; merge manually alongside any new capabilities and demos |
| Prisma schema and migrations | `prisma/migrations/20260412130000_add_hosted_page_documents/migration.sql` | missing from dev-retro | No live `prisma/schema.prisma` diff was found between `dev-retro` and `origin/main`, but the hosted-page migration is still main-only |

## What Has Landed In `dev-retro`

Relative to `registrar-dev`, the current `dev-retro` head clearly contains:

- validated auth-access hardening and public webhook security work
- recoverability foundation, restore/purge APIs, and the manager recovery console
- platform-admin capability routing and related manager/admin updates
- invite role enforcement and manager portal-overrides corrections
- beta feedback intake, triage, export, and structured manager review surfaces
- reporting/dashboard/services guidance and related credit workflow handoffs
- hosted-form continuity and submit-guard work
- the recent beta-triage fixes already committed during this session, including:
  - `src/app/portal/app/ai-chat/PortalAiChatClient.tsx`
  - `src/app/portal/app/services/reporting/sales/PortalSalesReportingClient.tsx`
  - `src/app/app/manager/invites/ManagerInvitesClient.tsx`

## What Is Still Only On Another Branch

The meaningful surviving non-`dev-retro` line is `origin/main`.

Notable work present on `origin/main` and missing from `dev-retro` includes:

- hosted-page document APIs and their migration
- broader funnel-builder and hosted-page editor route shape changes
- additional Pura routing and reply-quality work
- additional portal/connect polish, business-profile polish, and glass UI work
- extra Pura and funnel planning docs plus prompt/agent instruction files
- `scripts/pura-production-smoke.cjs`
- branch-specific seeding helpers such as `scripts/seed-ai-outbound-demo.mjs` and `scripts/seed-demo-business-credit.mjs`

The surviving `p022*` and `p023a` prompt branches do not currently represent separate unmerged implementation units because they are already ancestors of `dev-retro`.

## Likely Conflict Zones

These files or file families are the highest-probability merge-conflict surfaces because both branch lines moved them or because they are central shared abstractions.

- `prisma/seed.ts`
- `src/app/(auth)/login/PortalLoginClient.tsx`
- `src/app/api/manager/invites/route.ts`
- `src/app/api/manager/invites/send/route.ts`
- `src/app/api/manager/portal/overrides/route.ts`
- `src/app/api/manager/portal/user-details/route.ts`
- `src/app/api/portal/ai-chat/actions/execute/route.ts`
- `src/app/portal/app/ai-chat/PortalAiChatClient.tsx`
- `src/app/api/portal/credit/disputes/**`
- `src/app/credit/app/disputes/DisputeLettersClient.tsx`
- `src/app/api/portal/booking/calendars/route.ts`
- `src/app/portal/app/services/booking/PortalBookingClient.tsx`
- `src/app/portal/app/services/funnel-builder/FunnelBuilderClient.tsx`
- `src/app/portal/app/services/funnel-builder/forms/[formId]/edit/FormEditorClient.tsx`
- `src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx`
- `src/app/portal/PortalDashboardClient.tsx`
- `src/app/portal/app/services/PortalServicesClient.tsx`
- `src/app/portal/app/services/reporting/PortalReportingClient.tsx`
- `src/app/portal/PortalFloatingTools.tsx`
- `src/app/domain-router/[domain]/[[...path]]/page.tsx`
- `src/app/forms/[slug]/[key]/page.tsx`
- `src/app/f/[slug]/[key]/hostedFunnelRoute.tsx`

## Changes That Must Merge Together

### 1. Security and access foundation

Merge together:

- `src/lib/apiAuth.ts`
- `src/lib/portalAuth.ts`
- `src/lib/publicIntakeSecurity.ts`
- `src/lib/twilioWebhookSecurity.ts`
- `src/lib/internalCapabilities.ts`
- `src/lib/platformAdminGrants.ts`
- `src/app/api/auth/**`
- `src/app/api/hr/employees/[employeeId]/platform-admin/route.ts`
- `scripts/auth-access-validation.js`

These changes set the contract for the admin and public routes that depend on them.

### 2. Recoverability foundation before recovery UI

Merge together:

- `src/lib/recoverability.ts`
- `src/app/api/manager/recoverability/**`
- `src/app/app/manager/admin/recovery/**`
- `docs/recoverability-deletion-safety-audit.md`
- `docs/recoverability-retention-policy.md`

Do not merge the console UI without the underlying archive, restore, and purge helpers.

### 3. Manager invite governance and beta feedback

Merge together:

- `src/lib/employeeInviteRoles.ts`
- `src/lib/employeeInvitesSchema.ts`
- `src/app/api/manager/invites/**`
- `src/app/app/manager/invites/**`
- `src/lib/betaFeedback.ts`
- `src/app/api/portal/bug-report/route.ts`
- `src/app/api/manager/portal/beta-feedback/**`
- `src/app/app/manager/portal-overrides/**`
- `src/app/portal/PortalFloatingTools.tsx`

The role model, send flow, portal feedback capture, and manager review surface are one functional cluster.

### 4. Public form continuity before builder/editor links

Merge together:

- `src/lib/publicFormResolution.ts`
- `src/lib/publicFormSubmitGuards.ts`
- `src/lib/publicHostedOrigin.ts`
- `src/app/api/public/credit/forms/**`
- `src/app/api/public/portal/forms/**`
- `src/app/forms/[slug]/[key]/page.tsx`
- `src/app/f/[slug]/[key]/**`
- `src/app/domain-router/[domain]/[[...path]]/page.tsx`
- `src/app/portal/app/services/funnel-builder/FunnelBuilderClient.tsx`
- `src/app/portal/app/services/funnel-builder/forms/[formId]/edit/FormEditorClient.tsx`

The helpers control the routing truth; the editor and preview links should follow them, not precede them.

### 5. Reporting and credit workflow handoff

Merge together:

- `src/lib/portalReportingSummary.server.ts`
- `src/lib/portalGuidance.ts`
- `src/app/portal/PortalDashboardClient.tsx`
- `src/app/portal/app/services/PortalServicesClient.tsx`
- `src/app/portal/app/services/reporting/PortalReportingClient.tsx`
- `src/app/portal/app/services/credit-reports/CreditReportsClient.tsx`
- `src/app/credit/app/disputes/DisputeLettersClient.tsx`
- `src/app/portal/app/tasks/PortalTasksClient.tsx`
- `src/app/portal/app/people/contacts/PortalPeopleContactsClient.tsx`

The server summary contract and the client handoff copy must stay aligned.

### 6. Main-only hosted page editor line

If the `origin/main` hosted-page editor line is intended to survive, merge together:

- `prisma/migrations/20260412130000_add_hosted_page_documents/migration.sql`
- `src/app/api/portal/hosted-pages/documents/**`
- `docs/plans/hosted-page-editor-unification-plan.md`
- the related funnel-builder route shape changes on `origin/main`

This line is not safely mergeable as isolated route files because it includes migration and content-model assumptions.

### 7. Pura route logic and client UX

Merge together:

- `src/app/api/portal/ai-chat/actions/execute/route.ts`
- `src/app/api/portal/ai-chat/threads/**`
- `src/app/portal/app/ai-chat/PortalAiChatClient.tsx`
- any retained Pura guardrail or plan docs

`dev-retro` and `origin/main` both changed this surface for different reasons. A selective merge is more likely to break reply state or thread status than a grouped merge.

## Recommended Merge Order

1. Merge security, route-auth, and platform-admin capability changes first.
2. Merge recoverability foundation and manager recovery routes next, then the recovery console UI.
3. Merge invite role enforcement and beta feedback/account-management surfaces.
4. Merge public hosted-form continuity helpers and routes before any dependent builder/editor or preview link work.
5. Reconcile the divergent Prisma seed changes before any new seed-dependent validation.
6. Merge reporting/dashboard/services/credit workflow handoff changes.
7. Merge the `origin/main` hosted-page editor and funnel route line as one deliberate unit, not as isolated file picks.
8. Reconcile Pura route logic with the recent `dev-retro` beta-triage UI fixes.
9. Merge lower-risk shell and polish work last.

## Final Checks To Rerun After Merge

Run these after the combined branch is assembled:

- `npx tsc --noEmit --project tsconfig.json`
- `npm run lint`
- `npm run build`
- `npm run test:auth-access-validation`
- `npm run test:route-browser-smoke`
- `npm run test:journey-browser-smoke`
- `npm run funnel:scorecard`
- `npm run pura:intent-smoke`
- Prisma generate plus migration status review if the hosted-page migration is merged

Re-run targeted manual or scripted smokes for:

- manager recovery console archive, restore, and purge paths
- manager invites creation and send-result traceability
- manager portal overrides and beta feedback triage/export
- Pura thread send, loading state, unresolved run handling, and reply completion
- funnel editor booking calendar continuity and hosted preview/live links
- portal reporting, sales reporting, and credit-report handoff surfaces

## Blocked And Unknown Areas

- `docs/post-beta-platform-improvement-tracker.md` is missing, so repo-local prompt-to-file mapping is incomplete
- `docs/platform-improvement-prompt-tracker.md` is missing, so prompt history drift cannot be reconciled from the workspace alone
- `origin/main` contains a large hosted-page and Pura line that may have been validated elsewhere, but this audit stayed read-only and did not replay that validation
- no separate local branches were found for late prompt slices such as `P-031` through `P-036`; their evidence is commit- and file-based rather than branch-name based
- `prisma/schema.prisma` changed on both lines historically, but there is no live branch diff for it now; migration compatibility should still be reviewed when reconciling the hosted-page work

## Bottom Line

`dev-retro` currently holds the validated post-beta security, recoverability, manager/admin, feedback, reporting, hosted-form continuity, and recent beta-triage fixes.

The real merge-readiness risk is not the old `p022*` or `p023a` branches. Those are already ancestors of `dev-retro`. The risk is the live divergence between `dev-retro` and `origin/main`, especially across Funnel Builder, hosted-page editing, Pura, booking, reporting, disputes, manager/admin surfaces, and `prisma/seed.ts`.

Treat `dev-retro` as the post-beta integration line, treat `origin/main` as a separate delivered line that still contains missing changes, and merge the foundational security and recoverability layers before reconciling the shared UI surfaces.