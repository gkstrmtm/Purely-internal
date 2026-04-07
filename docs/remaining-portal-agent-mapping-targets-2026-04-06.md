# Remaining portal-agent mapping targets

Updated: 2026-04-06

This list reflects the current explicit coverage audit after adding:
- integrations API key routes
- dashboard analysis + quick access routes
- AI chat status + runs helper routes
- contact delete coverage
- AI chat dictate coverage
- funnel submission detail coverage

Current uncovered product-facing route count: 0

## Remaining uncovered product-facing routes

None.

## Excluded simulator/dev routes

1. `POST /api/portal/ai-flow-sim`
   - File: `src/app/api/portal/ai-flow-sim/route.ts`
   - Notes: intentionally excluded from agent coverage gaps because it is simulator/dev tooling.

2. `POST /api/portal/ai-flow-sim/explain`
   - File: `src/app/api/portal/ai-flow-sim/explain/route.ts`
   - Notes: intentionally excluded from agent coverage gaps because it is simulator/dev tooling.

## Suggested order

1. Treat new product-facing routes the same way: add an explicit action only when the route represents a real end-user capability.
2. Keep simulator/support-only routes on the exclusion list unless they need to become first-class operator tools.

## Audit snapshot

- Inventory routes: 254
- Endpoint+method pairs: 337
- Covered pairs: 335
- Excluded simulator/dev pairs: 2
- Uncovered product-facing pairs: 0
