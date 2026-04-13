# Hosted Page Editor Unification Plan

## Status
- Audit complete.
- Implementation complete on this branch.
- Booking, reviews, newsletter, blog index, and blog post hosted pages now use the shared hosted-page document/editor architecture described below.
- Shared hosted-page APIs, runtime rendering, and Pura action coverage are wired and validated with a successful production build.
- Final hosted-page Pura audit passes are clean for list, preview, update, publish, reset, and generate flows.
- Pura now returns deterministic hosted-page summaries with page keys, editor mode, runtime tokens, live-data context, and hosted-page-specific follow-up suggestions.

## Summary
Hosted pages already have good service-specific APIs, but they are mostly settings-shaped: domains, fonts, form fields, titles, descriptions, and content records. Funnel builder already has the richer editing model we want: `editorMode`, `blocksJson`, `customHtml`, preview, export, and shared block rendering.

The recommended path is to reuse the funnel editor engine and block schema, but not force hosted pages into the `CreditFunnel`/`CreditFunnelPage` tables. Instead, introduce a shared hosted-page document model that stores page-canvas content for service-owned public pages while preserving the existing service APIs for business logic.

## Audit findings
- Funnel builder persistence already supports full page editing through `CreditFunnelPage` with:
  - `editorMode`
  - `contentMarkdown`
  - `blocksJson`
  - `customHtml`
  - `customChatJson`
- Funnel builder already has mature editing and rendering logic in the portal UI.
- Hosted page services currently store configuration in service-specific places:
  - `ClientBlogSite` stores shared hosted-site identity for blogs/newsletter/reviews/booking domains and slug.
  - `portalServiceSetup.dataJson` stores service JSON blobs like blog appearance and booking form config.
  - reviews public page settings live in `ReviewRequestsSettings.publicPage`.
- Existing hosted-page APIs are strong for operational data, but not for page-canvas editing:
  - booking: site, settings, form, calendars, reminders, bookings
  - newsletter: site, newsletters, automation, audience, images
  - reviews: site, settings, inbox, questions, events, contacts, bookings
  - blogs: site, appearance, posts, automation, usage
- Pura already has action coverage for most of those service operations, but not for a shared page-layout editing model.

## Recommendation
### Use one shared hosted-page document model
Add a new model dedicated to public hosted-page content, separate from funnels.

Suggested shape:
- `HostedPageDocument`
  - `id`
  - `ownerId`
  - `service` = `BOOKING | NEWSLETTER | REVIEWS | BLOGS`
  - `pageKey` = service-defined stable key such as `booking_main`, `newsletter_home`, `reviews_home`, `blogs_index`, `blogs_post`, `newsletter_issue`
  - `title`
  - `slug?`
  - `status`
  - `editorMode`
  - `contentMarkdown`
  - `blocksJson`
  - `customHtml`
  - `customChatJson`
  - `seoTitle?`
  - `seoDescription?`
  - `themeJson?`
  - `dataBindingsJson?`
  - timestamps
- Optional later: `HostedPageRevision` if we want durable history beyond the UI undo stack.

### Why not reuse `CreditFunnelPage` directly
Reusing the funnel editor internals is good; reusing the funnel tables directly is not.

Reasons:
- Hosted pages are service-owned assets, not conversion funnel pages.
- Their public routes and operational data are driven by service logic, not funnel navigation.
- They often need stable singleton pages (`reviews_home`, `booking_main`) rather than arbitrary funnel page collections.
- Polluting `CreditFunnel` with service semantics will make publishing, permissions, analytics, and Pura reasoning harder over time.

### Reuse the editor UI and renderer wholesale
Keep one editing engine, one block schema, and one rendering pipeline.

Reuse from funnel builder:
- block schema and helpers from the funnel block system
- block renderer
- editor mode switching (`MARKDOWN`, `BLOCKS`, `CUSTOM_HTML`)
- export-to-custom-HTML flow
- media picker, font controls, and preview mechanics

Refactor the current funnel editor into a shared shell that accepts a document adapter:
- load document
- save document patch
- create/delete page where allowed
- export blocks to custom HTML
- publish/unpublish
- resolve preview URL

Then implement two adapters:
- funnel adapter
- hosted-page adapter

## Hosted-page ownership model
Keep the service APIs as the source of truth for business behavior.

Examples:
- booking availability, reminders, calendars, questions stay in booking APIs
- review request settings, inbox, questions, and destinations stay in reviews APIs
- newsletter issues and automation stay in newsletter APIs
- blog posts and automation stay in blog APIs

The new hosted-page document model becomes the source of truth only for page layout and presentation.

## Data binding strategy
Hosted pages need dynamic content. The layout system should support data-bound blocks instead of hardcoding business content into static HTML.

Add `dataBindingsJson` and a small set of block-level dynamic tokens so layouts can render service data at runtime.

Examples:
- booking page binds to business title, description, calendar cards, question form, thank-you message
- reviews page binds to review list, average rating, gallery, form fields, thank-you state
- newsletter home binds to newsletter archive, signup form, brand header
- blogs index binds to post list, featured post, categories later if needed
- blog post template binds to post title, excerpt, body, author/date, CTA blocks

Rule of thumb:
- layout lives in `HostedPageDocument`
- live business data stays in service tables/settings
- renderer merges them at request time

## Public rendering model
For each hosted public route:
1. resolve owner/site/domain as today
2. resolve the correct `HostedPageDocument` by `service + pageKey`
3. fetch service-specific data payload
4. render blocks/custom HTML with that payload
5. fall back to a default generated template if no custom document exists yet

This gives us safe backwards compatibility: existing hosted pages keep working before customers edit anything.

