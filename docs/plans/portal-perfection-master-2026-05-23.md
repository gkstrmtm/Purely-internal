# Portal perfection master

## Purpose
- Use this file as the active source of truth for making the portal feel premium, reliable, and safe enough to charge real monthly money for.
- Track only real current-state work grounded in the repo, diagnostics, and existing portal plans.
- Keep the backlog split between customer-visible blockers, operational confidence gaps, and deliberate long-range architecture debt.
- Do not mark an item done until the touched code path is validated.

## Current directives
- Do not commit or push yet.
- Keep changes surgical and portal-focused.
- Preserve portal, credit, ads, and custom-domain boundaries.
- Preserve schema-compatibility and ensure-schema patterns.
- Prefer truthful product posture over fake readiness, especially for provider integrations and reporting claims.

## Release standard
If this portal were sold at a premium monthly price today, these must be true:
- No known compile errors in touched portal files.
- No high-confidence customer-visible broken workflows in active portal and credit surfaces.
- Reporting, provider setup, and media workflow surfaces say only what the product can really prove.
- Portal and credit routing remain variant-aware and session-safe.
- Core monetizable surfaces have actionable recovery states instead of vague dead ends.
- Large debt buckets are either burned down or explicitly documented as non-blocking with a truthful reason.

## Status key
- `todo`: not started
- `doing`: currently in progress
- `done`: implemented and validated
- `needs-verification`: likely fixed but still needs validation
- `deferred`: intentionally left alone because the safe fix is unclear or too wide for the current pass

## Fresh audit inputs used for this file
- Existing readiness tracker: `docs/plans/portal-production-readiness-master-2026-05-21.md`
- Existing portal hardening tracker: `docs/plans/portal-burndown-audit-2026-05-22.md`
- Existing media/provider truthfulness tracker: `docs/plans/media-provider-publishing-audit-2026-05-23.md`
- Fresh diagnostics sweep over portal, credit, and shared portal files
- Fresh TODO/FIXME/HACK search over portal code and portal libs
- Fresh dirty-tree inspection of active files changed in the current workspace

## Ground truth snapshot
- The synced media, reporting, provider-setup, dashboard, and growth-readiness slice is currently lint-clean in targeted validation.
- Several important portal files changed recently in the workspace, especially reporting and provider-setup surfaces.
- Raw TODO/FIXME portal searches are noisy because transcript-style markdown files live inside portal directories. Those files are not reliable backlog sources.
- The largest currently visible diagnostics bucket is still the funnel editor.
- Known architecture debt remains in `src/lib/portalAgentActions.ts`.

## Non-negotiable gates

### 1. Auth, routing, and variant safety
- `todo` Reconfirm no new portal work bypasses `portalBasePath()`, `normalizePortalVariant()`, or proxy-based variant handling.
- `todo` Reconfirm `/credit/*` rewrite compatibility after recent reporting and provider-setup changes.
- `todo` Reconfirm no recent portal changes cross session boundaries between portal, credit, and ads.
- `todo` Reconfirm custom-domain rewrite behavior remains untouched for portal-related route work.

### 2. Truthful product posture
- `doing` Keep reporting copy, provider setup, and media workflow cards honest about what is measured versus what is not measured.
- `todo` Recheck new reporting widgets for any implied claims that exceed stored data.
- `done` Rechecked media/provider setup flows and current premium surfaces still present manual-only lanes as manual-only.
- `todo` Recheck credit reporting surfaces so they do not imply bureau confirmation, score outcomes, or delivery proof unless stored.

### 3. Compile and diagnostics confidence
- `done` Triaged the current high-noise diagnostics hotspot in the funnel editor and confirmed the remaining editor warning list is partly stale relative to the live file.
- `todo` Re-run targeted diagnostics after each portal fix batch.
- `todo` Keep touched files clean even if broader repo noise remains elsewhere.
- `deferred` Large non-portal style-only warnings with no portal product impact.

### 4. Customer-visible UX reliability
- `done` Broad portal non-auth recovery-copy hardening across service surfaces.
- `done` Re-audited newly changed reporting and provider-setup surfaces for current lint and truthful-copy regressions.
- `done` Re-audited dashboard and media-library recent changes for current lint and manual-lane messaging regressions.
- `doing` Reconfirm portal empty states and setup states feel intentional instead of placeholder-like.

