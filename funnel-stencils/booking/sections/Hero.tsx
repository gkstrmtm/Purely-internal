import { PatternHero } from "../../_shared/sectionPatterns";

export function Hero() {
  return (
    <PatternHero
      eyebrow="{{booking.hero.eyebrow}}"
      title="{{booking.hero.headline}}"
      description="{{booking.hero.subheadline}}"
      primaryCta={{ label: "{{booking.hero.primaryCta.label}}", href: "{{booking.hero.primaryCta.href}}" }}
      secondaryCta={{ label: "{{booking.hero.secondaryCta.label}}", href: "{{booking.hero.secondaryCta.href}}" }}
    />
  );
}
