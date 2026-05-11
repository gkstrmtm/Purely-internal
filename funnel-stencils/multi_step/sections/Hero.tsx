import { PatternHero } from "../../_shared/sectionPatterns";

export function Hero() {
  return (
    <PatternHero
      eyebrow="{{multiStep.hero.eyebrow}}"
      title="{{multiStep.hero.headline}}"
      description="{{multiStep.hero.subheadline}}"
      primaryCta={{ label: "{{multiStep.hero.primaryCta.label}}", href: "{{multiStep.hero.primaryCta.href}}" }}
      secondaryCta={{ label: "{{multiStep.hero.secondaryCta.label}}", href: "{{multiStep.hero.secondaryCta.href}}" }}
    />
  );
}
