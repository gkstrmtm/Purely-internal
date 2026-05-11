import { NextResponse } from "next/server";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { buildCreditFunnelPagesFromTemplateAndTheme, coerceCreditFunnelTemplateKey, getCreditFunnelTemplate } from "@/lib/creditFunnelTemplates";
import { coerceCreditFunnelThemeKey, getCreditFunnelTheme } from "@/lib/creditFunnelThemes";
import { mutateCreditFunnelBuilderSettingsTx } from "@/lib/creditFunnelBuilderSettingsStore";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import { blocksToCustomHtmlDocument } from "@/lib/funnelBlocksToCustomHtmlDocument";
import { applyDraftHtmlWriteCompat, dbHasCreditFunnelPageDraftHtmlColumn } from "@/lib/funnelPageDbCompat";
import { buildSuggestedFunnelNaming, buildSuggestedPageNaming, inferFunnelBriefProfile, inferFunnelPageIntentProfile, writeFunnelBrief, writeFunnelPageBrief } from "@/lib/funnelPageIntent";
import { buildFunnelInitializationScaffold } from "@/lib/funnelStencilRegistry.server";
import { createFunnelPageMirroredHtmlUpdate } from "@/lib/funnelPageState";
import { consumeCredits } from "@/lib/credits";
import { addCredits } from "@/lib/credits";
import { PORTAL_CREDIT_COSTS } from "@/lib/portalCreditCosts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeDomain(raw: unknown) {
  let s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!s) return null;

  // Strip protocol and any path/query.
  s = s.replace(/^https?:\/\//, "");
  s = s.split("/")[0] || "";
  s = s.split("?")[0] || "";
  s = s.split("#")[0] || "";

  if (!s) return null;
  if (s.length > 253) return null;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return null;
  if (s.includes("..")) return null;
  if (s.startsWith("-") || s.endsWith("-")) return null;
  return s;
}

function readFunnelDomains(settingsJson: unknown): Record<string, string> {
  if (!settingsJson || typeof settingsJson !== "object" || Array.isArray(settingsJson)) return {};
  const raw = (settingsJson as any).funnelDomains;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as any)) {
    if (typeof k !== "string" || !k.trim()) continue;
    const domain = normalizeDomain(v);
    if (!domain) continue;
    out[k] = domain;
  }
  return out;
}

function normalizeSlug(raw: unknown) {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  const cleaned = s
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-/, "")
    .replace(/-$/, "");

  if (!cleaned) return null;
  if (cleaned.length < 2 || cleaned.length > 60) return null;
  return cleaned;
}

function withRandomSuffix(base: string, maxLen = 60) {
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  const suffix = `-${digits}`;
  const headMax = Math.max(1, maxLen - suffix.length);
  const head = base.length > headMax ? base.slice(0, headMax).replace(/-+$/g, "") : base;
  return `${head}${suffix}`;
}

export async function GET() {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const settings = await prisma.creditFunnelBuilderSettings
    .findUnique({ where: { ownerId }, select: { dataJson: true } })
    .catch(() => null);
  const funnelDomains = readFunnelDomains(settings?.dataJson ?? null);

  const funnels = await prisma.creditFunnel.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, slug: true, name: true, status: true, createdAt: true, updatedAt: true },
  });

  const funnelsWithDomains = funnels.map((f) => ({ ...f, assignedDomain: funnelDomains[f.id] ?? null }));

  return NextResponse.json({ ok: true, funnels: funnelsWithDomains });
}

