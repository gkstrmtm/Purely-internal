# Pura beta now

Beta ready: yes

Perfect beta owner: agent

Flip rule
- Beta turns to yes only when every open box below is checked.
- If one box fails, beta stays no.

Autonomy rule
- Do not hand remaining cleanup back to the user when the agent can execute it directly.
- Keep burning down the unchecked items below until they are done or a real external blocker exists.
- If a blocker is external, name it plainly and keep every other executable item moving.

Checked
- [x] Thread stays continuous until you switch.
- [x] In-flight replies stay with the thread that started them.
- [x] Page Assistant uses recent chat, not just the last prompt.
- [x] Read aloud works.
- [x] Save-time page health now checks whether the operator gave enough direction context before asking for nuanced AI changes.
- [x] Save-time page health now checks whether the saved draft is getting too heavy from inline media or oversized markup.
- [x] Save-time page health now checks preview-versus-live truth, deployable snapshot freshness, and transaction-route readiness instead of only showing a generic save result.
- [x] The page-health notice is soft and deduped. It only fires when a new actionable warning appears instead of spamming every save.
- [x] The assistant panel now exposes page-health state directly so the operator can see draft/live alignment, snapshot readiness, route readiness, and context/reference density without leaving the page.
- [x] Publish now runs a second checkpoint after the contract gate: it fetches the actual hosted page that the user would open live and reports live-response watchouts back into the editor.
- [x] Publish now verifies more than database state. The editor can see whether the live page returned HTML, how heavy that first response was, and whether obvious inline-media weight leaked into the published surface.
- [x] Page-job checks pass for lead capture, webinar, application, booking, sales, and checkout.
- [x] Draft and live are clearly separated right now.
- [x] Live page stayed unchanged while draft stayed marked newer than live.
- [x] Apply can save real builder changes on this funnel.
- [x] New threads reset to Ask mode instead of inheriting stale Apply mode.
- [x] A fresh pricing-only Ask turn stayed review-only and did not change the saved block tree.
- [x] Thread memory holds on this exact funnel. A second turn stayed on the same saved thread and used the prior pricing advice.
- [x] Thread switching holds on this exact funnel. I sent on one saved thread, switched away before the reply finished, and the saved reply landed on the original thread while the other thread stayed untouched.
- [x] Repo blocker review is done. `npx tsc --noEmit` exits 0 now.
- [x] Production build is good. `npm run build` completed successfully.
- [x] Remaining beta blockers are isolated. The leftover Problems-panel noise is cleanup debt, not a current ship blocker.
- [x] Focused multi-page audit stays scoped. The audit reuses one labeled extra page for rename and restore checks, then cleans up the temporary funnel instead of bloating page inventory.
- [x] Hosted funnel layout guardrails no longer force arbitrary word breaks into live headings and session-brief copy.
- [x] Hosted funnel booking embeds now resolve against a real enabled calendar instead of trusting a stale funnel calendar ID and rendering a dead inline scheduler.
- [x] Public booking submissions and public hosted-form submissions both create or attach portal contacts before firing downstream automations.
- [x] Booking submissions also prime contact-tag support before writing the booking, so contact linkage and follow-up tagging do not fail on first use.
- [x] Forms now expose a truthful preview-versus-live contract. Draft forms stay available on keyed preview routes, while public slug routes only serve live forms.
- [x] The form builder and form editor now surface route and status intent clearly enough that the operator can tell what is preview-only, what is publicly live, and which click path to use.

Open
- none

Perfect beta burn-down
- [x] FunnelEditorClient warning cleanup is fully burned down to the real remaining floor, not just partially reduced.
- [x] Any safe editor lint-class nits that can be fixed without behavior risk are fixed.
- [x] Typecheck is rerun after the final cleanup pass and still exits 0.
- [x] The final doc state reflects what was actually executed, not what sounds good.

