import type { SuggestedSetupAction } from "@/lib/suggestedSetup/shared";
import { actionIdFromParts } from "@/lib/suggestedSetup/actionIds";

type StarterTask = {
  title: string;
  description: string;
  dueOffsetDays: number | null;
};

export function proposeTasksSeedStarterTasks(opts: {
  businessName: string;
  hasAnyTasks: boolean;
}): SuggestedSetupAction | null {
  if (opts.hasAnyTasks) return null;

  const businessName = String(opts.businessName || "").trim();

  const tasks: StarterTask[] = [
    {
      title: "Finish your Profile",
      description: "Your business name, website, and brand voice power templates across services.",
      dueOffsetDays: 1,
    },
    {
      title: "Connect Inbox (SMS and email)",
      description: "Connect Twilio so you can send and receive messages in one place.",
      dueOffsetDays: 2,
    },
    {
      title: "Review suggested setup",
      description: businessName
        ? `Open Suggested setup and apply the starter templates for ${businessName}.`
        : "Open Suggested setup and apply the starter templates.",
      dueOffsetDays: null,
    },
  ];

  const payload = { version: 1, tasks };

  return {
    id: actionIdFromParts({ kind: "tasks.seedStarterTasks", serviceSlug: "tasks", signature: payload }),
    serviceSlug: "tasks",
    kind: "tasks.seedStarterTasks",
    title: "Seed a starter task list",
    description: "Adds a few starter tasks so you have a clear setup checklist.",
    payload,
  };
}
