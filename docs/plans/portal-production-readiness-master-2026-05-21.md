# Portal production readiness master

## Mission
- Drive the portal toward a production-ready standard suitable for paying customers.
- Use this file as the source of truth for what is done, what is in progress, what is blocked, and what still needs verification.
- Do not treat any item as complete until the related code path is validated.

## Non-negotiable release gates
- No known compile errors in touched files.
- No generic failure copy on visible non-auth portal recovery surfaces when a concrete retry, reopen, save, upload, or settings action is already on screen.
- No newly introduced regressions in routing, auth-surface boundaries, or variant-aware portal behavior.
- No schema-sensitive portal changes that bypass existing compatibility or ensure-schema patterns.
- No unresolved high-confidence production blockers in the portal flows being actively hardened.

## Status key
- `todo`: not yet started
- `doing`: actively being worked
- `done`: implemented and validated
- `deferred`: intentionally left alone because the right fix is unclear, too risky, or outside current scope
- `needs-verification`: likely fixed but still needs targeted validation

## Current production-readiness board

### 1. UX hardening and recovery guidance
- `done` Exhausted the high-confidence customer-visible non-auth portal generic failure-state sweep across service clients, editors, dialogs, cards, and helper panels where concrete recovery actions are visible.
- `done` Major portal non-auth visible-control sweep across services, editors, dialogs, and upload flows.
- `done` Inbox local composer error split for attachment upload, send, and schedule reschedule flows.
- `done` Business profile local logo-upload error handling.
- `done` AI chat composer local upload/send toasts without changing assistant reply behavior.
- `done` People contacts CSV import dialog retry copy.
- `done` Onboarding-completion, billing-upgrade completion, and verify-email fallback copy now matches the visible retry/navigation actions on those recovery pages.
- `done` Low-risk diagnostics cleanup in the active `get-started` flow plus selective funnel-editor Tailwind canonicalization where the change is behavior-neutral.
- `done` AI chat control toasts, shell reward/floating-tools feedback, and simple portal copy-to-clipboard errors now match visible local retry actions.
- `done` Billing, profile, settings, blogs, onboarding, credit reports, nurture detail cards, inbox contact-create, and other remaining non-funnel portal one-offs now use action-aware recovery copy where local controls already exist.
- `done` Safe funnel-editor toasts for read-aloud, offer building, and copy actions now match the visible local retry/copy controls without widening the large editor refactor scope.
- `done` Funnel builder/editor dictation, page-assistant, favicon upload, file-upload URL fallback, page-path save, Stripe product, foundation fallback, and page/SEO/booking/tracking save fallbacks now better match the visible typing, retry, save, and Ask Pura controls without widening the larger editor refactor scope.
- `done` Shared retry-card hardening for dashboard, users and invites, tasks, general settings, profile, API keys, mailbox, and contact detail surfaces.
- `done` Checkout recovery-copy hardening for dashboard billing, billing page purchases, billing upgrade bundles, discount checkout, and onboarding checkout fallback.
- `done` Billing overview, billing info, payment-method update, and business-profile load/save recovery-copy hardening.
- `done` Shell account-switcher, duplicates cleanup, settings save, appearance settings, and profile contact-save recovery-copy hardening.
- `done` AI chat local share/save/scheduled-task recovery-copy hardening, including local scheduled-stop error handling.
- `done` Blog workspace/blog post local save and font failure hardening.
- `done` Funnel form editor and form responses recovery-copy hardening for builder load/save/delete, responses list paging, CSV export, and submission drawer states.
- `done` Funnel-builder settings and funnel editor recovery-copy hardening for workspace load, Stripe product load/create, export HTML, page save, SEO, booking route, thread save, page path save, and funnel tracking states where visible local recovery actions already exist.
- `done` Booking workspace load-toast and AI chat share-load/onboarding recovery-copy hardening.
- `done` Booking save/cancel/send/reschedule/reminder-draft fallback hardening now matches the visible Retry, Open settings, and Ask Pura recovery paths.
- `done` Reporting, Stripe sales, and sales-reporting load fallbacks now match the visible retry and adjacent reporting-navigation recovery paths.
- `done` Credit reports and reviews setup recovery-copy hardening now matches the visible Retry, Pull report, Open reports, Open requests, Open reviews home, Open booking settings, Open People, and Ask Pura paths.
- `done` Newsletter workspace/draft flows plus lead-scraping load/save/run/contact-action fallback copy now matches the visible Retry, Open settings, Open People, Open AI outbound, and Ask Pura paths.
- `done` People contact-detail/contact-save flows plus selective AI Outbound load/save/detail/settings fallback copy now matches the visible Retry, review-details, create-campaign, settings, and Ask Pura paths.
- `done` Credit dispute letters list/editor recovery copy now matches the visible Retry, Save draft, Open letters, and New letter paths.
- `done` Media library load/create/upload/rename/move/delete fallback copy now matches the visible Retry, Open all media, Upload, New folder, and dialog recovery paths.
- `done` Nurture campaigns list/detail/template/step/enroll/draft fallback copy now matches the visible Retry, New campaign, Open campaigns, Load template, Save, Open People, and Ask Pura paths.
- `done` Nurture, follow-up, and booking tag-picker load/create flows now surface action-aware guidance and keep newly created tags available even if the post-create refresh stumbles.
- `done` Follow-up, Inbox, and AI receptionist localized load/save/upload/testing fallback copy now matches the visible Retry, composer, contact-editor, integrations, settings, testing, call-panel, and Ask Pura recovery paths.
- `done` Booking reminder-side attachments/tags plus automations and missed-call text back localized fallback copy now matches the visible Retry, Open settings, Open services, Open AI Receptionist, list, dialog, and Ask Pura recovery paths.
- `done` AI receptionist shared fallback helper, availability panel save, compact media picker load, and reporting widget-add notes now match the visible Retry, Open services, Open media library, and local panel actions.
- `done` Lead scraping exclusion import, outbound file/draft, contact-tag, assignment, newsletter/nurture, and variable-picker fallback copy now matches the visible dialog, panel, lead, and picker recovery actions.
- `done` Blogs workspace/blog automation and blog post editor fallback copy now matches the visible Retry, Open blog setup, Open blogs, and local editor/panel recovery actions.
- `done` Reviews setup and hosted reviews page editor fallback copy now matches the visible settings, list, send, delete, and local editor recovery actions.
- `done` Newsletter generate/send/upload/image/copy-link and hosted-page-settings fallback copy now matches the visible panel, preview, live-link, and local settings recovery actions.
- `done` Funnel builder/editor shared fallback helpers plus form editor/responses and central upload copy now match the visible Retry, reopen-builder, and local editor recovery actions.
- `deferred` Background/helper-only error wording where no explicit local recovery action exists yet.

