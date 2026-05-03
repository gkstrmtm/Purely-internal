import { StencilPageShell } from "../../_shared/primitives";
import { ConfirmationPanel } from "../sections/ConfirmationPanel";
import { NextStepPanel } from "../sections/NextStepPanel";

export function ThankYouPage() {
  return (
    <StencilPageShell>
      <ConfirmationPanel />
      <NextStepPanel />
    </StencilPageShell>
  );
}
