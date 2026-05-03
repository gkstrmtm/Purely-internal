# Funnel Exhibit Archetype Pack Seed

Build a reusable Exhibit archetype pack for this funnel.

## Funnel Context
- Funnel name: {{funnelName}}
- Route label: {{routeLabel}}
- Audience: {{audience}}
- Offer: {{offer}}
- Primary CTA: {{primaryCta}}
- Funnel goal: {{funnelGoal}}
- Business context: {{businessContext}}

## What To Return
Return JSON only. Do not wrap the answer in prose.

Use this shape:

```json
{
  "summary": "string",
  "designProfileId": "string",
  "categories": ["string"],
  "archetypes": [
    {
      "id": "string",
      "label": "string",
      "pageTypes": ["string"],
      "triggers": ["string"],
      "shellPosture": "string",
      "heroHierarchy": ["string"],
      "sectionSequence": ["string"],
      "proofStrategy": "string",
      "ctaCadence": "string",
      "designTone": "string",
      "antiPatterns": ["string"],
      "resourceCategories": ["string"]
    }
  ]
}
```

## Rules
- Create archetypes that are reusable across funnel generation, not one-off mockups.
- Cover at least these flows when relevant: VSL-first, booking-first consultation, booking confirmation, post-opt-in continuation, proof-heavy sales, and qualification/application.
- Keep the pack conversion-first and oriented around section order, trust flow, and CTA placement.
- If a needed category does not exist yet, create it instead of forcing a weak fit.
- Prefer concrete reusable categories such as Layout, Cards, Proof, Scheduling, Intake, Pricing, Media, Inputs, Feedback, Confirmation, Qualification, Style Families, and Navigation when they apply.
- Booking and consultation flows should usually include scheduling or intake-oriented categories.
- Sales and checkout flows should usually include proof or pricing-oriented categories.
- VSL or webinar flows should usually include media-oriented categories.
- Avoid generic creative-director language. Write structural guidance that another system can attach to prompts.