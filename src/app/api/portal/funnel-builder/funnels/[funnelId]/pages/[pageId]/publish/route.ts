import { NextResponse } from "next/server";

import { getCreditFunnelBuilderSettings } from "@/lib/creditFunnelBuilderSettingsStore";
import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import {
  dbHasCreditFunnelPageDraftHtmlColumn,
  normalizeDraftHtml,
  withDraftHtmlSelect,
} from "@/lib/funnelPageDbCompat";
import { readFunnelPageBrief } from "@/lib/funnelPageIntent";
import { validateFunnelPageContract } from "@/lib/funnelPageContract";
import { auditPublishedFunnelPage } from "@/lib/funnelPagePublishAudit";
import { createFunnelPagePublishUpdate } from "@/lib/funnelPageState";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function readAssignedFunnelDomain(settingsJson: unknown, funnelId: string): string | null {
  if (!settingsJson || typeof settingsJson !== "object" || Array.isArray(settingsJson)) return null;
  const funnelDomains = (settingsJson as Record<string, unknown>).funnelDomains;
  if (!funnelDomains || typeof funnelDomains !== "object" || Array.isArray(funnelDomains)) return null;
  const raw = (funnelDomains as Record<string, unknown>)[funnelId];
  let domain = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!domain) return null;

  domain = domain.replace(/^https?:\/\//, "");
  domain = domain.split("/")[0] || "";
  domain = domain.split("?")[0] || "";
  domain = domain.split("#")[0] || "";

  if (!domain) return null;
  if (domain.length > 253) return null;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
  if (domain.includes("..")) return null;
  if (domain.startsWith("-") || domain.endsWith("-")) return null;

  return domain;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ funnelId: string; pageId: string }> },
) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { funnelId: funnelIdRaw, pageId: pageIdRaw } = await ctx.params;
  const funnelId = String(funnelIdRaw || "").trim();
  const pageId = String(pageIdRaw || "").trim();
  if (!funnelId || !pageId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  const hasDraftHtml = await dbHasCreditFunnelPageDraftHtmlColumn();
  const settings = await getCreditFunnelBuilderSettings(auth.session.user.id).catch(() => ({}));

  const page = await prisma.creditFunnelPage.findFirst({
    where: { id: pageId, funnelId, funnel: { ownerId: auth.session.user.id } },
    select: withDraftHtmlSelect({ id: true, slug: true, title: true, editorMode: true, blocksJson: true, customHtml: true }, hasDraftHtml),
  });
  if (!page) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const normalizedPage = normalizeDraftHtml(page);
  if (!hasDraftHtml) {
    return NextResponse.json({ ok: true, page: normalizedPage });
  }

  const publishUpdate = createFunnelPagePublishUpdate(normalizedPage);
  if (!publishUpdate) {
    return NextResponse.json({ ok: false, error: "No draft to publish" }, { status: 400 });
  }

  const contractValidation = validateFunnelPageContract({
    ...normalizedPage,
    intentProfile: readFunnelPageBrief(settings, pageId),
  });
  if (!contractValidation.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `This ${contractValidation.pageType} page is not ready to publish yet.`,
        issues: contractValidation.issues,
      },
      { status: 422 },
    );
  }

  const updated = await prisma.creditFunnelPage.update({
    where: { id: pageId },
    data: publishUpdate,
    select: withDraftHtmlSelect({
      id: true,
      slug: true,
      title: true,
      sortOrder: true,
      contentMarkdown: true,
      editorMode: true,
      blocksJson: true,
      customHtml: true,
      customChatJson: true,
      createdAt: true,
      updatedAt: true,
    }, hasDraftHtml),
  });

  const funnel = await prisma.creditFunnel.findFirst({
    where: { id: funnelId, ownerId: auth.session.user.id },
    select: { id: true, slug: true },
  });
  const assignedDomain = readAssignedFunnelDomain(settings, funnelId);
  const requestOrigin = new URL(req.url).origin;
  const audit = funnel?.slug
    ? await auditPublishedFunnelPage({
        requestOrigin,
        assignedDomain,
        funnelSlug: funnel.slug,
        funnelId: funnel.id,
        pageSlug: updated.slug,
      })
    : null;

  return NextResponse.json({ ok: true, page: normalizeDraftHtml(updated), audit });
}
