import { PatternHero } from "../../_shared/sectionPatterns";

export function Hero() {
  return (
    <PatternHero
      eyebrow="{{sales.hero.eyebrow}}"
      title="{{sales.hero.headline}}"
      description="{{sales.hero.subheadline}}"
      primaryCta={{ label: "{{sales.hero.primaryCta.label}}", href: "{{sales.hero.primaryCta.href}}" }}
      secondaryCta={{ label: "{{sales.hero.secondaryCta.label}}", href: "{{sales.hero.secondaryCta.href}}" }}
    />
  );
}
