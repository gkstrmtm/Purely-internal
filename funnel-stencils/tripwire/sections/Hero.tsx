import { PatternHero } from "../../_shared/sectionPatterns";

export function Hero() {
  return (
    <PatternHero
      eyebrow="{{tripwire.hero.eyebrow}}"
      title="{{tripwire.hero.headline}}"
      description="{{tripwire.hero.subheadline}}"
      primaryCta={{ label: "{{tripwire.hero.primaryCta.label}}", href: "{{tripwire.hero.primaryCta.href}}" }}
      secondaryCta={{ label: "{{tripwire.hero.secondaryCta.label}}", href: "{{tripwire.hero.secondaryCta.href}}" }}
    />
  );
}
