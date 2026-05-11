import {
  StencilBulletList,
  StencilCard,
  StencilContainer,
  StencilPlaceholderButton,
  StencilSectionShell,
} from "./primitives";

type ProofItem = {
  label: string;
  detail: string;
};

type ListColumn = {
  title: string;
  items: string[];
};

type GridItem = {
  title: string;
  description: string;
};

type TestimonialItem = {
  quote: string;
  name: string;
  role: string;
};

type FAQItem = {
  question: string;
  answer: string;
};

type Plan = {
  name: string;
  price: string;
  description: string;
  ctaLabel: string;
  features: string[];
};

type Speaker = {
  name: string;
  role: string;
  detail: string;
};

type AgendaItem = {
  label: string;
  detail: string;
};

type Field = {
  label: string;
  placeholder: string;
};

function FieldRow({ label, placeholder }: Field) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-800">{label}</span>
      <div className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-400">
        {placeholder}
      </div>
    </label>
  );
}

export function PatternHero(props: {
  eyebrow: string;
  title: string;
  description: string;
  primaryCta: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
}) {
  return (
    <StencilSectionShell align="center" pad="lg" eyebrow={props.eyebrow} title={props.title} description={props.description}>
      <div className="flex flex-wrap justify-center gap-3">
        <StencilPlaceholderButton label={props.primaryCta.label} href={props.primaryCta.href} />
        {props.secondaryCta ? (
          <StencilPlaceholderButton
            label={props.secondaryCta.label}
            href={props.secondaryCta.href}
            variant="secondary"
          />
        ) : null}
      </div>
    </StencilSectionShell>
  );
}

export function PatternProofStrip({ items }: { items: ProofItem[] }) {
  return (
    <section className="py-8">
      <StencilContainer>
        <div className="grid gap-4 md:grid-cols-3">
          {items.map((item) => (
            <StencilCard key={item.label}>
              <p className="text-sm font-semibold text-slate-900">{item.label}</p>
              <p className="mt-2 text-sm text-slate-600">{item.detail}</p>
            </StencilCard>
          ))}
        </div>
      </StencilContainer>
    </section>
  );
}

export function PatternBenefitsSplit(props: {
  eyebrow: string;
  title: string;
  description: string;
  columns: ListColumn[];
}) {
  return (
    <StencilSectionShell eyebrow={props.eyebrow} title={props.title} description={props.description}>
      <div className="grid gap-4 md:grid-cols-2">
        {props.columns.map((column) => (
          <StencilCard key={column.title}>
            <p className="mb-4 text-sm font-semibold text-slate-900">{column.title}</p>
            <StencilBulletList items={column.items} />
          </StencilCard>
        ))}
      </div>
    </StencilSectionShell>
  );
}

export function PatternFeatureGrid(props: {
  eyebrow: string;
  title: string;
  description: string;
  items: GridItem[];
}) {
  return (
    <StencilSectionShell eyebrow={props.eyebrow} title={props.title} description={props.description}>
      <div className="grid gap-4 md:grid-cols-3">
        {props.items.map((item) => (
          <StencilCard key={item.title}>
            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
            <p className="mt-3 text-sm leading-7 text-slate-600">{item.description}</p>
          </StencilCard>
        ))}
      </div>
    </StencilSectionShell>
  );
}

export function PatternTestimonialGrid(props: {
  eyebrow: string;
  title: string;
  description: string;
  items: TestimonialItem[];
}) {
  return (
    <StencilSectionShell eyebrow={props.eyebrow} title={props.title} description={props.description}>
      <div className="grid gap-4 md:grid-cols-3">
        {props.items.map((item) => (
          <StencilCard key={item.name}>
            <p className="text-sm leading-7 text-slate-700">{item.quote}</p>
            <div className="mt-4">
              <p className="text-sm font-semibold text-slate-900">{item.name}</p>
              <p className="text-sm text-slate-500">{item.role}</p>
            </div>
          </StencilCard>
        ))}
      </div>
    </StencilSectionShell>
  );
}

