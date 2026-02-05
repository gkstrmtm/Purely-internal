import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { PortalFollowUpClient } from "@/app/portal/app/services/follow-up/PortalFollowUpClient";

export default async function PortalFollowUpServicePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/portal/login?from=/portal/app/services/follow-up");

  if (session.user.role !== "CLIENT" && session.user.role !== "ADMIN") {
    redirect("/app");
  }

  return <PortalFollowUpClient />;
}
