# Recoverability and Deletion Safety Audit

Date: 2026-05-17
Prompt: P-031
Scope: platform destructive actions, overwrite-heavy mutations, and recovery expectations

## Summary

The platform is not using one consistent recovery model.

- Most destructive actions are still hard deletes.
- A few safer patterns already exist: archived blog/review content and tombstoned portal client accounts.
- Several important areas do not hard-delete, but still overwrite live state in place with no version history.

Current pattern quality by area:

- Good reusable pattern: portal client account tombstone in `src/app/api/manager/portal/users/[ownerId]/route.ts`
- Partial reusable pattern: `archivedAt` soft archive for blogs and reviews
- Weak pattern: destructive manager/demo utilities rely on confirm flags but still purge real relational data
- Missing pattern: version history for funnels, forms, automations, and service-setup JSON

## Existing Recovery Patterns To Reuse

1. Portal client account tombstone

- File: `src/app/api/manager/portal/users/[ownerId]/route.ts`
- Model: store deleted metadata in `PortalServiceSetup` under `__portal_deleted_account`, mark the user inactive, remap the unique email, preserve original identity, and restore later.

2. Content archive via `archivedAt`

- Files: `src/app/api/portal/blogs/posts/[postId]/archive/route.ts`, `src/app/api/portal/reviews/archive/route.ts`
- Model: archive instead of delete, keep recovery cheap, keep history visible to operators.

3. Confirm-gated destructive bulk ops

- Files: `src/app/api/manager/leads/bulk/route.ts`, `src/app/api/manager/leads/cleanup/route.ts`
- Model: require explicit confirm before destructive bulk action. This is useful, but not enough on its own without archive or audit.

## Recovery Classification Table

