import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { PortalServicePageClient } from "@/app/portal/services/[service]/PortalServicePageClient";

export default async function PortalAppServicePage({
  params,
}: {
  params: Promise<{ service: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/portal/login");
  if (session.user.role !== "CLIENT" && session.user.role !== "ADMIN") {
    redirect("/app");
  }

  const { service } = await params;
  const exists = PORTAL_SERVICES.some((s) => s.slug === service);
  if (!exists) notFound();

  return <PortalServicePageClient slug={service} />;
}
