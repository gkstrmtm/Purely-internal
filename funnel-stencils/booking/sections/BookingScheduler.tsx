import { PatternBookingScheduler } from "../../_shared/sectionPatterns";

export function BookingScheduler() {
  return (
    <PatternBookingScheduler
      eyebrow="{{booking.scheduler.eyebrow}}"
      title="{{booking.scheduler.heading}}"
      description="{{booking.scheduler.description}}"
      slots={[
        { title: "{{booking.scheduler.slots[0].title}}", description: "{{booking.scheduler.slots[0].description}}" },
        { title: "{{booking.scheduler.slots[1].title}}", description: "{{booking.scheduler.slots[1].description}}" },
        { title: "{{booking.scheduler.slots[2].title}}", description: "{{booking.scheduler.slots[2].description}}" },
      ]}
    />
  );
}
