# Funnel Stencils

This tree is a standalone extraction and normalization surface for reusable funnel stencils.

## Scope

- Extract recurring section and page structure from external landing-page template repositories.
- Strip branding, decorative styling, logo systems, gradients, illustration-heavy layouts, and source-specific copy.
- Preserve only the reusable information architecture needed to reconstruct funnel flows with bound content later.
- Keep the output neutral and AI-ready. These files are not finished designs and are not wired into runtime in this pass.

## Source basis

- `cruip/tailwind-landing-page-template`
- `cruip/open-react-template`
- `ixartz/Next-JS-Landing-Page-Starter-Template`
- `Blazity/next-saas-starter`
- `PageAI-Pro/page-ui`
- broader GitHub `landing-page` topic patterns used as cross-checks

## Normalization rules

- Image CTA, text CTA, and video CTA all normalize into `Hero` or `CTASection`.
- Logo clouds, sponsor grids, rating bands, awards, inline avatars, and quick stats all normalize into `ProofStrip` or testimonial surfaces.
- Interactive galleries, workflow tabs, tours, and spotlight cards normalize into `FeatureGrid`, `BenefitsSection`, `Workflow`-style structure, or funnel-specific archetypes.
- Pricing variants normalize into `PricingTable` or `CheckoutPanel` depending on whether the visitor is still evaluating or already buying.
- Confirmation surfaces normalize into `ConfirmationPanel` and `NextStepPanel` rather than bespoke thank-you layouts.
- Scheduler, countdown, and agenda structures are represented as neutral shells, not live integrations or animated widgets.

## Output contract

Each funnel folder contains:

- `pages/` for page-level composition shells
- `sections/` for funnel-local section wrappers
- `stencil.json` for machine-readable page order, section order, placeholder tokens, optional sections, conversion goal, and source ancestry

Shared files live under `_shared/`:

- `types.ts` defines the manifest contract
- `primitives.tsx` defines neutral layout wrappers
- `sectionPatterns.tsx` defines reusable structural section archetypes used by multiple funnels

## Funnel coverage

- `lead_capture` focuses on value exchange, form capture, proof, and thank-you routing.
- `sales` adds pricing, guarantee, checkout, and post-purchase routing.
- `booking` adds scheduler structure and booking confirmation.
- `webinar` adds speaker, agenda, registration, and confirmation flow.
- `multi_step` adds explicit staged qualification and routing.
- `tripwire` adds urgency-led offer structure and low-friction checkout.

## Implementation notes

- Placeholder syntax stays explicit, for example `{{hero.headline}}` and `{{pricing.plans[0].price}}`, so downstream systems can bind content deterministically.
- Section wrappers stay per-funnel even when they map to shared patterns. That keeps each funnel self-describing without requiring runtime introspection of the manifest.
- These stencils intentionally avoid source asset imports, brand naming, external font dependencies, and copied animation logic.