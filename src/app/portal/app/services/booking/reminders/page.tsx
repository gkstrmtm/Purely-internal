import { redirect } from "next/navigation";

export default function PortalBookingRemindersSlugPage() {
  redirect("/portal/app/services/booking?tab=reminders");
}
