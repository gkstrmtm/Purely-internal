# Operator Guidance Friction Scorecard

## Scope and Method

- Branch reviewed: `dev-retro`
- Audit mode: route and browser review only. No outbound sends, no purchases, no live calls/SMS, no real scraping, no destructive writes.
- Scoring direction: `100` means strong operator guidance with low friction. `0` means poor guidance with high friction.
- Evidence sources: live portal routes, live credit routes, public booking route, manager override route, and earlier safe validation passes completed in this session for blogs, inbox, lead scraping, AI receptionist, funnel widget guidance, and automation readiness.

## Executive Summary

The product is strongest where a surface clearly states its workflow boundary, names the next action, and explicitly tells the operator what the system is **not** claiming to do yet. That pattern is visible in Business, Reviews, Reporting, Credit Reports, and Dispute Letters.

The main friction comes from overview surfaces that stall in readiness-loading states instead of giving a stable first recommendation. The weakest examples are the portal services index, the credit services index, the credit dashboard, and AI Outbound. Those pages make the operator work to infer whether the problem is setup, entitlement, empty data, or still-loading status.

## Route and Service Review Map

| Area | Routes reviewed | Fresh audit status | Notes |
| --- | --- | --- | --- |
| Portal dashboard | `/portal/app` | Reviewed | Loaded earlier in session with shortcuts, next actions, inactive services, and a self-aware sparse-layout note. |
| Portal services index | `/portal/app/services` | Reviewed | Repeatedly showed readiness placeholders and `Checking workspace status`. |
| Business settings | `/portal/app/settings/business` | Reviewed | Fully loaded. Strong guided profile completion. |
| People | `/portal/app/people/contacts` | Reviewed | Fully loaded. Clear tabs and empty table, lighter next-step guidance. |
| Inbox / Outbox | `/portal/app/services/inbox/email`, `/portal/app/services/inbox?tab=sms` | Reviewed earlier this session | Honest email-empty and Twilio-gated SMS states. |
| Media Library | `/portal/app/services/media-library` | Reviewed | Fully loaded. Strong empty state. |
| Tasks | `/portal/app/services/tasks` | Reviewed | Fully loaded. Simple but clear empty state. |
| Booking Automation | `/portal/app/services/booking`, `/book/p025-p026-validation-co` | Reviewed | Admin route loaded; public booking page reviewed. |
| AI Receptionist | `/portal/app/services/ai-receptionist` | Reviewed earlier this session | Twilio gating and empty activity were explicit. |
| Lead Scraping | `/portal/app/services/lead-scraping` | Reviewed earlier this session | Honest loading shell and no-leads guidance. |
| Reviews | `/portal/app/services/reviews` | Reviewed | Strong quiet-state guidance and clear public-page handoff. |
| Newsletter | `/portal/app/services/newsletter/external` | Reviewed | Loaded on retry. |
| Nurture Campaigns | `/portal/app/services/nurture-campaigns` | Reviewed | Loaded. Thin but usable setup state. |
| AI Outbound | `/portal/app/services/ai-outbound-calls` | Reviewed | Loaded into a near-empty `Select a campaign.` state. |
| Reporting | `/portal/app/services/reporting` | Reviewed | Strong inclusion/exclusion honesty. |
| Billing | `/portal/app/billing` | Reviewed | Fully loaded. Good service-status links and credit model clarity. |
| Manager overrides | `/app/manager/portal-overrides` | Reviewed | Internal admin surface only. |
| Credit dashboard | `/credit/app` | Reviewed | Stayed on loading state during capture. |
| Credit services index | `/credit/app/services` | Reviewed | Same readiness-placeholder issue as portal services index. |
| Credit reports | `/credit/app/services/credit-reports` | Reviewed | Strong workflow lane and handoff guidance. |
| Dispute letters | `/credit/app/services/dispute-letters` | Reviewed | Strong workflow boundary and manual-state honesty. |
| Credit reporting | `/credit/app/services/reporting` | Reviewed | Strong inclusion/exclusion honesty and handoff map. |
| Credit billing | `/credit/app/billing` | Partially reviewed | Stayed on loading state during capture. |

## Scorecard

