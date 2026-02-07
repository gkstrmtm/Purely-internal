import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";

export default async function PortalMissedCallTextBackServicePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/portal/login?from=/portal/app/services/missed-call-textback");

  if (session.user.role !== "CLIENT" && session.user.role !== "ADMIN") {
    redirect("/app");
  }

  redirect("/portal/app/services/ai-receptionist?tab=missed-call-textback");
}
