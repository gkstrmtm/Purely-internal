# AI Chat Scheduled SMS: Possible Failures + Preemptive Fixes

Date: 2026-03-28

## Goal (what “should” happen)
When a user says something like:

- “Every Monday through Friday at 9:00am, text Chester: ‘Good morning, ready to get started’ — and send one now as a test.”

…the AI chat agent should:

1. Send the test SMS immediately via the inbox tool (no “go click” instructions).
2. Create 5 AI chat scheduled items (Mon–Fri) that run weekly at 9:00am in the owner’s timezone.
3. Those scheduled items should execute autonomously at runtime (cron), sending the SMS via inbox.

## Failure modes → preemptive fixes

### 1) Agent outputs “steps” instead of doing it
**Symptom:** Assistant replies with UI navigation like “Go to Booking Automation → Reminders…”.

**Root causes:**
- Planner misclassifies an imperative request as “explain”.
- Model chooses a product area (Booking Automation) that is unrelated to the request.

**Fixes added (code):**
- Planner is hardened so imperative requests must return `mode=execute` (not `explain`).
- Added a “hard override” re-plan if the model returns `explain` for an imperative request.
- Explicit instruction: non-booking SMS schedules must use inbox + AI chat schedules, never Booking Automation.

### 2) Wrong scheduling system (Automations/Tasks vs AI chat scheduled runs)
**Symptom:** Agent creates portal tasks or automations instead of clock-icon scheduled chat runs.

**Fixes added (code):**
- Planner guidance routes recurring time-based workflows to `ai_chat.scheduled.create`.
- Runtime execution is re-enabled via `/api/portal/ai-chat/cron` and `ai_chat.cron.run`.

### 3) “Timing error” / invalid date parsing
**Symptom:** Assistant says “issue with timing” or schedule fails with invalid date.

**Root causes:**
- LLM outputs a non-ISO timestamp (`"9am"`, `"2026-03-28 09:00"`, etc.).
- Timezone ambiguity: “9am” must be interpreted in the owner’s timezone.

**Fixes added (code):**
- `ai_chat.scheduled.create` now supports `sendAtLocal`:
  - `{ isoWeekday: 1..7, timeLocal: "HH:mm", timeZone?: "America/Chicago" }`
- Executor computes an absolute `sendAt` in the owner’s timezone (fallback to UTC).

### 4) Weekdays-only schedules don’t map cleanly to “repeat”
**Symptom:** A single repeating schedule fires every day including weekends, or the agent can’t represent Mon–Fri.

**Fixes added (planner + executor):**
- Plan: create one scheduled item per weekday with `repeatEveryMinutes=10080` (weekly repeat).
- Use `sendAtLocal.isoWeekday` to target each weekday precisely.

### 5) “Trigger one now” test behaves weirdly (cron vs immediate send)
**Symptom:** User asks for a test SMS now; assistant schedules something and asks to wait, or runs cron instead of sending.

**Fixes added (planner):**
- If the user asks to “trigger one now as a test”, planner must include an immediate `inbox.send_sms` step.

### 6) Repeated “Which contact?” loops / Chester ambiguity
**Symptom:** Assistant repeatedly asks to pick Chester or asks multiple choice questions again and again.

**Root causes:**
- Resolver can’t reuse prior thread context.
- Contact name collisions (multiple “Chester”).

**Fixes added (resolver):**
- Contact resolution now reuses `threadContext.lastContact` for implicit/pronoun follow-ups ("him", "that contact", etc.).
- Explicit name collisions still require a one-time clarification (safety: don’t guess the wrong Chester).

### 7) Scheduled run can’t clarify (no user present at cron time)
**Symptom:** A scheduled run needs disambiguation and can’t proceed.

**Current behavior:**
- Scheduled processor posts a message into the chat explaining what’s missing.

**Recommended operational guardrail:**
- Ensure the contact is uniquely resolved at schedule-creation time (during the interactive “test send”), so future scheduled runs don’t require clarification.

### 8) Cron endpoint not running / auth blocks processing
**Symptom:** Schedules appear, but nothing ever sends.

**Fixes added (code):**
- `/api/portal/ai-chat/cron` is enabled to process due messages.
- Auth supports `x-vercel-cron: 1` or `AI_CHAT_CRON_SECRET` (header/query/bearer).

**Ops checklist:**
- Confirm the platform scheduler is actually calling `/api/portal/ai-chat/cron`.
- Ensure `AI_CHAT_CRON_SECRET` is set if not using Vercel cron.

### 9) SMS sending fails even though Twilio is connected
**Symptom:** “Twilio rejected…” or message fails.

**Likely causes:**
- Contact has no phone number.
- Phone invalid / not E.164.
- User not opted in / carrier filters.
- Messaging service / sender number mismatch.

**Existing mitigations:**
- Improved Twilio error mapping to be explicit when Twilio rejects the message.

### 10) Duplicate sends (cron concurrency)
**Symptom:** Same scheduled message sends twice.

**Fix present (code):**
- Scheduled processor marks the scheduled message `sentAt` before executing actions (idempotency best-effort).

## What was implemented in this hardening pass
- Planner: force “do it” requests to execute; forbid irrelevant Booking Automation guidance.
- Scheduling: `sendAtLocal` support + timezone-correct computation using Luxon.
- Resolver: reuse last-contact context for pronoun/implicit follow-ups to reduce loops.

## Next validation steps (product-side)
1. In AI chat, ask for Mon–Fri 9am Chester SMS + “send one now”.
2. Confirm: test SMS sends immediately.
3. Confirm: 5 scheduled items appear (clock icon view).
4. Confirm: cron processing sends the next due scheduled SMS (either via `ai_chat.cron.run` or the cron route).
