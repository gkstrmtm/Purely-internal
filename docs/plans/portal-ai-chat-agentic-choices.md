# Portal AI Chat: Agentic Choices + Calendar Disambiguation

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
- No new lint/typecheck failures introduced.

## Implementation Steps
1. Update `.gitignore` to ignore `docs/plans/portalchatlog.md` (local transcript).
2. Update chat UI to:
   - Render generic `choices` buttons.
   - Send structured `choice` payload on click.
3. Update chat messages API to:
   - Accept `choice` payload.
   - Return `choices` when resolver requests disambiguation.
4. Update resolver to produce calendar `choices` and support stored overrides.
5. Update funnel builder action args to accept `calendarId` (optional) and have the executor honor it.
6. Validate via `npm run lint` (and build/typecheck if available), then commit and push.

## Follow-ups
- Expand choices support to additional ambiguous entities (forms, nurture campaigns, media folders, etc.).
- Persist choice UI in message history (requires schema change) if desired.
- Add a small “No preference” button alongside choices.
