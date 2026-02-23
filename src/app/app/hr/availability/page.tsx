"use client";

import AvailabilityCalendar from "@/components/AvailabilityCalendar";

export default function HrAvailabilityPage() {
  return (
    <AvailabilityCalendar
      title="Interviewer availability"
      description="Pick the blocks when you’re available to interview candidates (Connect interviews)."
      backHref="/app/hr/interviews"
      backLabel="Upcoming interviews"
    />
  );
}
