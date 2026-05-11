import {
  StencilPlaceholderButton,
  StencilSectionShell,
} from "../../_shared/primitives";

export function CTASection() {
  return (
    <StencilSectionShell
      align="center"
      eyebrow="{{cta.eyebrow}}"
      title="{{cta.heading}}"
      description="{{cta.description}}"
    >
      <div className="flex justify-center">
        <StencilPlaceholderButton label="{{cta.label}}" href="{{cta.href}}" />
      </div>
    </StencilSectionShell>
  );
}
