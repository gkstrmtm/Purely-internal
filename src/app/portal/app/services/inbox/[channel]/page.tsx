import { redirect } from "next/navigation";

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
    redirect("/portal/app/services/inbox/email");
  }

  return null;
}
