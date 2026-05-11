# Funnel Builder Data Retention

Date: 2026-05-08

This document defines the current retention and deletion behavior for funnel builder drafts, generated artifacts, uploads, and the new guardrail audit state. It describes current behavior only.

## Drafts and generated pages

- Funnel pages, page draft HTML, saved custom code fragments, and saved thread history persist until the owner deletes the page or funnel.
- Failed AI generation attempts do not publish live changes automatically.
- If an AI generation run fails before the route returns a usable result, no hidden partial HTML is committed as a separate abandoned artifact.
- Live publish state remains separated from draft state. Failed draft-generation attempts do not overwrite the live page.

## Uploads and imported media

- Media library uploads and remote imports persist until the owner deletes them.
- Media read, update, and delete routes are owner-scoped and operate on the stored media item itself, not only on a parent collection lookup.
- Oversized uploads, oversized remote imports, and non-image remote imports fail before storage write.

## Guardrail audit data

- Funnel builder request-rate hits, AI charge events, and guardrail alerts are stored under the owner-scoped `portalServiceSetup` record with service slug `__funnel_builder_guardrails`.
- This guardrail state is intentionally short-lived.
- Rate-hit records, charged-event records, and alerts are retained in rolling windows and pruned automatically.
- Current retention window: up to 24 hours of recent guardrail state.
- Current caps: 300 rate hits, 500 events, and 120 alerts per owner.

## Deletion behavior

- Deleting a funnel removes its pages and their draft/live content according to the owning route and database cascade behavior.
- Deleting a media item removes the stored object for that owner.
- Guardrail audit state is pruned automatically over time; it is not intended to be a permanent analytics store.

## Operational note

- If long-term analytics or legal retention becomes required later, add a dedicated audit table or warehouse export. The current guardrail store is a rolling abuse-protection ledger, not a permanent record system.