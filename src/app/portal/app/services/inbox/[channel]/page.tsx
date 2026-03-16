import { redirect } from "next/navigation";

import { requestPortalAppBasePath } from "@/lib/portalVariant.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PortalInboxServiceChannelPage({
  params,
}: {
  params: Promise<{ channel?: string }>;
}) {
  const resolved = await params;
  const raw = String(resolved?.channel || "email").toLowerCase();

  if (raw !== "email" && raw !== "sms") {
    const base = await requestPortalAppBasePath();
    redirect(`${base}/services/inbox/email`);
  }

  return null;
}
