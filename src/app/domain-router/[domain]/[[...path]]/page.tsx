import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { inlineMarkdownToHtmlSafe, parseBlogContent } from "@/lib/blog";
import { coerceBlocksJson, renderCreditFunnelBlocks } from "@/lib/creditFunnelBlocks";
import { coerceFontFamily, coerceGoogleFamily } from "@/lib/fontPresets";

import { CreditHostedFormClient, type CreditFormStyle, type Field } from "@/app/credit/forms/[slug]/CreditHostedFormClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DomainRootMode = "DISABLED" | "DIRECTORY" | "REDIRECT";

function safeRootMode(raw: unknown): DomainRootMode {
  const s = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (s === "DISABLED" || s === "DIRECTORY" || s === "REDIRECT") return s;
  return "DIRECTORY";
}

function safeSlug(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!s) return null;
  if (s.length > 80) return null;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(s)) return null;
  return s;
}

function readDomainSettings(settingsJson: unknown, domain: string): { rootMode: DomainRootMode; rootFunnelSlug: string | null } {
  if (!settingsJson || typeof settingsJson !== "object" || Array.isArray(settingsJson)) {
    return { rootMode: "DIRECTORY", rootFunnelSlug: null };
  }
  const domains = (settingsJson as any).customDomains;
  if (!domains || typeof domains !== "object" || Array.isArray(domains)) {
    return { rootMode: "DIRECTORY", rootFunnelSlug: null };
  }
  const row = (domains as any)[domain];
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return { rootMode: "DIRECTORY", rootFunnelSlug: null };
  }
  const rootMode = safeRootMode((row as any).rootMode);
  const rootFunnelSlug = safeSlug((row as any).rootFunnelSlug);
  return { rootMode, rootFunnelSlug };
}

function normalizeDomain(raw: unknown) {
  let s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!s) return null;

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

function normalizeSegments(raw: unknown): string[] {
  if (!raw) return [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .slice(0, 10);
}

function getDefaultFields(): Field[] {
  return [
    { name: "fullName", label: "Full name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "message", label: "Message", type: "textarea" },
  ];
}

function parseFields(schemaJson: unknown): Field[] {
  if (!schemaJson || typeof schemaJson !== "object") return getDefaultFields();
  const fields = (schemaJson as any).fields;
  if (!Array.isArray(fields)) return getDefaultFields();

  const allowed = new Set<Field["type"]>([
    "short_answer",
    "long_answer",
    "paragraph",
    "name",
    "email",
    "phone",
    "checklist",
    // legacy
    "text",
    "tel",
    "textarea",
  ]);

  const out: Field[] = [];
  for (const f of fields) {
    if (!f || typeof f !== "object") continue;
    const name = typeof (f as any).name === "string" ? (f as any).name.trim() : "";
    const label = typeof (f as any).label === "string" ? (f as any).label.trim() : "";
    const type = (f as any).type;
    const required = (f as any).required === true;
    const optionsRaw = (f as any).options;

    if (!name || !label) continue;
    if (!allowed.has(type)) continue;
    const options = Array.isArray(optionsRaw)
      ? optionsRaw
          .filter((x: any) => typeof x === "string")
          .map((s: string) => s.trim())
          .filter(Boolean)
          .slice(0, 50)
      : undefined;
    out.push({ name, label, type, required, options });
  }

  return out.length ? out.slice(0, 25) : getDefaultFields();
}

function parseHexColor(raw: unknown) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  if (s === "transparent") return "transparent";
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) return null;
  return s;
}

function parseStyle(schemaJson: unknown): CreditFormStyle {
  if (!schemaJson || typeof schemaJson !== "object") return {};
  const raw = (schemaJson as any).style;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const out: CreditFormStyle = {};
  const pageBg = parseHexColor((raw as any).pageBg);
  const cardBg = parseHexColor((raw as any).cardBg);
  const buttonBg = parseHexColor((raw as any).buttonBg);
  const buttonText = parseHexColor((raw as any).buttonText);
  const inputBg = parseHexColor((raw as any).inputBg);
  const inputBorder = parseHexColor((raw as any).inputBorder);
  const textColor = parseHexColor((raw as any).textColor);
  const fontFamily = coerceFontFamily((raw as any).fontFamily);
  const fontGoogleFamily = coerceGoogleFamily((raw as any).fontGoogleFamily);

  if (pageBg) out.pageBg = pageBg;
  if (cardBg) out.cardBg = cardBg;
  if (buttonBg) out.buttonBg = buttonBg;
  if (buttonText) out.buttonText = buttonText;
  if (inputBg) out.inputBg = inputBg;
  if (inputBorder) out.inputBorder = inputBorder;
  if (textColor) out.textColor = textColor;
  if (fontFamily) out.fontFamily = fontFamily;
  if (fontGoogleFamily) out.fontGoogleFamily = fontGoogleFamily;

  const radiusPx = (raw as any).radiusPx;
  if (typeof radiusPx === "number" && Number.isFinite(radiusPx)) {
    out.radiusPx = Math.max(0, Math.min(40, Math.round(radiusPx)));
  }

  return out;
}

