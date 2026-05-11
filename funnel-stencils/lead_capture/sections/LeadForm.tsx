import {
  StencilCard,
  StencilPlaceholderButton,
  StencilSectionShell,
} from "../../_shared/primitives";

function FieldRow({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-800">{label}</span>
      <div className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-400">
        {placeholder}
      </div>
    </label>
  );
}

export function LeadForm() {
  return (
    <StencilSectionShell
      id="lead-form"
      eyebrow="{{form.eyebrow}}"
      title="{{form.heading}}"
      description="{{form.description}}"
    >
      <StencilCard className="max-w-3xl">
        <div className="grid gap-4 md:grid-cols-2">
          <FieldRow label="{{form.fields[0].label}}" placeholder="{{form.fields[0].placeholder}}" />
          <FieldRow label="{{form.fields[1].label}}" placeholder="{{form.fields[1].placeholder}}" />
          <FieldRow label="{{form.fields[2].label}}" placeholder="{{form.fields[2].placeholder}}" />
          <FieldRow label="{{form.fields[3].label}}" placeholder="{{form.fields[3].placeholder}}" />
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">{"{{form.supportingText}}"}</p>
          <StencilPlaceholderButton label="{{form.submitLabel}}" href="{{form.submitHref}}" />
        </div>
      </StencilCard>
    </StencilSectionShell>
  );
}
