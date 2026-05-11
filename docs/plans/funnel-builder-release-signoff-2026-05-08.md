# Funnel Builder Release Signoff

Date: 2026-05-08

Status: conditional

This signoff records the current UX and abuse/security review state for the funnel builder launch pass.

## UX review

- Editor shell was reviewed at the code and artifact level after the mobile organization pass.
- Funnel editor now collapses the page rail on narrower widths so the first screen is not consumed by navigation.
- Form editor primary actions now stack cleanly on smaller widths instead of forcing clipped controls.
- Page-health output now surfaces a real business-profile score inside the overall readiness score.
- Mobile-width editor validation on 2026-05-08 confirmed the create-page flow remains usable at `390x844`, including in-flight button disabling, duplicate-route guidance, success into a clear empty state, and inline validation for invalid routes.
- Form editor failure-language validation on 2026-05-08 confirmed stale `404` load errors now render product copy instead of the raw `Not found` message.
- Live create-funnel validation on 2026-05-08 confirmed the list-to-create flow seeds a first draft from the modal inputs, routes into the editor cleanly, and resolves a working hosted page URL.
- Preview-route validation on 2026-05-08 confirmed the hosted slug+key root now canonicalizes to the first page slug instead of hanging on the ambiguous root path; isolated validation returned `307` to the page route and then `200`.
- Additional isolated desktop editor pass on 2026-05-08 at `http://localhost:3002` confirmed list preview, editor open, temporary page create, mobile preview toggle, product-safe publish failure handling, and page delete all behaved coherently in one session.
- Remaining UX blocker: full create-flow and all-primary-click-path manual walkthrough coverage is still incomplete.

## Abuse and security review

- High-cost builder AI routes now enforce owner-scoped rolling spend caps, per-route rate limits, and persistent short-window audit logging.
- Guardrail alerts now record repeated 402s, burst retries, and sudden spend spikes.
- API-key variant selection now resolves from the owner account instead of trusting a request header fallback.
- Builder AI attachment URLs are restricted to trusted assets, and remote media import rejects unsafe fetch targets.
- Builder settings responses no longer expose the raw webhook secret.
- Contract and secret-exposure audit completed cleanly at `tmp/funnel_builder_contracts.json`, with no bare-error route findings and no client-visible secret findings.
- Negative-path audit completed cleanly at `tmp/funnel_builder_negative_paths.json`, including `401`, `403`, `402`, malformed-payload, oversized-payload, and empty-input coverage.
- Provider-failure and timeout audit completed cleanly at `tmp/funnel_builder_ai_provider_failures.json`, confirming product-safe `500` responses for read-aloud timeout and custom-code provider failure.
- Session and API-key access matrix completed on 2026-05-08 and saved at `tmp/funnel_builder_security_matrix.json`, covering anonymous create denial, service-role denial, portal/credit cookie-slot mismatch denial, API-key variant mismatch denial, cross-owner funnel/page denial, and stale-session mutation denial.
- Remaining-gates audit completed on 2026-05-08 and saved at `tmp/funnel_builder_remaining_gates.json`, covering public form continuity into contacts and funnel events, public booking continuity into bookings and funnel events, cross-owner generate-html denial, cross-owner booking-calendar attach denial, and manager-route denial from a builder-facing session.
- The session auth boundary now blocks a previously reproducible credit-to-portal cookie-slot bypass in `src/lib/funnelBuilderAccess.ts`.

## Linked evidence

- `tmp/funnel_builder_contracts.json`
- `tmp/funnel_builder_negative_paths.json`
- `tmp/funnel_builder_ai_provider_failures.json`
- `tmp/funnel_edit_final_scorecard.json`
- `tmp/newsletter_targeted_after_patch.json`
- `tmp/funnel_builder_security_matrix.json`
- `tmp/funnel_builder_remaining_gates.json`

## Remaining blockers before unconditional signoff

- Full desktop and mobile click-path walkthrough coverage is still incomplete.
- Booking-specific manual QA coverage is still incomplete.
- Credit-exhaustion abuse loops for read-aloud, custom-code generation, and repair-heavy generate-html retries are still not saved as artifacts.