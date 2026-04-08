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
- 2026-03-27: Funnel Builder can embed calendars via the built-in `calendarEmbed` block (see `funnel_builder.pages.generate_html` in `src/lib/portalAgentActionExecutor.ts`). If the user requests a calendar and none exist, it will enable the first existing calendar or create a default one (credits permitting).

## Booking Automation
- Status: In Progress
- Expected behavior:
  - Configure reminders/follow-ups per calendar.
  - Validate inputs and show real errors when an action fails.

Updates:
- 2026-03-27: Fixed agent action replies so failures never render as "Done." (shows `Action failed` + HTTP status when available). This directly affects booking calendar creation + booking settings actions.

## Automation Builder
- Status: In Progress
- Expected behavior:
  - Create/edit workflows, triggers, and actions.
  - Execute manual triggers reliably; reflect partial failures.

Updates:
- 2026-04-07: Added alias-tolerant normalization for `automations.*` actions before schema validation so workflow actions can accept human-style fields instead of exact API arg names.
- 2026-04-07: Workflow create/run/test/update flows now tolerate looser identifiers and phrasing like `workflow`, `flow`, `title`, `instructions`, `campaign`, `recipient`, `steps`, `connections`, and active/paused status wording.

## Funnel Builder
- Status: In Progress
- Expected behavior:
  - Create funnels/pages, update content/sections, publish.
  - Confirm the resource exists after “create” actions.

Updates:
- 2026-03-27: Fixed agent action replies so errors never masquerade as success (was causing "action failed" scenarios to still display "Done.").
- 2026-03-27: Verified end-to-end “plain English” support for adding interactive funnel content:
  - `funnel_builder.pages.generate_html` detects intent (shop/cart/checkout/calendar/chatbot) and can insert real blocks (including `calendarEmbed`) and also generates a Custom HTML snapshot for preview.
  - `funnel_builder.pages.generate_html` supports `attachments` + `contextMedia` and will call image-aware generation when images are provided.
  - `funnel_builder.custom_code_block.generate` can return structured block insert actions (including `calendarEmbed`, `image`, `button`, `formEmbed`) so the agent can prefer built-ins over fragile custom HTML.

## Lead Scraping
- Status: In Progress
- Expected behavior:
  - Run pulls, manage leads (tag/star/delete), respect credits.
  - Outbound rules: only email leads with email; CC owner; plain text.

Updates:
- 2026-04-07: Added alias-tolerant normalization for `lead_scraping.*` actions before schema validation so run/list/lead/outbound flows can accept human-style args instead of exact API field names.
- 2026-04-07: Lead scraping actions now tolerate looser phrasing like `lead`, `id`, `query`, `search`, `count`, `industry`, `channel`, `title`, `body`, `approve`, and direct top-level settings payloads.

## Media Library
- Status: In Progress
- Expected behavior:
  - Upload, organize folders, share links, download zips.

Updates:
- 2026-04-07: Added alias-tolerant normalization for `media.*` actions before schema validation so folder/item/media requests can accept human-style args instead of exact API field names.
- 2026-04-07: Media actions now tolerate looser phrasing like `folder`, `item`, `name`, `title`, `query`, `search`, `count`, `destinationFolder`, `imageUrl`, `blobUrl`, and direct upload payload aliases.

## Tasks
- Status: In Progress
- Expected behavior:
  - Create/assign/complete tasks; reflect permissions.

Updates:
- 2026-04-07: Loosened task action handling so Pura can better tolerate human phrasing instead of exact API-style args:
  - `tasks.create` / `tasks.update` now accept assignee aliases (`assigneeUserId`, `assignedTo`, `assignee`) and due-date aliases (`dueAt`, `dueDate`) in addition to the canonical fields.
  - `tasks.update` and `tasks.list` now normalize common status words like `completed`, `finished`, `pending`, `todo`, and `cancelled`.
  - `tasks.list` now treats `assigned=mine|my` as `me`.
  - `resolveTaskId` now honors active-context phrasing like “this task” / “that one” instead of forcing a pasted id or exact title.

## Reporting + Dashboard
- Status: In Progress
- Expected behavior:
  - Add/remove widgets; save layouts; compute KPIs.

Updates:
- 2026-04-07: Added a shared pre-validation normalization pass so dashboard/reporting actions can tolerate human-style arg names before schema validation.
- 2026-04-07: `dashboard.*` now accepts scope aliases like `embed` / `portal`, widget aliases like `sales`, `reviews`, and `activity`, plus looser quick-access input such as comma-separated service names.
- 2026-04-07: Reporting range requests now normalize common phrases like `week`, `month`, `quarter`, and `all time` to the supported reporting windows.

## People + Invites
- Status: In Progress
- Expected behavior:
  - Invite users, manage roles/permissions, remove access.

Updates:
- 2026-04-07: `people.users.*` now tolerates aliases like `memberEmail`, `targetUserId`, `memberId`, `user`, and lowercase role phrasing like `admin` / `member` before schema validation.
- 2026-04-07: `contacts.*` and `contacts.tags.*` now tolerate more operator-style args such as `contact`, `contactEmail`, `tag`, and `tagName`, allowing resolver-based lookup instead of forcing exact ids.

