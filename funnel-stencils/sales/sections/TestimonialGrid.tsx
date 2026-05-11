import { PatternTestimonialGrid } from "../../_shared/sectionPatterns";

export function TestimonialGrid() {
  return (
    <PatternTestimonialGrid
      eyebrow="{{sales.testimonials.eyebrow}}"
      title="{{sales.testimonials.heading}}"
      description="{{sales.testimonials.description}}"
      items={[
        {
          quote: "{{sales.testimonials.items[0].quote}}",
          name: "{{sales.testimonials.items[0].name}}",
          role: "{{sales.testimonials.items[0].role}}",
        },
        {
          quote: "{{sales.testimonials.items[1].quote}}",
          name: "{{sales.testimonials.items[1].name}}",
          role: "{{sales.testimonials.items[1].role}}",
        },
        {
          quote: "{{sales.testimonials.items[2].quote}}",
          name: "{{sales.testimonials.items[2].name}}",
          role: "{{sales.testimonials.items[2].role}}",
        },
      ]}
    />
  );
}
