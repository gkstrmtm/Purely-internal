import type { SuggestedSetupAction } from "@/lib/suggestedSetup/shared";
import { actionIdFromParts } from "@/lib/suggestedSetup/actionIds";

export function proposeAutomationsInitialize(opts: {
  hasSetupRow: boolean;
  hasWebhookToken: boolean;
  automationCount: number;
}): SuggestedSetupAction | null {
  if (opts.hasSetupRow && opts.hasWebhookToken) return null;

  const starterAutomation = {
    id: "starter_manual_task",
    name: "Starter: manual task",
    paused: true,
    nodes: [
      {
        id: "trigger_manual",
        type: "trigger",
        label: "Manual trigger",
        x: 80,
        y: 80,
        config: { kind: "trigger", triggerKind: "manual" },
      },
      {
        id: "action_task",
        type: "action",
        label: "Create task",
        x: 380,
        y: 80,
        config: { kind: "action", actionKind: "create_task", title: "Follow up", note: "Triggered from automation" },
      },
    ],
    edges: [{ id: "e1", from: "trigger_manual", to: "action_task" }],
  };

  const payload = {
    version: 1,
    ensureWebhookToken: true,
    // Only seed the sample if there are no automations yet.
    seedIfEmpty: opts.automationCount === 0,
    starterAutomation,
  };

  return {
    id: actionIdFromParts({
      kind: "automations.initialize",
      serviceSlug: "automations",
      signature: payload,
    }),
    serviceSlug: "automations",
    kind: "automations.initialize",
    title: "Initialize Automation Builder",
    description: "Ensures your automations workspace is ready and adds a paused starter automation if empty.",
    payload,
  };
}
