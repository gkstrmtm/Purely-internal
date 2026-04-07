import { PortalSidebarOverrideProvider } from "@/app/portal/PortalSidebarOverride";
import { PortalAiChatPreviewClient } from "@/app/portal/app/pura-preview/PortalAiChatPreviewClient";

export default function PublicPuraPreviewPage() {
  return (
    <PortalSidebarOverrideProvider>
      <PortalAiChatPreviewClient standalone />
    </PortalSidebarOverrideProvider>
  );
}
