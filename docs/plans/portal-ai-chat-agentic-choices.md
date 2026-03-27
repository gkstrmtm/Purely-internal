# Portal AI Chat: Agentic Choices + Calendar Disambiguation

## Status
- Implemented in the portal AI chat UI and API.
- Validated with `npm run lint` and `npm run build`.
- Companion implementation plan: `docs/plans/portal-ai-agentic-implementation-plan.md`.

## Goal
Make the portal AI chat feel “agentic” by minimizing back-and-forth when an action needs an entity (calendar, contact, etc.).

Specifically:
- If the agent can safely auto-pick, it should.
- If the agent needs a choice (ex: multiple calendars), it should return clickable options.
- Follow-ups like “doesn’t matter” should allow the agent to auto-select and continue.

## Non-goals (for this iteration)
- Full generalized disambiguation for every entity type in the system.
- Database schema migrations for persisting choice UI in message history.

## UX Changes
### Threads sidebar
- Remove the close (×) control on the left threads sidebar.
- Keep resize-only behavior (drag handle) on desktop.

### Thread menu updates
- Rename `Duplicate / Branch` to `Branch`.
- Add `Share with team` in the thread menu.
- Sharing uses a custom in-app modal with no divider lines and X-only close.
- Threads remain private per member until explicitly shared.

### Clickable choices
- Introduce a generic “choices” payload that the backend can return with an assistant message.
- The chat UI renders these choices as buttons under the most recent assistant message.
- Clicking a choice sends a structured selection back to the backend (not just free-text).

## Backend Protocol (Proposed)
### Response additions
When the assistant needs a disambiguation, return:

- `choices`: `{ kind, title, options[] }`
  - `kind`: string key (example: `booking_calendar`)
  - `title`: short UI prompt
  - `options`: list of `{ value, label, description? }`

This is an ephemeral UI hint; it is not persisted in the message table.

### Request additions
Allow sending a structured selection:

- `choice`: `{ kind, value }`

Backend stores an override in `thread.contextJson.choiceOverrides` so the next plan resolution can proceed.

Sharing state is stored in `thread.contextJson.sharedWithUserIds` and enforced at the API layer.

## Calendar Disambiguation (First Implementation)
### Where it applies
- `booking.reminders.settings.get/update` when `calendarId` is not provided.
- `funnel_builder.pages.generate_html` when the prompt indicates a booking/calendar embed and multiple calendars exist.

### Auto-pick behavior
If user text indicates no preference (examples: “doesn’t matter”, “any”, “either”), pick the default enabled calendar.

### Choice behavior
If multiple enabled calendars exist and the user has not specified one:
- Ask a single question (“Which calendar should I use?”)
- Return `choices.kind = booking_calendar` and include enabled calendars as options.

## Acceptance Criteria
- Threads sidebar has no close (×) button; resize remains.
- When multiple booking calendars exist, the AI chat can show clickable calendar options.
- Clicking an option continues the pending plan without asking for IDs.
- Replying “doesn’t matter” auto-selects and continues.
- Thread menu shows `Branch` and `Share with team`.
- Threads are private per member until explicitly shared with teammates.
- No new lint/typecheck failures introduced.

## Implemented pieces
1. Chat UI renders generic choice buttons and a `No preference` action.
2. Chat messages API accepts structured `choice` payloads.
3. Choice overrides persist to `thread.contextJson.choiceOverrides` through shared helpers.
4. Calendar disambiguation honors stored overrides and validates selected calendar IDs before action execution.
5. Thread menu includes `Branch` and `Share with team`.
6. Sharing is enforced by thread/message/action/scheduled endpoints using per-member access checks.
7. Validation completed with `npm run lint` and `npm run build`.

## Follow-ups
- Expand choices support to additional ambiguous entities (forms, nurture campaigns, media folders, etc.).
- Persist choice UI in message history (requires schema change) if desired.
- Add automated regression coverage if the repo gains a test harness for portal AI chat.