async function resolveCustomDomain(host: string): Promise<{ ownerId: string; matchedDomain: string; status: "PENDING" | "VERIFIED" } | null> {
  const clean = String(host || "").trim().toLowerCase();
  if (!clean) return null;

  const primary = await prisma.creditCustomDomain
    .findFirst({ where: { domain: clean }, select: { ownerId: true, domain: true, status: true } })
    .catch(() => null);
  if (primary) return { ownerId: primary.ownerId, matchedDomain: primary.domain, status: primary.status };

  if (clean.startsWith("www.")) {
    const apex = clean.slice(4);
    const fallback = await prisma.creditCustomDomain
      .findFirst({ where: { domain: apex }, select: { ownerId: true, domain: true, status: true } })
      .catch(() => null);
    if (fallback) return { ownerId: fallback.ownerId, matchedDomain: fallback.domain, status: fallback.status };
  }

  return null;
}

function FunnelMarkdown({ blocks }: { blocks: any[] }) {
  return (
    <div className="prose prose-zinc max-w-none">
      {blocks.map((b, idx) => {
        if (b.type === "h2") {
          return (
            <h2 key={idx} className="pt-4 text-xl font-bold text-zinc-900">
              <span dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtmlSafe(b.text) }} />
            </h2>
          );
        }
        if (b.type === "h3") {
          return (
            <h3 key={idx} className="pt-2 text-lg font-bold text-zinc-900">
              <span dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtmlSafe(b.text) }} />
            </h3>
          );
        }
        if (b.type === "p") {
          return (
            <p key={idx} className="text-base leading-relaxed text-zinc-700">
              <span dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtmlSafe(b.text) }} />
            </p>
          );
        }
        if (b.type === "ul") {
          return (
            <ul key={idx} className="list-disc space-y-1 pl-6 text-zinc-700">
              {b.items.map((item: string, j: number) => (
                <li key={j}>
                  <span dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtmlSafe(item) }} />
                </li>
              ))}
            </ul>
          );
        }
        if (b.type === "img") {
          return (
            <div key={idx} className="overflow-hidden rounded-2xl border border-zinc-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.src} alt={b.alt} className="h-auto w-full" />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

async function renderFunnel(ownerId: string, slug: string, funnelDomains: Record<string, string>, allowedDomains: Set<string>) {
  const funnel = await prisma.creditFunnel
    .findFirst({
      where: { ownerId, slug },
      select: {
        id: true,
        ownerId: true,
        pages: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          take: 1,
          select: {
            title: true,
            contentMarkdown: true,
            editorMode: true,
            blocksJson: true,
            customHtml: true,
          },
        },
      },
    })
    .catch(() => null);

  if (!funnel) notFound();

  const assignedDomain = funnelDomains[funnel.id] ?? null;
  if (assignedDomain && !allowedDomains.has(assignedDomain)) notFound();

  const page = funnel.pages[0] || null;
  const markdownBlocks = page ? parseBlogContent(page.contentMarkdown) : [];
  const blockBlocks = page ? coerceBlocksJson(page.blocksJson) : [];

  return (
    <main className="w-full min-h-screen">
      {page ? (
        <>
          {page.editorMode === "CUSTOM_HTML" ? (
            <iframe
              title={page.title}
              sandbox="allow-forms allow-popups allow-scripts"
              srcDoc={page.customHtml || ""}
              className="h-[100vh] w-full bg-white"
            />
          ) : page.editorMode === "BLOCKS" ? (
            <div>
              {renderCreditFunnelBlocks({
                blocks: blockBlocks,
                basePath: "",
                context: { bookingOwnerId: funnel.ownerId },
              })}
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl p-8">
              <FunnelMarkdown blocks={markdownBlocks} />
            </div>
          )}
        </>
      ) : (
        <div className="mx-auto w-full max-w-3xl p-8">
          <p className="text-sm text-zinc-700">No pages yet for this funnel.</p>
        </div>
      )}
    </main>
  );
}

export default async function CustomDomainCatchallPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string; path?: string[] }>;
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const { domain, path } = await params;
  const host = decodeURIComponent(String(domain || "")).trim().toLowerCase();
  if (!host) notFound();

  const mapping = await resolveCustomDomain(host);
  if (!mapping) notFound();

  if (mapping.status !== "VERIFIED") {
    return (
      <main className="mx-auto w-full max-w-2xl p-8">
        <h1 className="text-2xl font-bold text-zinc-900">Domain pending verification</h1>
        <p className="mt-2 text-sm text-zinc-700">
          This domain is saved, but not verified yet. DNS changes can take time to propagate.
        </p>
      </main>
    );
  }

  const segments = normalizeSegments(path);

  const settingsRow = await prisma.creditFunnelBuilderSettings
    .findUnique({ where: { ownerId: mapping.ownerId }, select: { dataJson: true } })
    .catch(() => null);

  const funnelDomains = readFunnelDomains(settingsRow?.dataJson ?? null);
  const allowedDomains = new Set([mapping.matchedDomain, host]);

  const settings = (() => {
    const direct = readDomainSettings(settingsRow?.dataJson ?? null, mapping.matchedDomain);
    if (direct.rootMode !== "DIRECTORY" || direct.rootFunnelSlug) return direct;
    if (host !== mapping.matchedDomain) {
      const alt = readDomainSettings(settingsRow?.dataJson ?? null, host);
      return alt;
    }
    return direct;
  })();

  // Root behavior
  if (segments.length === 0) {
    if (settings.rootMode === "DISABLED") notFound();
    if (settings.rootMode === "REDIRECT" && settings.rootFunnelSlug) {
      redirect(`/${settings.rootFunnelSlug}`);
    }

    const funnels = await prisma.creditFunnel.findMany({
      where: { ownerId: mapping.ownerId, status: "ACTIVE" },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, name: true, slug: true },
      take: 100,
    });

    const visibleFunnels = funnels.filter((f) => {
      const assigned = funnelDomains[f.id] ?? null;
      if (!assigned) return true;
      return allowedDomains.has(assigned);
    });

    return (
      <main className="mx-auto w-full max-w-3xl p-8">
        <h1 className="text-2xl font-bold text-zinc-900">Funnels</h1>
        <p className="mt-2 text-sm text-zinc-600">Choose a page to visit.</p>

        <div className="mt-6 space-y-3">
          {visibleFunnels.length ? (
            visibleFunnels.map((f) => (
              <Link
                key={f.id}
                href={`/${encodeURIComponent(f.slug)}`}
                className="block rounded-2xl border border-zinc-200 bg-white p-4 hover:bg-zinc-50"
              >
                <div className="text-sm font-semibold text-zinc-900">{f.name}</div>
                <div className="mt-1 text-xs font-mono text-zinc-600">/{f.slug}</div>
              </Link>
            ))
          ) : (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">No active funnels yet.</div>
          )}
        </div>
      </main>
    );
  }

  // /f/<slug>
  if (segments[0] === "f") {
    const funnelSlug = safeSlug(segments[1]);
    if (!funnelSlug || segments.length > 2) notFound();
    return renderFunnel(mapping.ownerId, funnelSlug, funnelDomains, allowedDomains);
  }

  // /forms/<slug>
  if (segments[0] === "forms") {
    const formSlug = safeSlug(segments[1]);
    if (!formSlug || segments.length > 2) notFound();

    const embedRaw = searchParams?.embed;
    const embed = Array.isArray(embedRaw) ? embedRaw[0] === "1" : embedRaw === "1";

    const form = await prisma.creditForm
      .findFirst({ where: { ownerId: mapping.ownerId, slug: formSlug }, select: { name: true, slug: true, schemaJson: true } })
      .catch(() => null);

    if (!form) notFound();

    const fields = parseFields(form.schemaJson);
    const style = parseStyle(form.schemaJson);
    const pageBg = style.pageBg ?? (embed ? "transparent" : "#f4f4f5");

    return (
      <div className={embed ? "w-full" : "min-h-dvh w-full"} style={{ backgroundColor: pageBg }}>
        <main className={embed ? "mx-auto w-full max-w-3xl p-0" : "mx-auto w-full max-w-3xl p-8"}>
          <CreditHostedFormClient slug={form.slug} formName={form.name} fields={fields} embedded={embed} style={style} submitBasePath="/credit" />
        </main>
      </div>
    );
  }

  // /<funnelSlug>
  if (segments.length === 1) {
    const funnelSlug = safeSlug(segments[0]);
    if (!funnelSlug) notFound();
    return renderFunnel(mapping.ownerId, funnelSlug, funnelDomains, allowedDomains);
  }

  notFound();
}
