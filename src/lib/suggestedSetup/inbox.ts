import type { SuggestedSetupAction } from "@/lib/suggestedSetup/shared";
import { actionIdFromParts } from "@/lib/suggestedSetup/actionIds";

export function proposeInboxInitialize(opts: { needsInit: boolean }): SuggestedSetupAction | null {
  if (!opts.needsInit) return null;

  const payload = { version: 1, ensureWebhookToken: true };

  return {
    id: actionIdFromParts({ kind: "inbox.initialize", serviceSlug: "inbox", signature: payload }),
    serviceSlug: "inbox",
    kind: "inbox.initialize",
    title: "Initialize Inbox",
    description: "Ensures the Inbox is ready for email and SMS threads.",
    payload,
  };
}
