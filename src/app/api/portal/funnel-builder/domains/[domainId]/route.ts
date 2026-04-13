import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function removeDomainFromSettings(settingsJson: unknown, domain: string) {
  if (!settingsJson || typeof settingsJson !== "object" || Array.isArray(settingsJson)) {
    return {};
  }

  const base: Record<string, unknown> = { ...(settingsJson as Record<string, unknown>) };

  const customDomains =
    base.customDomains && typeof base.customDomains === "object" && !Array.isArray(base.customDomains)
      ? { ...(base.customDomains as Record<string, unknown>) }
      : {};
  delete customDomains[domain];
  base.customDomains = customDomains;

  const funnelDomains =
    base.funnelDomains && typeof base.funnelDomains === "object" && !Array.isArray(base.funnelDomains)
      ? { ...(base.funnelDomains as Record<string, unknown>) }
      : {};
  for (const [funnelId, assignedDomain] of Object.entries(funnelDomains)) {
    if (String(assignedDomain || "").trim().toLowerCase() === domain) {
      delete funnelDomains[funnelId];
    }
  }
  base.funnelDomains = funnelDomains;

  return base;
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ domainId: string }> }) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const { domainId } = await ctx.params;
  const cleanId = String(domainId || "").trim();
  if (!cleanId) {
    return NextResponse.json({ ok: false, error: "Domain not found" }, { status: 404 });
  }

  const existing = await prisma.creditCustomDomain.findFirst({
    where: { id: cleanId, ownerId },
    select: { id: true, domain: true },
  });
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Domain not found" }, { status: 404 });
  }

  const settings = await prisma.creditFunnelBuilderSettings.findUnique({
    where: { ownerId },
    select: { dataJson: true },
  });

  const nextJson = removeDomainFromSettings(settings?.dataJson ?? null, existing.domain);

  await prisma.$transaction([
    prisma.creditCustomDomain.delete({ where: { id: existing.id } }),
    prisma.creditFunnelBuilderSettings.upsert({
      where: { ownerId },
      update: { dataJson: nextJson as any },
      create: { ownerId, dataJson: nextJson as any },
      select: { ownerId: true },
    }),
  ]);

  return NextResponse.json({ ok: true });
}