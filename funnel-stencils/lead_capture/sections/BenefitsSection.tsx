import {
  StencilBulletList,
  StencilCard,
  StencilSectionShell,
} from "../../_shared/primitives";

export function BenefitsSection() {
  return (
    <StencilSectionShell
      eyebrow="{{benefits.eyebrow}}"
      title="{{benefits.heading}}"
      description="{{benefits.description}}"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <StencilCard>
          <p className="mb-4 text-sm font-semibold text-slate-900">{"{{benefits.columns[0].title}}"}</p>
          <StencilBulletList
            items={[
              "{{benefits.columns[0].items[0]}}",
              "{{benefits.columns[0].items[1]}}",
              "{{benefits.columns[0].items[2]}}",
            ]}
          />
        </StencilCard>
        <StencilCard>
          <p className="mb-4 text-sm font-semibold text-slate-900">{"{{benefits.columns[1].title}}"}</p>
          <StencilBulletList
            items={[
              "{{benefits.columns[1].items[0]}}",
              "{{benefits.columns[1].items[1]}}",
              "{{benefits.columns[1].items[2]}}",
            ]}
          />
        </StencilCard>
      </div>
    </StencilSectionShell>
  );
}
