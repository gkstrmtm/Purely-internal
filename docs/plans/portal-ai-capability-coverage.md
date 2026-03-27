# Portal AI Capability Coverage Tracker

## Purpose
This file tracks every major portal surface the AI agent must be able to operate reliably.

For each section:
- Describe how the AI should work in that area.
- Add implementation/work notes as changes land.
- When a section is fully addressed, add a line that says `section complete`.

## Portal AI Chat + Canvas
- Status: in progress
- The AI chat should reliably clarify missing inputs, continue pending work after follow-up answers, and never report success when an action failed.
- The canvas should open clearly, resize smoothly, and keep drag behavior working even when the cursor moves over embedded content.
- Work log:
  - 2026-03-27: Fixed pending-plan follow-up handling for replies like "doesn't matter" and patched canvas resize drag behavior over iframe content.

## Booking Calendars
- Status: in progress
- The AI should be able to create, list, update, choose, and embed booking calendars without asking for raw IDs when it can infer or clarify from available calendars.
- If multiple calendars exist, the AI should show choices or auto-pick when the user says any/default/doesn't matter.
- Work log:
  - 2026-03-27: Patched booking calendar clarification flow so calendar disambiguation can continue from pending plan context and from direct action execution.

## Booking Automations
- Status: not started
- The AI should be able to inspect and update booking reminders, booking settings, booking forms, public booking site behavior, and booking-related automations end to end.

## Automation Builder
- Status: not started
- The AI should be able to create, inspect, update, trigger, and troubleshoot automation workflows, triggers, and steps using the same capabilities a user has manually.

## Funnel Builder
- Status: in progress
- The AI should be able to create funnels, create pages, update content, generate HTML, embed calendars/chat widgets, and open the correct editor surface when work completes.
- Action results should be truthful about failures and should not claim success when a page or content generation failed.
- Work log:
  - 2026-03-27: Patched action result summaries to stop reporting blanket success when one or more execution steps failed.

## Lead Scraping
- Status: not started
- The AI should be able to search leads, update lead scraping settings, trigger outbound drafts, and work with scraped lead records as reliably as the manual UI.

## Media Library
- Status: not started
- The AI should be able to browse folders/items, upload/import media, pick assets for portal actions, and move between folder/item contexts when needed.

## Tasks
- Status: not started
- The AI should be able to create, assign, update, complete, and inspect tasks for the current owner/team, respecting permissions and assignment rules.

## Reporting
- Status: not started
- The AI should be able to navigate and summarize reporting surfaces, including sales and Stripe reporting, and open the right reporting view when useful.

## Nurture Campaigns
- Status: not started
- The AI should be able to list campaigns, inspect steps, update configuration, and launch related campaign actions with correct IDs and clarifications.

## Reviews
- Status: not started
- The AI should be able to inspect review settings, questions, sends, archive state, and related review workflows without dead-end action suggestions.

## Automated Blogs
- Status: not started
- The AI should be able to manage blog automation settings, drafts, publishing flows, and blog site appearance/settings from natural language requests.

## Newsletter
- Status: not started
- The AI should be able to create/update newsletters, automation settings, audience selections, site settings, and send/publish flows as a human user would.

## AI Outbound Calls
- Status: not started
- The AI should be able to inspect campaigns, create/update campaigns, enroll contacts, preview content, and navigate campaign activity accurately.

## AI Receptionist
- Status: not started
- The AI should be able to inspect and modify receptionist settings, prompts, knowledge bases, and preview flows without breaking required configuration.

## Inbox / Outbox
- Status: not started
- The AI should be able to find threads, inspect messages, compose/send replies, manage attachments, and handle scheduled messaging workflows correctly.

## Settings
- Status: not started
- The AI should be able to work across applicable settings surfaces, explain what changed, and open the right settings area after successful actions.

## People
- Status: not started
- The AI should be able to search contacts/users, update records, manage tags/custom variables, and disambiguate people cleanly when more than one match exists.

## Services
- Status: not started
- The AI should be able to operate across service setup pages and service-specific flows using the same capabilities available in the manual portal UI.

## Dashboard
- Status: not started
- The AI should be able to guide users to dashboard-relevant configuration and interpret dashboard-related portal context when planning actions.