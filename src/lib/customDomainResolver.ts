import { prisma } from "@/lib/db";

export type CustomDomainStatus = "PENDING" | "VERIFIED";

export type ResolvedCustomDomain = {
  ownerId: string;
  matchedDomain: string;
  status: CustomDomainStatus;
  source: "creditCustomDomain" | "clientBlogSite";
};

function normalizeHost(raw: unknown): string | null {
  const clean = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  return clean ? clean : null;
}

async function resolveFromCreditCustomDomain(cleanHost: string): Promise<ResolvedCustomDomain | null> {
  const primary = await prisma.creditCustomDomain
    .findFirst({ where: { domain: cleanHost }, select: { ownerId: true, domain: true, status: true } })
    .catch(() => null);

  if (primary) {
    return {
      ownerId: primary.ownerId,
      matchedDomain: primary.domain,
      status: primary.status,
      source: "creditCustomDomain",
    };
  }

  return null;
}

async function resolveFromClientBlogSite(cleanHost: string): Promise<ResolvedCustomDomain | null> {
  // This table/column may not exist in some environments (migration-free path), so be defensive.
  const row = await (prisma.clientBlogSite as any)
    .findFirst({
      where: { primaryDomain: cleanHost },
      select: { ownerId: true, primaryDomain: true, verifiedAt: true },
    })
    .catch(() => null);

  if (!row || !row.ownerId || !row.primaryDomain) return null;

  const verified = row.verifiedAt instanceof Date || !!row.verifiedAt;

  return {
    ownerId: String(row.ownerId),
    matchedDomain: String(row.primaryDomain),
    status: verified ? "VERIFIED" : "PENDING",
    source: "clientBlogSite",
  };
}

async function resolveWithWwwFallback(
  cleanHost: string,
  resolver: (host: string) => Promise<ResolvedCustomDomain | null>,
): Promise<ResolvedCustomDomain | null> {
  const primary = await resolver(cleanHost);
  if (primary) return primary;

  if (cleanHost.startsWith("www.")) {
    const apex = cleanHost.slice(4);
    if (!apex) return null;
    return resolver(apex);
  }

  return resolver(`www.${cleanHost}`);
}

export async function resolveCustomDomain(host: unknown): Promise<ResolvedCustomDomain | null> {
  const cleanHost = normalizeHost(host);
  if (!cleanHost) return null;

  // Prefer the general/custom-domain table first (funnels/forms), then fall back to the blog/newsletter site domain.
  const credit = await resolveWithWwwFallback(cleanHost, resolveFromCreditCustomDomain);
  if (credit) return credit;

  const site = await resolveWithWwwFallback(cleanHost, resolveFromClientBlogSite);
  if (site) return site;

  return null;
}