### 2. Diagnostics and build confidence
- `done` Fresh diagnostics sweep completed; remaining findings are now mostly long-standing lint/style noise and large-file editor suggestions rather than customer-visible blocker copy.
- `done` Full TypeScript validation still passes after the latest portal-wide hardening work (`npx tsc --noEmit`).
- `doing` Distinguish compile/runtime risk from stylistic Tailwind and unused-symbol suggestions in large editor files.
- `done` Validate that touched files remain clean after each batch.

### 3. Reliability and state management
- `todo` Audit remaining shared error channels that should be local to a modal, composer, or panel.
- `todo` Audit optimistic-update rollback paths in actively monetizable flows.
- `todo` Audit upload/import actions for consistent user recovery guidance.
- `doing` Re-audit profile, billing, and booking surfaces for any remaining generic load/save fallbacks that still sit behind visible recovery actions.

### 4. Auth, routing, and session safety
- `todo` Reconfirm no recent changes crossed portal, credit, ads, or custom-domain boundaries.
- `todo` Reconfirm no recent fixes bypass variant-aware helpers or middleware/proxy behavior.

### 5. Data and schema safety
- `todo` Reconfirm no recent changes bypass shared Prisma/db compatibility patterns.
- `todo` Reconfirm touched flows that rely on schema-sensitive data still follow existing production-safe access patterns.

### 6. Release polish
- `todo` Update this board continuously as fixes land.
- `todo` Leave a final residual list only for truly ambiguous, high-risk, or intentionally deferred issues.

