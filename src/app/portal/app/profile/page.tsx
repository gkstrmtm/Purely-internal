import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { PortalProfileClient } from "@/app/portal/profile/PortalProfileClient";

export default async function PortalAppProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/portal/login");

  if (session.user.role !== "CLIENT" && session.user.role !== "ADMIN") {
    redirect("/app");
  }

  return <PortalProfileClient />;
}
