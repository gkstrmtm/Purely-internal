import { redirect } from "next/navigation";

import { PortalShell } from "@/app/portal/PortalShell";
import { PortalSidebarOverrideProvider } from "@/app/portal/PortalSidebarOverride";
import { PortalThemeClient } from "@/app/portal/PortalThemeClient";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";
import { getPortalThemeMode } from "@/lib/portalTheme.server";

const DEFAULT_FULL_DEMO_EMAIL = "demo-full@purelyautomation.dev";

export default async function CreditAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireCreditClientSession();
  if (!session.ok) redirect("/credit/login");
  const user = session.session.user;
  const themePreferenceUserId = user.memberId ?? user.id ?? null;
  const themeModeRaw = await getPortalThemeMode(themePreferenceUserId);
  const isFullDemo = (user.email ?? "").toLowerCase().trim() === DEFAULT_FULL_DEMO_EMAIL;
  const themeMode = isFullDemo && themeModeRaw === "device" ? "light" : themeModeRaw;

  return (
    <PortalThemeClient preferredMode={themeMode}>
      <PortalSidebarOverrideProvider>
        <PortalShell>{children}</PortalShell>
      </PortalSidebarOverrideProvider>
    </PortalThemeClient>
  );
}