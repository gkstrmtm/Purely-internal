import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalAutomationsClient } from "@/app/portal/app/services/automations/PortalAutomationsClient";

export default async function PortalAutomationsEditorPage() {
  return (
    <PortalServiceGate slug="automations">
      <PortalAutomationsClient mode="editor" />
    </PortalServiceGate>
  );
}