## Services + Billing
- Status: In Progress
- Expected behavior:
  - Start/pause/cancel subscriptions; buy credits; show accurate totals.

Updates:
- 2026-04-07: Added billing/services normalization before schema validation so Pura can tolerate human-style args instead of exact enum keys.
- 2026-04-07: `services.lifecycle.update` now accepts looser service aliases like `calendar`, `blogs`, `receptionist`, `outbound`, `lead scraping`, and common lifecycle wording like `enable`, `reactivate`, `stop`, and `cancel`.
- 2026-04-07: `billing.checkout_module`, `billing.upgrade.checkout`, and onboarding billing actions now normalize module names, bundle names, plan lists, coupon aliases, and common path/id field aliases before validation.
- 2026-04-07: `billing.info.update`, subscription cancellation, portal-session, setup-intent, and credits-only actions now tolerate more operator-style arg names such as `email`, `address`, `subscription`, `returnUrl`, and `checkoutSessionId`.

## Reviews
- Status: In Progress
- Expected behavior:
  - Configure review requests; manage Q&A; publish hosted pages.

Updates:
- 2026-04-07: `reviews.archive`, `reviews.questions.answer`, and related list/search actions now accept looser aliases like `review`, `questionId`, `response`, `search`, and boolean archive phrasing before validation.

## Blogs
- Status: In Progress
- Expected behavior:
  - Create/manage posts, schedule automation, publish; domain selection.

Updates:
- 2026-04-07: Added alias-tolerant normalization for `blogs.*` actions before schema validation so content workflows no longer depend on exact API field names.
- 2026-04-07: Blog post and automation actions now tolerate looser identifiers and operator phrasing like `post`, `id`, `summary`, `body`, `markdown`, `count`, and content-kind aliases while still resolving to canonical fields.

## Newsletter
- Status: In Progress
- Expected behavior:
  - Compose/draft/send; audience selection; credits for extra sends.

Updates:
- 2026-04-07: Added alias-tolerant normalization for `newsletter.*` actions before schema validation so draft/send flows can accept human-style fields instead of exact arg names.
- 2026-04-07: Newsletter compose, audience, and automation actions now tolerate looser identifiers and phrases like `newsletter`, `draftId`, `subject`, `body`, `text`, `search`, `count`, and `team/client` kind aliases.

## AI Receptionist
- Status: In Progress
- Expected behavior:
  - Configure inbound voice + SMS; show usage; handle provider webhooks.

Updates:
- 2026-04-07: Added alias-tolerant normalization for `ai_receptionist.*` actions before schema validation so settings, refresh/delete, preview, and knowledge-base flows can accept human-style args.
- 2026-04-07: Receptionist actions now tolerate looser phrasing like `call`, `recording`, `prompt`, `notes`, `message`, `body`, `tagIds`, `kb`, `base64`, `phoneNumber`, and transfer/mode aliases.

## AI Outbound
- Status: In Progress
- Expected behavior:
  - Configure campaigns; create audiences; place calls; show outcomes/usage.

Updates:
- 2026-04-07: Added alias-tolerant normalization for `ai_outbound_calls.*` actions before schema validation so campaign, contact, KB, and manual-call flows can accept human-style args instead of exact API field names.
- 2026-04-07: AI outbound actions now tolerate looser phrasing like `campaign`, `call`, `contact`, `recipient`, `channel`, `query`, `count`, `prompt`, `notes`, `message`, `recording`, `base64`, and nested config/knowledge-base aliases.

## Inbox / Outbox
- Status: In Progress
- Expected behavior:
  - Threads, compose, attachments; show provider errors; dedupe.

Updates:
- 2026-04-07: Added alias-tolerant normalization for inbox thread/message/contact/scheduled/send actions before schema validation.
- 2026-04-07: `inbox.send*` now tolerates common operator fields like `message`, `text`, `recipient`, `conversation`, `scheduledAt`, and attachment/file-id aliases.
- 2026-04-07: Inbox thread/contact/scheduled actions now accept looser identifiers like `thread`, `conversationId`, `contact`, `messageId`, and `scheduledAt` instead of exact API-only field names.

## Settings / Profile
- Status: In Progress
- Expected behavior:
  - Update company profile, Twilio settings, API keys; validate inputs.

Updates:
- 2026-04-07: `profile.*`, `mailbox.*`, `webhooks.get`, and `business_profile.*` now tolerate more natural field names like `first`, `last`, `phoneNumber`, `agentId`, `apiKey`, `companyName`, `website`, `goals`, and `tone` before validation.

## Portal AI Chat UI (Canvas)
- Status: In Progress
- Expected behavior:
  - Canvas open button is clear.
  - Resizing works even when cursor passes over embedded iframe.
  - Actions show real success/failure with actionable errors.

Updates:
- 2026-03-27: Added a full-screen drag overlay while resizing to prevent the embedded iframe from stealing the mouse, and made the collapsed open control more obvious.
- 2026-03-27: Action failures now render as `Action failed` (never "Done.") when an action returns a non-2xx status or `ok=false`.
