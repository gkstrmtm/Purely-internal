# Funnel Design Governance

This system should generate first drafts that feel intentional, elevated, and conversion-led before the user has to micromanage the page.

## Source Of Truth

1. Curated in-repo shell frames are the primary source of structure and design posture.
2. Page type and conversion pattern infer the default frame.
3. User overrides refine the frame or shell; they do not replace the need for a strong default.
4. Exhibit is advisory only when enabled. It can enrich or refine direction, but it does not replace local frame definitions as the main design authority.

## Design Objectives

1. First drafts must look deliberate, not like generic page-builder sludge.
2. Layout, typography, proof placement, and CTA rhythm should do more work than decorative effects.
3. The shell should give the user something strong enough to iterate from immediately.
4. The page must feel conversion-aware from the first draft, not just visually cleaner.

## Brand Restraint

1. Stored company colors are selective accents by default, not full-page styling instructions.
2. Prefer calm neutrals, strong contrast, and a clear visual hierarchy over saturated brand washes.
3. Use brand color primarily for CTA treatment, small highlights, and supporting surfaces.
4. Do not apply brand color broadly to hero backgrounds, body surfaces, or large content blocks unless the user explicitly asks for a branded redesign and it still improves readability.

## Intake Philosophy

1. Do not ask users to restate obvious conversion intent.
2. Infer page goal, shell concept, section plan, and brand handling whenever the page type already makes them obvious.
3. Keep freeform overrides available, but demote them behind advanced controls or later-step refinement.
4. Favor visual frame selection and conversion feedback over open-ended worksheet prompts.

## Exhibit Usage

1. Exhibit guidance is optional and non-blocking.
2. Any Exhibit call must be timeout-bounded and safe to skip.
3. If the Exhibit agent times out or returns an error, generation should fall back first to cached library-index guidance when available, then to local frames only.
4. Exhibit output should be treated as advisory context for prompt synthesis, not as executable UI code or a hard dependency.

## Verification Standard

1. A booking page should immediately read like a consultation-conversion asset.
2. A lead-capture page should immediately read like a clear value exchange.
3. A sales page should immediately read like a premium proof-driven offer surface.
4. Brand use should remain calm even when the business palette is loud.
5. The user should need less typing to reach a strong first draft.