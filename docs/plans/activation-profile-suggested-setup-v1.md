# Activation Profile + Suggested Setup (v1)

This document is the consolidated, implementation-grade spec for:
- Turning **Business Info** into an **Activation Profile** (single source of truth).
- Generating deterministic, industry- and model-aware **Suggested Setup** for *every* portal service.
- Upgrading the in-portal assistant into an **approval-gated operator** that proposes structured actions and applies them only after explicit consent.

This file is intentionally **not** a transcript. It is the stable source-of-truth spec.

## Non-goals (v1)
- No portal-wide “Save / Saving / Saved” standardization work is included here.
- No UI polish sweeps across every page in v1. Only the minimal entrypoints required.

---

## 1) Service eligibility (entitlements)

Suggested Setup must respect what the owner can use.

### Rules
- **Credits-only** owners: `eligibleServices = ALL_SERVICES`.
- **Monthly-plan** owners: `eligibleServices = activatedServices`.

### UX consequences
- “Apply all” means **apply all eligible** services.
- Ineligible services may show “Available when activated”, but:
  - the assistant must not propose executable actions for them
  - the “Apply” endpoint must reject them

---

## 2) Canonical taxonomy

Suggested Setup always considers **business model + industry + service**.

### Business models (canonical IDs)
- `local_service`
- `professional_practice`
- `retail_showroom`
- `ecommerce`
- `agency_dfy`
- `coach_consultant`
- `saas_subscription`
- `nonprofit_community`

### Industry families (stable IDs)
- `home_services`
- `automotive`
- `health`
- `beauty`
- `real_estate`
- `legal`
- `financial`
- `fitness`
- `education`
- `hospitality`
- `b2b`

### Industries (stable IDs → one family)

Home Services (`home_services`)
- `lawn_care`, `landscaping`, `tree_service`, `pest_control`, `hvac`, `plumbing`, `electrical`, `roofing`, `pressure_washing`, `cleaning`, `painting`, `handyman`, `pool_service`

Automotive (`automotive`)
- `auto_repair`, `detailing`, `towing`

Health (`health`)
- `dental`, `chiropractor`, `med_spa`, `physical_therapy`, `therapy_counseling`

Beauty (`beauty`)
- `salon`, `barber`, `spa`

Real Estate (`real_estate`)
- `real_estate_agent`, `property_management`

Legal (`legal`)
- `law_firm`

Financial (`financial`)
- `accounting_bookkeeping`, `insurance_agency`

Fitness (`fitness`)
- `gym`, `personal_trainer`

Education (`education`)
- `tutoring`, `training_programs`

Hospitality (`hospitality`)
- `restaurant`, `catering`

B2B (`b2b`)
- `commercial_services`, `staffing_recruiting`

### Size modifiers
- `solo`
- `small_team`
- `multi_location`

Derivation:
- Default rule: `solo=1`, `small_team=2–9`, `multi_location=10+` OR `multiLocation=true`.

---

## 3) Activation Profile (single source of truth)

Activation Profile is the minimum data that makes setup frictionless.

### Required
- Basics: business name, website (optional), phone, email
- Location: city/state, service area description
- Taxonomy: `businessModelId`, `industryId`

### Strongly recommended
- Services offered: top 3–8 services + “do not offer” list
- Target customer summary + exclusions
- Differentiators (3–5 bullets)
- Tone: professional/clean/friendly + 3 brand adjectives
- Brand kit: logo URL, primary/secondary colors, font preset
- Operations: employee count + roles; multi-location flag
- Compliance flags: avoid guarantees/claims; avoid medical/legal promises

### Derived
- `industryFamilyId` derived from `industryId`
- `sizeModifierId` derived from employee count + multi-location flag

---

## 4) Template system (deterministic)

### Resolution order
Templates resolve in strict order:
1. `modelBase`
2. `industryFamilyOverlay`
3. `industryPatch` (rare allowlist)
4. `sizeModifier`
5. `toneModifier`

### Merge rules
- Scalars: last writer wins.
- Arrays of entities: **upsert** by deterministic IDs (never blindly append).
- Copy blocks: must comply with Copy Rules.

### Copy rules (global)
- Voice: professional, clean, friendly.
- Must be benefit-led (“what you get / what we do for you / why it matters”).
- Hard ban: no em dashes (`—`).

### Versioning
- Templates are versioned (`v1`, `v1.1`, …).
- Applying Suggested Setup creates an audit record containing the template version.
- Updating templates later produces new suggestions; it does not silently change existing settings.

---

## 5) Executable output: Proposed Actions

Suggested Setup output is not “settings” directly. It is a list of **allowlisted actions**.

### Action schema (v1)
Each action MUST include:
- `id` (stable string)
- `serviceSlug`
- `kind`:
  - `PATCH_SETTINGS`
  - `UPSERT_ENTITY`
  - `INVITE_USERS`
  - `SET_ROLE_MATRIX`
  - `APPLY_BRANDING`
- `api`: `{ method, path }` (portal API target)
- `payload`: JSON body for the API
- `preview`:
  - `title`, `why`, `impact`
  - `diff`: normalized diff for preview UI

