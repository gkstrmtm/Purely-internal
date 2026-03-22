export type FollowUpStepKind = "SMS" | "EMAIL" | "TAG";

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
        body: "Hey {contact.firstName}, thanks again for coming in. If anything comes up, just reply here. - {business.name}",
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
        body: "Quick check-in {contact.firstName}: any questions after your appointment? - {business.name}",
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
        body: "{contact.firstName}, quick favor: would you mind leaving a short review? It helps a ton. - {business.name}",
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
        body: "Hey {contact.firstName}, we missed you today. Want to reschedule? Reply with a good time. - {business.name}",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24,
        subject: "Reschedule your appointment",
        body:
          "Hi {contact.firstName},\n\nWe missed you today. No worries. If you’d like to reschedule, reply with two times that work and we’ll confirm.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 3,
        body: "Quick check-in {contact.firstName}: still want to reschedule, or should we close this out? - {business.name}",
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
        body: "Hey {contact.firstName}, want to book your next step? Reply here and we’ll get you scheduled. - {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 7,
        body: "Last check-in {contact.firstName}: want help booking the next step, or should we pause? - {business.name}",
      },
    ],
  },
  {
    id: "post-visit-care-instructions",
    title: "Care instructions + check-in (2 steps)",
    description: "Send any after-care / next steps right away, then check in the next day.",
    steps: [
      {
        kind: "EMAIL",
        delayMinutes: 60,
        subject: "Your next steps",
        body:
          "Hi {contact.firstName},\n\nThanks again for coming in today. Here are your next steps:\n\n- (Add instructions here)\n- (Add what to expect)\n\nIf you have any questions, just reply to this email.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24,
        body: "Hey {contact.firstName}, quick check-in after yesterday. How are things going? Reply here if you need anything. - {business.name}",
      },
    ],
  },
  {
    id: "rebook-reminder",
    title: "Rebook reminder (2 steps)",
    description: "Nudge them to book the next appointment in 2-3 weeks.",
    steps: [
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 14,
        subject: "Ready to book your next appointment?",
        body:
          "Hi {contact.firstName},\n\nJust a quick reminder: if you’d like to stay on track, now is a great time to book your next appointment.\n\nReply with a day/time that works and we’ll get you scheduled.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 18,
        body: "Hey {contact.firstName}, want to get your next appointment on the calendar? Reply with a good day/time. - {business.name}",
      },
    ],
  },
  {
    id: "referral-ask",
    title: "Referral ask (2 steps)",
    description: "Ask for a referral while the experience is fresh.",
    steps: [
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 2,
        subject: "Quick favor",
        body:
          "Hi {contact.firstName},\n\nIf you were happy with your experience, would you be open to referring a friend or family member?\n\nIf you reply with their name + best contact info, we’ll take great care of them.\n\nThank you,\n{business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 5,
        body: "{contact.firstName}, quick favor: know anyone else who could use our help? Reply with their name and I’ll reach out. - {business.name}",
      },
    ],
  },
  {
    id: "winback-30-days",
    title: "Winback after 30 days (3 steps)",
    description: "Re-engage past clients with a gentle check-in over a week.",
    steps: [
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 30,
        body: "Hey {contact.firstName}, it’s been a bit. Want to get back on the schedule? Reply here and I’ll help. - {business.name}",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 33,
        subject: "Checking in",
        body:
          "Hi {contact.firstName},\n\nJust checking in: if you’d like to book again, reply with what you’re looking for and we’ll get you taken care of.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 37,
        body: "Last check-in {contact.firstName}: should I keep a spot open for you this week, or circle back later? - {business.name}",
      },
    ],
  },
];