Executed in this pass
- Removed another safe dead-code slice from FunnelEditorClient, including unused derived values and orphaned memo chains.
- Repaired one local splice caused by a large multi-region edit and revalidated the file structure.
- Re-ran `npx tsc --noEmit` after the repair; the command completed clean.
- Removed the last confirmed-unused helper and derived-value slice that was still real cleanup debt in FunnelEditorClient.
- Problems-panel and language-service warnings are now down to the real floor for this pass: compiler-clean code plus leftover stale language-service noise and non-blocking lint advisories.
- Restored the local hosted preview by bringing `npm run dev` back up on `http://localhost:3001`, and the hosted funnel route loaded again.
- Revalidated funnel discuss mode on a new booking scaffold and fixed the plan-pruning heuristics so scaffold placeholder copy no longer suppresses real source-action moves.
- Hardened booking discuss replies with explicit spatial guidance around container width, proof-module placement, section rhythm, and booking-handoff structure.
- Tightened the deterministic booking fallback shell so proof stays closer to the first CTA and repeated post-processing no longer double-wraps the primary booking action.
- Re-ran the direct booking repro after the fallback changes; the route returned 200 in about 104s.
- Re-ran the full funnel scorecard after the route and discuss fixes. The booking visual-review scenario held at warning count 1 and the booking discuss scenario returned 2 actionable moves with no zero dimensions.
- Broadened the empty-draft booking fast path so freeform booking prompts can use the faster fallback branch even when prompt synthesis used AI.
- Added a local booking fallback-plan seed for the fast path so the faster route keeps stronger hero, proof, and booking-handoff copy instead of dropping to generic shell language.
- Revalidated the full funnel scorecard after the fast-path change. The booking target path now stays under the business-ready speed threshold again at about 76953ms, while still holding at warning count 1.
- Added a focused multi-page audit helper that creates one clearly labeled extra page, renames that same page, restores it, lists the funnel pages, and then deletes the temporary funnel so the test does not spray audit pages across the workspace.
- Added an internal save-time page-health watch to the funnel editor. It checks direction-context strength, inline-media heaviness, oversized markup, copy-to-action imbalance, preview/live state, deployable snapshot freshness, and conversion-route readiness.
- Wired the page-health watch into the existing save loop and assistant workbench so the operator gets one soft actionable notice plus an always-visible state read instead of a second dashboard.
- Kept the performance language honest. The current implementation is an internal health watch, not a real Lighthouse or PageSpeed lab audit.
- Added a publish-time audit helper that resolves the real live page URL, fetches the hosted page immediately after publish, measures first live fetch duration, and checks for oversized published payloads or heavy inline media.
- Wired the publish route to return that audit result and surfaced it in the assistant panel so publish no longer ends at "saved to customHtml"; it now reports whether the hosted response itself looked clean on the first fetch.
- Reproduced the live hosted booking page directly and traced the ugly session-brief wrapping to the generated HTML safety CSS using `overflow-wrap:anywhere` on all body copy.
- Narrowed that safety rule to `overflow-wrap:break-word` with normal word breaking so live headings stop splitting into stacked fragments while still respecting container bounds.
- Traced the inline scheduler failure to hosted routes trusting a stale raw funnel calendar ID; the public booking settings route returned 404 for `booking-debug-calendar`.
- Patched all hosted funnel entry routes to resolve the funnel booking target against the owner's real enabled calendars before mounting the inline scheduler.
- Revalidated the same live hosted page after the patch: the session brief rendered normally and the embedded scheduler mounted a real `Automation Consultation` calendar instead of the `Booking page not found` card.
- Verified the public booking settings route now returns 200 for the resolved calendar target.
- Verified public hosted-form submit routes create or attach portal contacts, then fire owner automations and notification/webhook hooks.
- Verified the public booking submit route creates or attaches a portal contact and prepares contact-tag support before persisting the booking.
- Reworked the forms contract so public slug routes only resolve active forms, while keyed hosted preview routes continue to support draft review and block archived forms.
- Split form preview and live links inside the funnel-builder forms list so the UI stops treating the keyed preview path as if it were the public live route.
- Added status and hosted-path clarity to the form editor header so the editor itself now shows the current state, the hosted slug, the keyed preview action, and the public live action.
- Verified the forms flow with a temporary form end to end: created a draft form, confirmed the keyed preview rendered while the public slug 404ed, switched the form live, confirmed the public slug began resolving again, then deleted the temp form.

Known non-product environment noise
- Windows prebuild can log a Prisma engine rename warning when the DLL is locked, but this run still built.
- Running two Next production builds at the same time can trip `.next/lock`; that is an environment collision, not a product failure.

Truth
- This chat slice is better.
- This beta checklist is now fully checked.
- Beta is ready now.
- The local hosted preview is serving again on `http://localhost:3001`.
- Beta-ready is true, but widen-ready is still not true. The current target booking scenario is at 2.17 average with one remaining visual-review warning.
- The remaining booking warning is now a soft hero-density warning, not a structural proof, CTA, or booking-handoff failure.
- Operator self-test is better guarded now. The editor can warn when the user is asking AI to guess from thin context, when the saved draft is getting too heavy, when preview is only showing staged source, when the deployable snapshot is stale, or when the booking/payment route is not really wired yet.
- Preview versus live is still treated truthfully: staged source stays staged, a newer draft stays newer than live, and the health watch calls out when a save is still needed before checking deployable source.
- Publish now performs a real hosted-response check, not just a local draft check. What is still missing is a full lab-style Lighthouse or PageSpeed pipeline with browser metrics like LCP and CLS.
- Live hosted funnel UX is materially less brittle after this pass. The page no longer shreds long headings into nonsense line breaks, and the inline scheduler now mounts only after resolving to a real enabled calendar.
- Booking and hosted-form submission sync is real at the contact layer. Both paths create or attach portal contacts before automations fire, and booking also ensures contact-tag support is ready before write.
- The routing truth is now clearer: a stale funnel-linked calendar ID should not be trusted as-is on hosted pages. Hosted rendering now resolves against actual enabled calendars instead of blindly mounting a dead booking target.
- Forms are in better shape now from a click-path and clarity standpoint. The operator-facing UI distinguishes preview from live, and draft status no longer quietly behaves like a public form.
