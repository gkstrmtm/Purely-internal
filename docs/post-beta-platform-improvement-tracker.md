# Post-Beta Platform Improvement Tracker

- Tracker date: `2026-05-20`
- Branch: `dev-retro`
- Scope: future-growth outcome guidance and revenue-readiness follow-through

## Product goal

Turn Purely from a service catalog into an outcome-guided operating system.

The user-facing guidance in this cycle must answer, from real stored platform state:

- what is already set up
- what is missing
- what the next best action is
- why that action matters for revenue
- which service or page to open next

## Guardrails

- Do not fake revenue, ROI, booked appointments, provider confirmations, social metrics, email delivery, SMS delivery, or AI outcomes.
- Do not trigger live outbound messages, calls, emails, scraping, social posts, purchases, or automations.
- Do not change Pura or chat routing, chat-agent behavior, or AI chat actions.
- Keep Meta, Facebook, and Instagram publishing soft-gated and manual-post only.

## Slice status

| Slice | Status | Notes |
| --- | --- | --- |
| `FG-001` booking-link growth wrapper | complete | Already landed before this tracker pass; preserved as part of the current growth-readiness foundation. |
| `FG-002` booking confirmation and handoff reporting | complete | Reporting continues to keep redirect-confirmed and provider-confirmed booking truth separate from native booking totals. |
| `FG-003` media-to-campaign operating layer | complete | Media continuity signals remain part of the shared readiness snapshot without claiming direct publishing success. |
| `FG-004` social distribution continuity | complete | Social guidance stays manual-post only and does not imply direct Meta publishing. |
| `FG-005B` Meta coming-soon soft gate and connection architecture | complete | Added an owner-scoped Meta readiness model, Media Library coming-soon/early-access UI, and a blocked Meta publish route that returns a truthful conflict response instead of implying live connection or publishing. |
| `FG-006` growth playbooks | complete | Added deterministic readiness categories, top actions, starter paths, and playbooks derived from stored portal state. |
| `FG-007` revenue readiness | complete with environment caveat | Added provider blockers and revenue-readiness guidance across dashboard, services, reporting, and a shared API route. Route-level proof is complete; full browser reload proof remains noisy in the current dev session. |
| `FG-009` Prisma schema build blocker for media growth | complete | Added the missing `User` back-reference for `PortalMediaGrowthProfile`, clearing Prisma schema validation. A clean uncontended production build now completes successfully. |
| `P-043` final dev-retro merge sync handoff | complete | Clean build and smoke validation are complete on `dev-retro`. Sync/merge guidance is captured in `docs/platform-improvement-final-dev-retro-handoff.md`. |
| `P-044` public policy pages for Meta review readiness | complete | Added public privacy, terms, data deletion, and provider-integration policy pages under the unauthenticated marketing shell, plus footer links and public proof that the routes return `200` without login. |
| `P-045` platform contract clarity hardening | validated | Demo login repair is now explicitly gated, portal account invites always send hosted links plus resend actions, inbound SendGrid drop paths no longer return fake success, AI fallback states are surfaced more honestly, the public booking CTA now has a callback handoff when no slots exist, and external confirmation dedupe now explains same-handoff duplicates more clearly. Typecheck, build, auth smoke, route smoke, journey smoke, and invalid-token inbound proof all now pass against a single clean production server. |
| `P-046` dev runtime 500 stabilization and smoke recovery | complete | The blanket local `500`s were caused by a Next route-graph conflict under `src/app/api/portal/people/users` where both `[userId]` and `[inviteId]` existed for the same segment, plus a broken Windows dev task path pointing at `/opt/homebrew/bin/npm`. Aligning the resend route under `[userId]`, removing the stale `[inviteId]` folder, and fixing the task launcher restored stable smoke validation. |
| `P-047` funnel-to-conversion friction audit and fix | validated | Funnel Builder now removes the blank-slug trap on form creation, form editor share guidance shows the exact keyed preview path without hydration-driven link drift, and form responses now point straight into People, follow-up, and Reporting. Browser proof now covers create form -> public submit -> response visible -> matched contact handoff. |
| `P-048` plain-language UX copy pass for core conversion flows | complete with browser proof pending | People contact details now call out personalization fields and custom fields in plain language, Follow-up uses clearer field insertion wording, Funnel Builder and the form editor describe public links versus private previews more directly, and Reporting plus Booking now explain outside booking activity and confirmation setup without leaking internal provider jargon. TypeScript validation passes on the changed slices. |

