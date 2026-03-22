import type { SuggestedSetupAction } from "@/lib/suggestedSetup/shared";
import { actionIdFromParts } from "@/lib/suggestedSetup/actionIds";
import { FOLLOW_UP_TEMPLATES } from "@/lib/portalFollowUpTemplates";

function toChainTemplates(businessName: string) {
  const pickIds = ["post-visit-thankyou", "review-request", "no-show-reschedule"];
  const picks = pickIds
    .map((id) => FOLLOW_UP_TEMPLATES.find((t) => t.id === id))
    .filter(Boolean) as typeof FOLLOW_UP_TEMPLATES;

  const chosen = picks.length ? picks : FOLLOW_UP_TEMPLATES.slice(0, 3);

  return chosen.map((tpl) => ({
    id: `chain_${tpl.id}`.slice(0, 60),
    name: tpl.title,
    steps: tpl.steps
      .map((s, idx) => {
        const stepId = `step_${tpl.id}_${idx + 1}`.slice(0, 60);
        const name = s.kind === "EMAIL" ? `${tpl.title} (Email)` : s.kind === "SMS" ? `${tpl.title} (SMS)` : tpl.title;
        if (s.kind === "EMAIL") {
          return {
            id: stepId,
            name,
            enabled: true,
            delayMinutes: Math.max(0, Math.round(s.delayMinutes)),
            kind: "EMAIL" as const,
            audience: "CONTACT" as const,
            email: {
              subjectTemplate: s.subject ?? `Follow up from ${businessName || "your team"}`,
              bodyTemplate: s.body,
            },
            presetId: tpl.id,
          };
        }
        if (s.kind === "SMS") {
          return {
            id: stepId,
            name,
            enabled: true,
            delayMinutes: Math.max(0, Math.round(s.delayMinutes)),
            kind: "SMS" as const,
            audience: "CONTACT" as const,
            sms: { bodyTemplate: s.body },
            presetId: tpl.id,
          };
        }
        return {
          id: stepId,
          name,
          enabled: true,
          delayMinutes: Math.max(0, Math.round(s.delayMinutes)),
          kind: "TAG" as const,
          audience: "CONTACT" as const,
          tagId: "",
          presetId: tpl.id,
        };
      })
      .filter(Boolean),
  }));
}

export function proposeFollowUpSeedTemplates(opts: {
  businessName: string;
  enabledNow: boolean;
  hasAnyChainTemplates: boolean;
}): SuggestedSetupAction | null {
  if (opts.enabledNow) return null;
  if (opts.hasAnyChainTemplates) return null;

  const chainTemplates = toChainTemplates(opts.businessName);
  const defaultSteps = chainTemplates[0]?.steps?.slice(0, 6) ?? [];

  const payload = {
    settingsPatch: {
      enabled: false,
      chainTemplates,
      assignments: {
        defaultSteps,
        calendarSteps: {},
      },
    },
  };

  return {
    id: actionIdFromParts({
      kind: "followUp.seedTemplates",
      serviceSlug: "follow-up",
      signature: payload,
    }),
    serviceSlug: "follow-up",
    kind: "followUp.seedTemplates",
    title: "Seed follow-up templates",
    description: "Adds ready-to-use follow-up sequences so you can turn follow-up on when you are ready.",
    payload,
  };
}
