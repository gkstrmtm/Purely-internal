# Pura Copilot-style chat and work plan

## Simple version

Pura should feel more like VS Code Copilot.

That means:
- you tell it what you want in plain English,
- it quietly gathers the context it needs,
- it keeps working through the steps instead of stopping too early,
- it only asks you a question when it is truly blocked,
- and when it starts doing real work, the product should make that obvious.

So the chat should have two clear states:
- **Plan/chat mode** for talking through the request,
- **Work mode** for showing what Pura is actively changing.

Each chat should also have its own real URL so refresh keeps you in the same conversation.

## Product goals

- Give every thread a stable, shareable route.
- Keep refresh on the active conversation instead of falling back to a blank new chat.
- Make redo and edit controls feel intentional instead of noisy.
- Show when Pura is thinking, planning, or actively working.
- Create a cleaner transition from discussion into execution.

## UX changes in this phase

### 1. Thread URLs
- Move from query-param-only thread selection to per-thread routes.
- Use a human-readable thread ref in the URL with the real thread id preserved in the tail.
- Keep the root chat route for a fresh draft chat.

### 2. Plan/chat vs work mode
- Add a visible mode switch in the chat surface.
- Default to plan/chat for a fresh conversation.
- Automatically move into work mode when a concrete work canvas appears.
- Let the user jump back to plan/chat without losing context.

### 3. Working state
- Show a persistent working banner while Pura is thinking, redoing, or executing steps.
- Make it obvious when work is happening even before the canvas loads.
- Use concise status copy instead of fake completion language.

### 4. Message actions cleanup
- Limit redo's active state to the message actually being regenerated.
- Keep user edit affordances quieter by showing them on hover/focus with a larger hit area.
- Avoid making the whole thread look busy when only one action is running.

## Implementation notes

### Routing
- Add a thread-ref helper that builds URLs like `title-slug--threadId`.
- Parse the real thread id from the tail of the route segment.
- Keep old `?thread=` support as a compatibility fallback during transition.

### Client state
- Keep thread identity based on the real thread id.
- Treat the route as the source of truth for which thread is selected after refresh or navigation.
- Update the route when:
  - selecting a thread,
  - creating the first persisted message in a draft,
  - duplicating a thread,
  - deleting the active thread,
  - returning to a blank new chat.

### Work mode
- Drive work mode from existing canvas state first.
- Avoid inventing deterministic execution branches.
- Use the existing work canvas and execution signals, but present them more clearly.

### Future direction
- Once the UX is cleaner, Pura can move further toward a Copilot-style loop:
  - inspect context automatically,
  - use portal actions like tools,
  - continue multi-step execution until done,
  - surface progress instead of generic filler replies,
  - ask the user only when the system cannot safely infer or fetch the missing detail.
