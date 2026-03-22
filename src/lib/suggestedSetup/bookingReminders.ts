import type { SuggestedSetupAction } from "@/lib/suggestedSetup/shared";
import { actionIdFromParts } from "@/lib/suggestedSetup/actionIds";
import { REMINDER_TEMPLATES } from "@/lib/portalReminderTemplates";

function bestUnitFromMinutes(minutes: number): { value: number; unit: "minutes" | "hours" | "days" | "weeks" } {
  const m = Math.max(5, Math.min(60 * 24 * 14, Math.round(minutes)));
  if (m % (60 * 24 * 7) === 0) return { value: Math.max(1, Math.round(m / (60 * 24 * 7))), unit: "weeks" };
  if (m % (60 * 24) === 0) return { value: Math.max(1, Math.round(m / (60 * 24))), unit: "days" };
  if (m % 60 === 0) return { value: Math.max(1, Math.round(m / 60)), unit: "hours" };
  return { value: m, unit: "minutes" };
}

export function proposeBookingConfigureReminders(opts: {
  businessName: string;
  enabledNow: boolean;
  hasCustomizedSteps: boolean;
}): SuggestedSetupAction | null {
  if (opts.enabledNow) return null;
  if (opts.hasCustomizedSteps) return null;

  const template =
    REMINDER_TEMPLATES.find((t) => t.id === "standard-24h-2h") ??
    REMINDER_TEMPLATES.find((t) => t.id === "sms-heavy-24h-2h-15m") ??
    REMINDER_TEMPLATES[0];

  const steps = template.steps.map((s, idx) => ({
    id: `step_${idx + 1}`,
    enabled: true,
    kind: s.kind,
    leadTime: bestUnitFromMinutes(s.leadMinutes),
    ...(s.subject ? { subjectTemplate: s.subject } : {}),
    messageBody: s.body,
  }));

  const payload = {
    settings: {
      version: 4,
      enabled: true,
      customVariables: {},
      steps,
    },
  };

  return {
    id: actionIdFromParts({
      kind: "booking.configureReminders",
      serviceSlug: "appointment-reminders",
      signature: payload,
    }),
    serviceSlug: "appointment-reminders",
    kind: "booking.configureReminders",
    title: "Set up appointment reminders",
    description: "Turns on a starter reminder sequence using proven templates. You can edit messages anytime.",
    payload,
  };
}
