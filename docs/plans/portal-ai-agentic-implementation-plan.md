# Portal AI Chat — Agentic Choices: Implementation Plan

## Status
- Implemented in the portal AI chat UI and API.
- Verified with `npm run lint` and `npm run build` on March 27, 2026.
- Remaining validation is manual in-product smoke testing for owner/share/member behavior.

## Summary
Make the AI chat able to act agentically by returning clickable choices when it needs a disambiguation (e.g., multiple calendars), allowing the user to click a choice or say “doesn’t matter” to auto-pick, and letting the agent continue without extra free-text. This implements a generic `choices` payload + structured `choice` requests, calendar disambiguation as the first use-case, and resolver-side support for choice overrides.

## Goals
- Add a generic `choices` UI and transport that works for any entity kind.
- Ensure the AI resolver can return `choices` and receive `choice` selections to continue plans.
- Implement calendar disambiguation (auto-pick & explicit pick) as the first concrete case.
- Keep the choices UI ephemeral but persist chosen override so the plan can proceed.

## Acceptance criteria
- UI shows choice buttons below the assistant message when backend returns `choices`.
- Clicking a choice sends `{ kind, value }` to the messages API and the resolver continues the pending plan.
- Typing or clicking “doesn't matter” triggers the agent to auto-pick a safe default and continue.
- Calendar-specific: when multiple booking calendars exist, the assistant shows calendars, allows pick/auto-pick, and proceeds.
- No lint/typecheck failures.

## Additional UX requirements (Threads menu)
### Rename menu item
- In the three-dot menu for each chat thread, rename `Duplicate / Branch` to `Branch`.

### Share with team
- Add a new menu item: `Share with team`.
- Clicking it opens a custom in-app modal (not browser-native):
  - No divider lines.
  - No “Close” button; close via an `X` icon only.
  - Shows a picker list of team members (users under the same portal account / owner).
  - User must explicitly select which members to share with.
- Access rules:
  - Threads are private per-user by default.
  - A thread becomes accessible to another user only after explicit sharing.
  - Sharing must never be “on by default”.

### Acceptance criteria (Share)
- By default, user A cannot see user B’s threads.
- After user A shares a thread with user B, user B can view that thread (and its messages) in the portal AI chat.
- Removing a share revokes access immediately.
- API endpoints for listing threads/messages enforce access checks.

## High-level tasks
1. Frontend: render `choices` under assistant messages and send structured selection.
2. API: accept `choice` payload in message POSTs; accept `choice` event route if needed.
3. Backend: add `choiceOverrides` storage in thread context and helper funcs to set/get.
4. Resolver: produce `choices` for calendar disambiguation and honor `choiceOverrides` on subsequent calls.
5. Calendar executor: accept optional `calendarId` and use chosen value; support default pick logic.
6. UX: add small “No preference / Doesn't matter” button that maps to auto-pick.
7. Tests & build: unit tests for resolver choice flow; manual E2E smoke tests.
8. Docs: update `docs/plans/portal-ai-chat-agentic-choices.md` with implementation notes and link to new plan.

9. Threads menu: rename `Duplicate / Branch` → `Branch` and add `Share with team` modal.
10. Thread access control: implement explicit sharing (private-by-default threads).

## Delivered
- `choices` UI is rendered under the latest assistant message for calendar disambiguation.
- Clicking a choice sends a structured `choice` payload through the existing messages API flow.
- The small `No preference` action is present and maps to the auto-pick path.
- Choice overrides are stored in thread context and validated through shared helper logic.
- Calendar-specific execution validates selected calendar IDs before continuing.
- Thread menu now shows `Branch` and `Share with team`.
- `Share with team` uses an in-app modal with X-only close and no divider lines.
- Threads are private per member by default and become visible only through explicit sharing.
- Thread list, messages, actions, choice endpoint, scheduled runs, and assistant action execution now enforce member-scoped access.

## Implementation notes
- Transport
  - Messages API (existing): accept an optional `choice` field `{ kind: string, value: string }` on POST.
  - Assistant responses may include an optional `choices` field:
    ```json
    { "choices": { "kind": "booking_calendar", "title": "Which calendar?", "options": [{"value":"cal_123","label":"Main Calendar","description":"Default"}] } }
    ```
  - `choices` UI is ephemeral (not persisted in messages table) but selection is recorded as a `thread.contextJson.choiceOverrides` entry so subsequent resolver runs can consult it.

- Backend storage
  - Reuse the `thread` record context JSON for `choiceOverrides`:
    ```json
    "choiceOverrides": { "booking_calendar": "cal_123" }
    ```
  - Helper API: `POST /api/chat/threads/:threadId/choice` to set an override (or accept via messages POST). This allows both UI and programmatic callers to set choices.

- Resolver behavior
  - When resolver needs an entity and multiple candidates exist, return an assistant message with `choices` and stop.
  - If `thread.contextJson.choiceOverrides[kind]` exists, use that and continue automatically.
  - For auto-pick: implement a set of heuristics per `kind` (for calendars: pick `defaultEnabled` or first `enabled` by preference order). When user types "doesn't matter" the frontend sends a boolean special selection which triggers auto-pick and sets the override.

- Calendar specifics
  - `choices.kind = "booking_calendar"`
  - `options` should include `value` (calendarId), `label` (display name), `description` (owner / timezone / enabled flag)
  - If the assistant sees text implying no preference (pattern match: "doesn\'t matter|any|either|whatever"), call auto-pick and continue.

- UX details
  - Render choices as compact buttons under last assistant message; include a small secondary "No preference" button.
  - Clicking an option sends a structured request and displays a small inline toast "Selected: Main Calendar" then the chat continues as if the user typed that selection.

## Rollout plan (phased)
- Phase 1: Implement message-level `choices` transport + simple UI and test with static calendar options.
- Phase 2: Integrate resolver so it returns choices for calendar flows and honors overrides.
- Phase 3: Wire calendar executor and test the full flow (create funnel page + embed calendar) with auto-pick.
- Phase 4: Expand `choices` usage to other entities (forms, nurture campaigns, media folders).

## Risks & mitigations
- Risk: choice UI gets out-of-sync with thread state. Mitigation: UI always re-fetch thread context after selection and the resolver should validate chosen id exists.
- Risk: too many choice options (100s). Mitigation: paginate or limit options to most relevant + "See all".

## Manual smoke test checklist
- Owner creates a new chat and confirms it is only visible to themselves.
- Owner triggers a calendar ambiguity and confirms buttons plus `No preference` appear.
- Owner uses `Share with team` to grant access to one teammate.
- Shared teammate can open the thread and continue messaging.
- Shared teammate cannot rename, pin, branch, delete, or edit sharing.
- Owner removes the share and confirms teammate loses access immediately.

---

Created by agent as an actionable plan to implement the agentic `choices` flow and calendar disambiguation (first use-case).