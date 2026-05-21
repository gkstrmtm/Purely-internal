# Future Growth: Booking Confirmation Integrations

## Purpose

FG-002 defines how Purely can move from external booking-link handoff tracking to real booking confirmation without weakening the current truth boundary.

Today the platform can truthfully say:

- a business configured an external booking link
- a visitor was sent to that booking page
- a lead may have been captured before redirect

Today the platform cannot truthfully say:

- the visitor completed booking
- the visitor canceled or rescheduled
- the appointment happened

This document defines the practical paths to real confirmation and recommends the first implementation path.

## Non-Negotiable Truth Boundary

Use these confirmation levels everywhere in UI, reporting, automation, and data contracts.

| Level | What it means | What it does not mean |
| --- | --- | --- |
| `handoff_only` | Purely tracked a send to the external booking page. | It does not prove booking started or completed. |
| `redirect_confirmed` | The user returned through a provider thank-you or redirect callback after booking flow completion. | It still does not prove the provider actually stored the booking unless the provider guarantees the callback semantics. |
| `webhook_confirmed` | The provider sent a booking lifecycle event to Purely. | It does not prove the appointment happened yet. |
| `api_confirmed` | Purely verified booking state through a provider API or calendar API. | It does not automatically prove attendance or outcome. |
| `owned_booking` | The booking was created and managed inside Purely's own booking stack. | It still needs separate attended/completed logic if outcome matters. |

Never label a handoff or lead capture as a booked appointment unless the confirmation source is at least `webhook_confirmed`, `api_confirmed`, or `owned_booking`.

## Confirmation Method Comparison

| Method | What it can prove | Can detect cancel/reschedule? | Strength | Weakness | Recommended use |
| --- | --- | --- | --- | --- | --- |
| Provider thank-you or redirect return | The user reached a post-booking return step. | Usually no. | Fastest path, low integration cost. | Easy to miss if the user closes the tab, opens a new window, blocks scripts, or the provider has no real return callback. | Phase 1 only, and label as `redirect_confirmed`, not booked by default. |
| Provider webhook | Booking created, canceled, rescheduled, or changed, depending on provider. | Yes, where provider supports lifecycle events. | Best practical confirmation source for external providers. | Requires public HTTPS endpoint, provider app setup, signature verification, retries, and seller/provider connection. | Phase 2 primary path. |
| Provider API polling | Current booking state via direct API read. | Yes. | Useful as a recovery and backfill path. | More latency, rate-limit pressure, token management, and usually worse than webhooks for real-time UX. | Phase 2 fallback and reconciliation path. |
| Calendar sync | A calendar event exists or changed in a connected calendar. | Usually yes for event changes. | Broad fallback when booking provider APIs are weak. | Indirect source, harder matching, not proof that the event came from the tracked booking link. | Phase 4 deeper sync, not first confirmation path. |
| Email parsing | Maybe a confirmation email was received. | Maybe. | Works without a formal API in theory. | Fragile, provider-template dependent, privacy-heavy, hard to verify, easy to break. | Not recommended as an MVP path. |
| Platform-owned booking | Purely created and owns the appointment record. | Yes. | Strongest long-term control and reporting quality. | Largest scope and product surface area. | Long-term end state, not this slice. |

## Provider Comparison

Legend:

- `Verified` means the current planning pass found direct evidence in public docs.
- `Likely` means the provider is commonly understood to support it, but the exact implementation details should be verified before building.
- `Unclear` means this planning pass did not find a reliable self-serve public path and Purely should not promise it yet.

