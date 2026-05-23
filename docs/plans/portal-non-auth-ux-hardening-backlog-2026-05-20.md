# Portal non-auth UX hardening backlog

## Scope
- Keep improving non-auth portal UX across `src/app/portal/**`.
- Prioritize fixes where the UI already has a real recovery path: `Retry`, `Open settings`, `Open services`, `Ask Pura`, `New campaign`, or an in-modal save/send/regenerate control.
- Avoid auth/sign-in work unless a non-auth surface is directly blocked by stale copy.
- Prefer surgical fixes over broad refactors.

## Execution rules
- Replace generic fallback copy with action-aware guidance only when the matching action already exists on screen.
- Replace internal hard navigations with router navigation when the destination is inside the portal.
- Do not rewrite validation copy as retry copy.
- Leave toast-only helpers alone unless they clearly mirror an on-screen retry state.
- Validate each touched file before moving on.

## Completed sweeps
- Funnel builder and form editor retry CTAs.
- Funnel builder upload retry copy for editor-side video, poster, cropped-image, and AI context uploads where the same editor controls stay visible after failure.
- Internal SPA navigation cleanup across booking-adjacent and portal utility surfaces.
- Mailbox, tutorials, telephony, inbox, media library, blogs, booking, lead scraping, follow-up, reporting, AI Outbound, newsletter, and Stripe sales retry-copy alignment where recovery UI already existed.
- Reviews setup shared load-state retry copy.
- Reviews setup editor-action retry copy for save/send/upload flows that keep the same control visible.
- Reviews setup follow-on action copy for update/delete and settings-tag flows that keep the same control visible.
- Nurture campaigns shared list/detail retry copy.
- Nurture campaign AI draft modal retry copy.
- Nurture campaign editor-action retry copy for create/save/delete campaign and add/save/delete step flows that keep the same control visible.
- Nurture template-apply and tag-create retry copy for side panels that stay open after failure.
- Nurture editor upload retry copy where the same editor panel stays visible after failure.
- AI Outbound manual-call and call-detail action copy where the triggering control remains visible.
- AI Outbound settings-action copy for sync/upload/generate flows that keep the same control visible.
- AI Outbound campaign and agent-sync action copy for create/update/delete/tag flows with visible panel controls.
- AI Outbound detail and activity retry copy for manual artifact refresh, detail refresh, and delete flows with visible modal controls.
- Newsletter draft retry copy for open-draft delete failures that feed the existing draft retry card.
- Newsletter toast-copy cleanup for settings, create, generate, send, tag creation, and hosted-page save flows with visible controls.
- Newsletter upload retry copy for image/file pickers where the same editor panel stays visible after failure.
- Newsletter utility-toast cleanup for remote media import and hosted-page link copy actions where the same preview or card controls stay visible after failure.
- People contacts CSV import retry copy where the same import dialog stays visible after file-read, import, or duplicate-add failures.
- Booking reminder and availability retry copy for reminder AI draft, tag creation, and availability save flows with visible modal or panel controls.
- Booking reschedule suggestion retry copy where the same modal stays open and still offers manual entry plus settings access.
- Booking reminder attachment upload retry copy where the same reminder editor stays visible after failure.
- Credit reports shared retry-card copy for load, import, pull, and item-update failures with existing recovery actions.
- AI Receptionist visible-control retry copy for generate, polish, call refresh/delete, and reply preview actions.
- AI Receptionist contact-tag creation retry copy where the same settings dialog stays open after failure.
- AI Receptionist knowledge-base upload retry copy where the same settings panel stays visible after failure.
- Follow-up utility retry copy for AI step generation and tag creation where the same panel stays open after failure.
- Follow-up attachment upload retry copy where the same editor panel stays visible after failure.
- Missed-Call Text Back attachment upload and compact media picker retry copy where retry or reopen controls already exist.
- Missed-Call Text Back upload-message cleanup for raw attachment errors where the same settings panel stays visible after failure.
- Automations shared load, manual trigger, and create-tag retry copy where retry cards or visible controls already exist.
- Reporting dashboard add-action retry copy where the same add control stays visible on the reporting card.
- Lead Scraping modal retry copy for outbound AI draft generation and lead tag creation where the same panel stays open after failure.
- Lead Scraping retry copy for variable creation, lead assignment, newsletter add, and nurture enrollment where the same picker, dialog, or lead panel stays visible after failure.
- Lead Scraping retry copy for exclusions CSV import and contact-tag add/remove actions where the same dialog or lead panel stays visible after failure.
- Lead Scraping outbound resource upload retry copy where the same composer panel stays visible after failure.
- Inbox editor retry copy for contact save and custom variable creation where the same editor or picker stays open after failure.
- Inbox attachment upload retry copy where the same composer attachment controls stay visible after failure.
- Inbox composer local error split for send and reschedule flows so composer and schedule-dialog failures no longer reuse the broader conversation error surface.
- AI chat composer upload/send retry toasts where the same composer and attachment controls are restored after failure without changing assistant reply behavior.
- Business profile logo upload retry copy where the same logo section stays visible after failure instead of taking over the broader profile error banner.
- Hosted reviews page editor retry copy for load, save, export, and generate actions where the same editor controls stay visible.
- Blog post editor retry copy for load, save, publish, generate, archive, and delete actions where the editor stays visible.
- Blog post editor image-upload retry copy where the same editor controls stay visible after failure.
- Blog workspace retry copy for account/setup load states and automation generate-now failures where retry, setup, or the same panel controls stay visible.
- Blog workspace automation-context upload retry copy where the same settings panel stays visible after failure.
- Sales reporting retry-card copy for load failures where retry, Stripe setup, and Ask Pura actions already exist.
- Media library retry copy for load, folder create, rename, and move flows where the same panel or dialog stays visible after failure.
- Media library upload retry copy where the same toolbar or empty-state upload controls stay visible after failure.
- Media library move-dialog retry copy for folder loading where the same dialog stays visible after failure.
- Shared media upload and modal error cleanup in the most obvious portal service flows.

