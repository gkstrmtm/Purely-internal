export type ReminderStepKind = "SMS" | "EMAIL" | "TAG";

export type ReminderTemplate = {
  id: string;
  title: string;
  description: string;
  steps: Array<{ kind: ReminderStepKind; leadMinutes: number; subject?: string; body: string }>;
};

// leadMinutes is how long BEFORE the appointment the reminder should send.
export const REMINDER_TEMPLATES: ReminderTemplate[] = [
  {
    id: "confirm-48h-3h",
    title: "Confirm + reduce no-shows (2 steps)",
    description: "48 hours email confirmation + 3 hours SMS reminder.",
    steps: [
      {
        kind: "EMAIL",
        leadMinutes: 60 * 24 * 2,
        subject: "Confirming your appointment {when}",
        body:
          "Hi {contact.firstName},\n\nJust confirming your appointment {when}. If you need to reschedule, reply here and we’ll help.\n\n- {business.name}",
      },
      {
        kind: "SMS",
        leadMinutes: 60 * 3,
        body: "Reminder: your appointment is at {when}. Reply to reschedule. - {business.name}",
      },
    ],
  },
  {
    id: "standard-24h-2h",
    title: "Standard reminders (2 steps)",
    description: "24 hours + 2 hours before the appointment.",
    steps: [
      {
        kind: "EMAIL",
        leadMinutes: 60 * 24,
        subject: "Reminder: your appointment {when}",
        body:
          "Hi {contact.firstName},\n\nJust a reminder about your appointment {when}.\n\nLocation: {location}\n\nIf you need to reschedule, reply to this message.\n\n- {business.name}",
      },
      {
        kind: "EMAIL",
        leadMinutes: 60 * 2,
        subject: "Today: your appointment {when}",
        body:
          "Hi {contact.firstName},\n\nQuick reminder — your appointment is coming up at {when}.\n\nLocation: {location}\n\n- {business.name}",
      },
      {
        kind: "SMS",
        leadMinutes: 60 * 2,
        body: "Reminder: appointment at {when}. Location: {location}. Reply to reschedule. - {business.name}",
      },
      {
        kind: "SMS",
        leadMinutes: 15,
        body: "Starting soon: {when}. Location: {location}. - {business.name}",
      },
    ],
  },
  {
    id: "simple-2h",
    title: "Simple reminder (1 step)",
    description: "One message 2 hours before.",
    steps: [
      {
        kind: "EMAIL",
        leadMinutes: 60 * 2,
        subject: "Reminder: appointment {when}",
        body:
          "Hi {contact.firstName},\n\nReminder about your appointment {when}.\n\nLocation: {location}\n\n- {business.name}",
      },
      {
        kind: "SMS",
        leadMinutes: 60 * 2,
        body: "Reminder: appointment {when}. Location: {location}. - {business.name}",
      },
    ],
  },
  {
    id: "high-show-48h-24h-2h",
    title: "High show-rate (3 steps)",
    description: "48 hours + 24 hours + 2 hours before.",
    steps: [
      {
        kind: "EMAIL",
        leadMinutes: 60 * 24 * 2,
        subject: "Confirming your appointment {when}",
        body:
          "Hi {contact.firstName},\n\nJust confirming your appointment {when}.\n\nLocation: {location}\n\nIf you need to reschedule, reply here and we’ll help.\n\n- {business.name}",
      },
      {
        kind: "EMAIL",
        leadMinutes: 60 * 24,
        subject: "Reminder: appointment tomorrow {when}",
        body:
          "Hi {contact.firstName},\n\nReminder about your appointment {when}.\n\nLocation: {location}\n\n- {business.name}",
      },
      {
        kind: "EMAIL",
        leadMinutes: 60 * 2,
        subject: "Today: appointment {when}",
        body:
          "Hi {contact.firstName},\n\nQuick reminder — your appointment is coming up at {when}.\n\nLocation: {location}\n\n- {business.name}",
      },
      {
        kind: "SMS",
        leadMinutes: 60 * 24,
        body: "Reminder for tomorrow {when}. Location: {location}. Reply to reschedule. - {business.name}",
      },
      {
        kind: "SMS",
        leadMinutes: 60 * 2,
        body: "Reminder: appointment at {when}. Location: {location}. - {business.name}",
      },
      {
        kind: "SMS",
        leadMinutes: 15,
        body: "Starting soon: {when}. Location: {location}. - {business.name}",
      },
    ],
  },
  {
    id: "sms-heavy-24h-2h-15m",
    title: "SMS-heavy (3 steps)",
    description: "24 hours + 2 hours + 15 minutes before (SMS).",
    steps: [
      {
        kind: "SMS",
        leadMinutes: 60 * 24,
        body: "Reminder for tomorrow {when}. Location: {location}. Reply to reschedule. - {business.name}",
      },
      {
        kind: "SMS",
        leadMinutes: 60 * 2,
        body: "Reminder: appointment at {when}. Location: {location}. - {business.name}",
      },
      {
        kind: "SMS",
        leadMinutes: 15,
        body: "Starting soon: {when}. Location: {location}. - {business.name}",
      },
    ],
  },
  {
    id: "email-only-48h-24h",
    title: "Email-only (2 steps)",
    description: "Two email reminders 48 hours + 24 hours before.",
    steps: [
      {
        kind: "EMAIL",
        leadMinutes: 60 * 24 * 2,
        subject: "Reminder: your appointment {when}",
        body:
          "Hi {contact.firstName},\n\nJust a reminder about your appointment {when}.\n\nLocation: {location}\n\nIf you need to reschedule, reply to this email.\n\n- {business.name}",
      },
      {
        kind: "EMAIL",
        leadMinutes: 60 * 24,
        subject: "Tomorrow: your appointment {when}",
        body:
          "Hi {contact.firstName},\n\nQuick reminder that your appointment is tomorrow at {when}.\n\nLocation: {location}\n\n- {business.name}",
      },
    ],
  },
];
