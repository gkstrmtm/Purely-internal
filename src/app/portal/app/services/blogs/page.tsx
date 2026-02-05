import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { PortalBlogsClient } from "@/app/portal/app/services/blogs/PortalBlogsClient";

export default async function PortalBlogsServicePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/portal/login?from=/portal/app/services/blogs");

  if (session.user.role !== "CLIENT" && session.user.role !== "ADMIN") {
    redirect("/app");
  }

  return <PortalBlogsClient />;
}
