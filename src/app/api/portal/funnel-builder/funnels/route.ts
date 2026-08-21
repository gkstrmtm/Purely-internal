import { NextResponse } from "next/server";

import type { Prisma } from "@prisma/client";

import type { CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import { normalizeCreditFormSchema } from "@/lib/creditFormSchema";
import { getCreditFormTheme } from "@/lib/creditFormThemes";
import { prisma } from "@/lib/db";
import { buildCreditFunnelPagesFromTemplateAndTheme, coerceCreditFunnelTemplateKey, getCreditFunnelTemplate } from "@/lib/creditFunnelTemplates";
import { coerceCreditFunnelThemeKey, getCreditFunnelTheme } from "@/lib/creditFunnelThemes";
import { mutateCreditFunnelBuilderSettingsTx } from "@/lib/creditFunnelBuilderSettingsStore";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import { ensureFunnelBookingCalendar } from "@/lib/funnelBookingCalendars";
import { blocksToCustomHtmlDocument } from "@/lib/funnelBlocksToCustomHtmlDocument";
import { applyDraftHtmlWriteCompat, dbHasCreditFunnelPageDraftHtmlColumn } from "@/lib/funnelPageDbCompat";
import { buildSuggestedFunnelNaming, buildSuggestedPageNaming, inferFunnelBriefProfile, inferFunnelPageIntentProfile, writeFunnelBrief, writeFunnelPageBrief, type FunnelPageIntentType } from "@/lib/funnelPageIntent";
import { buildFunnelInitializationScaffold } from "@/lib/funnelStencilRegistry.server";
import { createFunnelPageMirroredHtmlUpdate } from "@/lib/funnelPageState";
import { getBusinessProfileFoundationContext } from "@/lib/businessProfileAiContext.server";
import { consumeCredits, consumeCreditsOnce } from "@/lib/credits";
import { addCredits } from "@/lib/credits";
import { enforceFunnelBuilderRouteRateLimit, readFunnelBuilderRequestId } from "@/lib/funnelBuilderGuardrails";
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

function hasStructuredInitializationIntent(body: Record<string, unknown> | null) {
  if (!body) return false;

  const signalKeys = [
    "pageType",
    "pageGoal",
    "funnelGoal",
    "offer",
    "offerSummary",
    "audience",
    "audienceSummary",
    "primaryCta",
    "companyContext",
    "qualificationFields",
    "routingDestination",
    "formStrategy",
    "heroAssetMode",
    "shellFrameId",
    "shellConcept",
    "sectionPlan",
  ] as const;

  return signalKeys.some((key) => {
    const value = body[key];
    return typeof value === "string" ? Boolean(value.trim()) : value != null;
  });
}

function cleanContextText(value: unknown, maxLen: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLen) : "";
}

