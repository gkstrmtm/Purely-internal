import { StencilPageShell } from "../../_shared/primitives";
import { BookingScheduler } from "../sections/BookingScheduler";
import { FAQSection } from "../sections/FAQSection";
import { GuaranteeSection } from "../sections/GuaranteeSection";

export function BookingPage() {
  return (
    <StencilPageShell>
      <BookingScheduler />
      <FAQSection />
      <GuaranteeSection />
    </StencilPageShell>
  );
}
