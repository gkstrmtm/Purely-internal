import { StencilCard, StencilContainer } from "../../_shared/primitives";

export function ProofStrip() {
  return (
    <section className="py-8">
      <StencilContainer>
        <div className="grid gap-4 md:grid-cols-3">
          <StencilCard>
            <p className="text-sm font-semibold text-slate-900">{"{{proof.items[0].label}}"}</p>
            <p className="mt-2 text-sm text-slate-600">{"{{proof.items[0].detail}}"}</p>
          </StencilCard>
          <StencilCard>
            <p className="text-sm font-semibold text-slate-900">{"{{proof.items[1].label}}"}</p>
            <p className="mt-2 text-sm text-slate-600">{"{{proof.items[1].detail}}"}</p>
          </StencilCard>
          <StencilCard>
            <p className="text-sm font-semibold text-slate-900">{"{{proof.items[2].label}}"}</p>
            <p className="mt-2 text-sm text-slate-600">{"{{proof.items[2].detail}}"}</p>
          </StencilCard>
        </div>
      </StencilContainer>
    </section>
  );
}
