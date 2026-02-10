import { redirect } from "next/navigation";

export default function PortalBookingAppointmentsSlugPage() {
  redirect("/portal/app/services/booking?tab=appointments");
}
