import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { hostedFunnelPath } from "@/lib/publicHostedKeys";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HostedFunnelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = String(slug || "").trim().toLowerCase();
  if (!s) notFound();

  // Canonicalize to a collision-safe URL that includes a short key derived from the funnel id.
  // If multiple funnels share the same slug (across different owners), the slug-only URL is ambiguous.
  const matches = await prisma.creditFunnel
    .findMany({ where: { slug: s }, select: { id: true }, take: 2 })
    .catch(() => null);

  if (!matches || matches.length === 0) notFound();
  if (matches.length > 1) notFound();

  const next = hostedFunnelPath(s, matches[0].id);
  if (!next) notFound();
  redirect(next);

  // next/navigation redirect throws; this is just to satisfy types.
  return null;
}