## Implementation added in this slice

- Owner-scoped Meta readiness helper: `src/lib/portalMetaProviderReadiness.ts`
- Meta readiness API route: `src/app/api/portal/media/providers/meta/readiness/route.ts`
- Meta publish guardrail route: `src/app/api/portal/media/providers/meta/publish/route.ts`
- Media growth default provider-state update: `src/lib/portalMediaGrowth.ts`
- Media Library Meta coming-soon UI: `src/app/portal/app/services/media-library/PortalMediaLibraryClient.tsx`
- Public legal link registry: `src/components/marketing/legalLinks.ts`
- Public legal page shell: `src/components/marketing/MarketingLegalPage.tsx`
- Public privacy policy route: `src/app/privacy/page.tsx`
- Public terms route: `src/app/terms/page.tsx`
- Public data deletion route: `src/app/data-deletion/page.tsx`
- Public provider integrations route: `src/app/provider-integrations/page.tsx`
- Public marketing footer legal links: `src/components/marketing/MarketingLanding.tsx`
- Demo login repair gating: `src/app/portal/api/login/route.ts`
- Cookie-aware portal variant resolution: `src/lib/portalVariant.ts`
- Portal auth request-context update: `src/lib/portalAuth.ts`
- Clearer portal versus employee auth errors: `src/app/api/customer/me/route.ts`
- Honest SendGrid inbound drop responses: `src/app/api/public/inbox/catchall/[token]/sendgrid/inbound/route.ts`
- AI chat fallback metadata: `src/app/api/portal/ai-chat/threads/[threadId]/messages/route.ts`
- AI chat fallback notice UI: `src/app/portal/app/ai-chat/PortalAiChatClient.tsx`
- Outbound AI fallback review toast: `src/app/portal/app/services/ai-outbound-calls/PortalAiOutboundCallsClient.tsx`
- Employee invite code-first copy: `src/app/app/manager/invites/page.tsx`
- Employee invite code/email action clarity: `src/app/app/manager/invites/ManagerInvitesClient.tsx`
- Marketing booking callback fallback handoff: `src/components/marketing/MarketingLanding.tsx`
- External confirmation duplicate explainability: `src/lib/externalBookingConfirmation.ts`
- Public booking confirmation duplicate messaging: `src/app/book/[slug]/confirmed/page.tsx`
- Funnel Builder form create-flow slug guidance: `src/app/portal/app/services/funnel-builder/FunnelBuilderClient.tsx`
- Form editor keyed-preview link and status guidance: `src/app/portal/app/services/funnel-builder/forms/[formId]/edit/FormEditorClient.tsx`
- Funnel editor runtime hosted-origin hydration fix: `src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx`
- Form response matched-contact lookup: `src/app/api/portal/funnel-builder/forms/[formId]/submissions/[submissionId]/route.ts`
- Form response next-step handoff UI: `src/app/portal/app/services/funnel-builder/forms/[formId]/responses/FormResponsesClient.tsx`
- People contact-detail plain-language personalization copy: `src/app/portal/app/people/contacts/PortalPeopleContactsClient.tsx`
- Follow-up plain-language personalization controls: `src/app/portal/app/services/follow-up/PortalFollowUpClient.tsx`
- Funnel Builder public-link wording pass: `src/app/portal/app/services/funnel-builder/FunnelBuilderClient.tsx`
- Form editor private-preview versus public-link wording pass: `src/app/portal/app/services/funnel-builder/forms/[formId]/edit/FormEditorClient.tsx`
- Reporting plain-language booking activity and coverage wording: `src/app/portal/app/services/reporting/PortalReportingClient.tsx`
- Booking setup plain-language outside-booking and confirmation wording: `src/app/portal/app/services/booking/PortalBookingClient.tsx`
- Shared readiness model and builder: `src/lib/portalGrowthReadiness.ts`
- Shared server snapshot loader: `src/lib/portalGrowthReadiness.server.ts`
- Browser-facing readiness API: `src/app/api/portal/growth/readiness/route.ts`
- Dashboard consumption: `src/app/portal/PortalDashboardClient.tsx`
- Services index consumption: `src/app/portal/app/services/PortalServicesClient.tsx`
- Reporting consumption: `src/app/portal/app/services/reporting/PortalReportingClient.tsx`

