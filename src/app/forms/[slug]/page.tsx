import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { hostedFormPath } from "@/lib/publicHostedKeys";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HostedFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const s = String(slug || "").trim().toLowerCase();
  if (!s) notFound();

  const embedRaw = resolvedSearchParams?.embed;
  const embed = Array.isArray(embedRaw) ? embedRaw[0] === "1" : embedRaw === "1";

  // Canonicalize to a collision-safe URL that includes a short key derived from the form id.
  // If multiple forms share the same slug (across different owners), the slug-only URL is ambiguous.
  const matches = await prisma.creditForm
    .findMany({ where: { slug: s }, select: { id: true }, take: 2 })
    .catch(() => null);

  if (!matches || matches.length === 0) notFound();
  if (matches.length > 1) notFound();

  const next = hostedFormPath(s, matches[0].id);
  if (!next) notFound();

  const nextUrl = new URL(next, "https://example.invalid");
  if (resolvedSearchParams) {
    for (const [key, rawValue] of Object.entries(resolvedSearchParams)) {
      if (typeof rawValue === "undefined") continue;
      if (Array.isArray(rawValue)) {
        for (const value of rawValue) nextUrl.searchParams.append(key, value);
        continue;
      }
      nextUrl.searchParams.set(key, rawValue);
    }
  }
  if (embed && !nextUrl.searchParams.has("embed")) nextUrl.searchParams.set("embed", "1");
  redirect(`${nextUrl.pathname}${nextUrl.search}`);

  // next/navigation redirect throws; this is just to satisfy types.
  return null;
}