| Provider | Connect model | OAuth / multi-tenant connection | Webhooks | Booking lifecycle events | Redirect / thank-you confirmation | MVP fit | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Calendly | Developer app + API platform | Likely | Likely | Likely created, canceled, and reschedule-adjacent events; verify exact event names before build | Unclear; verify exact post-booking return behavior and plan limits | Best first target | Strong product fit for current external-link wrapper and current demo state. Calendly also now exposes a Scheduling API for deeper later work. |
| Square Appointments | Seller OAuth + Bookings API | Verified | Verified | Verified create, retrieve, update, cancel through Bookings API; webhook support exists through Square platform | Unclear for hosted Square booking page; do not assume a reliable post-booking redirect | Strong second target | Excellent long-term provider because OAuth, APIs, webhooks, and sandbox exist. Heavier seller/location/team/catalog model than Calendly. |
| Acuity / Squarespace Scheduling | OAuth2 + API | Verified | Verified | Verified `scheduled`, `rescheduled`, `canceled`, and `changed` webhook actions | Likely through embeds/dynamic links, but exact redirect semantics should be verified | Strong alternative first target | Public docs are clear and webhook semantics are explicit. Lower product pressure than Calendly or Square unless user demand is strong. |
| GlossGenius | Public integration path unclear | Unclear | Unclear | Unclear | Unclear | Not first | Do not promise direct integration until a public app path, webhook story, and approval rules are verified. |
| Booksy | Public integration path unclear | Unclear | Unclear | Unclear | Unclear | Not first | Likely partner-led or restricted. Treat as research-only for now. |
| Fresha | Public integration path unclear | Unclear | Unclear | Unclear | Unclear | Not first | Treat as research-only for now. |
| Vagaro | Public integration path unclear | Unclear | Unclear | Unclear | Unclear | Not first | Verify API and approval requirements before any roadmap commitment. |
| Setmore | Docs path was not stable in this planning pass | Unclear | Unclear | Unclear | Unclear | Not first | Historical API existence is not enough. Re-verify current auth and webhook story before committing. |
| SimplyBook.me | API token/plugin model | Unclear for Purely-style self-serve multi-tenant OAuth | Unclear in this planning pass | Verified that an API/token model exists | Likely possible in embedded/native patterns, but not yet verified for confirmation callback use | Later | Interesting if Purely wants deeper embedded booking creation, but current auth model looks less friendly for low-friction SaaS onboarding. |
| Google Calendar | Calendar OAuth | Verified | Verified push notifications | Verified event create/update/delete at calendar layer | Not applicable | Later sync layer | Useful only as indirect confirmation. It confirms calendar events, not that the event came from the tracked public booking handoff unless Purely has a strong matching strategy. |
| Microsoft Calendar / Outlook events | Microsoft Graph OAuth | Verified | Verified change notifications | Verified event create/update/delete at calendar layer | Not applicable | Later sync layer | Same limitation as Google Calendar: valuable as a sync layer, not as the first external booking confirmation source. |
| Platform-owned booking | First-party | First-party | First-party | First-party | First-party | Long-term end state | Highest trust, highest scope. |

## Recommended First Path

### Recommendation

Build a provider-agnostic confirmation framework, but implement the first real provider integration with Calendly.

### Why Calendly first

- It is already present in the current external-link test flow and matches the wrapper product direction well.
- It is common among coaching, consultation, agency, and service businesses that fit Purely's current booking-growth wrapper.
- It is more likely than Square to map cleanly onto a simple `external link -> confirmation webhook -> contact/reporting update` flow without pulling in Square's broader seller, team, location, and catalog complexity on day one.
- Calendly's newer Scheduling API suggests a path beyond mere hosted redirects if Purely later wants deeper integration.

### Why not Square first

Square is an excellent second provider, and its public docs for OAuth, webhooks, and Bookings API are clearer in this planning pass. But the seller model is operationally heavier and the hosted booking-page redirect story is less obvious. Square should follow immediately after the first provider pattern is proven.

### Why not lead with calendar sync

Calendar sync is a valuable fallback and reconciliation layer, but it is weaker as the first confirmation path because:

- calendar events do not inherently prove they came from the tracked public booking handoff
- matching by contact/time window is probabilistic unless provider metadata is preserved
- event changes are often noisier than provider-native booking events

## MVP Phases

### Phase 1: Redirect confirmation where provider supports it

Goal: add a low-cost intermediate confirmation layer without claiming booked appointments.

Scope:

- add a provider-agnostic return endpoint such as `/api/public/booking/[slug]/confirm-return`
- support correlation tokens on outbound handoff links where the provider can round-trip them
- if the provider or hosted flow can return to Purely after booking flow completion, store a `redirect_confirmed` confirmation event
- show this level separately from `handoff_only`

Rules:

- do not convert `redirect_confirmed` into `confirmed booking` by default
- use it only as a warmer signal than a raw click

### Phase 2: First webhook-capable provider integration

Goal: ship one real provider-backed confirmation path.

Recommended provider: Calendly

Scope:

- seller/provider connection setup
- provider connection status in Purely
- webhook receiver
- booking-created confirmation event
- contact matching + handoff-event linkage
- confirmed booking reporting split from handoff-only

### Phase 3: Cancellation and reschedule handling

Goal: update downstream automation and reporting truthfully.

Scope:

- cancellation webhook/API handling
- reschedule detection and timeline updates
- follow-up suppression or rerouting for canceled bookings
- reminder updates for rescheduled bookings

### Phase 4: Deeper provider sync

Goal: improve reliability and backfill missed events.

Scope:

- provider API reconciliation jobs
- calendar sync fallback where appropriate
- periodic integrity check between provider bookings and Purely confirmation records

### Phase 5: Platform-owned booking path

Goal: full first-party control over booking lifecycle, reminders, attendance, and review timing.

Scope:

- native scheduling inventory
- booking creation inside Purely
- first-party cancellation/reschedule flows
- completion and attended-state logic

## Data Model Recommendations

### 1. Provider connection

