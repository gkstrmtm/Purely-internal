import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalBlogsShell } from "@/app/portal/app/services/blogs/(tabs)/PortalBlogsShell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PortalBlogsTabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Keep the client shell mounted across /blogs <-> /blogs/automation <-> /blogs/settings.
  // The leaf pages only exist to set the URL segment.
  return (
    <PortalServiceGate slug="blogs">
      <PortalBlogsShell />
      {children}
    </PortalServiceGate>
  );
}
