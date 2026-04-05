# AUT - Purely Automation system design

This document is the **source-of-truth system design** for the Purely Automation internal ops platform.

## 1) Goals (what “done” looks like)
- A single system where **Setters/Dialers**, **Closers**, and **Managers** can:
  - Manage **lead assignment** and prevent “double-calling” the same lead.
  - Log outbound call activity with **dispositions**.
  - Book meetings and route them to **available closers**.
  - Track meeting outcomes so the **setter and management** see results.
  - Generate and manage **AI-assisted scripts** and **call notes**.
  - Capture call recordings/transcripts (upload + transcribe) into editable “doc-style” notes.
  - Generate contracts from a structured sale form, send for **manager approval**, then send to client.

Non-goals (for MVP):
- Building a full telephony/dialer product (calls happen on employee phones).
- Complex CRM replacement.

## 2) Roles & permissions
### Dialer / Setter
- View assigned leads and pull more leads (from a shared pool) using filters.
- Log calls and set call dispositions.
- Book meetings and assign/auto-assign a closer.
- View the status/outcome of meetings they set.

### Closer
- Maintain availability inside the app.
- View assigned meetings and meeting context (lead profile, setter transcript, AI analysis).
- Disposition meeting outcomes (Closed / Follow Up / No Show / Lost / Rescheduled).
- If Closed: complete sale form -> generate contract draft -> submit for approval.

### Manager / Admin
- View everything.
- Manage users, roles, working hours/capacity.
- Override lead assignment, meeting assignment, outcomes.
- Approve/reject contracts.
- Reporting and exports.

## 3) Core objects (data model)
Keep the data model simple and auditable. Names below are conceptual; map to Prisma models.

### User
- `id`, `name`, `email`, `role` (`DIALER` | `CLOSER` | `MANAGER`)
- `active`, `timezone`
- (optional) `capacityPerDay`, `priorityWeight`

### Lead
- `id`, `businessName`, `phone`, `email?`, `website?`
- `location` (city/state/zip), `niche` (category)
- `source` (scrape job id / import)
- `status` (`NEW` | `ASSIGNED` | `CONTACTED` | `BOOKED` | `DISQUALIFIED`)

### LeadAssignment
- `id`, `leadId`, `assignedToUserId`, `assignedAt`, `releasedAt?`
- Uniqueness rule: a lead can only be “active-assigned” to one user at a time.

### CallLog
- `id`, `leadId`, `setterUserId`
- `startedAt`, `durationSec?`
- `disposition` (`NO_ANSWER` | `LEFT_VM` | `FOLLOW_UP` | `BOOKED` | `NOT_INTERESTED` | `BAD_NUMBER` | ...)
- `followUpAt?`, `notesDocId?`
- `recordingAssetId?`, `transcriptDocId?`

### Availability
- `id`, `closerUserId`, `rules` (working hours), `overrides` (PTO/time-off), `timezone`
- For MVP: store availability blocks; later integrate external calendars.

### Appointment
- `id`, `leadId`, `setterUserId`, `closerUserId`
- `startAt`, `endAt`, `timezone`
- `status` (`SCHEDULED` | `COMPLETED` | `CANCELED` | `NO_SHOW` | `RESCHEDULED`)
- `closerOutcome` (`CLOSED` | `FOLLOW_UP` | `LOST` | ...)
- `outcomeNotesDocId?`
- `setterContextDocId?` (call notes/transcript summary)

### Script
- `id`, `ownerUserId` (or team-shared)
- `title`, `docId`
- `tags` (`niche`, `tone`, etc)

### Doc (Google-doc style editor backing)
- `id`, `ownerId`, `type` (`SCRIPT` | `CALL_NOTES` | `TRANSCRIPT` | `CONTRACT_DRAFT` | ...)
- `content` (rich text JSON or markdown), `createdBy`, `updatedBy`
- Versioning (optional MVP): store revisions or append-only history.

### Contract
- `id`, `appointmentId`, `closerUserId`
- `status` (`DRAFT` | `PENDING_APPROVAL` | `APPROVED` | `REJECTED` | `SENT` | `SIGNED?`)
- `pricing`, `terms`, `servicesIncluded`
- `draftDocId` (AI-generated contract that the closer can edit)
- `approvedByUserId?`, `approvedAt?`

