import { redirect } from "next/navigation";

export default function PortalBookingFollowUpSlugPage() {
  redirect("/portal/app/services/booking?tab=follow-up");
}
