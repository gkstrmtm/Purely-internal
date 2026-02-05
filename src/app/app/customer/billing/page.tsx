import { redirect } from "next/navigation";

export default function LegacyCustomerBillingRedirect() {
  redirect("/portal/app/billing");
}