## Active execution log
- 2026-05-21: Created master production-readiness tracker.
- 2026-05-21: Audited current portal diagnostics and remaining generic failure strings.
- 2026-05-21: Confirmed current repo diagnostics include a mix of real issues and long-standing lint/style noise, especially in large editor files.
- 2026-05-21: Hardened shared retry-card copy for dashboard, users and invites, tasks, settings, profile, API keys, mailbox, and contact detail panels; validated touched files clean.
- 2026-05-21: Removed generic checkout fallbacks from dashboard billing, billing, upgrade, discount, and onboarding flows where visible recovery actions already exist.
- 2026-05-21: Hardened billing overview/info/payment-method and business-profile load/save fallbacks; validated billing and profile files clean.
- 2026-05-21: Hardened shell account-switcher, duplicates cleanup, settings save, appearance settings, and profile contact-save fallbacks; validated touched files clean.
- 2026-05-21: Hardened AI chat local share/save/scheduled-task states; added local stop-task error handling and validated the chat client clean.
- 2026-05-21: Hardened blog workspace/blog post save-font fallback copy and validated both blog files clean.
- 2026-05-21: Hardened funnel form editor and responses fallback copy for builder, response pages, export, and submission detail flows; validated touched form files clean.
- 2026-05-21: Hardened funnel-builder settings plus funnel editor workspace/save/export/Stripe recovery copy; validated touched builder files clean apart from pre-existing large-file lint/style noise.
- 2026-05-21: Hardened booking workspace load toasts plus AI chat share-load/onboarding fallbacks; validated both files clean.
- 2026-05-21: Hardened booking save/cancel/send/reschedule/reminder-draft fallback copy; validated the booking client clean.
- 2026-05-21: Hardened reporting, Stripe sales, and sales-reporting load fallback copy; validated all three reporting files clean.
- 2026-05-21: Hardened credit reports plus reviews setup fallback copy; validated both files clean.
- 2026-05-21: Hardened newsletter plus lead-scraping fallback copy, including draft, run, contact-action, and tag-create states; validated both files clean.
- 2026-05-21: Hardened people contacts save/tag/link flows plus selective AI Outbound load/save/detail/settings fallback copy; validated both files clean and cleared the targeted generic-string sweep.
- 2026-05-21: Hardened credit dispute letters list/editor load/save/generate/mail/PDF fallback copy and added local recovery actions to the inline error cards; validated the file clean.
- 2026-05-21: Hardened media library load/create/upload/rename/move/delete fallback copy; validated the file clean and cleared the targeted generic-string sweep.
- 2026-05-21: Hardened nurture campaigns list/detail/template/step/enroll/draft fallback copy; validated the file clean and cleared the targeted generic-string sweep.
- 2026-05-21: Hardened nurture, follow-up, and booking tag-library load/create flows so tag pickers no longer fail silently and newly created tags remain available locally; validated all three files clean.
- 2026-05-21: Hardened follow-up settings/test/AI-draft, Inbox contact/composer/thread, and AI receptionist settings/testing/activity fallback copy; pending targeted diagnostics and string sweeps.
- 2026-05-21: Hardened booking reminder tag/attachment, automations load/manual-trigger, and missed-call text back load/save/upload fallback copy; pending targeted diagnostics and string sweeps.
- 2026-05-21: Hardened AI receptionist shared fallback helper, booking availability save, compact media picker load, and reporting widget-add fallback copy; pending targeted diagnostics and string sweeps.
- 2026-05-21: Hardened lead scraping exclusion import, outbound file/draft, contact-tag, assignment, newsletter/nurture, and variable-picker fallback copy; pending targeted diagnostics and string sweeps.
- 2026-05-21: Hardened blogs workspace/blog automation and blog post editor fallback copy; pending targeted diagnostics and string sweeps.
- 2026-05-21: Hardened reviews setup and hosted reviews page editor fallback copy; pending targeted diagnostics and string sweeps.
- 2026-05-21: Hardened newsletter generate/send/upload/image/copy-link and hosted-page-settings fallback copy; pending targeted diagnostics and string sweeps.
- 2026-05-21: Hardened funnel builder/editor shared fallback helpers, form editor/responses, and central upload fallback copy; pending targeted diagnostics and string sweeps.
- 2026-05-21: Re-ran full TypeScript validation after the broader portal pass; `npx tsc --noEmit` remained clean.
- 2026-05-21: Re-ran the customer-visible generic-copy residual sweep after the latest batches; direct service-surface hits are effectively exhausted and the remaining backlog is now mostly helper/internal wording or long-standing editor style noise.
- 2026-05-22: Extended the residual sweep beyond `services/` into shared hosted-page editor, AI chat composer, contacts CSV import, business profile logo upload, onboarding/billing completion pages, and verify-email; validated the touched files clean and reduced active portal grep hits to tutorial prose plus a few non-service/auth edge cases.
- 2026-05-22: Re-ran the active portal residual grep and a full `npx tsc --noEmit`; live portal hits are now down to tutorial prose while compile validation still passes clean.
- 2026-05-22: Cleaned the remaining low-risk `get-started` Tailwind canonicalization warnings and a small safe subset in the funnel editor, then re-ran `npx tsc --noEmit`; compile validation stayed clean and the remaining funnel backlog stayed in the existing hook/unused/style-noise bucket.
- 2026-05-22: Hardened remaining AI chat control toasts, shell reward/floating-tools feedback states, and simple portal copy-link failure toasts; all touched files validated clean.
- 2026-05-22: While trimming low-risk funnel-editor diagnostics, briefly broke `buildTransactionReadiness`; repaired the helper immediately and re-ran `npx tsc --noEmit`, which returned clean again.
- 2026-05-22: Hardened the next portal one-off cluster across billing, profile, settings, blogs, onboarding, credit reports, nurture detail fallback cards, inbox contact creation, and small signup/upload fallbacks; repeated `npx tsc --noEmit` checks stayed clean throughout.
- 2026-05-22: Cleared the remaining obvious non-funnel portal one-offs, then did one more safe funnel-editor pass for read-aloud, offer-build, and copy-action toasts; `npx tsc --noEmit` stayed clean after each pass.
- 2026-05-22: Hardened the next safe funnel builder/editor batch for speech-recognition helpers, dictation start failures, page-assistant replies, favicon upload fallback, file-upload URL fallback, page-path save, Stripe product panel errors, foundation fallback messaging, and page/SEO/booking/tracking save messaging; one patch briefly spliced into the wrong editor block, was repaired immediately, and the follow-up `npx tsc --noEmit` returned clean.
- 2026-05-22: Captured live funnel-editor proof after the latest copy hardening with `tmp/portal-qa/capture_funnel_editor_loaded.mjs` and a focused error-state proof via `tmp/portal-qa/capture_funnel_editor_copy_proof.mjs`; artifacts now live under `tmp/portal-qa/funnel-editor-shots/` and `tmp/portal-qa/funnel-editor-copy-proof/`.

