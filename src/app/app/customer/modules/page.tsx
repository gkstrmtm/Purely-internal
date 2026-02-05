import { redirect } from "next/navigation";

export default function LegacyCustomerModulesRedirect() {
  redirect("/portal/app/services");
}