export function PatternFAQSection(props: {
  eyebrow: string;
  title: string;
  description: string;
  items: FAQItem[];
}) {
  return (
    <StencilSectionShell eyebrow={props.eyebrow} title={props.title} description={props.description}>
      <div className="grid gap-4 md:grid-cols-2">
        {props.items.map((item) => (
          <StencilCard key={item.question}>
            <p className="text-sm font-semibold text-slate-900">{item.question}</p>
            <p className="mt-3 text-sm leading-7 text-slate-600">{item.answer}</p>
          </StencilCard>
        ))}
      </div>
    </StencilSectionShell>
  );
}

export function PatternCTASection(props: {
  eyebrow: string;
  title: string;
  description: string;
  label: string;
  href: string;
}) {
  return (
    <StencilSectionShell align="center" eyebrow={props.eyebrow} title={props.title} description={props.description}>
      <div className="flex justify-center">
        <StencilPlaceholderButton label={props.label} href={props.href} />
      </div>
    </StencilSectionShell>
  );
}

export function PatternGuaranteeSection(props: {
  eyebrow: string;
  title: string;
  description: string;
  detail: string;
}) {
  return (
    <StencilSectionShell eyebrow={props.eyebrow} title={props.title} description={props.description}>
      <StencilCard className="max-w-3xl">
        <p className="text-sm leading-7 text-slate-700">{props.detail}</p>
      </StencilCard>
    </StencilSectionShell>
  );
}

export function PatternPricingTable(props: {
  eyebrow: string;
  title: string;
  description: string;
  plans: Plan[];
}) {
  return (
    <StencilSectionShell eyebrow={props.eyebrow} title={props.title} description={props.description}>
      <div className="grid gap-4 lg:grid-cols-3">
        {props.plans.map((plan) => (
          <StencilCard key={plan.name} className="flex h-full flex-col gap-5">
            <div>
              <p className="text-sm font-semibold text-slate-900">{plan.name}</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{plan.price}</p>
              <p className="mt-3 text-sm leading-7 text-slate-600">{plan.description}</p>
            </div>
            <StencilBulletList items={plan.features} />
            <div className="mt-auto">
              <StencilPlaceholderButton label={plan.ctaLabel} href="#" variant="secondary" />
            </div>
          </StencilCard>
        ))}
      </div>
    </StencilSectionShell>
  );
}

export function PatternCheckoutPanel(props: {
  eyebrow: string;
  title: string;
  description: string;
  fields: Field[];
  summaryLabel: string;
  summaryDetail: string;
  ctaLabel: string;
}) {
  return (
    <StencilSectionShell eyebrow={props.eyebrow} title={props.title} description={props.description}>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <StencilCard>
          <div className="grid gap-4 md:grid-cols-2">
            {props.fields.map((field) => (
              <FieldRow key={field.label} label={field.label} placeholder={field.placeholder} />
            ))}
          </div>
          <div className="mt-6">
            <StencilPlaceholderButton label={props.ctaLabel} href="#" />
          </div>
        </StencilCard>
        <StencilCard>
          <p className="text-sm font-semibold text-slate-900">{props.summaryLabel}</p>
          <p className="mt-3 text-sm leading-7 text-slate-600">{props.summaryDetail}</p>
        </StencilCard>
      </div>
    </StencilSectionShell>
  );
}

export function PatternConfirmationPanel(props: {
  eyebrow: string;
  title: string;
  description: string;
  detailHeading: string;
  detailBody: string;
}) {
  return (
    <StencilSectionShell align="center" pad="lg" eyebrow={props.eyebrow} title={props.title} description={props.description}>
      <StencilCard className="mx-auto max-w-2xl text-left">
        <p className="text-sm font-semibold text-slate-900">{props.detailHeading}</p>
        <p className="mt-3 text-sm leading-7 text-slate-600">{props.detailBody}</p>
      </StencilCard>
    </StencilSectionShell>
  );
}