Add a durable provider-connection model rather than overloading the existing external-link config.

Suggested shape:

| Field | Purpose |
| --- | --- |
| `id` | Internal connection id |
| `ownerId` | Workspace owner scope |
| `providerKey` | `calendly`, `square`, `acuity`, etc. |
| `status` | `not_connected`, `connecting`, `connected`, `error`, `revoked` |
| `confirmationLevel` | Highest active level for this provider connection |
| `authType` | `oauth`, `api_key`, `manual`, `none` |
| `externalAccountId` | Provider account identifier if available |
| `accessTokenEncrypted` / `refreshTokenEncrypted` | Stored credentials when applicable |
| `tokenExpiresAt` | Expiry/renewal timing |
| `scopesJson` | Granted scopes |
| `webhookStatus` | `none`, `pending`, `active`, `error` |
| `webhookSubscriptionId` | Provider webhook/subscription id |
| `lastWebhookAt` | Operational health |
| `lastSyncAt` | Reconciliation marker |
| `dataJson` | Provider-specific settings and metadata |

### 2. Confirmed booking record

Introduce a provider-neutral confirmed booking model.

Suggested shape:

| Field | Purpose |
| --- | --- |
| `id` | Internal booking confirmation id |
| `ownerId` | Workspace scope |
| `siteId` | Optional link back to booking site |
| `providerConnectionId` | Which provider connection confirmed it |
| `providerKey` | Provider registry key |
| `providerBookingId` | External provider booking id |
| `providerEventId` | External provider event id or equivalent |
| `contactId` | Linked Purely contact if matched |
| `sourceHandoffEventId` | Link back to `PortalBookingExternalLinkEvent` when known |
| `confirmationLevel` | `redirect_confirmed`, `webhook_confirmed`, `api_confirmed`, `owned_booking` |
| `status` | `booked`, `canceled`, `rescheduled`, `completed`, `no_show`, `unknown` |
| `scheduledStartAt` / `scheduledEndAt` | Appointment window |
| `bookedAt` | When booking was created |
| `canceledAt` | When cancellation was confirmed |
| `rescheduledAt` | When reschedule was confirmed |
| `rescheduledToBookingId` | Link to successor record if needed |
| `calendarExternalId` | Optional calendar event linkage |
| `rawSummaryJson` | Small normalized provider summary |
| `createdAt` / `updatedAt` | Audit trail |

### 3. Confirmation event log

Keep raw lifecycle events separate from the normalized booking record.

Suggested shape:

| Field | Purpose |
| --- | --- |
| `id` | Internal event id |
| `ownerId` | Scope |
| `providerConnectionId` | Source connection |
| `providerKey` | Provider key |
| `providerEventId` | External webhook/event id for idempotency |
| `providerBookingId` | Associated provider booking id |
| `eventType` | `booking_created`, `booking_canceled`, `booking_rescheduled`, `booking_completed`, `booking_changed`, `redirect_returned`, etc. |
| `confirmationLevel` | Level attached to this event |
| `occurredAt` | Provider event time |
| `receivedAt` | Time Purely received it |
| `signatureVerified` | Integrity flag |
| `payloadJson` | Raw provider payload |

### 4. Matching and linkage strategy

Use this order when connecting a confirmation to a prior handoff event:

1. Exact correlation token passed through provider-supported metadata, query param, custom field, or redirect state.
2. Exact provider booking id or event id already mapped to a pending handoff.
3. Contact match by normalized email/phone plus a tight time window around the handoff event.
4. Manual review if multiple candidate handoffs exist.

Never auto-link across owners or workspaces.

## UX Flow

### Integrations page

Add a booking-provider section with:

- provider cards
- connection status
- confirmation level badge
- webhook health or sync health
- last successful confirmation received
- primary next step

Example badges:

- `Handoff only`
- `Redirect confirmed`
- `Webhook confirmed`
- `API confirmed`
- `Owned booking`

### Booking Settings

Extend the existing external-link settings card with:

- current provider connection status
- current confirmation level
- what Purely can and cannot prove today
- next best setup action

Examples:

- `Purely is counting handoffs to Calendly, but completed bookings are not confirmed yet.`
- `Calendly is connected. Purely can confirm booked, canceled, and rescheduled appointments from provider events.`

### Reporting

Split metrics clearly:

- sent to booking page
- lead-first captures
- redirect-confirmed returns
- confirmed bookings
- confirmed cancellations
- confirmed reschedules

If no provider confirmation exists, reporting should say:

- `Confirmed bookings are unavailable for this provider connection.`

### Dashboard next actions

Examples:

- `People are reaching your booking page. Connect Calendly to confirm who actually books.`
- `Bookings are provider-confirmed, but cancellation handling is not active yet.`
- `No booking confirmations have been recorded yet. Finish provider connection or share the tracked handoff link.`