## Initial page keys
Recommended first keys:
- booking
  - `booking_main`
- reviews
  - `reviews_home`
- newsletter
  - `newsletter_home`
  - later: `newsletter_issue_template`
- blogs
  - `blogs_index`
  - `blogs_post_template`

## Portal API additions
Add a new shared portal surface for hosted-page editing.

Suggested routes:
- `GET /api/portal/hosted-pages/documents?service=booking`
- `POST /api/portal/hosted-pages/documents/bootstrap`
- `GET /api/portal/hosted-pages/documents/[documentId]`
- `PATCH /api/portal/hosted-pages/documents/[documentId]`
- `POST /api/portal/hosted-pages/documents/[documentId]/export-custom-html`
- `POST /api/portal/hosted-pages/documents/[documentId]/publish`
- `POST /api/portal/hosted-pages/documents/[documentId]/reset-to-default`
- `GET /api/portal/hosted-pages/documents/[documentId]/preview-data`

Behavior:
- `bootstrap` creates default hosted-page documents for the service if missing.
- `preview-data` returns the merged service data payload used for preview rendering.
- existing service APIs remain unchanged and continue to power the right-side settings/business panels.

## Portal UI changes
Add an `Edit page` entry anywhere the user manages a hosted public page:
- booking service
- newsletter service
- reviews setup
- blogs site/appearance area

UX recommendation:
- open the shared editor shell with the hosted-page adapter
- left rail: page/template selection
- center: preview/canvas
- right rail: block controls and service-specific settings shortcuts
- include a quick jump back to the service settings screen

## Pura toolkit changes
### Keep existing actions
Do not remove current service actions. They remain the best interface for operational edits.

Examples to keep:
- `booking.settings.update`
- `booking.form.update`
- `reviews.settings.update`
- `blogs.appearance.update`
- `newsletter.site.update`

### Add new shared hosted-page actions
Add high-level page-editing actions that work across services.

Recommended new actions:
- `hosted_pages.documents.list`
- `hosted_pages.documents.get`
- `hosted_pages.documents.bootstrap`
- `hosted_pages.documents.update_meta`
- `hosted_pages.documents.set_editor_mode`
- `hosted_pages.documents.get_blocks`
- `hosted_pages.documents.replace_blocks`
- `hosted_pages.documents.insert_block`
- `hosted_pages.documents.update_block`
- `hosted_pages.documents.delete_block`
- `hosted_pages.documents.move_block`
- `hosted_pages.documents.export_custom_html`
- `hosted_pages.documents.reset_to_default`
- `hosted_pages.documents.preview_data`
- `hosted_pages.documents.publish`

### Why shared actions matter for Pura
This lets Pura reason in one universal pattern:
- find the hosted page
- inspect its structure
- modify layout blocks
- separately call service-specific actions for business settings when needed

That is much easier than teaching Pura four different page-editing dialects.

## Rollout plan
### Phase 1: foundation
- Add `HostedPageDocument` Prisma model and migration.
- Extract shared editor shell from funnel builder.
- Build hosted-page adapter and shared render entry points.
- Add bootstrap/default-template generation per service.

### Phase 2: reviews first
Reviews is the best first slice because it already has one obvious public page and relatively constrained dynamic data.

Deliver:
- `reviews_home` hosted-page document
- public renderer fallback to default template
- portal `Edit page` entry in reviews
- Pura read/write actions for shared hosted pages

### Phase 3: booking
Deliver:
- `booking_main`
- block bindings for calendar list, booking form, thank-you state
- preserve existing booking settings and form APIs

### Phase 4: newsletter and blogs
Deliver:
- `newsletter_home`
- `blogs_index`
- `blogs_post_template`
- optionally `newsletter_issue_template` once we want issue-level layout templating

## Migration and compatibility
- Existing customers should see no change until a hosted page is bootstrapped or edited.
- Public routes must fall back to generated defaults when no `HostedPageDocument` exists.
- Existing domain/slug/site APIs keep their contracts.
- Existing blog/newsletter/reviews/booking settings continue to populate preview data and runtime rendering.

## Risks and mitigations
- Risk: duplicated style/config between service settings and page documents.
  - Mitigation: treat business settings as input data, not page-layout state.
- Risk: hosted-page blocks need dynamic service data that custom HTML cannot safely express.
  - Mitigation: support block bindings first; keep custom HTML as an advanced escape hatch.
- Risk: blog post pages may eventually need per-post layout overrides.
  - Mitigation: start with a shared `blogs_post_template`; add per-post overrides only if needed later.
- Risk: Pura may overuse low-level block actions.
  - Mitigation: keep high-level service actions and teach the resolver when to use layout actions versus service-setting actions.

## Acceptance criteria
- A customer can open booking, reviews, newsletter, and blog hosted pages in the same visual editor quality as funnel pages.
- The same block system and renderer power both funnels and hosted pages.
- Hosted pages keep using service-specific APIs for operational/business data.
- Public routes render custom hosted-page layouts when present and safe defaults otherwise.
- Pura can inspect and edit hosted-page layouts through one shared action family.
- Existing service actions remain intact for non-layout tasks.

## Immediate next build steps
1. Create `HostedPageDocument` model and migration.
2. Extract a shared editor shell from the current funnel editor.
3. Add hosted-page bootstrap + document CRUD APIs.
4. Implement reviews as the first end-to-end hosted-page editor surface.
5. Add the new shared hosted-page actions to `portalAgentActions` and executor wiring.

---

Created by agent after auditing funnel editor persistence, hosted service routes, Prisma models, and current Pura action coverage.