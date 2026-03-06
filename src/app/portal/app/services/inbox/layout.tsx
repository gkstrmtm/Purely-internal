import { redirect } from "next/navigation";

import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalInboxClient } from "@/app/portal/app/services/inbox/PortalInboxClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Channel = "email" | "sms";

export default async function PortalInboxLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ channel?: string }>;
}) {
  // Keep the client shell mounted across /inbox/email <-> /inbox/sms.
  // The leaf page only validates/redirects.
  const resolved = await params;
  const raw = String(resolved?.channel || "email").toLowerCase();

  if (raw !== "email" && raw !== "sms") {
    redirect("/portal/app/services/inbox/email");
  }

  return (
    <PortalServiceGate slug="inbox">
      <PortalInboxClient initialChannel={raw as Channel} />
      {children}
    </PortalServiceGate>
  );
}