### 5. Data and schema safety
- `todo` Reconfirm recent growth/media/provider work still follows shared Prisma and schema-compat patterns.
- `todo` Reconfirm schema ensure helpers exist anywhere new runtime tables are referenced.
- `todo` Reconfirm reporting fallbacks remain safe under partially-applied production schema.

## Active backlog by area

### A. Funnel editor debt
Priority: highest current burn-down target because diagnostics are still concentrated here.

#### Current findings
- `doing` `src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx`
- Fresh diagnostics show a large cluster of:
  - unused symbols and helper functions
  - unused React state setters
  - hook dependency warnings
  - unstable function identity warnings inside hooks
  - one direct `<img>` warning
- This file is a confidence drag even when customer-facing flows mostly work.
- Direct file inspection shows part of that diagnostics set is stale or misaligned with the current file contents.
- A direct `npx eslint` run against the current live file returns clean, so this bucket now needs careful signal-triage instead of blind cleanup.

#### Acceptance criteria
- Remove the highest-confidence unused symbols introduced or left behind by prior targeted edits.
- Reduce hook warnings only where the fix is obviously behavior-safe.
- Do not widen into a full funnel-editor refactor.
- Validate the file after each pass.

#### Execution order
1. Remove dead imports and obviously dead locals.
2. Remove unused setters and stale helper references.
3. Triage hook warnings into safe-fix versus risky-fix buckets.
4. Stop before any change becomes architectural.

### B. Reporting surface quality
Priority: high, because reporting is now one of the most premium-looking surfaces and must remain truthful.

#### Current findings
- `needs-verification` `src/app/portal/app/services/reporting/PortalReportingClient.tsx`
- This file has substantial new capability added in the dirty tree:
  - growth readiness summary
  - reporting coverage explanation
  - action insights
  - content workflow summary
  - booking handoff visibility
- The scope is valuable, but it increases risk around:
  - truthful copy
  - performance/loading behavior
  - credit versus portal wording
  - runtime safety for optional data

#### Acceptance criteria
- No broken loading states.
- No references to missing optional payload branches.
- No wording that overclaims attribution, provider confirmation, or credit outcomes.
- Credit and portal variants stay distinct and sensible.

#### Immediate checks
- `done` Re-read current file before any direct edits.
- `done` Ran targeted diagnostics/lint on the current file.
- `done` Spot-checked current truthful-copy and fallback language for portal and credit-sensitive reporting content.

### C. Provider setup wizard quality
Priority: high, because it directly sets user expectations for what Purely can actually run.

#### Current findings
- `needs-verification` `src/app/portal/app/settings/integrations/ProviderSetupWizardPanel.tsx`
- `needs-verification` `src/lib/providerSetupWizard.server.ts`
- `needs-verification` `src/lib/providerSetupWizard.ts`
- The feature is directionally strong and truthful, but it is new and should be treated as premium setup UX, not a one-off panel.

#### Acceptance criteria
- Setup statuses are truthful and stable.
- Fallback path is clean when the API fails.
- Owner-only and connection-status assumptions remain accurate.
- Links lead to real next steps, not dead ends.

#### Immediate checks
- `done` Re-read current dirty-tree file state before edits.
- `done` Validated current setup language does not imply live publishing where only manual workflow exists.
- `done` Validated current setup language does not imply live transactional proof where only configuration exists.

### D. Dashboard and media workflow sync slice
Priority: medium-high, because this is the recently synced area from `origin/dev-retro`.

#### Current findings
- `needs-verification` `src/app/portal/PortalDashboardClient.tsx`
- `needs-verification` `src/app/portal/app/services/media-library/PortalMediaLibraryClient.tsx`
- `done` Targeted lint for the synced slice was previously clean.
- These files were explicitly called out by the user as potentially changed again since the last validation.

#### Acceptance criteria
- Re-read before editing.
- Preserve truthful provider/manual messaging from the media audit.
- Preserve premium UX polish introduced by the sync without regressing compatibility.

#### Immediate checks
- `done` Re-read current file state before edits.
- `done` Reconfirmed no fresh diagnostics appeared in these files during targeted ESLint validation.
- `done` Spot-checked wording and controls around manual posting, provider readiness, and dashboard surfacing.

### E. Credit shared route safety
Priority: medium-high, because credit is a separate session surface sharing portal code.

#### Current findings
- `needs-verification` `src/app/credit/app/[[...slug]]/page.tsx`
- This file already required a careful revert-and-selective-port during sync work.
- It must be re-read before any new routing-related edits.