### Contacts and follow-up

Add a booking timeline lane on the contact when possible:

- handoff clicked
- lead captured
- booking redirect confirmed
- booking confirmed
- canceled
- rescheduled

Automation behavior:

- `handoff_only`: keep nurture active, do not stop conversion follow-up
- `redirect_confirmed`: optionally reduce duplicate CTA pressure for a short window, but do not mark converted
- `webhook_confirmed` / `api_confirmed`: stop pre-booking conversion follow-up and switch to reminder/pre-appointment flow
- `canceled`: resume booking recovery flow or task guidance
- `rescheduled`: move reminders to new appointment window

### Reviews

Do not trigger review requests from a click, lead capture, or booking confirmation alone.

Preferred review trigger order:

1. explicit attended/completed signal from owned booking or provider
2. if attendance does not exist, a cautious fallback after the appointment end time and only when not canceled

## Confirmation-Level UX Rules

Use these user-facing interpretations consistently.

| Level | UI wording |
| --- | --- |
| `handoff_only` | `Purely tracked a send to the booking page.` |
| `redirect_confirmed` | `Purely saw a post-booking return, but provider confirmation is still pending.` |
| `webhook_confirmed` | `Provider-confirmed booking event received.` |
| `api_confirmed` | `Provider or calendar data confirms the booking record exists.` |
| `owned_booking` | `Booked inside Purely.` |

## Risks and Blockers

### Provider capability risk

Several beauty and salon schedulers in the target list do not show a clear public self-serve developer path in this planning pass. Purely should avoid roadmap promises for GlossGenius, Booksy, Fresha, Vagaro, and Setmore until auth, webhook, and approval rules are verified.

### Correlation risk

The hardest product problem is not receiving a webhook. It is linking that webhook back to the exact handoff and contact reliably.

Mitigation:

- prefer provider metadata or redirect state when supported
- otherwise use strict normalized contact + time-window matching
- log ambiguous matches for manual review instead of auto-merging aggressively

### OAuth and revocation risk

Multi-tenant provider connections require:

- encrypted token storage
- refresh handling
- revocation handling
- webhook re-subscription handling
- sandbox vs production separation

### Webhook operational risk

Need:

- public HTTPS receiver
- signature verification
- idempotency
- retry-safe processing
- replay handling
- dead-letter or audit trail for failed payloads

### Calendar sync ambiguity

Google and Microsoft calendar events are helpful but weaker than provider-native confirmations because the event may not have come from the tracked public handoff. Treat calendar integration as a later sync layer, not the primary truth source.

### Email parsing risk

Email parsing is not recommended because it is brittle, privacy-heavy, template-dependent, and hard to keep reliable across providers and plan tiers.

## Recommended Implementation Order

1. Provider registry + confirmation-level framework
2. Redirect confirmation endpoint and reporting support
3. Calendly connection + webhook receiver + confirmed booking record
4. Cancellation and reschedule updates
5. Square provider connection as the next major provider
6. Calendar sync and reconciliation
7. Platform-owned booking as the highest-control path

## First Implementation Prompt Recommendation

Implement the provider-agnostic booking confirmation framework and the first real provider-backed confirmation path for external booking links.

Goal:

Move Purely from `handoff_only` reporting to real confirmed booking reporting for one external provider, while preserving explicit confirmation-level truth in UI and automation.

Recommended provider:

- Calendly first

Scope:

- add provider connection models and confirmation-level enums
- add a booking confirmation event log and normalized confirmed booking model
- add a provider connection card to Booking Settings and Integrations
- add `confirmationLevel` to reporting, dashboard guidance, and booking settings surfaces
- implement one webhook receiver for the first provider
- verify signatures and idempotency
- map provider booking-created and booking-canceled events into normalized records
- link confirmed bookings back to contacts and prior external handoff events when correlation is reliable
- keep ambiguous matches out of auto-confirmed reporting

Constraints:

- do not claim confirmed booking from click-through only
- do not use email parsing as the primary confirmation method
- do not build every provider at once
- do not trigger real production provider calls without safe sandbox or approved credentials

Validation:

- prove `handoff_only` and `webhook_confirmed` render differently in reporting
- prove one confirmed booking links to the correct owner, contact, and source handoff
- prove a cancellation event updates status without deleting the history
- prove portal and credit remain owner-scoped
- prove review automation still waits for a stronger post-booking state than a click

## Practical Summary

The shortest honest path is:

- keep the current handoff wrapper
- add a provider-neutral confirmation-level framework
- ship Calendly as the first webhook-confirmed provider
- use Square next
- treat calendar sync as later reconciliation, not the first truth source
- keep all UI explicit about whether Purely knows about a click, a redirect return, a provider-confirmed booking, or a fully owned booking