# Portal AI Chat — How I Want It To Work (Requirements)

Owner: Jaylan  
Last updated: 2026-03-27

## Non-negotiables
- AI-first conversation.
- The assistant speaks like ChatGPT (normal conversation), not like a checklist UI.
- The assistant uses portal endpoints as tools *after* it decides what to do.
- Never require the user to provide raw internal IDs when the system can infer, auto-pick, or offer choices.

## Decision flow (high level)
1) Save user message.
2) Ask the AI what to do next:
   - `explain` (just answer normally)
   - `clarify` (ask 1 short question)
   - `execute` (run one or more portal tools)
   - `noop` (do nothing / small conversational reply)
3) If `execute`, resolve missing IDs automatically from:
   - current page URL
   - thread memory/context
   - prior tool results
   - user follow-up answers
   - clickable choices
4) Run tools.
5) Ask the AI to write the final user-facing reply (plain, normal voice).

## Clarifying questions
- Ask ONE question at a time.
- Never repeat the same question after the user answers.
- If the user says “doesn’t matter / any / whatever / pick one”, the system must accept that.

## Booking calendar selection (critical)
### Rules
- If the user says “use any calendar / doesn’t matter / pick one” → auto-pick a reasonable default.
- If multiple calendars exist and the user did NOT express a preference → show clickable choices.
- Never ask the user for a calendar ID.
- If there are zero enabled calendars → say that and offer to create one.

### Default selection
- Prefer the most recently updated enabled calendar, otherwise the first enabled calendar.

### Choice UX
- Present up to 8 calendars as buttons.
- Each choice should show: name + short description (if available).

## Tool execution behavior
- If a tool fails: do NOT say it worked.
- If multiple tools run: summarize what succeeded/failed in a normal tone.
- Only open canvas / show links for successful work.

## Tone + UI
- The assistant should feel like a normal chat.
- Buttons/choices are support UX, not the primary “voice”.

## Acceptance tests (write these as examples)
- Example: “Add my calendar to this funnel page”
  - Expected:
    - If user says “any calendar”, it picks one and proceeds.
    - If ambiguous, it shows calendar choices.

- Example: “doesn’t matter just use any calendar”
  - Expected: no more questions about calendar name/ID; it picks and continues.

---

## Notes / changes log
- 2026-03-27: Initial requirements doc created.