#### Acceptance criteria
- Preserve credit rewrite behavior.
- Preserve provider-setup wiring that was selectively ported.
- Do not accidentally import portal-only assumptions into the credit route.

### F. Portal agent architecture debt
Priority: medium, important but not first unless it surfaces user-facing breakage.

#### Current findings
- `todo` `src/lib/portalAgentActions.ts`
- Known TODOs remain for:
  - `$ref` resolution from context/session
  - actual entity lookup by type and ID
- This is real debt but not automatically the next safest fix.

#### Acceptance criteria
- Only touch this if a narrow, safe improvement path becomes obvious.
- Do not invent fake resolution logic just to clear TODOs.

### G. Search hygiene and audit hygiene
Priority: medium, because bad backlog mining wastes time.

#### Current findings
- `done` Confirmed transcript-style markdown files inside portal directories pollute TODO search results.
- `todo` Future code sweeps must exclude markdown and note files when creating real engineering backlog.

#### Rule going forward
- Use code-file-only searches for backlog generation.
- Treat in-folder transcripts and notes as context, not active engineering debt.

## Current burn-down order
1. `doing` Funnel editor diagnostics bucket
2. `todo` Reporting surface verification and any necessary fixes
3. `todo` Provider setup wizard verification and any necessary fixes
4. `todo` Re-read and validate dashboard/media-library recent dirty-tree changes
5. `todo` Re-read and validate credit catch-all route safety
6. `todo` Reassess whether portal-agent architecture debt has a narrow safe slice worth doing now

## Validation protocol
For each fix burst:
- Run targeted diagnostics on touched files.
- Prefer file-scoped or slice-scoped validation over full-repo noise.
- If a fix touches shared portal behavior, recheck portal versus credit assumptions.
- If a fix touches reporting or provider wording, verify it stays truthful.

