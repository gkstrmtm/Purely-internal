export type StepKind = "SMS" | "EMAIL" | "TAG";

export type NurtureTemplate = {
  id: string;
  title: string;
  description: string;
  steps: Array<{ kind: StepKind; delayMinutes: number; subject?: string; body: string }>;
};

export const NURTURE_TEMPLATES: NurtureTemplate[] = [
  {
    id: "quick-checkin",
    title: "Quick check-in (3 steps)",
    description: "Short follow-up sequence: day 0, day 2, day 5.",
    steps: [
      {
        kind: "SMS",
        delayMinutes: 0,
        body: "Hey {contact.firstName}, quick question. Want help getting this set up? - {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 2,
        body: "Just bumping this, {contact.firstName}. Should I send details or hop on a quick call?",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 5,
        subject: "Quick question",
        body: "Hi {contact.name},\n\nJust checking in. Do you want help getting this set up?\n\nIf it’s easier, reply with the best time today/tomorrow.\n\n- {business.name}",
      },
    ],
  },
  {
    id: "welcome-onboarding",
    title: "Welcome + onboarding (5 steps)",
    description: "Welcomes the lead, sets expectations, and nudges to reply.",
    steps: [
      {
        kind: "EMAIL",
        delayMinutes: 0,
        subject: "Welcome: next steps",
        body: "Hi {contact.firstName},\n\nWelcome! Excited to help. Here’s what happens next:\n\n1) We confirm your goals\n2) We set up the workflow\n3) You get results and reporting\n\nReply with your top priority and we’ll start there.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 6,
        body: "Hey {contact.firstName}, I emailed next steps. What’s your #1 goal right now?",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24,
        body: "Quick ping {contact.firstName}, want me to set this up for you this week?",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 3,
        subject: "Should I close this out?",
        body: "Hi {contact.firstName},\n\nTotally fine if now isn’t the right time. Should I close this out for now?\n\nIf you still want help, reply with ‘yes’ and I’ll send 2-3 quick questions.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 7,
        body: "Last one from me, {contact.firstName}. Still want help with this or should I close it out?",
      },
    ],
  },
  {
    id: "appointment-push",
    title: "Book an appointment (4 steps)",
    description: "Drives toward scheduling a quick call.",
    steps: [
      {
        kind: "SMS",
        delayMinutes: 0,
        body: "Hey {contact.firstName}, want to book 10 minutes so I can set this up for you?",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24,
        subject: "10 minutes this week?",
        body: "Hi {contact.firstName},\n\nDo you have 10 minutes this week for a quick setup call?\n\nReply with two times that work and I’ll confirm.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 2,
        body: "What’s better: today or tomorrow? I can make time, {contact.firstName}.",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 5,
        body: "Still want to book a quick call, {contact.firstName}, or should I pause?",
      },
    ],
  },
  {
    id: "email-only",
    title: "Email follow-ups only (3 steps)",
    description: "Simple email-only cadence.",
    steps: [
      {
        kind: "EMAIL",
        delayMinutes: 0,
        subject: "Quick question",
        body: "Hi {contact.firstName},\n\nQuick question: what are you trying to accomplish right now?\n\n- {business.name}",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 2,
        subject: "Bumping this",
        body: "Hi {contact.firstName},\n\nJust bumping this. Do you want help getting this set up?\n\n- {business.name}",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 7,
        subject: "Close the loop?",
        body: "Hi {contact.firstName},\n\nShould I close this out for now? If you still want help, reply with ‘yes’.\n\n- {business.name}",
      },
    ],
  },
  {
    id: "reactivation",
    title: "Reactivation (4 steps)",
    description: "For older leads that went quiet.",
    steps: [
      {
        kind: "SMS",
        delayMinutes: 0,
        body: "Hey {contact.firstName}, circling back. Still want help with this?",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24,
        subject: "Still want help?",
        body: "Hi {contact.firstName},\n\nJust checking in. Do you still want help getting this set up?\n\nIf not, no worries. Just reply ‘stop’.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 3,
        body: "Last check-in, {contact.firstName}. Want me to help or should I close it out?",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 10,
        body: "Closing the loop. If you want help later, just reply here anytime.",
      },
    ],
  },
  {
    id: "quote-followup",
    title: "Quote follow-up (4 steps)",
    description: "Nudges after sending pricing or an estimate.",
    steps: [
      {
        kind: "SMS",
        delayMinutes: 0,
        body: "Hey {contact.firstName}, I just sent pricing. Want me to walk you through it real quick? - {business.name}",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24,
        subject: "Any questions on the quote?",
        body: "Hi {contact.firstName},\n\nQuick check-in - did you have any questions on the quote?\n\nIf you tell me what matters most (speed, budget, quality), I can recommend the best option.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 2,
        body: "Just bumping this, {contact.firstName}. Should I keep this open or pause it for now?",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 5,
        subject: "Should I close this out?",
        body: "Hi {contact.firstName},\n\nTotally fine if timing is not right. Should I close this out for now?\n\nIf you still want to move forward, reply with your ideal start date and I will confirm next steps.\n\n- {business.name}",
      },
    ],
  },
  {
    id: "no-show-reschedule",
    title: "No-show reschedule (3 steps)",
    description: "Polite sequence to reschedule when they miss an appointment.",
    steps: [
      {
        kind: "SMS",
        delayMinutes: 0,
        body: "Hey {contact.firstName}, we missed you today. Want to reschedule? Reply with a good time. - {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24,
        body: "Quick ping {contact.firstName} - still want to reschedule, or should I close this out?",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 3,
        subject: "Reschedule your appointment",
        body: "Hi {contact.firstName},\n\nJust following up to help you reschedule. Reply with two times that work and I will confirm.\n\n- {business.name}",
      },
    ],
  },
  {
    id: "referral-ask",
    title: "Referral ask (3 steps)",
    description: "Ask happy customers for a referral in a simple, low-pressure way.",
    steps: [
      {
        kind: "EMAIL",
        delayMinutes: 0,
        subject: "Quick favor?",
        body: "Hi {contact.firstName},\n\nQuick favor - if you know anyone who could use help with this, would you introduce us?\n\nEven a name and number is perfect, and I will take great care of them.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24,
        body: "Hey {contact.firstName}, quick favor - know anyone who could use help with this? Happy to take great care of them.",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 4,
        body: "Last one from me, {contact.firstName}. If someone comes to mind later, just reply here anytime.",
      },
    ],
  },
  {
    id: "lead-warming-7",
    title: "Lead warming (7 steps)",
    description: "A longer SMS + email sequence that warms the lead up over ~2 weeks.",
    steps: [
      {
        kind: "EMAIL",
        delayMinutes: 0,
        subject: "Quick intro + next steps",
        body: "Hi {contact.firstName},\n\nThanks for reaching out. Happy to help.\n\nWhat outcome are you aiming for this month? If you reply with 1 sentence, I’ll recommend the best next step.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 6,
        body: "Hey {contact.firstName}, quick question: what are you trying to accomplish right now?",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24,
        body: "If I could help with just one thing this week, what would it be?",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 2,
        subject: "Two quick options",
        body: "Hi {contact.firstName},\n\nIf it helps, here are two common paths:\n\nA) Fast setup (quick win this week)\nB) Full workflow (best long-term)\n\nWhich one sounds closer to what you want?\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 2,
        body: "Want me to send a 60-second walkthrough for option A vs B?",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 3,
        subject: "Should I keep this open?",
        body: "Hi {contact.firstName},\n\nTotally fine if timing isn’t right. Should I keep this open for you, or pause for now?\n\nReply with ‘pause’ and I’ll stop following up.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 4,
        body: "Last check-in from me, {contact.firstName}. Want help moving forward or should I pause this?",
      },
    ],
  },
  {
    id: "booking-push-10",
    title: "Book the call (10 steps)",
    description: "More persistent booking cadence: mixes value + clear next step (book 10 minutes).",
    steps: [
      {
        kind: "SMS",
        delayMinutes: 0,
        body: "Hey {contact.firstName}, want to book 10 minutes so I can get this set up for you?",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 12,
        subject: "10 minutes to get you set up",
        body: "Hi {contact.firstName},\n\nIf you’re open to it, let’s do a quick 10-minute call so I can set this up for you.\n\nReply with two times that work today/tomorrow.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24,
        body: "What’s better: today or tomorrow? I can make time.",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 2,
        subject: "Before we meet (2 questions)",
        body: "Hi {contact.firstName},\n\nIf we do a quick call, I’ll come prepared. Two questions:\n\n1) What’s the goal?\n2) What’s the deadline?\n\nReply here and I’ll tailor the setup.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 2,
        body: "If a call is annoying, no worries; want me to just send the fastest path in 2-3 bullets?",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 3,
        subject: "Common question",
        body: "Hi {contact.firstName},\n\nMost people ask: ‘How long does setup take?’\n\nUsually we can get a first version running same week, then improve from there.\n\nWant to do the quick 10 minutes?\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 4,
        body: "Still want to get this done, {contact.firstName}?",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 5,
        subject: "Should I close this out?",
        body: "Hi {contact.firstName},\n\nShould I close this out for now? If you still want help, reply with ‘yes’ and I’ll send the next step.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 7,
        body: "Closing the loop: if you want help later, just reply here anytime.",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 14,
        subject: "Last note",
        body: "Hi {contact.firstName},\n\nLast note from me. If you want to revisit this later, hit reply and I’ll jump back in.\n\n- {business.name}",
      },
    ],
  },
  {
    id: "winback-12",
    title: "Win-back / reactivation (12 steps)",
    description: "A longer win-back sequence for older leads over ~45 days.",
    steps: [
      {
        kind: "SMS",
        delayMinutes: 0,
        body: "Hey {contact.firstName}, should I keep this open, or is it not a priority right now?",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24,
        subject: "Still want help?",
        body: "Hi {contact.firstName},\n\nJust checking in: do you still want help with this?\n\nIf not, no worries at all. Reply ‘pause’ and I’ll stop.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 2,
        body: "If you reply with your #1 goal, I’ll send the fastest path.",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 3,
        subject: "One idea for you",
        body: "Hi {contact.firstName},\n\nOne quick idea: we can start with a small quick-win and expand from there.\n\nWant me to outline it in 3 bullets?\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 4,
        body: "Would a 10-minute call be helpful, or do you prefer async?",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 7,
        subject: "Close this out?",
        body: "Hi {contact.firstName},\n\nShould I close this out for now? If you still want help, reply ‘yes’ and I’ll jump in.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 7,
        body: "Last check-in: want me to help, or should I pause?",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 10,
        subject: "Still here if you want this",
        body: "Hi {contact.firstName},\n\nStill here if you want this handled. Reply with a deadline and I’ll propose the simplest plan.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 10,
        body: "If you want to revisit later, just reply with ‘later’ and I’ll check back next month.",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 14,
        subject: "Checking one last time",
        body: "Hi {contact.firstName},\n\nChecking one last time: should I close this out?\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 14,
        body: "Closing this out. If you want help later, just reply here anytime.",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 7,
        subject: "Always happy to help",
        body: "Hi {contact.firstName},\n\nAlways happy to help when timing is better. If you reply in the future, this thread comes right back to me.\n\n- {business.name}",
      },
    ],
  },
  {
    id: "education-drip-15",
    title: "Education drip (15 steps)",
    description: "A longer, gentle education drip with weekly emails + occasional SMS check-ins.",
    steps: [
      {
        kind: "EMAIL",
        delayMinutes: 0,
        subject: "Getting started",
        body: "Hi {contact.firstName},\n\nQuick note to get you started: what’s the main thing you want to improve first?\n\nReply with one sentence and I’ll tailor recommendations.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24,
        body: "Hey {contact.firstName}, did you see my email? What’s your top goal right now?",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 2,
        subject: "Quick win idea",
        body: "Hi {contact.firstName},\n\nQuick win idea: start with one simple automation that saves time immediately.\n\nWant me to suggest the best one for your situation?\n\n- {business.name}",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 3,
        subject: "How we usually approach this",
        body: "Hi {contact.firstName},\n\nWe usually approach this in 3 phases: quick win → stabilize → scale.\n\nIf you tell me your deadline, I can recommend the right phase to start with.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 4,
        body: "If it’s easier, reply with just a deadline (e.g. ‘by end of month’) and I’ll propose the simplest plan.",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 7,
        subject: "Common mistake to avoid",
        body: "Hi {contact.firstName},\n\nCommon mistake: trying to automate everything at once.\n\nIt’s almost always better to automate one flow, measure, then expand.\n\nWant me to recommend the best first flow?\n\n- {business.name}",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 7,
        subject: "Simple checklist",
        body: "Hi {contact.firstName},\n\nHere’s a simple checklist:\n\n1) Choose one goal\n2) Pick one channel\n3) Measure outcomes\n\nIf you reply with (1) goal and (2) channel, I’ll suggest an outline.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 7,
        body: "Quick check-in: should I keep sending these tips, or pause?",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 7,
        subject: "Two paths",
        body: "Hi {contact.firstName},\n\nTwo paths from here:\n\nA) DIY (I send a simple template)\nB) Done-for-you (we set it up together)\n\nWhich do you prefer?\n\n- {business.name}",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 7,
        subject: "What would make this a win?",
        body: "Hi {contact.firstName},\n\nWhat would make this a win for you?\n\nIf you reply with one metric (time saved, bookings, revenue, etc.), I’ll tailor the plan.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 7,
        body: "Want to do a quick 10-minute call, {contact.firstName}, or keep this async?",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 14,
        subject: "Close the loop",
        body: "Hi {contact.firstName},\n\nShould I close this out for now? If you still want help, reply with ‘yes’ and I’ll jump back in.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 14,
        body: "Closing the loop: if you want help later, just reply here anytime.",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 30,
        subject: "Still here if you want to revisit",
        body: "Hi {contact.firstName},\n\nStill here if you want to revisit this. If you reply in the future, this thread comes right back.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 30,
        body: "Final note: if you want to revisit, reply with what changed and I’ll suggest the next step.",
      },
    ],
  },
];
