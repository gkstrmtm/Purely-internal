# Exhibit Funnel Audit Prompts

Use these prompts to test whether Exhibit is adding real value to funnel generation, or whether it is drifting into soft advisory language.

## 1. Backend Value Audit

Use this when you want a black-and-white read on whether Exhibit should be treated as advisory-only, composition guidance, or something stronger.

```text
You are auditing whether Exhibit can materially improve a funnel-generation backend.
Give a strict answer in plain JSON only.

Evaluate this use case:
- A funnel builder generates booking pages, sales pages, lead capture pages, and application pages.
- The local system already has shell frames, prompt synthesis, visual reasoning rules, validation, and fallback HTML generation.
- The goal is better first-draft design quality, stronger conversion structure, and less dependence on vague user prompts.

Your job:
1. State whether Exhibit is currently best used as advisory-only, composition-guidance, or executable design-system authority.
2. Score its likely value from 0-10 for improving first-draft design quality.
3. Score its likely value from 0-10 for improving structural conversion quality.
4. List the top 5 pieces of guidance Exhibit can reliably provide.
5. List the top 5 gaps where a local system must still take over.
6. Say what inputs you would need to give black-and-white stronger guidance.
7. Recommend the minimum integration pattern that would actually improve results in production.

Return JSON with keys:
mode,
designQualityScore,
conversionStructureScore,
reliableStrengths,
hardGaps,
requiredInputs,
minimumUsefulIntegration,
redFlags.

No prose outside JSON.
```

Suggested context payload:

```json
{
  "pageType": "booking",
  "primaryCta": "Book a call",
  "audience": "operators evaluating automation help",
  "shellFrame": "booking-authority-editorial",
  "existingSystem": "local shell frames + prompt synthesis + scene validation + fallback shell"
}
```

## 2. Booking Shell Audit

Use this when you want Exhibit to stop talking like a creative director and start acting like a constraint source for the booking generator.

```text
You are auditing a booking-page design engine.
Answer in plain JSON only.

A backend already knows:
- pageType=booking
- primaryCta=Book a call
- audience=operators evaluating automation help
- shell posture=authority editorial booking
- desired tone=premium, calm, trust-first
- proof must be adjacent to the opening CTA and repeated at the booking handoff

Give black-and-white direction, not inspiration.

Return JSON with keys:
openingPosture,
heroHierarchy,
proofPlacement,
ctaDiscipline,
sectionSequence,
antiPatterns,
layoutRules,
whatLocalEngineMustEnforce.

Each field must be concrete and implementation-usable.
No prose outside JSON.
```

## 3. Platform Gap Audit

Use this when you want Exhibit to explicitly tell you what it cannot infer and what the local engine must supply.

```text
You are auditing a design-advisory platform for conversion funnels.
Return strict JSON only.

The platform may understand design systems, layout patterns, typography, spacing, and component families.
The local funnel engine owns runtime truth, booking URLs, form routing, CTA enforcement, conversion sequencing, fallback rendering, and quality validation.

Your job:
1. Separate what the design-advisory platform can determine reliably from what only the local engine can determine.
2. Flag anything that would be unsafe to leave to advisory interpretation.
3. Recommend the thinnest integration that still improves output quality.

Return JSON with keys:
safeForAdvisory,
unsafeForAdvisory,
requiredLocalAuthority,
minimumContract,
latencyRisk,
fallbackPlan.

No prose outside JSON.
```

## How To Judge The Answer

Good answer:
- Names a mode clearly.
- Gives structural guidance, not moodboard language.
- Distinguishes advisory design from local runtime authority.
- Identifies concrete required inputs.
- Produces enforceable rules for opening posture, proof staging, CTA hierarchy, and anti-patterns.

Bad answer:
- Talks about polish or premium feel without telling you what to enforce.
- Suggests components without saying how they map to funnel structure.
- Pretends it can own booking logic, routing, or validation.
- Times out or returns soft design copy under audit conditions.

## Current Read

Based on direct testing in this repo:
- The remote Exhibit agent timed out under strict audit prompts.
- The published Exhibit rulebook and category index are more reliable than the live audit endpoint.
- The highest-value use today is design-foundation guidance plus reference anchors, not synchronous authority.
- The local funnel engine should remain the authority for shell selection, runtime truth, CTA dominance, proof staging, validation, and fallback rendering.