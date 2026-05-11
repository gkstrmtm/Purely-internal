import { StencilCard, StencilSectionShell } from "../../_shared/primitives";

function TestimonialCard({
  quote,
  name,
  role,
}: {
  quote: string;
  name: string;
  role: string;
}) {
  return (
    <StencilCard>
      <p className="text-sm leading-7 text-slate-700">{quote}</p>
      <div className="mt-4">
        <p className="text-sm font-semibold text-slate-900">{name}</p>
        <p className="text-sm text-slate-500">{role}</p>
      </div>
    </StencilCard>
  );
}

export function TestimonialGrid() {
  return (
    <StencilSectionShell
      eyebrow="{{testimonials.eyebrow}}"
      title="{{testimonials.heading}}"
      description="{{testimonials.description}}"
    >
      <div className="grid gap-4 md:grid-cols-3">
        <TestimonialCard
          quote="{{testimonials.items[0].quote}}"
          name="{{testimonials.items[0].name}}"
          role="{{testimonials.items[0].role}}"
        />
        <TestimonialCard
          quote="{{testimonials.items[1].quote}}"
          name="{{testimonials.items[1].name}}"
          role="{{testimonials.items[1].role}}"
        />
        <TestimonialCard
          quote="{{testimonials.items[2].quote}}"
          name="{{testimonials.items[2].name}}"
          role="{{testimonials.items[2].role}}"
        />
      </div>
    </StencilSectionShell>
  );
}