| Area | Guidance | Setup friction | Handoff clarity | State honesty | Overall | Evidence summary |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Portal dashboard | 68 | 55 | 62 | 63 | 62 | Useful next actions and shortcuts exist, but analysis stayed in `Generating analysis…` and the dashboard still feels transitional rather than directive. |
| Portal services index | 42 | 38 | 46 | 52 | 45 | The page repeatedly opened in `Checking workspace status` with per-card `Checking readiness`, which blocks a fast first decision. |
| Business settings | 92 | 84 | 78 | 90 | 86 | Best setup guidance in the portal. Missing-section framing, quick-fill prompts, and explicit completion structure reduce ambiguity. |
| People | 71 | 69 | 72 | 75 | 72 | Tabs, search, and empty contacts table are clear, but `No matches` is weaker than a more intentional empty-state explanation. |
| Inbox / Outbox | 86 | 80 | 77 | 91 | 84 | Email and SMS states are honest. The SMS route correctly says Twilio must be connected before the operator expects text activity. |
| Media Library | 87 | 84 | 70 | 90 | 83 | Clear value proposition and one-step empty-state actions. Less cross-service guidance than some stronger workflow pages. |
| Tasks | 82 | 82 | 76 | 89 | 82 | Minimal but legible. `No open tasks` is plain and doesn’t overclaim. |
| Booking Automation | 78 | 69 | 75 | 83 | 76 | The admin route exposes tabs, links, and `Edit availability`, but the operator still has to infer how to get from no availability to a usable booking link. |
| Public booking page | 76 | 64 | 70 | 89 | 75 | Strong boundary message: `This booking link isn’t accepting bookings yet.` Still shows a full disabled calendar and form, which invites dead-end interaction. |
| AI Receptionist | 84 | 78 | 74 | 90 | 82 | Clear Twilio-first gating and honest empty activity feed. |
| Lead Scraping | 79 | 71 | 74 | 88 | 78 | Good loading and empty-state messaging, especially the approval-gated outbound reminder. |
| Reviews | 93 | 83 | 88 | 94 | 90 | One of the best surfaces reviewed. It clearly states the setup is done, what happens next, and where activity/reviews/Q&A will appear. |
| Newsletter | 79 | 72 | 68 | 82 | 75 | The list, credits, and schedule are visible, but the external/internal split and first-run path are less explicit than they should be. |
| Nurture Campaigns | 75 | 70 | 70 | 82 | 74 | The page explains the product and offers `+ New campaign`, but onboarding is thin once the operator lands. |
| AI Outbound | 28 | 31 | 35 | 46 | 35 | This is the weakest surface reviewed. `Select a campaign.` is not enough guidance for a first-run operator. |
| Reporting | 91 | 82 | 90 | 95 | 90 | Strong inclusion/exclusion framing, honest empty-state language, and explicit direction to tasks instead of vague implied tracking. |
| Billing | 86 | 78 | 84 | 88 | 84 | Strong credits explanation, service status list, and direct links into setup gaps. Dense, but directionally useful. |
| Manager overrides | 77 | 73 | 69 | 86 | 76 | Clear internal purpose and entitlement framing. Not deeply audited beyond landing-state guidance. |
| Credit dashboard | 40 | 38 | 43 | 52 | 43 | The captured state stayed on `Loading…` while analysis also said `Generating analysis…`, so the first-run signal is weak. |
| Credit services index | 39 | 35 | 47 | 50 | 43 | Same issue as the portal services index: status placeholders dominate the first impression. |
| Credit reports | 94 | 83 | 94 | 95 | 91 | Excellent operator guidance. It explains the workflow lane, sequencing, provider boundary, and downstream handoffs cleanly. |
| Dispute letters | 95 | 84 | 95 | 97 | 93 | Strongest workflow honesty in the audit. It explicitly says Purely drafts and exports, but does not submit disputes externally. |
| Credit reporting | 94 | 83 | 95 | 97 | 92 | Strongest cross-service handoff page. It clearly distinguishes reporting from reports, disputes, and tasks. |
| Credit billing | 41 | 39 | 40 | 50 | 43 | Could not be fairly scored beyond the loading capture. Current score reflects first-run friction, not deeper product quality. |

## Strongest Surfaces