### Asset (uploads)
- `id`, `type` (`AUDIO` | `VIDEO` | `DOC_ATTACHMENT`)
- `storageUrl`, `mimeType`, `sizeBytes`, `createdByUserId`

### AuditEvent
- `id`, `actorUserId`, `action`, `entityType`, `entityId`, `metadataJson`, `createdAt`
- Required for: lead assignment changes, outcome changes, contract approvals.

## 4) Key workflows
### 4.1 Lead pulling (anti-duplication)
1. Dialer chooses filters (location + niche) and clicks “Pull leads”.
2. System selects unused/unassigned leads from the pool.
3. Leads become assigned to that dialer (with TTL option).
4. Dialer works the list; dispositions update lead status.

Rules:
- A lead should not be concurrently assigned to multiple dialers.
- Allow manager override / reassign.

### 4.2 Call logging
1. Dialer opens a lead -> taps “Log call”.
2. Picks disposition; if `FOLLOW_UP`, sets follow-up date/time.
3. Optionally creates/links a call notes doc.

### 4.3 Script generation + editing
1. Dialer clicks “Generate script”.
2. AI produces a draft based on lead/business info + niche + tone.
3. Script is saved as a Doc and opens in the editor.
4. Dialer can iterate: “Rewrite with a friendlier tone”, “Shorter opener”, etc.
5. Dialer can save scripts as templates for future calls.

### 4.4 Recording + transcription
1. Dialer uploads audio recording (or later: mobile recording capture).
2. Backend transcribes -> saves transcript doc.
3. Dialer can edit transcript notes, then “Submit to closer”.

### 4.5 Booking + closer routing
1. Dialer selects time slot.
2. System finds eligible closers with availability.
3. Assign using a routing rule:
   - MVP: “available at that time + least meetings today”
   - Later: skills-based, weighted round-robin.
4. Create appointment and notify closer.

### 4.6 Closer meeting outcome loop
1. Closer opens assigned appointment.
2. Reviews lead + transcript + AI summary + suggested discovery questions.
3. After meeting, closer dispositions outcome.
4. Setter + manager see updates immediately.

### 4.7 Contract generation + approval
1. If outcome is Closed, closer fills sale form (price, terms, included services).
2. AI generates contract draft doc.
3. Closer edits draft and submits for approval.
4. Manager approves -> system sends contract to client.

## 5) AI capabilities (guardrails + UX)
### Inputs
- Lead profile (business name, niche, location, website)
- Prior call logs + setter notes
- Transcript (if available)
- User-selected tone/constraints

### Outputs
- Call scripts (setter + closer variants)
- Talking points + objections handling
- Discovery questions
- Transcript summary + key commitments
- Contract draft

### Guardrails
- Persist AI outputs as drafts; never auto-send external messages/contracts without explicit user action.
- Keep an audit trail of approvals and what changed.

## 6) UI (Apple-like)
Principles:
- Mobile-first layouts, large spacing, minimal chrome.
- “Card” surfaces for lead/appointment details.
- Prominent primary action button on each screen.

Recommended nav:
- Dialer: Leads, Calls, Book, Scripts, Profile
- Closer: Calendar, Meetings, Scripts, Profile
- Manager: Dashboard, Team, Leads, Meetings, Contracts

## 7) System architecture (high level)
### Web app
- Next.js App Router UI + API routes
- Auth + role-based access controls

### Data
- Postgres (prod) / SQLite (local)
- Prisma models and migrations

### Background jobs
- Lead scraping jobs
- Transcription jobs
- AI generation jobs
- Notification fanout (in-app, email, push)

### Storage
- Assets in object storage (S3/Vercel Blob/Supabase Storage)

## 8) MVP milestones (build order)
1. Auth + roles + basic navigation
2. Lead pool + assignment + lead details
3. Call log + dispositions + follow-up
4. Availability + appointment booking + routing
5. Closer outcomes + manager visibility
6. Doc editor (scripts/notes) + AI generation
7. Upload + transcription pipeline
8. Contract generation + approval workflow

## 9) Open questions (answer to lock scope)
1. Lead sources: scraping only, or CSV imports too?
2. Lead dedupe key: phone only, or phone+domain?
3. Appointment booking: internal-only calendar UI, or also invite the lead via email/text?
4. Contract sending: email-only for MVP? e-sign later?
5. Reporting: what are the 5 KPIs that matter most day 1?
