# Funnel Builder Readiness And Security Checklist

Date: 2026-05-08

This document is the working readiness gate for funnel builder launch quality. It is not a hype document. Nothing gets marked complete unless the behavior was actually checked.

## Current hardening already landed

- [x] Funnel create route now supports request-bound idempotent credit charging.
- [x] Funnel page create route now supports request-bound idempotent credit charging.
- [x] Visual review now charges credits for screenshot-backed AI critique.
- [x] Visual review now rejects oversized preview payloads.
- [x] Read-aloud now charges credits before TTS generation.
- [x] Custom code block generation now charges credits for each AI step.
- [x] Generate HTML now enforces a per-request AI step cap before charging more credits.
- [x] Several funnel-builder AI routes now return generic user-safe errors instead of raw internal/provider failures.
- [x] Funnel builder list and editor shell got a first-pass UX cleanup for primary actions and duplicated status noise.
- [x] Admin-only diagnostics and reliability readouts are kept off hosted/customer funnel surfaces.

## Release gate

### UX and interaction

- [x] Funnel list cards expose the primary open/edit path clearly.
- [x] Editor header no longer duplicates save/live state in multiple bands.
- [x] Save idle label no longer collides with publish/live idle messaging.
- [x] Create funnel flow has been reviewed from blank state through first live page.
- [x] Create page flow has been reviewed for empty, loading, success, duplicate-submit, and failure states.
- [ ] No raw toasts, stack traces, provider messages, or validation dumps appear in normal builder UX.
- [ ] All primary builder click paths have been manually exercised on desktop.
- [ ] All primary builder click paths have been manually exercised on mobile-width layouts.
- [ ] Motion is intentional and placed only where it improves orientation, hierarchy, or confirmation.
- [ ] Empty states, loading states, and disabled states use product language rather than debug language.
- [x] Customer-facing funnel surfaces remain free of admin diagnostics, reliability widgets, and operator-facing failure language.

### Tenant isolation and data integrity

- [x] Every funnel-builder read route is owner-scoped and rejects cross-owner IDs.
- [x] Every funnel-builder write route is owner-scoped and rejects cross-owner IDs.
- [x] Every nested page/block/media mutation path verifies ownership at the final mutation target, not only at the parent lookup.
- [x] No route trusts client-supplied owner identifiers, billing identifiers, or portal variant fields.
- [x] Cross-account manual test: owner A cannot read, mutate, publish, preview, or delete owner B assets by changing IDs.
- [x] Cross-account manual test: uploaded media, generated HTML, and booking assets do not bleed across owners.
- [x] Credit balances, spend ledgers, and top-up settings cannot be mutated from builder-facing payloads.
- [x] Admin or service-only pathways are not reachable from builder user sessions.

### Billing, abuse, and AI cost control

- [x] Funnel create charges are idempotent when the client retries the same request.
- [x] Funnel page create charges are idempotent when the client retries the same request.
- [x] Visual review is no longer a free screenshot-backed AI path.
- [x] Read-aloud is no longer a free AI path.
- [x] Custom code generation is no longer a free multi-step AI path.
- [x] Generate HTML cannot exceed its per-request AI step cap.
- [x] Per-owner daily or rolling-window AI spend limits exist for high-cost generation routes.
- [x] Per-route rate limits exist for create, generate, review, and read-aloud endpoints.
- [x] AI step counts and credit charges are logged with owner, route, and request identifiers.
- [x] Alerting exists for sudden spend spikes, repeated 402s, or burst retries.
- [x] Replay testing confirms request IDs cannot be reused to obtain free create operations on different targets.
- [x] Abuse testing confirms bots cannot burn credits through anonymous, variant-mismatched, or stale-session requests.

### Error language and failure behavior

- [x] Read-aloud returns a generic failure message on provider/internal errors.
- [x] Visual review no longer reflects raw auth errors.
- [x] Custom code generation no longer leaks raw build errors.
- [x] Generate HTML top-level failures return generic user-safe errors.
- [ ] Every funnel-builder route returns structured, consistent product-safe errors.
- [ ] Frontend presentation maps route failures into calm inline/product messaging instead of raw toast dumps.
- [x] Validation failures name the user-action problem without exposing internal rulesets, stack traces, or provider payloads.
- [ ] Logging still preserves enough internal detail for debugging without leaking secrets or user content into the client.

### Auth, variant, and access control

- [x] Variant restrictions are verified across session auth, API-key auth, and stale-client state.
- [x] Credit-variant users cannot reach routes or assets reserved for non-credit variants.
- [x] API key pathways cannot bypass the same owner and variant checks enforced for session requests.
- [x] Server-only credentials are never exposed to client bundles, client-visible route responses, or logs.
- [x] Secret rotation procedure exists for every third-party provider used by builder AI flows.

### Storage, uploads, and attachments

