import { requirePortalUser } from "@/lib/portalAuth";

import { PortalAiChatClient } from "@/app/portal/app/ai-chat/PortalAiChatClient";

export default async function PortalAiChatThreadPage(props: { params: Promise<{ threadRef: string }> }) {
  await requirePortalUser();
  const { threadRef } = await props.params;
  return <PortalAiChatClient basePath="/portal" initialThreadRef={threadRef} />;
}