| Area | Route / API | Current behavior | Risk | Recommended recovery model | Priority |
| --- | --- | --- | --- | --- | --- |
| Contacts / people | `src/app/api/portal/contacts/[contactId]/route.ts` `DELETE` | Hard deletes `portalContact` directly | High | Archive required | P0 |
| Contacts / people | `src/app/api/portal/contact-tags/[tagId]/route.ts` `DELETE` | Hard deletes a tag and its assignments | Medium | Archive required | P2 |
| Contacts / people | `src/app/api/portal/people/users/[userId]/route.ts` `DELETE` | Hard deletes portal team membership row | Medium | Soft delete required | P2 |
| Inbox threads / messages | `src/app/api/portal/ai-chat/threads/[threadId]/route.ts` `DELETE` | Hard deletes the thread; dependent chat data is removed with it | High | Archive required | P0 |
| Inbox threads / messages | `src/app/api/portal/ai-chat/threads/[threadId]/actions/route.ts` `action="delete"` | Hard deletes messages first, then thread | High | Archive required | P0 |
| Inbox threads / messages | `src/app/api/portal/ai-chat/scheduled/[messageId]/route.ts` `DELETE` | Hard deletes scheduled outbound chat message | High | Archive required | P1 |
| Inbox threads / messages | `src/app/api/portal/inbox/attachments/[id]/route.ts` `DELETE` | Hard deletes attachment record; blob/file history is not versioned in app | Medium | Version history required | P2 |
| Tasks | `src/app/api/portal/tasks/[taskId]/route.ts` `DELETE` | Hard deletes `PortalTaskMemberCompletion` rows, then the task | High | Archive required | P0 |
| Media / files | `src/app/api/portal/media/items/[id]/route.ts` `DELETE` | Hard deletes media item record | Medium | Version history required | P2 |
| Funnels / pages | `src/app/api/portal/funnel-builder/funnels/[funnelId]/route.ts` `DELETE` | Hard deletes funnel and clears builder settings such as domain, SEO, offers, routing, and tracking | High | Version history required | P0 |
| Funnels / pages | `src/app/api/portal/funnel-builder/funnels/[funnelId]/pages/[pageId]/route.ts` `DELETE` | Hard deletes funnel page | High | Version history required | P0 |
| Forms / submissions | `src/app/api/portal/funnel-builder/forms/[formId]/route.ts` `DELETE` | Hard deletes form; submissions are effectively lost with the form relationship | High | Version history required | P0 |
| Booking records | `src/app/api/availability/route.ts` `DELETE` | Hard deletes availability block | Medium | Archive required | P2 |
| Booking records | `src/app/api/portal/booking/integrations/[provider]/route.ts` `DELETE` | Clears meeting-provider credentials | Low | Audit only | P3 |
| Blogs / newsletters / reviews / nurture | `src/app/api/portal/blogs/posts/[postId]/route.ts` `DELETE` | Hard deletes blog post | High | Archive required | P0 |
| Blogs / newsletters / reviews / nurture | `src/app/api/manager/blogs/posts/bulk/route.ts` `action="delete"` | Bulk hard delete of blog posts | High | Archive required | P0 |
| Blogs / newsletters / reviews / nurture | `src/app/api/portal/blogs/posts/[postId]/archive/route.ts` | Soft archive already exists via `archivedAt` | Low | Audit only | P3 |
| Blogs / newsletters / reviews / nurture | `src/app/api/portal/reviews/archive/route.ts` | Soft archive already exists via `archivedAt` | Low | Audit only | P3 |
| Blogs / newsletters / reviews / nurture | `src/app/api/portal/nurture/campaigns/[campaignId]/route.ts` `DELETE` | Hard deletes nurture campaign | High | Archive required | P1 |
| Blogs / newsletters / reviews / nurture | `src/app/api/portal/nurture/steps/[stepId]/route.ts` `DELETE` | Hard deletes a nurture step and rewrites ordering around it | High | Version history required | P1 |
| Automations | `src/app/api/portal/automations/settings/route.ts` | Upserts live settings in place with no revision log | Medium | Version history required | P1 |
| AI outbound campaigns | `src/app/api/portal/ai-outbound-calls/campaigns/[campaignId]/sync-agent/route.ts`, `sync-chat-agent/route.ts`, `knowledge-base/upload/route.ts`, `messages-knowledge-base/upload/route.ts` | Overwrites campaign agent and knowledge-base state in place | Medium | Version history required | P1 |
| Lead scraping results | `src/app/api/portal/lead-scraping/leads/[leadId]/route.ts` `DELETE` | Hard deletes lead and clears related state map entries | High | Archive required | P1 |
| Credit reports / report items / dispute letters | `src/app/api/manager/portal/seed-credit-demo/route.ts` with `force=true` | Hard deletes dispute letters, report items, reports, pulls, and seeded contacts before reseeding | High | Hard delete allowed | P2 |
| Billing / credits / service overrides | `src/app/api/manager/portal/overrides/route.ts` `DELETE` | Removes module override from setup JSON and deletes the whole setup row when empty | Medium | Version history required | P1 |
| Billing / credits / service overrides | `src/app/api/manager/portal/billing-model/route.ts` | Deletes billing override setup rows when clearing credits-only | Medium | Audit only | P2 |
| Billing / credits / service overrides | `src/app/api/manager/portal/credits/gift/route.ts` | Mutates client credit balance through `addCredits`; financial state changes must remain reconstructable | High | Audit only | P0 |
| Manager / platform-admin tools | `src/app/api/manager/portal/users/[ownerId]/route.ts` `DELETE` / `PATCH` | Soft archive and restore model already exists for portal client accounts | Low | Soft delete required | P3 |
| Manager / platform-admin tools | `src/app/api/manager/leads/bulk/route.ts` `action="delete"` | Hard deletes leads plus appointments, calls, contract drafts, docs, and marketing rows | High | Hard delete allowed | P1 |
| Manager / platform-admin tools | `src/app/api/manager/leads/cleanup/route.ts` | Cleanup route hard deletes orphaned lead trees after `confirm=true` | Medium | Hard delete allowed | P2 |
| Manager / platform-admin tools | `src/app/api/manager/portal/seed-demo/route.ts` | Demo reseed purges reviews, tasks, contacts, inbox threads, and attachments for matching demo users | High | Hard delete allowed | P2 |
| Public submissions / uploaded docs | `src/app/api/manager/leads/bulk/route.ts`, `src/app/api/manager/leads/cleanup/route.ts` | Lead deletion and cleanup hard delete `Doc` rows tied to leads | High | Legal/privacy purge required | P1 |
| Public submissions / uploaded docs | `src/app/api/portal/business-profile/brief/route.ts` | Uploaded brief is parsed and workspace brief context is overwritten in place; no version history of prior uploads is obvious | Medium | Version history required | P1 |

## Top 10 Destructive-Risk Findings

1. Funnel delete wipes both the funnel row and the attached builder state.

- File: `src/app/api/portal/funnel-builder/funnels/[funnelId]/route.ts`
- Why it matters: this is not just content delete; it also clears domain assignment, SEO, offers, routing, and tracking. Recovery is expensive without snapshots.

2. Form delete effectively destroys submissions with it.

- File: `src/app/api/portal/funnel-builder/forms/[formId]/route.ts`
- Why it matters: user-submitted form data is business evidence. It should not disappear because an operator deleted the form shell.

3. Lead bulk delete is a true cascade purge across core sales history.

- File: `src/app/api/manager/leads/bulk/route.ts`
- Why it matters: calls, appointments, videos, contract drafts, approvals, messages, docs, and the lead itself all go away together.

4. Contact delete is still hard delete with no archive.

- File: `src/app/api/portal/contacts/[contactId]/route.ts`
- Why it matters: contacts are core customer records and often anchor tasks, inbox, campaigns, and follow-up behavior.

5. Task delete permanently removes task state and completion history.

- File: `src/app/api/portal/tasks/[taskId]/route.ts`
- Why it matters: task history is operational evidence. Today there is no archive or audit trail for removal.

6. AI chat thread delete removes customer-facing conversation history.

- Files: `src/app/api/portal/ai-chat/threads/[threadId]/route.ts`, `src/app/api/portal/ai-chat/threads/[threadId]/actions/route.ts`
- Why it matters: chats are often the only durable record of a support or AI interaction.

