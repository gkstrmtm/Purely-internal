import {
  StencilPlaceholderButton,
  StencilSectionShell,
} from "../../_shared/primitives";

export function Hero() {
  return (
    <StencilSectionShell
      align="center"
      pad="lg"
      eyebrow="{{hero.eyebrow}}"
      title="{{hero.headline}}"
      description="{{hero.subheadline}}"
    >
      <div className="flex flex-wrap justify-center gap-3">
        <StencilPlaceholderButton label="{{hero.primaryCta.label}}" href="{{hero.primaryCta.href}}" />
        <StencilPlaceholderButton
          label="{{hero.secondaryCta.label}}"
          href="{{hero.secondaryCta.href}}"
          variant="secondary"
        />
      </div>
    </StencilSectionShell>
  );
}