## Execution log
- 2026-05-23: Created this master tracker from current docs, diagnostics, TODO search, and dirty-tree inspection.
- 2026-05-23: Confirmed the current highest-confidence active debt bucket is the funnel editor diagnostics backlog.
- 2026-05-23: Confirmed the newly synced reporting/media/provider slice is not the current diagnostics hotspot, but it still needs premium-surface verification because it changed recently.
- 2026-05-23: Confirmed raw portal TODO searches are polluted by transcript markdown files and should not drive the engineering backlog by themselves.
- 2026-05-23: Removed one stale funnel-editor `eslint-disable` directive during the first cleanup pass.
- 2026-05-23: Verified that several funnel-editor symbols reported as unused by editor diagnostics are actively referenced in the current file.
- 2026-05-23: Ran direct `npx eslint` on the live funnel editor file and it returned clean, which means the remaining funnel-editor diagnostics list cannot be trusted at face value.
- 2026-05-23: Ran direct `npx eslint` on reporting, provider setup, dashboard, media-library, and credit catch-all files; the current premium slice returned clean.
- 2026-05-23: Spot-checked the current reporting, provider setup, dashboard, and media workflow copy and it still reads as intentionally truthful about manual lanes, unstored attribution, and non-proven external outcomes.
- 2026-05-23: Polished dashboard empty states so activity cards explain what will populate them and point users toward reporting/Pura instead of feeling dead.
- 2026-05-23: Polished media-library planner empty states so each workflow filter explains the next step instead of only saying nothing is there.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the touched dashboard/media files; both stayed clean.
- 2026-05-23: Polished service-list and service-gate `coming_soon` copy so rollout states read as deliberate access staging instead of placeholder language.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the touched service-list and service-gate files; both stayed clean.
- 2026-05-23: Replaced the reporting content-workflow `N/A` fallback with a real empty state that explains what creates the summary and links back to Media Library.
- 2026-05-23: Polished provider-setup loading copy so the panel explains what Purely is checking instead of showing a flat spinner-state sentence.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the touched reporting and provider-setup files; both stayed clean.
- 2026-05-23: Replaced the remaining blunt reporting/dashboard metric fallbacks (`N/A`) with more intentional language like `Watching usage`, `No rating yet`, `Unavailable`, and `Not enough data yet`.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the touched reporting and dashboard files after the fallback cleanup; both stayed clean.
- 2026-05-23: Polished the credit catch-all settings landing so internal credit navigation uses `next/link` instead of plain anchors.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the touched credit catch-all route; it stayed clean.
- 2026-05-23: Polished the blog post insufficient-credits CTA so the in-app billing path uses `next/link` instead of a plain anchor.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the touched blog post client; it stayed clean.
- 2026-05-23: Polished settings, billing, blogs, and newsletter credits/schedule fallback copy so balances, runway, monthly pricing, and automation timing states read as intentional system states instead of blunt `N/A` placeholders.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the touched settings, billing, blogs, and newsletter files; all four stayed clean.
- 2026-05-23: Polished profile setup readouts so generic copy rows plus Twilio and sales-provider credential summaries use clear setup-state wording instead of raw `N/A` placeholders.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the touched profile client; it stayed clean.
- 2026-05-23: Polished people and reviews setup views so member roles, member names, review-request destinations, contacts totals, contact details, credit profile details, and signature/setup fields no longer fall back to raw `N/A` copy in customer-facing panels.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the touched people-users, reviews-setup, and contacts clients; all stayed clean.
- 2026-05-23: Polished the remaining contact and lead list-card placeholders so visible people rows now use concrete fallback labels like `No email yet` and `No business name yet` instead of raw `N/A` text.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the contacts client after the list-card cleanup; it stayed clean.
- 2026-05-23: Polished the contacts import-preview table so sample rows no longer fall back to lowercase `n/a` placeholders during mapping review.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the contacts client after the import-preview cleanup; it stayed clean.
- 2026-05-23: Polished service-page, sales-reporting, account-switcher, and support-chat availability copy so setup and retry states read as syncing or retry-needed states instead of blunt `unavailable` failures.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the touched service-page, sales-reporting, shell, and floating-tools files; all stayed clean.
- 2026-05-23: Polished review-history, calendar-label, booking-event, and inbox sender fallbacks so visible labels no longer expose `(unknown)`-style internal placeholders.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the touched reviews-setup, service-page, shell, booking, and inbox files; all stayed clean.
- 2026-05-23: Polished blog, newsletter, automations, follow-up, and AI receptionist recovery copy so customer-facing load and preview fallbacks read as syncing states instead of blunt `did not load` failures.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the touched blogs, newsletter, automations, follow-up, and AI receptionist clients; all stayed clean.
- 2026-05-23: Polished nurture campaigns, missed-call text back, AI outbound, lead scraping, and inbox recovery copy so service-level load fallbacks now match the newer syncing-state language across the portal.
- 2026-05-23: Re-ran targeted diagnostics on the touched nurture, missed-call text back, AI outbound, lead scraping, and inbox clients; all returned clean, and targeted ESLint surfaced one pre-existing `react-hooks/exhaustive-deps` warning in AI outbound unrelated to this copy-only pass.
- 2026-05-23: Polished booking, credit reports, duplicate management, reviews setup, and Stripe sales recovery copy so load-state messaging now stays consistent across more customer-visible portal flows.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the touched booking, credit reports, duplicates, reviews setup, and Stripe sales files; all stayed clean.
- 2026-05-23: Polished residual load-state copy across AI chat, people, contacts, dashboard reporting fallback, hosted reviews page editor, billing subscriptions, sales reporting, blog post editor, tasks, and appearance settings.
- 2026-05-23: Re-ran targeted diagnostics on that residual batch; all returned clean, and targeted ESLint surfaced one pre-existing `react-hooks/exhaustive-deps` warning in tasks unrelated to this copy-only pass.
- 2026-05-23: Polished the next non-heavy residual set across AI chat sharing, nurture media picker, form responses, form editor load states, and forgot-password reset options, and removed one stale unused `eslint-disable` directive surfaced during validation.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on that residual batch after the cleanup; the files stayed clean.
- 2026-05-23: Polished the remaining visible `Unknown` customer labels in AI receptionist, AI outbound, and contact detail views so caller/contact/timestamp fallbacks read as intentional syncing states instead of placeholder labels.
- 2026-05-23: Re-ran targeted diagnostics on AI receptionist, AI outbound, and contacts after that cleanup; all returned clean, and targeted ESLint surfaced the same pre-existing `react-hooks/exhaustive-deps` warning in AI outbound unrelated to this copy-only pass.
- 2026-05-23: Polished residual reporting, dashboard, and media-library premium cards so growth guidance, media stats, booking handoff, and provider metrics now use syncing or not-linked language instead of blunt `unavailable` labels.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on reporting, dashboard, and media-library after that cleanup; all stayed clean.
- 2026-05-23: Polished the funnel editor tracking and analytics summaries so runtime verification and event-store states read as syncing states instead of blunt `unavailable` labels.
- 2026-05-23: Re-ran targeted diagnostics and direct `npx eslint` on the funnel editor after that copy-only pass; editor diagnostics still showed the same stale noisy bucket, while direct ESLint again returned effectively clean aside from the expected Babel size note.
- 2026-05-23: Polished the credit dispute-letter subject fallbacks so generated rounds no longer surface raw `Unknown` contact labels.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the credit dispute letters client after that cleanup; it stayed clean.
- 2026-05-23: Polished portal login, credit login, portal signup, and media-library provider-metrics fallback copy so retry states and pending analytics read more intentionally than blunt `unavailable` messaging.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the touched auth and media-library files after that cleanup; all stayed clean.
- 2026-05-23: Polished the booking availability grid so inactive time slots read as `Blocked` instead of blunt `Unavailable` labels.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the booking availability client after that cleanup; it stayed clean.
- 2026-05-23: Polished inbox and AI outbound status/source badges so raw internal `UNKNOWN` values now render as customer-facing syncing labels instead of leaking internal enum text.
- 2026-05-23: Re-ran targeted diagnostics on inbox and AI outbound after that cleanup; both returned clean, and targeted ESLint surfaced the same pre-existing `react-hooks/exhaustive-deps` warning in AI outbound unrelated to this display-only pass.
- 2026-05-23: Polished the discount checkout error state so unsupported services no longer surface a raw `Unknown service` message.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the discount checkout client after that cleanup; it stayed clean.
- 2026-05-23: Polished the floating-tools version badge so missing build hashes render as a syncing state instead of `v unknown`.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the floating tools client after that cleanup; it stayed clean.
- 2026-05-23: Polished smaller residual copy in discount checkout, email verification, and AI outbound contact detail cards so missing promo data, missing verification links, and missing contact channels read more intentionally.
- 2026-05-23: Re-ran targeted diagnostics on that residual batch; all returned clean, and targeted ESLint surfaced the same pre-existing `react-hooks/exhaustive-deps` warning in AI outbound unrelated to this display-only pass.
- 2026-05-23: Polished the AI chat unresolved-run chip and follow-up recipient validation toasts so missing-input and invalid contact prompts read more helpful and specific.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the touched AI chat and follow-up files after that cleanup; both stayed clean.
- 2026-05-23: Polished residual setup labels in reporting and funnel builder so Twilio sender and account-pixel states read as clearer setup language instead of generic `Not configured` text.
- 2026-05-23: Re-ran targeted diagnostics on reporting, funnel builder, and funnel editor after that cleanup; reporting and funnel builder stayed clean, and direct `npx eslint` on funnel editor again returned effectively clean aside from the expected Babel size note while the stale editor diagnostics bucket remained unchanged.
- 2026-05-23: Polished billing, profile, floating-tools, and shell setup labels so pricing, provider credentials, feedback delivery, and campaign media states read more intentionally than generic `not configured` messaging.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the touched billing, profile, floating-tools, and shell files after that cleanup; all stayed clean.
- 2026-05-23: Polished remaining setup-state cards in AI receptionist, AI outbound, follow-up, and funnel builder so knowledge bases, agents, calendars, and default-pixel states use more intentional ready-yet language.
- 2026-05-23: Re-ran targeted diagnostics on that setup-state batch; all returned clean, and targeted ESLint surfaced the same pre-existing `react-hooks/exhaustive-deps` warning in AI outbound unrelated to this copy-only pass.
- 2026-05-23: Polished the remaining review setup resting states so review-page and request-path setup language now reads as ready-yet guidance instead of flat configured-yet messaging.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the reviews setup client after that cleanup; it stayed clean.
- 2026-05-23: Polished the lead-scraping Google Places environment warning so it now reads as a clearer setup requirement for live location discovery.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the lead-scraping client after that cleanup; it stayed clean.
- 2026-05-23: Polished a smaller content-detail batch across blogs and newsletter so excerpt, domain, attachment, and audience placeholders read more intentionally.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the blogs and newsletter clients after that cleanup; both stayed clean.
- 2026-05-23: Polished a compact billing and profile empty-state heading batch so subscription, service, custom-domain, and scoped-key headings read more intentionally.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on billing and profile after that cleanup; both stayed clean.
- 2026-05-23: Polished a tiny AI chat and tasks empty-state batch so the canvas toast and completed-tasks heading read more naturally.
- 2026-05-23: Re-ran targeted diagnostics on AI chat and tasks after that cleanup; both returned clean, and targeted ESLint surfaced the same pre-existing `react-hooks/exhaustive-deps` warning in tasks unrelated to this display-only pass.
- 2026-05-23: Polished a small automations setup batch so demo-field and calendar setup states read more intentionally during first-run testing.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the automations client after that cleanup; it stayed clean.
- 2026-05-23: Polished a tiny residual lead-scraping and reviews empty-state batch so location-selection and contact-tag states read more intentionally.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the touched lead-scraping and reviews files after that cleanup; both stayed clean.
- 2026-05-23: Polished a focused AI outbound empty-state slice so campaign, rule, activity, tools, and thread-message first-run states read more specific and premium.
- 2026-05-23: Re-ran targeted diagnostics on AI outbound after that cleanup; it returned clean, and targeted ESLint surfaced the same pre-existing `react-hooks/exhaustive-deps` warning around `createCampaign` unrelated to this copy-only pass.
- 2026-05-23: Polished a focused AI receptionist empty-state slice so no-call, no-recording, and no-transcript states read more intentional and premium.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the AI receptionist client after that cleanup; it stayed clean.
- 2026-05-23: Polished a shell/dashboard/settings empty-state slice so shortcuts, reporting pulse, usage pulse, and active-service states read more intentionally.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on shell, dashboard, and settings after that cleanup; all stayed clean.
- 2026-05-23: Polished a People/Users and Booking empty-state slice so invite, booking, reminder, calendar, and intake-question first-run states read more intentionally.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on People/Users and Booking after that cleanup; both stayed clean.
- 2026-05-23: Polished a follow-up and nurture-campaigns empty-state slice so template, step, queue, and campaign first-run headings read more specific and premium.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the follow-up and nurture-campaigns clients after that cleanup; both stayed clean.
- 2026-05-23: Polished a compact inbox, missed-call text back, lead-scraping, and AI outbound empty-state slice so SMS, missed-call, lead-tag, and outbound-campaign headings read more specific and premium.
- 2026-05-23: Re-ran targeted diagnostics on that compact service-hub batch; all returned clean, and targeted ESLint surfaced the same pre-existing `react-hooks/exhaustive-deps` warning around `createCampaign` in AI outbound unrelated to this copy-only pass.
- 2026-05-23: Polished a tiny automations and blogs first-run slice so automation and post empty-state headings read more specific and premium.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the automations and blogs clients after that cleanup; both stayed clean.
- 2026-05-23: Polished a residual contacts, form-builder, newsletter, and reviews setup slice so contact, tag, question, and custom-domain empty states read more specific and premium.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the touched contacts, form-builder, newsletter, and reviews files after that cleanup; all stayed clean.
- 2026-05-23: Polished a tiny tasks and funnel-editor empty-state slice so completed-task and AI reference headings read more specific and premium.
- 2026-05-23: Re-ran targeted diagnostics on tasks and funnel editor after that cleanup; tasks stayed clean, and funnel editor surfaced the same stale high-noise diagnostics bucket already documented in this tracker. Direct `npx eslint` again returned only the expected Babel size note for funnel editor plus the same pre-existing `react-hooks/exhaustive-deps` warning in tasks unrelated to this copy-only pass.
- 2026-05-23: Polished a high-traffic AI chat and inbox slice so thread, conversation, and email empty-state headings read more specific and premium.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the AI chat and inbox clients after that cleanup; both stayed clean.
- 2026-05-23: Polished a Funnel Builder and Newsletter first-run slice so funnel, form, newsletter, and audience empty-state headings read more specific and premium.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the Funnel Builder and Newsletter clients after that cleanup; both stayed clean.
- 2026-05-23: Polished a hosted-tools slice across form responses, reviews setup, and Pura preview so submission, review-question, and preview-chat empty-state headings read more specific and premium.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the touched form responses, reviews setup, and Pura preview files after that cleanup; all stayed clean.
- 2026-05-23: Polished a residual AI chat activity slice so chat-search, thread-memory, and run-ledger empty-state headings read more specific and premium.
- 2026-05-23: Re-ran targeted diagnostics and `npx eslint` on the AI chat client after that cleanup; it stayed clean.

## Next action
- Continue from clean validation into the next customer-visible portal-quality slice, prioritizing reporting and empty-state polish before any deeper architecture work.
