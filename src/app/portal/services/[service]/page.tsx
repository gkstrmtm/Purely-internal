import { redirect } from "next/navigation";

export default async function LegacyPortalServicePage({
  params,
}: {
  params: Promise<{ service: string }>;
}) {
  const { service } = await params;
  redirect(`/portal/app/services/${service}`);
}
