import { requirePortalUser } from "@/lib/portalAuth";

import { PortalAiChatClient } from "@/app/portal/app/ai-chat/PortalAiChatClient";

export default async function PortalAiChatPage() {
  await requirePortalUser();
  return <PortalAiChatClient basePath="/portal" />;
}
