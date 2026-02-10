import { redirect } from "next/navigation";

export default function PortalBookingSettingsSlugPage() {
  redirect("/portal/app/services/booking?tab=settings");
}