- [x] Builder media upload/read/delete paths are owner-scoped end to end.
- [x] Attachment URLs used in AI prompts are validated and restricted to expected hosts or trusted stored assets.
- [x] No AI route can be abused as an unrestricted remote fetch proxy.
- [x] Storage retention and deletion behavior is defined for abandoned drafts and failed generations.
- [x] Large upload, oversized image, and malformed attachment paths fail safely and predictably.

### Testing and validation

- [x] Manual QA run completed for funnel list, funnel create, funnel edit, page create, page edit, preview, publish, and live open paths.
- [ ] Manual QA run completed for form embedding, contacts capture, automations linkage, and tracking continuity.
- [ ] Manual QA run completed for booking funnels, booking settings, booking handoff, and booking confirmation states.
- [x] Negative-path run completed for unauthorized, forbidden, insufficient credits, timeout, malformed payload, and oversized payload cases.
- [x] Regression run completed after each security patch set.
- [x] Audit output is stored for the latest targeted funnel edit and newsletter scenarios.
- [x] Release signoff includes both UX review and abuse/security review.

## Highest-priority remaining work

1. Finish the remaining full desktop click-path walkthroughs across the builder surface, not just the core create/edit/publish pass.
2. Finish the remaining mobile-width click-path walkthroughs across the builder surface.
3. Remove any remaining raw or awkward error presentation in the frontend so failures never read like backend/debug output.
4. Run the explicit credit-exhaustion abuse loops for read-aloud, custom-code generation, and repair-heavy generate-html retries.
5. Close the remaining booking-specific manual QA coverage and save the resulting evidence.

## Research-backed risk notes

### Supabase-style multi-tenant risks to assume are real

- Row Level Security must be enabled on every exposed table. Supabase notes that tables created outside the dashboard flow can miss RLS unless it is explicitly enabled.
- Secret keys and legacy `service_role` keys bypass RLS entirely. If a backend route or edge function uses one of these keys without its own authorization layer, tenant isolation is gone.
- Supabase documents that views created with `security definer` can bypass RLS unless `security_invoker = true` is used in supported Postgres versions or the view is moved out of exposed schemas.
- `auth.uid()` returns `null` when unauthenticated. Policies that assume it always has a value can behave differently than expected if the auth check is not explicit.
- Supabase warns against using mutable `raw_user_meta_data` for authorization decisions. Authorization claims belong in immutable app metadata or server-owned data.
- JWT-backed authorization data can be stale until the token refreshes. Removing access in the database is not enough if the enforcement layer trusts old JWT claims too broadly.
- Storage access requires explicit RLS policies on `storage.objects`. Service keys also bypass storage RLS, so uploads and downloads need the same tenant checks as database rows.
- Edge-function or backend key handling is still a root-risk area. Supabase documents that secret keys must never be exposed to browsers, URLs, or logs, and that some key modes require custom authorization inside the function itself.

### OWASP risks that map directly to this builder

- API1 Broken Object Level Authorization: every route that accepts funnel, page, media, contact, or booking IDs must enforce owner checks at the exact object being touched.
- API3 Broken Object Property Level Authorization: mass assignment or permissive JSON updates can let users mutate billing, ownership, or internal state fields.
- API4 Unrestricted Resource Consumption: AI, TTS, screenshots, SMS, email, and booking integrations are paid resources and must be rate-limited and budget-limited.
- API6 Unrestricted Access to Sensitive Business Flows: create, publish, generate, and outbound communication flows can harm the business even when auth is technically valid.
- API8 Security Misconfiguration: exposed debug routes, loose secret handling, over-broad CORS, or missing variant checks create bypasses without any single obvious exploit bug.
- API9 Improper Inventory Management: every builder-adjacent endpoint, background helper, and audit script path needs a known owner and exposure decision.

## Concrete test matrix still required

### Cross-account abuse probes

- [x] Replay create requests with reused request IDs against a different funnel or page target.
- [x] Swap page IDs, funnel IDs, and asset IDs across two test owners and confirm hard 403/404 behavior.
- [x] Attempt preview/live/publish actions on another owner's resources.
- [x] Attempt mutation with stale session state after switching accounts.

### Cost-abuse probes

- [ ] Loop custom-code generation until credits exhaust and confirm clean 402 behavior with no extra spend.
- [ ] Loop read-aloud until credits exhaust and confirm no free TTS output slips through.
- [ ] Force generate-html into repair-heavy prompts and confirm the per-request step cap stops extra charges.
- [x] Confirm visual-review oversized image payloads fail before expensive downstream work.

### Language and UX probes

- [x] Force provider failure, timeout, malformed JSON, and validation failure across each AI route.
- [ ] Confirm the user sees product-language failures rather than route internals.
- [ ] Confirm loading and retry states do not imply success before persistence completes.
- [ ] Confirm create/edit flows stay legible without debug-looking toasts.