### Execution rules
- Always approval required.
- Only allowlisted actions execute.
- Only actions for eligible services execute.

### Audit record (v1)
On apply, write:
- ownerId, userId
- templateVersion
- actionId
- appliedAt
- summary + diff (or a bounded version)

---

## 6) Services covered (v1)

Suggested Setup must cover these services:
- booking
- nurture-campaigns
- reviews
- blogs
- newsletter
- automations
- funnel-builder
- lead-scraping
- ai-receptionist
- ai-outbound-calls
- dashboard
- employees/invites/roles

---

## 7) Per-service template outputs (v1)

This section defines what each service template must output. The *exact* values come from base + overlays.

### 7.1 Booking
Outputs:
- appointment types (name/duration/buffers/locationMode/requiredFields)
- availability defaults
- assignment routing (round robin / role based)
- intake questions (industry overlays)

Apply surface (API targets):
- `PATCH /api/portal/booking/settings`
- `UPSERT /api/portal/booking/calendars`
- `PATCH /api/portal/booking/reminders/settings`

### 7.2 Nurture campaigns
Outputs (campaign catalog, upsert IDs):
- new lead response
- estimate follow-up
- winback
- post-service review ask
- no-show recovery (if booking)

Apply surface:
- `UPSERT /api/portal/nurture/campaigns`
- `UPSERT /api/portal/nurture/campaigns/[campaignId]/steps`

### 7.3 Reviews
Outputs:
- request cadence + channel priority
- landing page copy
- response templates
- low-rating escalation

Apply surface:
- `PATCH /api/portal/reviews/settings`
- `PATCH /api/portal/reviews/site`

### 7.4 Automated blogs
Outputs:
- cadence
- topic strategy (derive if blank, constrain if provided)
- local SEO insertion rules
- CTA style

Apply surface:
- `PATCH /api/portal/blogs/automation/settings`
- `PATCH /api/portal/blogs/appearance`
- `PATCH /api/portal/blogs/site`

### 7.5 Newsletters
Outputs:
- schedule
- section mix
- segmentation strategy
- subject style rules

Apply surface:
- `PATCH /api/portal/newsletter/automation/settings`
- optional: create a first newsletter draft via `POST /api/portal/newsletter/newsletters`

### 7.6 Automations
Outputs:
- missed-call text back defaults
- form submission follow-up
- booking reminders (if booking enabled)
- lead routing/internal notify

Apply surface:
- `PATCH /api/portal/automations/settings`

### 7.7 Funnels
Outputs:
- 2–3 funnel templates (lead capture, quote request, booking push)
- page section structure + copy guidance

Apply surface:
- `POST /api/portal/funnel-builder/funnels` (+ pages)
- `PATCH /api/portal/funnel-builder/settings`

### 7.8 Lead scraping
Outputs:
- geo radius defaults
- keyword set per industry family
- cadence + dedupe rules
- assignment target + attach nurture sequences

Apply surface:
- `PATCH /api/portal/lead-scraping/settings`

### 7.9 AI receptionist
Outputs:
- persona + tone
- intent library
- handoff rules
- knowledge seed from Activation Profile

Apply surface:
- `PATCH /api/portal/ai-receptionist/settings`

### 7.10 AI outbound calls
Outputs:
- campaign presets
- scripts (opener/objections/voicemail/SMS fallback)
- stop rules

Apply surface:
- `POST /api/portal/ai-outbound-calls/campaigns`
- `PATCH /api/portal/ai-outbound-calls/campaigns/[campaignId]`

### 7.11 Dashboard personalization
Outputs:
- widget priority list
- top KPIs per model/industry
- setup checklist ordering

Apply surface:
- `PATCH /api/portal/dashboard`

### 7.12 Employees/roles/invites
Outputs:
- roles (admin/manager/staff/sales/ops/tech)
- per-service access matrix
- invite plan derived from employee count + roles

Apply surface:
- `POST /api/portal/people/users` or invite endpoints (as implemented)

---

## 8) Minimal UX integration (v1)

### Onboarding entrypoint
- After Activation Profile save, show “Suggested Setup” screen:
  - list eligible services
  - each row has “Preview” and “Apply”
  - top action “Apply all eligible”

### Per-service entrypoint
- Each service settings page shows a top “Suggested Setup” card:
  - short benefit-led summary
  - “Preview changes” (default)
  - “Apply” (requires confirmation)

### Assistant widget
- If new suggestions exist, show “I have a suggestion”.
- Assistant can propose `proposedActions[]` and understands:
  - “apply all”
  - “apply all except X”
  - “apply only A and B”

---

## 9) Implementation checklist (what we will ship first)

First working slice (ship to main):
- Deterministic resolver + types + templates skeleton for all services.
- Preview endpoint returning `proposedActions[]`.
- Apply endpoint executing selected actions (initially limited allowlist).
- Remove dead “Custom” font option globally (or fully implement it everywhere).
- Add em-dash guardrail script and wire it into `npm run lint`.
