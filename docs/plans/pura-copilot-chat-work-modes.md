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
- Let the user stop an in-flight run without losing the thread.
- Make Pura better at suggesting the next useful move after it finishes work.

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
- Show live progress in the thread list and inline in the chat body, not only in one top-level banner.
- Keep enough metadata to explain where Pura is in the loop: round, completed steps, and the latest finished step.

### 4. Interrupt / stop current run
- Let the active thread request a stop while Pura is mid-run.
- Stop cleanly at the next safe checkpoint instead of hard-killing the request.
- Clear the live run state and leave a normal assistant message explaining that the run was paused.

### 5. Message actions cleanup
- Limit redo's active state to the message actually being regenerated.
- Keep user edit affordances quieter by showing them on hover/focus with a larger hit area.
- Avoid making the whole thread look busy when only one action is running.

### 6. Proactive follow-up suggestions
- After successful work, give the user 1-3 sensible next-step prompts.
- Make those suggestions one-click so the user can keep momentum instead of rephrasing the next request manually.

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

### Live run state
- Persist a lightweight `liveStatus` object in thread context while Pura is working.
- Include:
  - the current phase,
  - a user-facing label,
  - the active run id,
  - whether the run can still be interrupted,
  - the planner round,
  - completed step count,
  - and the last completed step title.
- Read that state from:
  - the thread messages endpoint,
  - a lightweight status-only view,
  - and the thread list endpoint for sidebar visibility.

### Interrupt behavior
- Start a new run id whenever a real execution loop begins.
- Write the run id into live status so the UI can stop the correct run.
- Interrupt requests should mark the thread context, not try to kill execution from the client.
- The backend should check for interrupt requests at safe checkpoints:
  - before planning,
  - before resolution,
  - before execution,
  - and before summary generation.
- When interrupted, Pura should:
  - stop before the next step,
  - clear current run control state,
  - and write a normal assistant message that the run was stopped.

### Work mode
- Drive work mode from existing canvas state first.
- Avoid inventing deterministic execution branches.
- Use the existing work canvas and execution signals, but present them more clearly.

### Proactive next-step behavior
- After successful work, return a short list of suggested next prompts.
- Suggestions should be:
  - domain-aware,
  - short enough to render as chips,
  - and only shown when the last run actually completed cleanly.

## Current shipped state

- Stable thread routes are live.
- Refresh keeps the active chat.
- Discuss and Work modes live inside chat.
- Work-mode assistant messages are visually distinct.
- Edit and redo controls are quieter and scoped correctly.
- Thread switches no longer flash the welcome shell.
- Pura now does domain-aware recovery instead of falling back to funnel-biased guesses.
- Run traces are persisted and rendered after work completes.
- Live status is now shown:
  - near the composer,
  - inline in the chat stream,
  - and in the sidebar thread list.
- Active runs can now be interrupted with a stop button.
- Successful runs can now suggest the next useful prompt to keep momentum going.
- Active-thread progress now streams through a dedicated SSE status channel instead of foreground polling.
- Follow-up suggestion chips now persist with assistant messages so they survive reloads.

### Future direction
- Once the UX is cleaner, Pura can move further toward a Copilot-style loop:
  - inspect context automatically,
  - use portal actions like tools,
  - continue multi-step execution until done,
  - surface progress instead of generic filler replies,
  - ask the user only when the system cannot safely infer or fetch the missing detail.

## What is still missing

- Broader streamed run visibility.
  - The active thread now gets true streamed status updates.
  - Cross-thread visibility in the sidebar still relies on lightweight refreshes instead of a full shared stream.
- Richer long-running job infrastructure.
  - There is not yet a first-class run queue with resumable background jobs, ownership, retries, and a dedicated runs view.
- Deeper self-healing.
  - Recovery is better, but there is still room for broader retry strategies, smarter branch switching, and better automatic repair after failed writes.
- Richer persistent proactive guidance.
  - Follow-up suggestions now survive reloads for the assistant messages that generated them.
  - There is still no fuller long-lived “next best action” memory that spans larger goals and changing priorities.
- Stronger proactive autonomy.
  - Pura still mostly reacts to the user’s current request.
  - It does not yet proactively open a durable work plan, identify a sequence of likely next actions, and carry that plan across a longer horizon.

## Next slices

1. Extend streamed status beyond the active thread into broader run visibility.
2. Add a dedicated run ledger for long-lived and background jobs.
3. Persist richer follow-up recommendations and next-best-action state.
4. Improve self-healing with broader retry and repair strategies.
5. Add stronger “I know what to do next” planning across multiple turns instead of only after a single completed run.