## Evidence logged in this pass

- Contract and secret-exposure audit completed on 2026-05-08:
	- artifact present: `tmp/funnel_builder_contracts.json`
	- `ok: true`
	- no bare-error route findings
	- no raw leak findings in routes, client bundles, or tmp artifacts
- Route ownership audit completed across `src/app/api/portal/funnel-builder/**/*.ts`. Read and write paths consistently scope owned resources through `ownerId: auth.session.user.id` or nested `funnel: { ownerId: auth.session.user.id }` checks before access or mutation.
- Nested final-target checks were spot-verified in the page publish, page route, generate-html, custom-code generate, visual-review, threads, and form submission routes rather than relying only on parent funnel lookup.
- Grep audit found no funnel-builder route that reads `ownerId`, billing, credits, or portal variant from the request body for authorization or billing mutation.
- Builder settings write surface only updates notification emails, webhook URL/secret, and Meta pixel fields; no builder-facing route in this API surface writes credit balances, spend ledgers, or top-up settings.
- Builder AI guardrails now persist owner-scoped rolling spend/rate data and short-window alerts under `portalServiceSetup` service slug `__funnel_builder_guardrails`.
- High-cost builder routes now enforce shared request rate limits on funnel create, page create, generate HTML, custom-code generate, visual review, and read-aloud.
- Generate HTML, custom-code generate, visual review, and read-aloud now log charged AI steps with owner, route, request, and step labels through the shared guardrail store.
- API-key portal variant is now resolved from the owner account instead of trusting request-header fallback, and canceled credit accounts are denied through the funnel-builder auth boundary.
- AI prompt attachments are now filtered through a trusted-asset policy in generate-html, custom-code generate, and page chat; remote media import rejects unsafe fetch targets before download.
- Builder settings responses now mask the webhook secret instead of returning the raw secret to the client.
- Retention behavior doc added: `docs/platform-guide/funnel-builder-data-retention.md`
- Secret rotation procedure added: `docs/platform-guide/funnel-builder-secret-rotation.md`
- Release signoff record added: `docs/plans/funnel-builder-release-signoff-2026-05-08.md`
- Manual mobile-width editor QA run completed on 2026-05-08 at `390x844` viewport:
	- funnel editor kept the page rail collapsed behind an explicit "Expand sidebar" control instead of flooding the first screen
	- create-page modal stayed usable on mobile width with direction, route, and AI guidance visible in one flow
	- create-page submit disabled during the in-flight request, preventing blind duplicate-submit behavior
	- successful page create landed on a product-language empty state: "This page is ready for a first move"
	- duplicate-route guidance stayed in product language: "Suggested route is already used; creation will add a numeric suffix."
	- invalid route input (`!!!`) returned product-language inline validation: "Use letters, numbers, and dashes for the page path."
- Form editor failure-language probe completed on 2026-05-08:
	- the editor still hit a backing `404` for the stale form path during probe
	- user-facing copy now renders product language instead of raw backend text: "This form could not be loaded. It may have been deleted or you may no longer have access."
- Create-funnel walkthrough completed on 2026-05-08:
	- funnel list loaded with clear `Open builder` and `Preview` entry points on each card
	- blank-state create modal inferred slug, funnel name, first-draft scaffold, and CTA suggestions from a typed offer
	- submit transitioned into a disabled `Creating...` state before routing into the new funnel editor
	- the seeded first page loaded with product-language loading copy: `Loading page workspace` / `Preparing preview and page controls.`
	- the new funnel resolved to a public hosted URL at `http://localhost:3000/f/qa-launch-funnel-walkthrough/ajvn0ddh` and loaded successfully in a separate browser page
	- temporary QA funnel `cmowfreh301m7lrn4ajvn0ddh` was deleted after validation through the funnel delete API used by the list client
- Additional isolated desktop editor walkthrough completed on 2026-05-08 at `http://localhost:3002`:
	- funnel list preview opened the hosted route and canonicalized `/f/credit-portal-bypass-1778216592596/dgeidejw` to `/f/credit-portal-bypass-1778216592596/dgeidejw/home`
	- `Open builder` loaded the editor cleanly for funnel `cmowg8xbc01nhlrn4dgeidejw`
	- `+ Page` created a temporary page from modal input (`Free credit repair consult`) and routed directly into the new page workspace
	- the new page showed the product-language empty state: `This page is ready for a first move.`
	- switching to mobile preview kept the editor usable and preserved the page state
	- `Publish live` failed with product-safe copy (`We couldn't publish this page right now. Review any highlighted issues and try again.`) instead of exposing a raw `422` contract message
	- deleting the temporary page returned the editor to the original page without leaving a dead route behind
