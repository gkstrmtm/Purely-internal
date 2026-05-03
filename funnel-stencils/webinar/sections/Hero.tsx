import { PatternHero } from "../../_shared/sectionPatterns";

export function Hero() {
  return (
    <PatternHero
      eyebrow="{{webinar.hero.eyebrow}}"
      title="{{webinar.hero.headline}}"
      description="{{webinar.hero.subheadline}}"
      primaryCta={{ label: "{{webinar.hero.primaryCta.label}}", href: "{{webinar.hero.primaryCta.href}}" }}
      secondaryCta={{ label: "{{webinar.hero.secondaryCta.label}}", href: "{{webinar.hero.secondaryCta.href}}" }}
    />
  );
}
