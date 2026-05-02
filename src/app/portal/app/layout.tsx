import { redirect } from "next/navigation";

import { PortalShell } from "@/app/portal/PortalShell";
import { PortalSidebarOverrideProvider } from "@/app/portal/PortalSidebarOverride";
import { PortalThemeClient } from "@/app/portal/PortalThemeClient";
import { requirePortalUser } from "@/lib/portalAuth";
import { getPortalThemeMode } from "@/lib/portalTheme.server";

const DEFAULT_FULL_DEMO_EMAIL = "demo-full@purelyautomation.dev";

export default async function PortalAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requirePortalUser();
  if (user.role !== "CLIENT" && user.role !== "ADMIN") redirect("/app");
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