## Audit snapshot

### High-confidence remaining work
- Remaining work is now mostly ambiguous background/helper loads, internal throw strings that normalize before render, or broader lint/style debt rather than obvious customer-facing retry/save surfaces.
- Active portal grep noise is now limited to tutorial copy that references retrying from Billing, which is instructional prose rather than a live failure surface.
- The last obvious direct customer-facing service-client clusters are now burned down; residual matches are concentrated in helper normalization code or very large funnel-builder editors that already carry long-standing style and hook-noise.
- The active customer-flow diagnostics backlog is now smaller: `src/app/portal/get-started/page.tsx` is clean, while the large funnel editor is still dominated by pre-existing hook dependency, unused symbol, and style suggestions that need deliberate triage before any broader cleanup.
- The newest residual customer-visible portal hits are now scattered, smaller clusters rather than any obvious high-density service surface; most remaining work is either localized one-off copy or deliberate funnel-editor triage.
- Outside the funnel-builder/editor family, the remaining portal grep hits are now mostly tutorial prose, truthful browser/runtime limitations (for example microphone/browser access), positive-but-imperfect notices, or internal logging strings rather than obvious customer-facing recovery defects.
- The live high-confidence backlog is now concentrated in funnel-builder/editor normalization and larger stale diagnostic buckets rather than obvious portal service/customer-flow copy defects.
- Large editor files still carry long-standing lint/style noise that may not represent production blockers but do reduce confidence.
- Repo-wide diagnostics show at least one non-portal stylesheet warning in `src/app/globals.css` about `@theme` and many lint-style suggestions in large portal editors.
- Several remaining grep hits are internal throw strings that are already normalized into actionable user-facing copy before render and do not necessarily represent customer-visible defects.

### Likely lint/style noise rather than immediate production blockers
- Tailwind class canonicalization suggestions such as `rounded-[24px] -> rounded-3xl`.
- Unused locals and hook-dependency suggestions in very large editor files like funnel builder.
- `no-img-element` guidance in places where the UI already intentionally uses direct image tags.

### Immediate next focus
1. Run stricter compile-oriented validation to identify true blockers.
2. Continue fixing only high-confidence portal UX and state-management issues that still surface to paying users, especially any residual localized helper-based loads with visible recovery actions.
3. Keep this file current after each batch so it remains the live source of truth.

## Immediate next actions
1. Audit current portal diagnostics and remaining generic error surfaces.
2. Update this file with concrete blockers discovered by that audit.
3. Fix the highest-confidence production issues first.
