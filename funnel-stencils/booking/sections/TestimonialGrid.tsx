import { PatternTestimonialGrid } from "../../_shared/sectionPatterns";

export function TestimonialGrid() {
  return (
    <PatternTestimonialGrid
      eyebrow="{{booking.testimonials.eyebrow}}"
      title="{{booking.testimonials.heading}}"
      description="{{booking.testimonials.description}}"
      items={[
        {
          quote: "{{booking.testimonials.items[0].quote}}",
          name: "{{booking.testimonials.items[0].name}}",
          role: "{{booking.testimonials.items[0].role}}",
        },
        {
          quote: "{{booking.testimonials.items[1].quote}}",
          name: "{{booking.testimonials.items[1].name}}",
          role: "{{booking.testimonials.items[1].role}}",
        },
        {
          quote: "{{booking.testimonials.items[2].quote}}",
          name: "{{booking.testimonials.items[2].name}}",
          role: "{{booking.testimonials.items[2].role}}",
        },
      ]}
    />
  );
}