export async function POST(req: Request) {
  try {
    const auth = await requireFunnelBuilderSession();
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
        { status: auth.status },
      );
    }

    const ownerId = auth.session.user.id;
  const basePath = auth.variant === "credit" ? "/credit" : "";

    const body = (await req.json().catch(() => null)) as any;
    const explicitSlugRaw = typeof body?.slug === "string" ? body.slug : "";
    const explicitSlug = explicitSlugRaw.trim() ? normalizeSlug(explicitSlugRaw) : null;
    const explicitName = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
    const templateKey = coerceCreditFunnelTemplateKey(body?.templateKey);
    const template = templateKey ? getCreditFunnelTemplate(templateKey) : null;
    const suggestedNaming = buildSuggestedFunnelNaming({
      pageType: body?.pageType,
      funnelGoal: body?.funnelGoal,
      offer: body?.offerSummary ?? body?.offer,
      primaryCta: body?.primaryCta,
      fallbackSlug: explicitSlug || undefined,
      fallbackName: explicitName || undefined,
      templateLabel: template?.label,
    });
    const slug = normalizeSlug(explicitSlug || suggestedNaming.slug);
    const name = explicitName || suggestedNaming.name;

    if (explicitSlugRaw.trim() && !explicitSlug) {
      return NextResponse.json({ ok: false, error: "Invalid slug - use letters, numbers, and dashes (2-60 characters)." }, { status: 400 });
    }

    if (!slug) {
      return NextResponse.json({ ok: false, error: "Unable to derive a valid funnel slug." }, { status: 400 });
    }

    if (!name || name.length > 120) {
      return NextResponse.json({ ok: false, error: "Invalid name" }, { status: 400 });
    }

    const requestedThemeKey = coerceCreditFunnelThemeKey(body?.themeKey);
    const themeKey = template ? requestedThemeKey || template.defaultThemeKey : null;
    const theme = themeKey ? getCreditFunnelTheme(themeKey) : null;
    const hasDraftHtml = await dbHasCreditFunnelPageDraftHtmlColumn();
    const blankPageNaming = buildSuggestedPageNaming({
      pageType: body?.pageType,
      primaryCta: body?.primaryCta,
      offer: body?.offerSummary ?? body?.offer,
      fallbackSlug: "home",
    });
    const firstPageIntent = inferFunnelPageIntentProfile({
      pageType: body?.pageType,
      pageGoal: body?.pageGoal,
      audience: body?.audience,
      offer: body?.offerSummary ?? body?.offer,
      primaryCta: body?.primaryCta,
      companyContext: body?.companyContext,
      qualificationFields: body?.qualificationFields,
      routingDestination: body?.routingDestination,
      formStrategy: body?.formStrategy,
      heroAssetMode: body?.heroAssetMode,
      shellFrameId: body?.shellFrameId,
      shellConcept: body?.shellConcept,
      sectionPlan: body?.sectionPlan,
      askClarifyingQuestions: body?.askClarifyingQuestions,
    });
    const initializationScaffold = template
      ? null
      : await buildFunnelInitializationScaffold({
          funnelName: name,
          pageType: firstPageIntent.pageType,
          pageGoal: firstPageIntent.pageGoal,
          primaryCta: firstPageIntent.primaryCta,
          offer: firstPageIntent.offer,
          preferCustomMode: body?.preferCustomMode === true,
          shellConcept: firstPageIntent.shellConcept,
          sectionPlan: firstPageIntent.sectionPlan,
          decisionInput: {
            pageType: body?.pageType,
            funnelGoal: body?.funnelGoal,
            offer: body?.offerSummary ?? body?.offer,
            audience: body?.audienceSummary ?? body?.audience,
            primaryCta: body?.primaryCta,
            name,
            slug,
            preferCustomMode: body?.preferCustomMode,
          },
        });

    const pageTemplates = template && theme ? buildCreditFunnelPagesFromTemplateAndTheme(template, theme) : null;
    const pagesCreate = pageTemplates
      ? pageTemplates.map((p) => ({
          slug: p.slug,
          title: p.title,
          sortOrder: p.sortOrder,
          editorMode: p.editorMode,
          contentMarkdown: p.contentMarkdown,
          blocksJson: p.blocksJson as unknown as Prisma.InputJsonValue,
          ...applyDraftHtmlWriteCompat(createFunnelPageMirroredHtmlUpdate(p.customHtml || ""), hasDraftHtml),
          ...(p.customChatJson !== undefined && p.customChatJson !== null
            ? { customChatJson: p.customChatJson as unknown as Prisma.InputJsonValue }
            : {}),
        }))
      : initializationScaffold
        ? initializationScaffold.seeds.map((seed) => ({
            slug: seed.slug,
            title: seed.title,
            sortOrder: seed.sortOrder,
            editorMode: seed.editorMode,
            contentMarkdown: seed.contentMarkdown,
            blocksJson: seed.blocksJson as unknown as Prisma.InputJsonValue,
            ...applyDraftHtmlWriteCompat(createFunnelPageMirroredHtmlUpdate(seed.customHtml || ""), hasDraftHtml),
          }))
        : [
            {
              slug: "home",
              title: blankPageNaming.title || name,
              sortOrder: 0,
              editorMode: "BLOCKS" as const,
              contentMarkdown: "",
              blocksJson: [] as unknown as Prisma.InputJsonValue,
              ...applyDraftHtmlWriteCompat(createFunnelPageMirroredHtmlUpdate(""), hasDraftHtml),
            },
          ];

    const existingBySlug = await prisma.creditFunnel.findFirst({
      where: { ownerId, slug },
      select: { id: true },
    });
    if (existingBySlug) {
      return NextResponse.json({ ok: false, error: "A funnel with that slug already exists. Try a different slug." }, { status: 409 });
    }

    const charged = await consumeCredits(ownerId, PORTAL_CREDIT_COSTS.funnelCreate);
    if (!charged.ok) {
      return NextResponse.json({ ok: false, error: "Insufficient credits" }, { status: 402 });
    }

    let funnel: any = null;
    let candidate = slug;
    try {
      for (let i = 0; i < 8; i += 1) {
        funnel = await prisma.$transaction(async (tx) => {
          const created = await tx.creditFunnel
            .create({
              data: {
                ownerId,
                slug: candidate,
                name,
                ...(pagesCreate?.length ? { pages: { create: pagesCreate } } : {}),
              },
              select: { id: true, slug: true, name: true, status: true, createdAt: true, updatedAt: true },
            })
            .catch((e) => {
              const msg = String((e as any)?.message || "");
              if (msg.includes("CreditFunnel_slug_key") || msg.toLowerCase().includes("unique")) return null;
              throw e;
            });

          if (!created) return null;

          const seededBrief = inferFunnelBriefProfile({
            existing: {
              funnelGoal: body?.funnelGoal,
              offerSummary: body?.offerSummary ?? body?.offer,
              audienceSummary: body?.audienceSummary ?? body?.audience,
              qualificationFields: body?.qualificationFields,
              routingDestination: body?.routingDestination,
              companyContext: body?.companyContext,
              integrationPlan: body?.integrationPlan,
            },
            funnelName: created.name,
            funnelSlug: created.slug,
          });

          const starterPage = await tx.creditFunnelPage.findFirst({
            where: { funnelId: created.id },
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            select: { id: true, slug: true, title: true },
          });
          const createdPages = await tx.creditFunnelPage.findMany({
            where: { funnelId: created.id },
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            select: { id: true, slug: true, title: true, blocksJson: true, editorMode: true },
          });

          if (initializationScaffold) {
            for (const createdPage of createdPages) {
              const blocks = Array.isArray(createdPage.blocksJson) ? createdPage.blocksJson : [];
              if (!blocks.length || createdPage.editorMode !== "BLOCKS") continue;
              const mirroredHtml = blocksToCustomHtmlDocument({
                blocks: blocks as any,
                pageId: createdPage.id,
                ownerId,
                basePath,
                title: createdPage.title || created.name || "Funnel page",
              });
              await tx.creditFunnelPage.update({
                where: { id: createdPage.id },
                data: applyDraftHtmlWriteCompat(createFunnelPageMirroredHtmlUpdate(mirroredHtml), hasDraftHtml),
                select: { id: true },
              });
            }
          }

          const seededPageBrief = !pageTemplates && starterPage
            ? inferFunnelPageIntentProfile({
                funnelBrief: seededBrief,
                funnelName: created.name,
                funnelSlug: created.slug,
                pageTitle: starterPage.title,
                pageSlug: starterPage.slug,
                pageType: body?.pageType,
                pageGoal: body?.pageGoal,
                audience: body?.audience,
                offer: body?.offerSummary ?? body?.offer,
                primaryCta: body?.primaryCta,
                companyContext: body?.companyContext,
                qualificationFields: body?.qualificationFields,
                routingDestination: body?.routingDestination,
                formStrategy: body?.formStrategy,
                heroAssetMode: body?.heroAssetMode,
                shellFrameId: body?.shellFrameId,
                shellConcept: body?.shellConcept,
                sectionPlan: body?.sectionPlan,
                askClarifyingQuestions: body?.askClarifyingQuestions,
              })
            : null;
          const scaffoldBriefsBySlug = new Map(
            (initializationScaffold?.seeds || []).map((seed) => [seed.slug, seed.briefSeed] as const),
          );

          await mutateCreditFunnelBuilderSettingsTx(tx, ownerId, (current) => ({
            next: (() => {
              let nextSettings = writeFunnelBrief(current, created.id, seededBrief);
              if (pageTemplates) return nextSettings;
              if (initializationScaffold) {
                for (const createdPage of createdPages) {
                  const briefSeed = scaffoldBriefsBySlug.get(createdPage.slug);
                  if (!briefSeed) continue;
                  const nextBrief = inferFunnelPageIntentProfile({
                    funnelBrief: seededBrief,
                    funnelName: created.name,
                    funnelSlug: created.slug,
                    pageTitle: createdPage.title,
                    pageSlug: createdPage.slug,
                    pageType: briefSeed.pageType,
                    pageGoal: briefSeed.pageGoal,
                    audience: body?.audience,
                    offer: body?.offerSummary ?? body?.offer,
                    primaryCta: body?.primaryCta,
                    companyContext: body?.companyContext,
                    qualificationFields: body?.qualificationFields,
                    routingDestination: body?.routingDestination,
                    formStrategy: body?.formStrategy,
                    heroAssetMode: body?.heroAssetMode,
                    shellFrameId: body?.shellFrameId,
                    shellConcept: briefSeed.shellConcept,
                    sectionPlan: briefSeed.sectionPlan,
                    askClarifyingQuestions: briefSeed.askClarifyingQuestions,
                  });
                  nextSettings = writeFunnelPageBrief(nextSettings, createdPage.id, nextBrief);
                }
                return nextSettings;
              }
              if (seededPageBrief && starterPage) {
                return writeFunnelPageBrief(nextSettings, starterPage.id, seededPageBrief);
              }
              return nextSettings;
            })(),
            value: null,
          }));

          return created;
        });

        if (funnel) break;
        candidate = withRandomSuffix(slug);
      }

      if (!funnel) {
        await addCredits(ownerId, PORTAL_CREDIT_COSTS.funnelCreate).catch(() => null);
        return NextResponse.json({ ok: false, error: "A funnel with that slug already exists. Try a different slug." }, { status: 409 });
      }
    } catch (e) {
      await addCredits(ownerId, PORTAL_CREDIT_COSTS.funnelCreate).catch(() => null);
      throw e;
    }

    return NextResponse.json({
      ok: true,
      funnel,
      initialization: template
        ? {
            mode: "template",
            confidence: "high",
            label: template.label,
            summary: `Loaded the ${template.label.toLowerCase()} template.`,
            pageCount: pageTemplates?.length || 0,
            pageTitles: (pageTemplates || []).map((page) => page.title),
          }
        : initializationScaffold?.summary || null,
    });
  } catch (e) {
    console.error("[funnel POST error]", e);
    return NextResponse.json({ ok: false, error: "Failed to create funnel. Please try again." }, { status: 500 });
  }
}