function buildBusinessProfileContextSeed(profile: Awaited<ReturnType<typeof getBusinessProfileFoundationContext>>) {
  if (!profile) return "";

  return [
    profile.businessName ? `Business: ${cleanContextText(profile.businessName, 160)}` : "",
    profile.industry ? `Industry: ${cleanContextText(profile.industry, 140)}` : "",
    profile.businessModel ? `Model: ${cleanContextText(profile.businessModel, 180)}` : "",
    profile.targetCustomer ? `Audience: ${cleanContextText(profile.targetCustomer, 180)}` : "",
    Array.isArray(profile.primaryGoals) && profile.primaryGoals.length
      ? `Goals: ${profile.primaryGoals.map((goal) => cleanContextText(goal, 100)).filter(Boolean).slice(0, 6).join("; ")}`
      : "",
    profile.brandVoice ? `Voice: ${cleanContextText(profile.brandVoice, 180)}` : "",
    profile.businessContext ? `Context: ${cleanContextText(profile.businessContext, 320)}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 480);
}

type FunnelCreatePageSeed = {
  slug: string;
  title: string;
  sortOrder: number;
  editorMode: "BLOCKS" | "CUSTOM_HTML" | "MARKDOWN";
  contentMarkdown: string;
  customHtml: string;
  blocksJson: CreditFunnelBlock[];
  customChatJson?: Prisma.InputJsonValue;
};

function blockTreeSome(blocks: CreditFunnelBlock[], predicate: (block: CreditFunnelBlock) => boolean): boolean {
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    if (predicate(block)) return true;

    if (block.type === "section") {
      const props: any = block.props;
      const nestedGroups = [props?.children, props?.leftChildren, props?.rightChildren];
      for (const nested of nestedGroups) {
        if (Array.isArray(nested) && blockTreeSome(nested as CreditFunnelBlock[], predicate)) return true;
      }
    }

    if (block.type === "columns") {
      const columns = Array.isArray((block.props as any)?.columns) ? ((block.props as any).columns as Array<{ children?: CreditFunnelBlock[] }>) : [];
      for (const column of columns) {
        if (Array.isArray(column?.children) && blockTreeSome(column.children, predicate)) return true;
      }
    }
  }

  return false;
}

function replaceStarterFormSlug(blocks: CreditFunnelBlock[], starterFormSlug: string): CreditFunnelBlock[] {
  return blocks.map((block) => {
    if (!block || typeof block !== "object") return block;

    if (block.type === "formLink" || block.type === "formEmbed") {
      const currentSlug = String((block.props as any)?.formSlug || "").trim().toLowerCase();
      if (!currentSlug || currentSlug === "intake") {
        return {
          ...block,
          props: {
            ...(block.props as any),
            formSlug: starterFormSlug,
          },
        } as CreditFunnelBlock;
      }
      return block;
    }

    if (block.type === "section") {
      const props: any = block.props;
      return {
        ...block,
        props: {
          ...props,
          ...(Array.isArray(props?.children) ? { children: replaceStarterFormSlug(props.children, starterFormSlug) } : null),
          ...(Array.isArray(props?.leftChildren) ? { leftChildren: replaceStarterFormSlug(props.leftChildren, starterFormSlug) } : null),
          ...(Array.isArray(props?.rightChildren) ? { rightChildren: replaceStarterFormSlug(props.rightChildren, starterFormSlug) } : null),
        },
      } as CreditFunnelBlock;
    }

    if (block.type === "columns") {
      const props: any = block.props;
      const columns = Array.isArray(props?.columns) ? props.columns : [];
      return {
        ...block,
        props: {
          ...props,
          columns: columns.map((column: any) => ({
            ...column,
            ...(Array.isArray(column?.children) ? { children: replaceStarterFormSlug(column.children, starterFormSlug) } : null),
          })),
        },
      } as CreditFunnelBlock;
    }

    return block;
  });
}

function buildStarterFormDraft(opts: {
  pageType: FunnelPageIntentType;
  funnelName: string;
  funnelSlug: string;
  offer: string;
}) {
  const theme = getCreditFormTheme("platinum-blue");
  const offer = typeof opts.offer === "string" ? opts.offer.trim() : "";
  const funnelName = opts.funnelName.trim() || "New funnel";

  if (opts.pageType === "webinar") {
    return {
      slugBase: normalizeSlug(`${opts.funnelSlug}-register`) || "register",
      name: `${funnelName} registration`,
      schemaJson: normalizeCreditFormSchema({
        fields: [
          { name: "fullName", label: "Full name", type: "text", required: true },
          { name: "email", label: "Email", type: "email", required: true },
          { name: "phone", label: "Phone", type: "tel" },
        ],
        content: {
          displayTitle: `Register for ${funnelName}`,
          description: "Save your spot and we will send the access details and reminders here.",
        },
        success: {
          title: "You're registered",
          message: "We saved your registration and will send the next details shortly.",
          buttonLabel: "Register another",
          buttonAction: "reset",
          ...(theme?.successColors || {}),
        },
        ...(theme ? { style: theme.style } : null),
      }) as Prisma.InputJsonValue,
    };
  }

  if (opts.pageType === "application") {
    return {
      slugBase: normalizeSlug(`${opts.funnelSlug}-apply`) || "apply",
      name: `${funnelName} application`,
      schemaJson: normalizeCreditFormSchema({
        fields: [
          { name: "fullName", label: "Full name", type: "text", required: true },
          { name: "email", label: "Email", type: "email", required: true },
          { name: "phone", label: "Phone", type: "tel", required: true },
          { name: "goal", label: "What are you trying to accomplish?", type: "short_answer", required: true },
          { name: "timeline", label: "Timeline", type: "radio", options: ["ASAP", "30-60 days", "60-90 days", "Not sure"] },
          { name: "details", label: "Anything we should know before we review this?", type: "long_answer" },
        ],
        content: {
          displayTitle: `${funnelName} application`,
          description: "Share the core details now so the next routing step can happen without back-and-forth.",
        },
        success: {
          title: "Application received",
          message: "We saved your application and the next step can now be routed from this funnel.",
          buttonLabel: "Submit another",
          buttonAction: "reset",
          ...(theme?.successColors || {}),
        },
        ...(theme ? { style: theme.style } : null),
      }) as Prisma.InputJsonValue,
    };
  }

  return {
    slugBase: normalizeSlug(`${opts.funnelSlug}-intake`) || "intake",
    name: `${funnelName} intake`,
    schemaJson: normalizeCreditFormSchema({
      fields: [
        { name: "fullName", label: "Full name", type: "text", required: true },
        { name: "email", label: "Email", type: "email", required: true },
        { name: "phone", label: "Phone", type: "tel", required: true },
        {
          name: "goal",
          label: offer ? `What do you need help with around ${offer}?` : "What do you need help with?",
          type: "short_answer",
          required: true,
        },
        { name: "details", label: "Anything else we should know?", type: "long_answer" },
      ],
      content: {
        displayTitle: offer ? `Get started with ${offer}` : `Get started with ${funnelName}`,
        description: "Send the key details here so this funnel can capture and route the lead immediately.",
      },
      success: {
        title: "You're all set",
        message: "We received your details and the next follow-up can move from here.",
        buttonLabel: "Submit another",
        buttonAction: "reset",
        ...(theme?.successColors || {}),
      },
      ...(theme ? { style: theme.style } : null),
    }) as Prisma.InputJsonValue,
  };
}

async function createStarterFormTx(
  tx: Prisma.TransactionClient,
  opts: { ownerId: string; funnelSlug: string; funnelName: string; pageType: FunnelPageIntentType; offer: string },
) {
  const draft = buildStarterFormDraft(opts);
  let candidate = draft.slugBase;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const created = await tx.creditForm
      .create({
        data: {
          ownerId: opts.ownerId,
          slug: candidate,
          name: draft.name,
          schemaJson: draft.schemaJson,
        },
        select: { id: true, slug: true, name: true },
      })
      .catch((error) => {
        const message = String((error as any)?.message || "");
        if (message.includes("CreditForm_slug_key") || message.toLowerCase().includes("unique")) return null;
        throw error;
      });

    if (created) return created;
    candidate = withRandomSuffix(draft.slugBase);
  }

  throw new Error("Unable to create starter form");
}

function materializeStarterPages(opts: {
  pages: FunnelCreatePageSeed[];
  starterFormSlug?: string | null;
  ownerId: string;
  basePath: string;
  hasDraftHtml: boolean;
  fallbackTitle: string;
}) {
  return opts.pages.map((page) => {
    const nextBlocks = opts.starterFormSlug ? replaceStarterFormSlug(page.blocksJson, opts.starterFormSlug) : page.blocksJson;
    const nextHtml = page.editorMode === "BLOCKS"
      ? blocksToCustomHtmlDocument({
          blocks: nextBlocks,
          pageId: page.slug,
          ownerId: opts.ownerId,
          basePath: opts.basePath,
          title: page.title || opts.fallbackTitle,
        })
      : page.customHtml || "";

    return {
      slug: page.slug,
      title: page.title,
      sortOrder: page.sortOrder,
      editorMode: page.editorMode,
      contentMarkdown: page.contentMarkdown,
      blocksJson: nextBlocks as unknown as Prisma.InputJsonValue,
      ...applyDraftHtmlWriteCompat(createFunnelPageMirroredHtmlUpdate(nextHtml), opts.hasDraftHtml),
      ...(page.customChatJson !== undefined && page.customChatJson !== null ? { customChatJson: page.customChatJson } : {}),
    };
  });
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
    const businessProfile = await getBusinessProfileFoundationContext(ownerId).catch(() => null);
    const clientRequestId = typeof body?.requestId === "string" ? body.requestId.trim().slice(0, 120) : "";
    const requestId = readFunnelBuilderRequestId(req, clientRequestId);
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

    const routeGate = await enforceFunnelBuilderRouteRateLimit({ ownerId, routeKey: "funnel-create", requestId });
    if (!routeGate.ok) {
      return NextResponse.json({ ok: false, error: routeGate.error }, { status: routeGate.status });
    }

    const requestedThemeKey = coerceCreditFunnelThemeKey(body?.themeKey);
    const themeKey = template ? requestedThemeKey || template.defaultThemeKey : null;
    const theme = themeKey ? getCreditFunnelTheme(themeKey) : null;
    const hasDraftHtml = await dbHasCreditFunnelPageDraftHtmlColumn();
    const effectiveAudience =
      cleanContextText(body?.audienceSummary ?? body?.audience, 240) || cleanContextText(businessProfile?.targetCustomer, 240);
    const effectiveCompanyContext =
      cleanContextText(body?.companyContext, 480) || buildBusinessProfileContextSeed(businessProfile);
    const blankPageNaming = buildSuggestedPageNaming({
      pageType: body?.pageType,
      primaryCta: body?.primaryCta,
      offer: body?.offerSummary ?? body?.offer,
      fallbackSlug: "home",
    });
    const firstPageIntent = inferFunnelPageIntentProfile({
      pageType: body?.pageType,
      pageGoal: body?.pageGoal,
      audience: effectiveAudience,
      offer: body?.offerSummary ?? body?.offer,
      primaryCta: body?.primaryCta,
      companyContext: effectiveCompanyContext,
      qualificationFields: body?.qualificationFields,
      routingDestination: body?.routingDestination,
      formStrategy: body?.formStrategy,
      heroAssetMode: body?.heroAssetMode,
      shellFrameId: body?.shellFrameId,
      shellConcept: body?.shellConcept,
      sectionPlan: body?.sectionPlan,
      askClarifyingQuestions: body?.askClarifyingQuestions,
    });
    const shouldForceMinimalCustomScaffold = !template && !hasStructuredInitializationIntent(body);
    const starterFormEligible = firstPageIntent.pageType === "lead-capture" || firstPageIntent.pageType === "application" || firstPageIntent.pageType === "webinar";
    const initializationScaffold = template
      ? null
      : await buildFunnelInitializationScaffold({
          funnelName: name,
          pageType: firstPageIntent.pageType,
          pageGoal: firstPageIntent.pageGoal,
          primaryCta: firstPageIntent.primaryCta,
          offer: firstPageIntent.offer,
          preferCustomMode: shouldForceMinimalCustomScaffold || body?.preferCustomMode === true,
          shellConcept: firstPageIntent.shellConcept,
          sectionPlan: firstPageIntent.sectionPlan,
          decisionInput: {
            pageType: body?.pageType,
            funnelGoal: body?.funnelGoal,
            offer: body?.offerSummary ?? body?.offer,
            audience: effectiveAudience,
            primaryCta: body?.primaryCta,
            name,
            slug,
            preferCustomMode: shouldForceMinimalCustomScaffold || body?.preferCustomMode === true,
          },
          ...(starterFormEligible ? { interactiveDefaults: { starterFormSlug: "intake" } } : null),
        });

    const pageTemplates = template && theme ? buildCreditFunnelPagesFromTemplateAndTheme(template, theme) : null;
    const basePagesCreate: FunnelCreatePageSeed[] = pageTemplates
      ? pageTemplates.map((p) => ({
          slug: p.slug,
          title: p.title,
          sortOrder: p.sortOrder,
          editorMode: p.editorMode,
          contentMarkdown: p.contentMarkdown,
          blocksJson: p.blocksJson,
          customHtml: p.customHtml || "",
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
            blocksJson: seed.blocksJson,
            customHtml: seed.customHtml || "",
          }))
        : [
            {
              slug: "home",
              title: blankPageNaming.title || name,
              sortOrder: 0,
              editorMode: "BLOCKS" as const,
              contentMarkdown: "",
              blocksJson: [],
              customHtml: "",
            },
          ];
    const starterNeedsForm = basePagesCreate.some((page) => blockTreeSome(page.blocksJson, (block) => block.type === "formLink" || block.type === "formEmbed"));
    const starterNeedsBooking = basePagesCreate.some((page) => blockTreeSome(page.blocksJson, (block) => block.type === "calendarEmbed"));
    const bookingStarterPageTitle = basePagesCreate.find((page) => blockTreeSome(page.blocksJson, (block) => block.type === "calendarEmbed"))?.title || name;

    const existingBySlug = await prisma.creditFunnel.findFirst({
      where: { ownerId, slug },
      select: { id: true },
    });
    if (existingBySlug) {
      return NextResponse.json({ ok: false, error: "A funnel with that slug already exists. Try a different slug." }, { status: 409 });
    }

    const charged = clientRequestId
      ? await consumeCreditsOnce(ownerId, PORTAL_CREDIT_COSTS.funnelCreate, `funnel-create:${ownerId}:${slug}:${clientRequestId}`)
      : await consumeCredits(ownerId, PORTAL_CREDIT_COSTS.funnelCreate);
    if (!charged.ok) {
      return NextResponse.json({ ok: false, error: "You need more credits to create a funnel." }, { status: 402 });
    }

    let funnel: any = null;
    let starterFormSlug: string | null = null;
    let candidate = slug;
    try {
      for (let i = 0; i < 8; i += 1) {
        funnel = await prisma.$transaction(async (tx) => {
          const starterForm = starterNeedsForm
            ? await createStarterFormTx(tx, {
                ownerId,
                funnelSlug: candidate,
                funnelName: name,
                pageType: firstPageIntent.pageType,
                offer: String(body?.offerSummary ?? (body?.offer || "")),
              })
            : null;
          starterFormSlug = starterForm?.slug || null;
          const pagesCreate = materializeStarterPages({
            pages: basePagesCreate,
            starterFormSlug,
            ownerId,
            basePath,
            hasDraftHtml,
            fallbackTitle: name,
          });

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
              audienceSummary: effectiveAudience,
              qualificationFields: body?.qualificationFields,
              routingDestination: body?.routingDestination,
              companyContext: effectiveCompanyContext,
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
                audience: effectiveAudience,
                offer: body?.offerSummary ?? body?.offer,
                primaryCta: body?.primaryCta,
                companyContext: effectiveCompanyContext,
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
                    audience: effectiveAudience,
                    offer: body?.offerSummary ?? body?.offer,
                    primaryCta: body?.primaryCta,
                    companyContext: effectiveCompanyContext,
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
        if (!("alreadyConsumed" in charged) || charged.alreadyConsumed !== true) {
          await addCredits(ownerId, PORTAL_CREDIT_COSTS.funnelCreate).catch(() => null);
        }
        return NextResponse.json({ ok: false, error: "A funnel with that slug already exists. Try a different slug." }, { status: 409 });
      }
    } catch (e) {
      if (!("alreadyConsumed" in charged) || charged.alreadyConsumed !== true) {
        await addCredits(ownerId, PORTAL_CREDIT_COSTS.funnelCreate).catch(() => null);
      }
      throw e;
    }

    let bookingProvisionWarning: string | null = null;
    if (funnel && starterNeedsBooking) {
      const bookingResult = await ensureFunnelBookingCalendar({
        ownerId,
        funnelId: funnel.id,
        funnelName: funnel.name,
        pageTitle: bookingStarterPageTitle,
      });
      if (!bookingResult.ok) {
        bookingProvisionWarning = bookingResult.error;
      }
    }

    const initialization = template
      ? {
          mode: "template",
          confidence: "high",
          label: template.label,
          summary: `Loaded the ${template.label.toLowerCase()} template.`,
          pageCount: pageTemplates?.length || 0,
          pageTitles: (pageTemplates || []).map((page) => page.title),
        }
      : initializationScaffold?.summary || null;

    const initializationSummaryAdditions = [
      starterFormSlug ? "a live starter form" : "",
      starterNeedsBooking && !bookingProvisionWarning ? "a linked booking route" : "",
    ].filter(Boolean);
    const nextInitialization = initialization
      ? {
          ...initialization,
          summary: initializationSummaryAdditions.length
            ? `${initialization.summary.replace(/[.]$/, "")}, plus ${initializationSummaryAdditions.join(" and ")}.`
            : initialization.summary,
          ...(bookingProvisionWarning ? { warning: bookingProvisionWarning } : null),
        }
      : null;

    return NextResponse.json({
      ok: true,
      funnel,
      initialization: nextInitialization,
    });
  } catch (e) {
    console.error("[funnel POST error]", e);
    return NextResponse.json({ ok: false, error: "Failed to create funnel. Please try again." }, { status: 500 });
  }
}
