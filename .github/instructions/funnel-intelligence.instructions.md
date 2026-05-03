---
applyTo: "src/app/api/portal/funnel-builder/**/*.ts"
description: "Use when working on funnel-builder AI routes, prompt synthesis, visual review, discuss/chat reasoning, or funnel-generation context handoff."
---

# Funnel Intelligence Workflow

Use this workflow for funnel-builder AI behavior in this repo.

## Core rule

Treat the funnel as a conversion system, not a styling exercise and not a generic chat surface.

The route must first understand:
- the page job
- the funnel posture
- the shell frame or intended section sequence
- the current page state
- the highest-value diffs between intended state and current state

Only after that should it describe changes, build prompts, or select assets.

## Required reasoning order

1. Infer or load the funnel brief and page intent.
2. Resolve the page job and shell posture.
3. Build the intended section path and proof/CTA rhythm.
4. Inspect the current page state.
5. Name the concrete diffs.
6. Return only the next changes that matter most.

## Communication contract

When describing funnel changes, prefer terms like:
- page job
- shell posture
- section sequence
- proof placement
- CTA rhythm
- qualification or intake step
- booking handoff
- current-state diff

Avoid vague critique like "make it stronger", "add polish", or "improve hierarchy" when the route can instead name the section and the specific before/after change.

## Asset rule

Map assets, blocks, or surfaces by funnel role first:
- attention
- proof
- mechanism
- CTA
- qualification
- intake
- scheduling
- reinforcement
- confirmation
- media

Do not choose assets primarily because they "feel premium" or match a loose visual mood.

## Fallback rule

Fallback is not the strategy. If a route repeatedly relies on fallback, fix the missing context, route contract, prompt wiring, or validation that is causing the primary path to fail.