export function PatternNextStepPanel(props: {
  eyebrow: string;
  title: string;
  description: string;
  primaryLabel: string;
  primaryDetail: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <StencilSectionShell eyebrow={props.eyebrow} title={props.title} description={props.description}>
      <StencilCard className="max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">{props.primaryLabel}</p>
            <p className="mt-2 text-sm leading-7 text-slate-600">{props.primaryDetail}</p>
          </div>
          <StencilPlaceholderButton label={props.ctaLabel} href={props.ctaHref} variant="secondary" />
        </div>
      </StencilCard>
    </StencilSectionShell>
  );
}

export function PatternBookingScheduler(props: {
  eyebrow: string;
  title: string;
  description: string;
  slots: GridItem[];
}) {
  return (
    <StencilSectionShell eyebrow={props.eyebrow} title={props.title} description={props.description}>
      <div className="grid gap-4 md:grid-cols-3">
        {props.slots.map((slot) => (
          <StencilCard key={slot.title}>
            <p className="text-sm font-semibold text-slate-900">{slot.title}</p>
            <p className="mt-3 text-sm leading-7 text-slate-600">{slot.description}</p>
          </StencilCard>
        ))}
      </div>
    </StencilSectionShell>
  );
}

export function PatternSpeakerStrip(props: {
  eyebrow: string;
  title: string;
  description: string;
  speakers: Speaker[];
}) {
  return (
    <StencilSectionShell eyebrow={props.eyebrow} title={props.title} description={props.description}>
      <div className="grid gap-4 md:grid-cols-3">
        {props.speakers.map((speaker) => (
          <StencilCard key={speaker.name}>
            <p className="text-sm font-semibold text-slate-900">{speaker.name}</p>
            <p className="mt-1 text-sm text-slate-500">{speaker.role}</p>
            <p className="mt-3 text-sm leading-7 text-slate-600">{speaker.detail}</p>
          </StencilCard>
        ))}
      </div>
    </StencilSectionShell>
  );
}

export function PatternWebinarAgenda(props: {
  eyebrow: string;
  title: string;
  description: string;
  items: AgendaItem[];
}) {
  return (
    <StencilSectionShell eyebrow={props.eyebrow} title={props.title} description={props.description}>
      <div className="grid gap-4">
        {props.items.map((item) => (
          <StencilCard key={item.label}>
            <p className="text-sm font-semibold text-slate-900">{item.label}</p>
            <p className="mt-3 text-sm leading-7 text-slate-600">{item.detail}</p>
          </StencilCard>
        ))}
      </div>
    </StencilSectionShell>
  );
}

export function PatternFormSection(props: {
  eyebrow: string;
  title: string;
  description: string;
  fields: Field[];
  supportingText: string;
  ctaLabel: string;
}) {
  return (
    <StencilSectionShell eyebrow={props.eyebrow} title={props.title} description={props.description}>
      <StencilCard className="max-w-3xl">
        <div className="grid gap-4 md:grid-cols-2">
          {props.fields.map((field) => (
            <FieldRow key={field.label} label={field.label} placeholder={field.placeholder} />
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">{props.supportingText}</p>
          <StencilPlaceholderButton label={props.ctaLabel} href="#" />
        </div>
      </StencilCard>
    </StencilSectionShell>
  );
}

export function PatternCountdownOffer(props: {
  eyebrow: string;
  title: string;
  description: string;
  timerLabel: string;
  urgencyNote: string;
  ctaLabel: string;
}) {
  return (
    <StencilSectionShell align="center" eyebrow={props.eyebrow} title={props.title} description={props.description}>
      <StencilCard className="mx-auto max-w-2xl">
        <p className="text-3xl font-semibold tracking-tight text-slate-900">{props.timerLabel}</p>
        <p className="mt-3 text-sm leading-7 text-slate-600">{props.urgencyNote}</p>
        <div className="mt-5 flex justify-center">
          <StencilPlaceholderButton label={props.ctaLabel} href="#" />
        </div>
      </StencilCard>
    </StencilSectionShell>
  );
}
