import {
  StencilCard,
  StencilPlaceholderButton,
  StencilSectionShell,
} from "../../_shared/primitives";

export function NextStepPanel() {
  return (
    <StencilSectionShell
      eyebrow="{{nextStep.eyebrow}}"
      title="{{nextStep.heading}}"
      description="{{nextStep.description}}"
    >
      <StencilCard className="max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">{"{{nextStep.primaryLabel}}"}</p>
            <p className="mt-2 text-sm leading-7 text-slate-600">{"{{nextStep.primaryDetail}}"}</p>
          </div>
          <StencilPlaceholderButton label="{{nextStep.ctaLabel}}" href="{{nextStep.ctaHref}}" variant="secondary" />
        </div>
      </StencilCard>
    </StencilSectionShell>
  );
}
