import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { buildHostedFunnelMetadata, fetchHostedFunnelRoute, renderHostedFunnelRoute } from "../hostedFunnelRoute";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function readRequestedPageSlug(path: string[] | undefined) {
  if (!Array.isArray(path) || path.length !== 1) return null;
  const pageSlug = String(path[0] || "").trim().toLowerCase();
  return pageSlug || null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; key: string; path?: string[] }>;
}): Promise<Metadata> {
  const { slug, key, path } = await params;
  const pageSlug = readRequestedPageSlug(path);
  if (!pageSlug) return {};

  const loaded = await fetchHostedFunnelRoute(slug, key, pageSlug);
  return loaded ? buildHostedFunnelMetadata(loaded) : {};
}

export default async function HostedFunnelSubpage({
  params,
}: {
  params: Promise<{ slug: string; key: string; path?: string[] }>;
}) {
  const { slug, key, path } = await params;
  const s = String(slug || "").trim().toLowerCase();
  const k = String(key || "").trim();
  const pageSlug = readRequestedPageSlug(path);
  if (!s || !k || !pageSlug) notFound();

  const loaded = await fetchHostedFunnelRoute(s, k, pageSlug);
  if (!loaded) notFound();

  return renderHostedFunnelRoute({ loaded, slug: s, key: k });
}