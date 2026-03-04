import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PortalHostedFunnelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = String(slug || "").trim().toLowerCase();
  if (!s) notFound();

  // These legacy /portal hosted routes are wrapped by the Portal header.
  // Redirect to the public hosted funnel route so live funnels are clean/brandable.
  redirect(`/f/${encodeURIComponent(s)}`);
}
