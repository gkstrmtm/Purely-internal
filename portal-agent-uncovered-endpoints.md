# Portal Agent Uncovered Endpoints

As of **2026-03-25**, all declared portal agent action endpoints are implemented in the runtime executor.

## Coverage summary

- Source of truth for action keys: `src/lib/portalAgentActions.ts` → `PortalAgentActionKeySchema = z.enum([...])`
- Executor implementation: `src/lib/portalAgentActionExecutor.ts` → `runDirectAction()` switch `case "...":`

Results:

- Action keys in enum: **305**
- Executor `case` labels found: **312**
- Uncovered (enum keys missing an executor `case`): **0**

## Uncovered endpoints

None.

## Notes

- The executor has **7** additional `case` labels that are *not* action endpoints (they are internal helpers / non-action selectors):
  - `"7"`, `"7d"`, `"30"`, `"30d"`, `"90"`, `"90d"`, `"all"`

## How this was computed

A simple text-level diff was run:

1. Parse action keys from the `z.enum([...])` block.
2. Parse executor cases via regex `case "<key>":`.
3. Compute `missing = enumKeys - executorCases`.

The last computed diff output is stored in:

- `tmp_uncovered_actions_enum.json`
