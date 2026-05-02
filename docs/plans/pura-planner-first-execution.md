# Pura planner-first execution slice

## Goal
Make normal mutating Pura chat requests follow one consistent pipeline:
1. AI planner call reads the user message and thread context.
2. Planner returns structured steps.
3. Each step resolves and executes in order.
4. One final AI synthesis call produces the assistant reply.

## Scope for this slice
This slice is done only when normal work-mode mutating requests stop taking the old preflight/direct mutation shortcuts in the main chat route and instead fall through to the planner/resolver/executor/synthesizer loop.

## In scope
- Remove work-mode mutating shortcut execution from [src/app/api/portal/ai-chat/threads/[threadId]/messages/route.ts](src/app/api/portal/ai-chat/threads/%5BthreadId%5D/messages/route.ts).
- Preserve read-only preflight checks, context-anchor helpers, and pending-action clarify/resume behavior.
- Validate with the focused live Pura reliability checks.

## Mutating bypasses to disable for work-mode chat
- direct bundled/simple action plans via `runDirectActionPlan(...)`
- hosted-page mutation shortcuts that execute before the planner
- booking settings mutation shortcuts
- newsletter/blog create-or-rewrite preflight mutations
- review reply and weekday-availability direct mutations

## Checklist
- [ ] Add route guard for planner-first work-mode mutations.
- [ ] Gate preflight/direct mutating shortcut branches behind that guard.
- [ ] Leave read-only preflight summaries and clarify/resume intact.
- [ ] Run targeted live validation and full focused suite.
- [ ] Update this file with completion notes and evidence.

## Completion notes
Pending.
