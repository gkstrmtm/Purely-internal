# Portal AI Action Coverage Tracker

Purpose: Track every portal surface area the AI agent should be able to operate end-to-end (same actions a user can do manually), plus any known gaps/bugs. As work is completed, append brief notes under the relevant section and mark it **Complete**.

Conventions:
- **Status**: Not Started | In Progress | Blocked | Complete
- Add a dated entry when you touch a section.
- Prefer linking to the action/router/module that implements the behavior.

---

## Calendars
- Status: In Progress
- Expected behavior:
  - List calendars, pick a calendar automatically when the user says “any / doesn’t matter”.
  - Create/update calendar settings.
  - Create appointments and reschedule/cancel.

Updates:
- 2026-03-27: Calendar selection should never require IDs; “any/doesn’t matter” should auto-pick, otherwise show clickable choices.

## Booking Automation
- Status: In Progress
- Expected behavior:
  - Configure reminders/follow-ups per calendar.
  - Validate inputs and show real errors when an action fails.

Updates:
- 2026-03-27: Fixed agent action replies so failures never render as "Done." (shows `Action failed` + HTTP status when available). This directly affects booking calendar creation + booking settings actions.

## Automation Builder
- Status: Not Started
- Expected behavior:
  - Create/edit workflows, triggers, and actions.
  - Execute manual triggers reliably; reflect partial failures.

## Funnel Builder
- Status: In Progress
- Expected behavior:
  - Create funnels/pages, update content/sections, publish.
  - Confirm the resource exists after “create” actions.

Updates:
- 2026-03-27: Fixed agent action replies so errors never masquerade as success (was causing "action failed" scenarios to still display "Done.").

## Lead Scraping
- Status: Not Started
- Expected behavior:
  - Run pulls, manage leads (tag/star/delete), respect credits.
  - Outbound rules: only email leads with email; CC owner; plain text.

## Media Library
- Status: Not Started
- Expected behavior:
  - Upload, organize folders, share links, download zips.

## Tasks
- Status: Not Started
- Expected behavior:
  - Create/assign/complete tasks; reflect permissions.

## Reporting + Dashboard
- Status: Not Started
- Expected behavior:
  - Add/remove widgets; save layouts; compute KPIs.

## People + Invites
- Status: Not Started
- Expected behavior:
  - Invite users, manage roles/permissions, remove access.

## Services + Billing
- Status: Not Started
- Expected behavior:
  - Start/pause/cancel subscriptions; buy credits; show accurate totals.

## Reviews
- Status: Not Started
- Expected behavior:
  - Configure review requests; manage Q&A; publish hosted pages.

## Blogs
- Status: Not Started
- Expected behavior:
  - Create/manage posts, schedule automation, publish; domain selection.

## Newsletter
- Status: Not Started
- Expected behavior:
  - Compose/draft/send; audience selection; credits for extra sends.

## AI Receptionist
- Status: Not Started
- Expected behavior:
  - Configure inbound voice + SMS; show usage; handle provider webhooks.

## AI Outbound
- Status: Not Started
- Expected behavior:
  - Configure campaigns; create audiences; place calls; show outcomes/usage.

## Inbox / Outbox
- Status: Not Started
- Expected behavior:
  - Threads, compose, attachments; show provider errors; dedupe.

## Settings / Profile
- Status: Not Started
- Expected behavior:
  - Update company profile, Twilio settings, API keys; validate inputs.

## Portal AI Chat UI (Canvas)
- Status: In Progress
- Expected behavior:
  - Canvas open button is clear.
  - Resizing works even when cursor passes over embedded iframe.
  - Actions show real success/failure with actionable errors.

Updates:
- 2026-03-27: Added a full-screen drag overlay while resizing to prevent the embedded iframe from stealing the mouse, and made the collapsed open control more obvious.
- 2026-03-27: Action failures now render as `Action failed` (never "Done.") when an action returns a non-2xx status or `ok=false`.
