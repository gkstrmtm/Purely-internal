export type FollowUpStepKind = "SMS" | "EMAIL";

export type FollowUpTemplate = {
  id: string;
  title: string;
  description: string;
  steps: Array<{ kind: FollowUpStepKind; delayMinutes: number; subject?: string; body: string }>;
};

export const FOLLOW_UP_TEMPLATES: FollowUpTemplate[] = [
  {
    id: "post-visit-thankyou",
    title: "Thank you + quick check-in (3 steps)",
    description: "Day 0 thank you, day 2 check-in, day 7 final nudge.",
    steps: [
      {
        kind: "SMS",
        delayMinutes: 0,
        body: "Hey {contact.firstName} — thanks again for coming in. If anything comes up, just reply here. - {business.name}",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 2,
        subject: "Quick check-in",
        body:
          "Hi {contact.firstName},\n\nJust checking in after your appointment. How did everything go?\n\nIf you have any questions, reply here and we’ll help.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 7,
        body: "Quick check-in {contact.firstName} — any questions after your appointment? - {business.name}",
      },
    ],
  },
  {
    id: "review-request",
    title: "Review request (2 steps)",
    description: "Ask for a review after a good experience.",
    steps: [
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24,
        subject: "How did we do?",
        body:
          "Hi {contact.firstName},\n\nIf you have 30 seconds, would you mind leaving a quick review? It really helps our small business.\n\nThank you,\n{business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 3,
        body: "{contact.firstName}, quick favor — would you mind leaving a short review? It helps a ton. - {business.name}",
      },
    ],
  },
  {
    id: "no-show-reschedule",
    title: "No-show reschedule (3 steps)",
    description: "Polite sequence to reschedule when they miss the appointment.",
    steps: [
      {
        kind: "SMS",
        delayMinutes: 0,
        body: "Hey {contact.firstName} — we missed you today. Want to reschedule? Reply with a good time. - {business.name}",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24,
        subject: "Reschedule your appointment",
        body:
          "Hi {contact.firstName},\n\nWe missed you today — no worries. If you’d like to reschedule, reply with two times that work and we’ll confirm.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 3,
        body: "Quick check-in {contact.firstName} — still want to reschedule, or should we close this out? - {business.name}",
      },
    ],
  },
  {
    id: "next-steps-upsell",
    title: "Next steps / continue service (3 steps)",
    description: "Keeps momentum: next appointment or next service.",
    steps: [
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24,
        subject: "Next steps",
        body:
          "Hi {contact.firstName},\n\nThanks again for coming in. If you want, we can book the next step now so you’re taken care of.\n\nReply with what you’d like to do next and we’ll get it scheduled.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 3,
        body: "Hey {contact.firstName} — want to book your next step? Reply here and we’ll get you scheduled. - {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 7,
        body: "Last check-in {contact.firstName} — want help booking the next step, or should we pause? - {business.name}",
      },
    ],
  },
];
