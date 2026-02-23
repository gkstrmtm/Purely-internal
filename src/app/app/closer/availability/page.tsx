"use client";

import AvailabilityCalendar from "@/components/AvailabilityCalendar";

export default function AvailabilityPage() {
  return (
    <AvailabilityCalendar
      title="Availability"
      description="Add blocks when you’re available to take meetings. Dialers will auto-assign you when a slot fits."
      backHref="/app/closer/appointments"
      backLabel="Upcoming meetings"
    />
  );
}