## Remaining clusters

### Tier 1: shared retry cards
- `src/app/portal/app/services/newsletter/PortalNewsletterClient.tsx`
  - Revisit only if another `loadError` or `draftError` path appears beyond the already aligned workspace and draft flows.

### Tier 2: modal retry states
- `src/app/portal/app/services/reviews/setup/PortalReviewsClient.tsx`
  - Revisit only if a remaining error is clearly tied to an on-screen retryable editor state.
- `src/app/portal/app/services/ai-outbound-calls/PortalAiOutboundCallsClient.tsx`
  - Completed for current visible-control paths; only revisit if a new modal or inline recovery path is added.
- `src/app/portal/app/services/nurture-campaigns/PortalNurtureCampaignsClient.tsx`
  - Completed for current visible-control paths; only revisit if a new retry card or modal recovery path is added.

### Tier 3: lower-priority toast-only cleanup
- Newsletter utility toasts only if another visible-control action path still uses generic fallback copy.
- Reviews setup background-load or utility toasts without direct on-screen recovery.
- Nurture campaign utility toasts beyond the already aligned editor-panel actions.
- Booking suggestion/tag-loading helpers and ambiguous booking workspace load states.
- Credit reports and portal utility helpers only where failures do not already land in a shared retry card.
- AI Receptionist and adjacent phone-tool utilities only where failures do not already map to visible panel controls.
- Follow-up background tag-loading helpers and similar utility fetches without a direct on-screen recovery path.
- Compact media and upload helper fetches only where there is no explicit retry or reopen path yet.
- Automations background fetches and autosave-specific wording only where no explicit recovery control is already present.
- Reporting dashboard utility helpers only where failures do not already map to visible card controls.
- Lead Scraping background helpers and utility toasts only where failures do not already map to visible modal or panel controls.
- Inbox conversation/global helper errors only where failures still land in the broader conversation retry surface.
- Hosted page editor utility wording only where failures do not already map to visible editor controls.
- Remaining upload-only fallbacks in reviews/newsletter/nurture where no shared card exists.

## Known background noise
- Large editor files can show long-standing style/lint suggestions unrelated to these targeted UX changes.
- Preserve compatibility and drift-hardening helpers; do not remove code just because it looks redundant.

## Next execution order
1. Newsletter, Reviews, and booking-adjacent utility helpers only where a direct recovery control is already present.
2. Lower-priority toast-only cleanup only if it clearly improves an already retryable flow.