| Area | Why it works |
| --- | --- |
| Dispute Letters | Explicit workflow boundary, explicit manual-state honesty, and concrete downstream handoffs. |
| Credit Reporting | Clear statement of what is included vs excluded, with direct links to the surfaces that own the missing workflow steps. |
| Credit Reports | Strong lane guidance and sequencing for the credit workflow. |
| Reviews | Quiet-state UX is proactive instead of dead. It tells the operator what is ready and what will appear next. |
| Business settings | Best setup coaching in the workspace. It decomposes profile completeness into concrete sections and missing fields. |

## Highest Friction Surfaces

| Area | Main friction |
| --- | --- |
| AI Outbound | Almost no first-run guidance. The surface collapses into a dead-end selection prompt. |
| Portal services index | Readiness placeholders block confident prioritization. |
| Credit services index | Same placeholder problem, now affecting credit-specific operators too. |
| Credit dashboard | Loading state lingered and the dashboard did not present a stable first action. |
| Credit billing | Still loading at capture time, so the first-run experience is weak even if the underlying product may be stronger. |

## Cross-Service Handoff Notes

- Portal reporting is strong because it refuses to pretend that untracked workflow milestones are already measured. It redirects the operator to tasks when the answer lives elsewhere.
- Credit reporting is stronger still because it cleanly names the ownership split: reporting for shared counts, credit reports for item review, dispute letters for draft/PDF/mailed-manual states, and tasks for the operational follow-up between them.
- Reviews handles the public-page handoff well. The operator sees both the admin quiet state and the public review page entry point.
- Billing helps handoff by listing service-level status and linking directly into the affected service, which is more useful than a passive invoice-only billing page.
- Business settings helps upstream handoff into AI and generated assets by explicitly saying missing profile details reduce onboarding, AI behavior, and asset quality.
- Booking only partially succeeds here. The admin route and public page are both honest, but the bridge from `no availability` to `accepting bookings` could be much more explicit.

## Configuration Friction Notes

- The biggest systemic problem is not a single broken setup screen. It is overview pages waiting too long to compute readiness before they can recommend the next action.
- Surfaces that succeed usually do one of three things immediately: say what is missing, say what is ready, or say what this page does **not** do.
- Surfaces that underperform usually replace that with status placeholders, generic loading, or a nearly empty editor shell.
- Twilio-dependent services are mostly honest once opened directly. The issue is more that the services indexes do not convert that dependency into a stable summary quickly enough.
- Public booking is directionally honest, but the disabled calendar and form still create unnecessary “try anyway” friction after the page already knows booking is unavailable.

## Recommendations

1. Replace `Checking readiness` on portal and credit services indexes with a fast server-side or cached first-pass summary, even if a deeper readiness refinement lands a second later.
2. Give AI Outbound a true first-run empty state: explain what a campaign is, what prerequisite data is missing, and what the first action should be.
3. Upgrade dashboard loading states into stable operator guidance. If analysis is still computing, the page should still name the top setup gaps immediately.
4. Make Booking Automation spell out the activation sequence in one place: set availability, confirm live link readiness, then test the public page.
5. Reuse the Credit Reports and Dispute Letters pattern more widely: every workflow-heavy page should explicitly state its boundary, its downstream owner, and the next route to open.

## Beta Readiness Grouping

| Group | Areas |
| --- | --- |
| Beta-ready with strong operator guidance | Business settings, Inbox / Outbox, Media Library, Tasks, Reviews, Reporting, Billing, Credit Reports, Dispute Letters, Credit Reporting |
| Usable but still guidance-thin | Portal dashboard, People, Booking Automation, Public booking page, AI Receptionist, Lead Scraping, Newsletter, Nurture Campaigns, Manager overrides |
| Not ready for confident first-run self-serve | Portal services index, AI Outbound, Credit dashboard, Credit services index, Credit billing |

## Blocked or Unreviewed Areas

- Credit billing never progressed past a loading capture during this audit.
- Credit dashboard never progressed past a loading capture during this audit.
- Sales-specific reporting routes were not deeply reviewed.
- Funnel Builder, Automations editor, Blogs editor, and deeper AI Receptionist/Lead Scraping settings were not re-scored from scratch in this P-027 pass because they had already been validated earlier in the session for P-025 and P-026.
- Public hosted pages were only sampled through the booking route. Other hosted/public surfaces were not deeply audited in this pass.

## Confidence

- Overall confidence: `84/100`
- Reason: the audit covered a broad set of portal and credit routes directly in the browser, but a few overview routes remained stuck in loading states, which limits certainty about their fully settled first-run behavior.