7. Blog content still has a hard-delete path even though archive already exists.

- Files: `src/app/api/portal/blogs/posts/[postId]/route.ts`, `src/app/api/manager/blogs/posts/bulk/route.ts`
- Why it matters: the codebase already proved archive is the safer model, but destructive routes still bypass it.

8. Nurture campaign and step deletion have no recovery and no revision history.

- Files: `src/app/api/portal/nurture/campaigns/[campaignId]/route.ts`, `src/app/api/portal/nurture/steps/[stepId]/route.ts`
- Why it matters: campaign logic is business IP. Removing it should be reversible.

9. Service override and automation settings are overwritten in place without version history.

- Files: `src/app/api/manager/portal/overrides/route.ts`, `src/app/api/manager/portal/billing-model/route.ts`, `src/app/api/portal/automations/settings/route.ts`, AI outbound campaign sync/upload routes
- Why it matters: settings changes can silently break a live customer experience and there is no built-in rollback.

10. Demo/seed routes can purge relational data by match patterns.

- Files: `src/app/api/manager/portal/seed-demo/route.ts`, `src/app/api/manager/portal/seed-credit-demo/route.ts`
- Why it matters: intended-only-for-demo routes still deserve strong guardrails because they perform real deletes.

## Recommended Recovery Model By Class

### Soft delete required

- Portal team membership rows
- Portal client accounts already use this pattern and should remain the baseline

### Archive required

- Contacts
- Tasks
- AI chat threads and scheduled messages
- Nurture campaigns
- Lead scraping leads
- Blog post delete routes should switch to archive-only

### Version history required

- Funnels
- Funnel pages
- Forms and submission-facing schemas
- Media/file metadata
- Automations settings
- AI outbound campaign settings and knowledge-base state
- Business brief uploads / parsed workspace brief state
- Service overrides and other setup JSON that is edited in place

### Audit only

- Meeting integration disconnect
- Billing model clear action
- Credit gifts and other balance mutations
- Existing archived content flows

### Hard delete allowed

- Manager cleanup utilities for known-bad/orphaned lead trees, but only behind strong confirm + audit
- Demo-only reseed routes, but only behind stronger environment and operator restrictions

### Legal/privacy purge required

- Public submission docs and uploaded customer documents when a customer requests deletion
- Any future customer-facing account purge should include uploaded docs, generated PDFs, inbox artifacts, and stored reports in a privacy-reviewed purge job

## Recommended Implementation Order

1. Stop hard-deleting customer-visible operational records.

- Contacts, tasks, AI chat threads, nurture campaigns, lead scraping results

2. Add revision history to configuration-heavy business assets.

- Funnels, pages, forms, automations, outbound AI campaign settings, service overrides

3. Normalize archive semantics.

- Use a clear archived/tombstoned state instead of a mix of hard delete, status clear, and setup-row delete.

4. Add audit coverage for financial and entitlement mutations.

- Credits gifted, billing model changed, service override changed, platform-admin tools used

5. Build a legal/privacy purge path separate from normal operator delete.

## Suggested Implementation Prompts

1. Contacts archive

```text
Implement contact archiving for portal contacts. Replace hard delete in src/app/api/portal/contacts/[contactId]/route.ts with an archive model that preserves original contact data, hides archived contacts from the default UI, supports restore, and adds operator audit metadata.
```

2. Funnel versioning

```text
Add version history for funnel builder assets. Cover funnels, pages, and forms so destructive actions become reversible snapshots instead of hard deletes. Preserve current publishing behavior, but store prior versions and support restore/rollback from manager tooling.
```

3. Task recoverability

```text
Replace task hard delete with archive in src/app/api/portal/tasks/[taskId]/route.ts. Preserve task completion history, add deletedBy/deletedAt metadata, hide archived tasks from active views, and support restore.
```

4. AI chat archive

```text
Implement archive-for-delete on portal AI chat threads and scheduled messages. Do not hard-delete conversation history. Add archivedAt/archivedBy support, exclude archived items from default queries, and make restore available to the account owner.
```

5. Override/settings revision ledger

```text
Add revision history for portal service overrides, billing model overrides, automations settings, and AI outbound campaign settings. Every mutation should write an append-only revision record with actor, timestamp, diff payload, and rollback capability.
```

6. Blog delete normalization

```text
Remove hard-delete behavior for blog posts. Route all delete actions through archive semantics, including manager bulk actions, and keep permanent purge as a separate explicit operator-only maintenance path.
```

7. Legal purge workflow

```text
Design and implement a legal/privacy purge workflow for portal client data. Cover uploaded docs, generated PDFs, inbox attachments, reports, submissions, and other customer artifacts. Keep it separate from standard operator archive/delete and require explicit privileged execution.
```

## Bottom Line

The platform already has enough evidence to standardize on three models:

- archive for business records
- version history for configurable assets
- audit-only for financial/entitlement mutations

Hard delete should be reserved for demo reseeding, orphan cleanup, and future legal/privacy purge flows.