- Session and API-key security matrix completed on 2026-05-08:
	- artifact present: `tmp/funnel_builder_security_matrix.json`
	- anonymous funnel create returned `401 Unauthorized`
	- signed `DIALER` session returned `403 Forbidden` on funnel create
	- a real credit-client token replayed through the portal cookie slot returned `403 Forbidden` after the auth-boundary fix in `src/lib/funnelBuilderAccess.ts`
	- a portal session replayed through the credit cookie slot returned `403 Forbidden`
	- a real scoped API key with `funnelBuilder` permission succeeded on `portal` and returned `403 Forbidden` on `credit`
	- cross-owner read, page-list, patch, preview-adjacent foundation, publish, live-status, and delete requests all returned hard `404` responses against the other owner's funnel/page ids
	- cross-owner media search returned zero matches for the other owner's uploaded file name, and direct media patch/delete by item id returned hard `404` responses
	- stale-session mutation attempt after switching to a second portal account returned `404 Not found`
- Targeted negative-path audit completed on 2026-05-08:
	- artifact present: `tmp/funnel_builder_negative_paths.json`
	- anonymous protected-route access returned `401 Unauthorized`
	- forged manager session returned `403 Forbidden`
	- reduced-credit builder action returned `402 You need more credits to continue this builder action.`
	- malformed `visual-review` request returned `400 Missing required review fields`
	- oversized `visual-review` preview image returned `413 Preview image is too large` before downstream AI work
	- empty `read-aloud` request returned `400 Text is required`
- AI provider-failure and timeout audit completed on 2026-05-08:
	- artifact present: `tmp/funnel_builder_ai_provider_failures.json`
	- `read-aloud` timeout returned `500` with product-safe copy: `Unable to generate read-aloud audio right now.`
	- `custom-code-block/generate` provider failure returned `500` with product-safe copy: `We couldn't apply that change right now. Please try again.`
- Replay safety probe completed in a logged-in browser session on 2026-05-08:
	- Funnel create: same `requestId`, different slug -> two distinct successful creates; same `requestId`, same slug retry -> `409` conflict.
	- Page create: same `requestId`, different slug -> two distinct successful creates; same `requestId`, same slug retry -> `409` conflict.
- Focused regression validation completed after the latest security/error-language patch set:
	- targeted `get_errors` checks passed on the touched routes
	- `Audit: funnel edit targeted final` completed successfully
	- artifact present: `tmp/funnel_edit_final_scorecard.json`
- Newsletter draft edit audit completed successfully on the credits-billed customer portal path on 2026-05-08:
	- variant: `credit`
	- login persona: seeded `credit-client@purelyautomation.dev`
	- create, read, update, and reread all returned `200`
	- artifact present: `tmp/newsletter_targeted_after_patch.json`
	- initial direct probe also passed and was preserved at `tmp/newsletter_credit_client_probe.json`
- Remaining-gates continuity and isolation audit completed on 2026-05-08:
	- artifact present: `tmp/funnel_builder_remaining_gates.json`
	- public form submit returned `200`, created a `CreditFormSubmission`, linked a `PortalContact`, and logged a `form_submitted` `CreditFunnelEvent`
	- public booking submit returned `200`, created a `PortalBooking`, linked contact state, appeared in the owner bookings API, and logged a `booking_created` `CreditFunnelEvent`
	- a second-owner portal session hit hard denial on cross-owner `generate-html` with `404 Not found`
	- patching an admin-owned funnel with another owner's booking calendar id returned `400 Booking calendar not found or not enabled`
	- a builder-facing `credit-client` session received `401 Unauthorized` on `/api/manager/portal/user-details`
	- hosted preview root canonicalization bug was fixed and validated on an isolated clean server: `/f/manual-qa-strategy-session/pax9bbou` returned `307` and resolved to `/f/manual-qa-strategy-session/pax9bbou/home` with `200`
- Customer-facing diagnostics boundary audit completed on 2026-05-08:
	- targeted grep found no new `portal diagnostics`, `action_failure`, `reportPortalActionFailure`, `usePortalDiagnosticsTracker`, `reliabilitySummary`, or `Action failures` references under hosted/public funnel surfaces
	- diagnostics and reliability readouts remain scoped to portal, reporting, and manager/operator surfaces

## Current blockers

- Full desktop and mobile click-path walkthrough coverage is still incomplete.
- Booking-specific manual QA coverage is still incomplete.
- Credit-exhaustion abuse loops for read-aloud, custom-code generation, and repair-heavy generate-html retries are still not saved as artifacts.

## Source references used for the risk notes

- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase API Keys: https://supabase.com/docs/guides/getting-started/api-keys
- Supabase Storage Access Control: https://supabase.com/docs/guides/storage/security/access-control
- OWASP API Security Top 10 2023: https://owasp.org/API-Security/editions/2023/en/0x11-t10/