## Validated proof

- File-level validation passed on the touched files.
- `npx prisma validate` passes.
- `npx tsc --noEmit --project tsconfig.json --pretty false` passes.
- A clean uncontended `npm run build` completed successfully, including Prisma generate, TypeScript, and static page generation.
- `get_errors` on the P-045 touched files found no code errors in the changed slices; the remaining diagnostics in `src/components/marketing/MarketingLanding.tsx` are pre-existing Tailwind class simplification suggestions outside this contract-hardening change.
- P-045 implementation proof is complete at the compile/build layer:
  - `npx tsc --noEmit --project tsconfig.json --pretty false`
  - `npm run build`
- P-046 resolved the prior blanket dev-session `500`s to a concrete route-runtime issue rather than a product regression:
  - Next was repeatedly throwing `You cannot use different slug names for the same dynamic path ('userId' !== 'inviteId')`
  - the conflicting subtree was `src/app/api/portal/people/users/[userId]` versus the stale `src/app/api/portal/people/users/[inviteId]`
  - the Windows `Dev: next dev absolute` task also pointed at `/opt/homebrew/bin/npm` instead of `npm`
- Post-build smoke validation now passes against a single clean `next start` instance on `localhost:3000`:
  - `npm run test:auth-access-validation`
  - `npm run test:route-browser-smoke`
  - `npm run test:journey-browser-smoke`
  - safe invalid-token `POST /api/public/inbox/catchall/not-a-real-token/sendgrid/inbound` returned `401` with `{ ok:false, accepted:false, reason:"invalid_token" }`
- P-047 funnel proof now succeeds in the live local browser session:
  - leaving the form slug blank while naming the form generated a usable slug and created `P047 Auto Slug Proof` at `/p047-auto-slug-proof`
  - the form editor preview button resolved to the exact keyed hosted path for `P047 Intake Form`: `/forms/p047-intake/5394d8cp`
  - public submission succeeded for `p047-audit-lead@purelyautomation.dev` and rendered the success state instead of stalling on validation
  - the response immediately appeared under `Loaded: 1` in the form responses view
  - the submission drawer exposed `Open contact`, `Follow up by email`, `Follow up by SMS`, and `Open Reporting`
  - `Open contact` resolved to a real People contact record for `P047 Audit Lead`
- P-048 compile-level proof now succeeds for the plain-language copy pass:
  - `npx tsc --noEmit --project tsconfig.json --pretty false`
  - touched conversion-facing surfaces now compile cleanly after replacing technical user-facing terms with plain-language link, preview, personalization, reporting, and booking wording
- Direct helper proof succeeded for both seeded personas:
  - `demo-full@purelyautomation.dev`
  - `credit-client@purelyautomation.dev`
- Live authenticated route proof succeeded from browser sessions after route hardening:
  - portal session returned `200` with provider and booking next-action guidance
  - credit session returned `200` with Twilio and payment-reporting blockers
- Live authenticated Media Library proof now succeeds for the credit persona:
  - owner-scoped Meta coming-soon card renders with Facebook Page and Instagram professional account placeholders
  - the Meta action remains disabled as `Coming soon`
  - manual-post messaging remains the active path in both the page shell and item-level provider continuity panel
  - `POST /api/portal/media/providers/meta/publish` returns `409` with `meta_provider_coming_soon`
- Live unauthenticated policy-page proof now succeeds on the public shell:
  - `/privacy` returns `200` and includes Meta/Facebook/Instagram privacy language
  - `/terms` returns `200` without authentication
  - `/data-deletion` returns `200` and includes public provider-data deletion instructions suitable for Meta review
  - `/provider-integrations` returns `200` and explicitly states owner-scoped Meta assets plus soft-gated direct publishing

## Current known limitation

- The growth-readiness API itself is now returning structured JSON successfully in the authenticated portal and credit browser sessions.
- Low-activity portal browser proof is still limited by the existing login-page `ToastProvider` instability in this environment.
- Broader portal/credit/employee auth unification is still deferred. P-045 only hardens the existing contract boundaries and messages; it does not rewrite the multi-surface auth architecture.

## Next verification target

- Re-run browser-level visual proof on dashboard, services, and reporting once the local dev session reload path is stable enough to trust full page refreshes.