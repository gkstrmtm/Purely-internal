# Full Force Redesign Kickoff Prompt

Use this in a new chat with the `Full Force Redesign` agent.

## Prompt

I need you to treat the funnel builder as a full product-system problem, not a local UI patch.

Primary target:

- `src/app/portal/app/services/funnel-builder/funnels/[funnelId]/edit/FunnelEditorClient.tsx`

Reference inputs:

- Live page: `https://shop.home2smart.com/bundles`
- Reference repo: `https://github.com/gkstrmtm/h2s-bundles-workspace`

Important constraint:

- Use the Home2Smart links strictly as reference material.
- Do not clone, pull, vendor, or directly port code.
- Do not cargo-cult their implementation details.
- Use it to benchmark what “precise, high-converting, production-ready page generation and booking UX” should feel like.

What I want from you:

I want a serious audit of what is keeping our funnel builder from being a 10/10 system for generating pages that are:

- visually precise
- conversion-aware
- structurally strong
- technically performant
- capable of richer design elements
- capable of robust booking / scheduling flows
- easy and fluid for a user to create, refine, and iterate inside the builder

Use the Home2Smart bundles page as a benchmark for the level of polish and operational completeness we should be able to support, especially around:

- above-the-fold clarity and CTA structure
- package / offer presentation
- proof placement and trust sequencing
- booking and scheduling flow sophistication
- pricing clarity
- motion, responsiveness, and perceived smoothness
- defer loading / lazy loading / reduced waterfall behavior
- rendering resilience and placeholder strategy
- capability to support rich commercial sections without the builder fighting the user

The point is not to copy that page.

The point is to identify the missing capabilities, workflow friction, architectural gaps, editor-model limits, design-system weaknesses, performance constraints, and product UX problems in our funnel builder that prevent us from reliably producing pages at or above that level.

What you should specifically study from the Home2Smart reference:

- the overall precision of the landing page composition
- the way proof, reviews, and guarantees support conversion without clutter
- the package grid / offer framing
- the booking intent path and how the page supports action decisively
- the signs of performance discipline, such as aggregated data loading, deferred logic, skeletons/placeholders, and lazy secondary work
- the fact that the page appears built to handle real commercial complexity instead of just rendering static marketing blocks

Useful reference details already observed from the Home2Smart page/repo:

- hero with immediate CTA split and proof support
- recent-install proof rails and trust sections
- package grid with clear pricing and inclusions
- aggregated data endpoint instead of obvious front-end waterfalls
- deferred and lazy-loaded secondary logic
- placeholder structure to avoid layout shift in dynamic review areas
- cart / booking / promo / checkout style flows backed by real API paths
- recommendation / bundle-swap logic that goes beyond static brochure content

Your job now:

1. inspect the current funnel builder as a whole product surface, not just one panel
2. compare its actual generation, editing, design, and conversion capabilities against the level implied by the Home2Smart bundles reference
3. identify every major blocker that keeps the builder from reliably producing pages with that level of polish, richness, and booking-flow competence
4. separate the problems into categories such as:
   - builder UX friction
   - page model / content model limitations
   - design-system / styling limitations
   - AI generation gaps
   - proof / offer / pricing / CTA composition gaps
   - booking-flow capability gaps
   - performance / loading / rendering architecture gaps
   - workflow friction for users trying to create or refine complex pages
5. call out where the builder currently nudges users toward weak, generic, flat, or brittle outputs
6. call out where the builder makes sophisticated pages too hard to create, too hard to revise, or too easy to break
7. propose the right redesign direction for the system so it can support best-in-class funnel creation with an easy, free-flowing user workflow

Deliverables I want in the response:

1. a blunt audit of the pain points and missing capabilities
2. the highest-leverage structural changes needed in the builder
3. the highest-leverage workflow changes needed for the user experience
4. the highest-leverage generation and rendering changes needed for page quality
5. the highest-leverage performance and deferred-loading changes needed for serious production pages
6. a prioritized roadmap of what should be fixed first vs later

Important framing:

- Do not reduce this to “make it prettier.”
- Do not reduce this to one page template.
- Do not stay at the level of generic advice.
- Do not give me soft product-language fluff.
- Point directly at the real constraints in our builder that are holding page quality back.
- If the current editor model, generation model, or page schema is too weak, say so plainly.
- If the workflow is too fragmented, too technical, too rigid, or too patchy, say so plainly.
- If performance architecture would break under richer page experiences, say so plainly.

What good looks like:

- the audit should make it obvious why our current builder is or is not capable of matching and beating that level of page
- the findings should connect concrete builder pain to concrete output weakness
- the redesign direction should feel like a whole-system answer, not scattered local fixes
- the end result should push us toward a funnel builder that can generate better-than-Home2Smart pages with less friction and more control

If you need to inspect the external references, do so through available web/repo inspection only. Again: no cloning, no pulling, no direct code import.