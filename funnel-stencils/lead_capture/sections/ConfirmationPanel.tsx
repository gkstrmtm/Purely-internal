import { StencilCard, StencilSectionShell } from "../../_shared/primitives";

export function ConfirmationPanel() {
  return (
    <StencilSectionShell
      align="center"
      pad="lg"
      eyebrow="{{confirmation.eyebrow}}"
      title="{{confirmation.heading}}"
      description="{{confirmation.message}}"
    >
      <StencilCard className="mx-auto max-w-2xl text-left">
        <p className="text-sm font-semibold text-slate-900">{"{{confirmation.detailHeading}}"}</p>
        <p className="mt-3 text-sm leading-7 text-slate-600">{"{{confirmation.detailBody}}"}</p>
      </StencilCard>
    </StencilSectionShell>
  );
}
