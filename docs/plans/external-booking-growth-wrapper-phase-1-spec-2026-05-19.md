# External Booking Growth Wrapper Phase 1 Spec

## Purpose

Define the first real implementation slice for:

"Paste your booking link. Purely builds the growth and follow-up layer around it."

This is a Phase 1 product and implementation spec, not a full Meta/social buildout.

Phase 1 focuses on:

- importing an external booking link
- detecting the likely provider when possible
- asking only the missing clarification questions
- wrapping that link with a truthful landing, capture, follow-up, and reporting layer
- reusing existing provider readiness and no-silent-failure patterns already present in the portal

This phase does not include:

- real booking-provider sync
- calendar ownership
- double-booking prevention
- direct Meta posting
- DM/comment capture
- fake booked-appointment attribution

## Product Promise

The operator promise for Phase 1 is:

- Paste your existing booking link.
- Confirm a few business details if we cannot detect them confidently.
- Purely builds the traffic, capture, follow-up, and reporting layer around that link.
- We send people to your existing booking page.

The product must not imply:

- that Purely owns the calendar
- that Purely prevents double-booking
- that Purely can confirm bookings unless a real provider integration exists
- that outbound SMS/email is live when provider setup is missing

## Existing Foundations To Reuse

Phase 1 should reuse these repo patterns instead of inventing a parallel system:

- Booking service shell and settings patterns in `src/app/portal/app/services/booking/PortalBookingClient.tsx`
- Public booking concepts and public route language in `src/app/book/[slug]/PublicBookingClient.tsx`
- Follow-up automation foundations in `src/lib/followUpAutomation.ts`
- Nurture campaign patterns in `src/lib/portalNurtureTemplates.ts`
- Newsletter distribution and CTA surfaces in `src/app/portal/app/services/newsletter/PortalNewsletterClient.tsx`
- Reminder configuration patterns in `src/app/api/portal/booking/reminders/settings/route.ts`
- Reporting and service-status patterns in `src/lib/portalServicesStatus.ts`
- Provider-blocker truth patterns in `src/lib/providerSetupGuidance.ts`
- Media selection and reuse in `src/app/portal/app/services/media-library/PortalMediaLibraryClient.tsx`
- Funnel CTA and booking-link references already present in funnel builder and booking surfaces

## Truth Boundaries

These are hard rules for the feature, not optional copy polish.

### Allowed claims

- "We send people to your existing booking page."
- "Purely can track page visits, lead capture, and booking-link clicks."
- "Booked appointment confirmation requires provider sync or manual confirmation."
- "SMS and email follow-up are only live after providers are connected."

### Disallowed claims

- "Your calendar is synced" unless a real provider connection exists
- "Double-booking protection" unless a real provider sync exists
- "Appointments confirmed" when only a click/redirect happened
- "Meta posting is live" before OAuth and real publish confirmation exist
- any outcome guarantee language

## Phase 1 User Journey

### Entry points

The feature should be reachable from:

- Booking service setup
- Funnel/page CTA setup when no native booking flow is configured
- Nurture or follow-up setup when the workspace needs a booking CTA target
- Suggested setup / next-best-action surfaces when booking is missing but an external link could unblock growth

Primary phase-1 home should be under Booking because the user mental model is still "where do I put my booking link?"

## Exact Wizard Flow

The flow should be a short import wizard, not a broad intake funnel.

### Screen 1. Import link

Title:

`Use your existing booking page`

Body:

`Paste the booking page you already use. Purely will build the growth and follow-up layer around it.`

Fields:

- booking URL

Helper copy:

- `Supported examples: Calendly, Square, Acuity, GlossGenius, Fresha, Booksy, or a custom booking form.`
- `We send people to your existing booking page. Calendar sync is not included in this step.`

Actions:

- `Detect booking page`
- `Cancel`

States:

- invalid URL
- unsupported or unknown provider
- fetch failed
- page blocked or inaccessible
- detected successfully

### Screen 2. Detection review

Title:

`We found your booking page`

Show:

- detected provider label or `Custom booking page`
- normalized link preview
- page title
- detected business name if any
- detected service labels if any
- confidence badge: `High`, `Medium`, `Low`

Core copy:

- `Purely will send people to this page when they are ready to book.`
- `This does not turn on calendar sync or appointment confirmation by itself.`

Actions:

- `Looks right`
- `Use link anyway`
- `Paste a different link`

### Screen 3. Clarify missing details

This screen should only ask what is missing or ambiguous.

If confidence is high, ask only short confirmations.

If confidence is medium, ask the missing business and CTA questions.

If confidence is low, use a fuller but still short guided setup card.

Title:

`Help us build around this link`

Possible questions:

- What do you want to call this booking flow?
- What is the main service or offer tied to this link?
- Is this for a consultation, appointment, estimate, class, service package, or another type of booking?
- Do you want people to book immediately or do you want lead capture first?
- What is the main business goal for this flow?
- What contact channels should Purely prepare for follow-up?

Progressive disclosure rules:

- do not ask city/service area if it was extracted confidently
- do not ask business name if profile/runtime already has a better name
- do not ask channel questions if the user explicitly chooses `draft only`
- do not ask broad branding questions in Phase 1

### Screen 4. Choose handoff mode

Title:

`Choose how people reach your booking page`

Options:

#### Direct-book mode

- `Send people straight to your booking page`
- best when operator already trusts the booking page and wants less friction

#### Lead-first mode

- `Capture name, phone, or email before redirecting to your booking page`
- best when operator wants follow-up even if someone does not finish booking

Core truth copy:

- `Purely sends visitors to your existing booking page in both modes.`
- `Booked appointment reporting is limited until a real provider sync exists.`

### Screen 5. Choose generated assets

Default assets should already be preselected.

Title:

`Choose your growth wrapper`

Default-on items:

- simple landing page
- booking CTA block
- reporting card
- next-best-action card

Optional items:

- lead capture form
- missed inquiry follow-up
- SMS reminder sequence draft
- email reminder sequence draft
- review request draft
- nurture campaign starter
- task/checklist pack

Rules:

- SMS/email assets can be generated as draft even when providers are not connected
- anything provider-backed must show `Draft only` or `Blocked` until setup is real

### Screen 6. Review and launch

Title:

`Your booking growth layer is ready`

Show summary cards:

- external booking link
- handoff mode
- generated assets
- live/draft/blocked states

Primary actions:

- `Open landing page`
- `Open booking settings`
- `Review follow-up`
- `Review reporting`

## Clarification Engine

The clarification engine should be a reusable internal utility, not logic buried inside one page component.

### Inputs

- detected provider
- normalized URL
- imported metadata
- extracted business/service hints
- existing business profile/runtime context
- existing booking service state
- existing provider readiness

### Outputs

- `confidence`: `high | medium | low`
- `needsUserInput`: boolean
- `questionSet`: ordered list of questions
- `suggestedAnswers`: optional defaults
- `blockingUnknowns`: minimal required unresolved items

### Confidence rubric

#### High confidence

Use when all are true:

- provider detected
- normalized URL looks valid
- page title or metadata gives clear business or service intent
- existing workspace profile fills missing business context

Ask 1 to 3 confirmation questions.

#### Medium confidence

Use when:

- provider or page looks valid
- some business/service context is ambiguous
- handoff mode or goal is still unclear

Ask a short guided card.

#### Low confidence

Use when:

- provider is unknown and page metadata is weak
- page is too generic or JS-heavy to extract meaning
- business/service offer is not inferable

Ask the minimal setup card necessary to produce a truthful wrapper.

### Recommended Phase 1 question bank

Required-or-near-required questions:

1. `What is the main service or offer for this link?`
2. `What kind of booking is this?`
3. `How should Purely hand people off: direct booking or lead capture first?`
4. `What is the main goal: more bookings, more leads, fewer no-shows, more reviews, or more repeat visits?`

Conditional questions:

5. `What should the main CTA say?`
6. `What area do you serve?`
7. `Should Purely prepare SMS, email, or draft-only follow-up?`
8. `Do you want a review request flow after the appointment?`

Phase 1 should cap the default question count at 6.

## Data Model Additions

Phase 1 should add a new external-booking wrapper slice rather than forcing this into the native booking-site model.

### Model: `ExternalBookingLink`

Fields:

- `id`
- `ownerId`
- `workspaceId` or reuse owner scope if that is the repo norm
- `providerKey`
- `providerLabel`
- `sourceUrl`
- `normalizedUrl`
- `status`
- `pageTitle`
- `businessNameHint`
- `serviceSummaryHint`
- `detectedServicesJson`
- `locationHintsJson`
- `detectionConfidence`
- `detectionNotesJson`
- `clarificationStatus`
- `clarificationAnswersJson`
- `needsUserInput`
- `lastDetectedAt`
- `lastVerifiedAt`
- `createdAt`
- `updatedAt`

Suggested enums:

- `providerKey`: `unknown | calendly | square | acuity | glossgenius | fresha | booksy | custom_form`
- `status`: `draft | active | needs_review | disabled`
- `detectionConfidence`: `high | medium | low`
- `clarificationStatus`: `not_started | needs_input | confirmed`

### Model: `ExternalBookingWrapper`

Fields:

- `id`
- `ownerId`
- `externalBookingLinkId`
- `handoffMode`
- `landingPageId` nullable
- `leadFormId` nullable
- `primaryFollowUpFlowId` nullable
- `primaryNurtureCampaignId` nullable
- `reviewFlowId` nullable
- `taskBundleId` nullable
- `reportingConfigJson`
- `isPublished`
- `createdAt`
- `updatedAt`

Enums:

- `handoffMode`: `direct_book | lead_first`

### Model: `ExternalBookingAttributionEvent`

Fields:

- `id`
- `ownerId`
- `externalBookingLinkId`
- `wrapperId` nullable
- `contactId` nullable
- `campaignId` nullable
- `sourceChannel`
- `sourceAssetId` nullable
- `sessionId` nullable
- `referrer`
- `utmJson`
- `eventType`
- `occurredAt`

Enums:

- `eventType`: `landing_view | lead_started | lead_submitted | booking_cta_clicked | review_flow_started | nurture_enrolled`

### Model: `ExternalBookingProviderCapability`

This can begin as a static runtime map instead of a real table.

Fields:

- `providerKey`
- `supportsDeepParse`
- `supportsEmbedHints`
- `supportsWebhook`
- `supportsApiSync`
- `supportsBookingConfirmationPull`
- `notes`

## API Contract

### 1. Import external booking link

`POST /api/portal/booking/external-links/import`

Request:

```json
{
  "url": "https://calendly.com/example/demo"
}
```

Response:

```json
{
  "ok": true,
  "externalBookingLink": {
    "id": "...",
    "providerKey": "calendly",
    "providerLabel": "Calendly",
    "normalizedUrl": "https://calendly.com/example/demo",
    "pageTitle": "Book a consultation",
    "businessNameHint": "Example Studio",
    "serviceSummaryHint": "Consultation booking",
    "detectionConfidence": "medium",
    "needsUserInput": true
  },
  "clarification": {
    "status": "needs_input",
    "questionSet": [
      {
        "key": "offerName",
        "label": "What is the main service or offer for this link?",
        "type": "text",
        "required": true
      }
    ]
  }
}
```

### 2. Update clarification answers

`PATCH /api/portal/booking/external-links/[linkId]/clarification`

Request:

```json
{
  "answers": {
    "offerName": "Free consultation",
    "bookingType": "consultation",
    "handoffMode": "lead_first",
    "goal": "more_bookings"
  }
}
```

Response should return the resolved next screen state and whether the wrapper can be generated.

### 3. Create wrapper assets

`POST /api/portal/booking/external-links/[linkId]/generate-wrapper`

Request:

```json
{
  "handoffMode": "lead_first",
  "assets": {
    "landingPage": true,
    "leadCapture": true,
    "missedInquiryFollowUp": true,
    "smsDraft": true,
    "emailDraft": true,
    "reviewDraft": true,
    "nurtureStarter": true,
    "taskBundle": true,
    "reportingCard": true
  }
}
```

Response:

- wrapper IDs
- generated asset IDs
- provider-backed asset readiness
- next-best-action items

### 4. Verify link health

`POST /api/portal/booking/external-links/[linkId]/verify`

Phase 1 scope:

- confirm URL format
- confirm page fetchability when allowed
- refresh detection metadata

Not in Phase 1:

- real booking availability sync
- provider-owned event confirmation

### 5. Attribution event ingest

`POST /api/portal/booking/external-links/[linkId]/events`

Use for:

- landing page views
- lead form start/submit
- booking CTA clicks

## Phase 1 UI Surfaces

### Booking service

Add an `External booking link` panel in booking settings.

States:

- no external link
- imported but not confirmed
- external link active
- wrapper generated but some provider-backed assets blocked

### Funnel and CTA surfaces

When native booking is not configured, allow CTA target selection:

- native booking link
- external booking link
- no booking target yet

UI copy must distinguish:

- `Native booking` vs `External booking redirect`

### Follow-up and nurture surfaces

If lead-first mode is chosen, allow generated flows to reference the imported booking CTA.

If providers are missing, use existing blocker language patterns:

- SMS: blocked until Twilio
- email: blocked until email delivery is configured

### Reporting surface

Phase 1 reporting card should show only what is real:

- landing page visits
- leads captured
- booking-link clicks
- outbound follow-up readiness

Do not show booked appointment counts unless real confirmation exists.

## Acceptance Criteria

Phase 1 is complete when all are true:

1. A user can paste an external booking link and get a detected provider label when possible.
2. The system stores the normalized link and extracted hints safely.
3. The system asks only the missing clarification questions required to generate a wrapper.
4. The user can choose `direct_book` or `lead_first` handoff.
5. The generated landing page and CTA surfaces route to the external booking link.
6. Lead-first mode can capture lead info before redirect.
7. Provider-backed follow-up never reports success when SMS/email providers are missing.
8. Reporting truthfully stops at views, leads, and click-through unless a real booking confirmation signal exists.
9. UI copy never implies calendar sync or double-booking prevention.

## Validation Checklist

Use at least these sample cases:

### Case A. Known provider, medium confidence

- import a Calendly link
- detect provider correctly
- ask for missing offer name and handoff mode
- generate wrapper

### Case B. Unknown provider, low confidence

- import a custom booking form
- show `Custom booking page`
- ask fuller clarification card
- still allow wrapper generation

### Case C. Direct-book mode

- landing page CTA sends user directly to external booking page
- reporting captures click-through only

### Case D. Lead-first mode

- capture lead before redirect
- create contact and attribution event
- allow follow-up enrollment

### Case E. Missing provider setup

- generate SMS/email draft assets
- confirm blocked/live states are truthful
- confirm no send path claims success before providers are connected

## Future Hooks Beyond Phase 1

These should shape data design now, but not be built in this phase.

### Phase 2

- better provider detection
- better CTA routing logic
- multiple external booking links per workspace

### Phase 3

- social content calendar with draft-only export
- no direct posting yet

### Phase 4

- Meta OAuth
- page/account permissions
- scheduled posting
- queue and retry handling

### Phase 5

- DM/comment lead capture
- social attribution to booking goals

### Phase 6

- deeper booking-provider sync if customer demand and provider APIs justify it

## Recommended First Implementation Prompt

Build Phase 1 of the external booking growth wrapper in the portal.

Goal:

Allow a business to paste an external booking link, answer only the missing clarification questions, and use that link as a truthful CTA target across generated growth assets.

Scope:

- add the external booking link data model and owner-scoped CRUD/import endpoints
- detect provider from URL/domain when possible
- store normalized URL, provider label, extracted hints, detection confidence, clarification status, and answers
- add a booking setup flow that says `We send people to your existing booking page`
- add a clarification engine that asks only the missing business and offer questions when confidence is incomplete
- support `direct_book` and `lead_first` handoff modes
- generate a simple landing page, optional lead capture form, reporting card, and next-best-action guidance around the imported link
- allow funnels and follow-up assets to reference the external booking link as CTA target
- reuse existing provider blocker patterns so SMS/email assets stay draft-only or blocked until providers are configured

Constraints:

- do not implement real booking-provider sync
- do not claim appointment confirmation from click-through only
- do not implement Meta posting
- do not claim double-booking prevention

Validation:

- verify provider detection on a known provider and a custom link
- verify clarification question count stays minimal
- verify direct-book and lead-first routing both work
- verify reporting shows views, leads, and booking-link clicks only
- verify blocked/live provider states remain truthful