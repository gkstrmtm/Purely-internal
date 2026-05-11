import { hostedFunnelPath } from "@/lib/publicHostedKeys";
import { isLocalHostedHost, toRuntimeHostedUrl } from "@/lib/publicHostedOrigin";

export type FunnelPagePublishAudit = {
  label: string;
  tone: "clear" | "watch";
  summary: string;
  warnings: string[];
  strengths: string[];
  metrics: {
    fetchMs: number;
    htmlChars: number;
    inlineMediaCount: number;
    heavyInlineMediaCount: number;
    imageCount: number;
    actionCount: number;
  };
  checkedAt: string;
  liveUrl: string;
};

type AuditPublishedPageInput = {
  requestOrigin: string;
  assignedDomain?: string | null;
  funnelSlug: string;
  funnelId: string;
  pageSlug?: string | null;
};

const PUBLISH_AUDIT_LABEL = "Live check";

function countMatches(value: string, pattern: RegExp) {
  return (String(value || "").match(pattern) || []).length;
}

function readInlineMediaMatches(html: string) {
  return Array.from(String(html || "").matchAll(/<(img|video|source)\b[^>]+(?:src|poster)=['"](data:[^'"]+)['"][^>]*>/gi));
}

function buildLiveUrl(input: AuditPublishedPageInput) {
  const assignedDomain = String(input.assignedDomain || "").trim().toLowerCase();
  const pageSlugSuffix = String(input.pageSlug || "").trim() && String(input.pageSlug || "").trim().toLowerCase() !== "home"
    ? `/${encodeURIComponent(String(input.pageSlug || "").trim())}`
    : "";

  if (assignedDomain) {
    if (isLocalHostedHost(input.requestOrigin)) {
      return `${input.requestOrigin.replace(/\/$/, "")}/domain-router/${encodeURIComponent(assignedDomain)}/${encodeURIComponent(input.funnelSlug)}${pageSlugSuffix}`;
    }
    return `https://${assignedDomain}/${encodeURIComponent(input.funnelSlug)}${pageSlugSuffix}`;
  }

  const hostedPath = hostedFunnelPath(input.funnelSlug, input.funnelId);
  if (!hostedPath) return null;
  return toRuntimeHostedUrl(`${hostedPath}${pageSlugSuffix}`, input.requestOrigin);
}

export async function auditPublishedFunnelPage(input: AuditPublishedPageInput): Promise<FunnelPagePublishAudit> {
  const liveUrl = buildLiveUrl(input);
  const checkedAt = new Date().toISOString();

  if (!liveUrl) {
    return {
      label: PUBLISH_AUDIT_LABEL,
      tone: "watch",
      summary: "Published, but the live page could not be checked right after publish.",
      warnings: ["Live URL resolution failed, so this publish pass could not verify the real hosted response."],
      strengths: [],
      metrics: { fetchMs: 0, htmlChars: 0, inlineMediaCount: 0, heavyInlineMediaCount: 0, imageCount: 0, actionCount: 0 },
      checkedAt,
      liveUrl: "",
    };
  }

  const startedAt = Date.now();
  try {
    const response = await fetch(liveUrl, { method: "GET", cache: "no-store", redirect: "follow" });
    const fetchMs = Date.now() - startedAt;
    const html = await response.text();
    const inlineMediaMatches = readInlineMediaMatches(html);
    const heavyInlineMediaCount = inlineMediaMatches.filter((match) => String(match[2] || "").length >= 150_000).length;
    const warnings: string[] = [];
    const strengths: string[] = [];

    if (!response.ok) {
      warnings.push(`The published page returned HTTP ${response.status} on the first live fetch.`);
    } else {
      strengths.push("The live page returned HTML immediately after publish.");
    }

    if (fetchMs > 3000) warnings.push("The first live fetch was slower than expected. Recheck payload size and expensive embeds before relying on this publish pass.");
    if (heavyInlineMediaCount > 0) warnings.push("The published page still carries heavy inline media. Move those assets to uploaded files so the live page paints faster.");
    if (html.length >= 250_000) warnings.push("The published HTML payload is getting heavy. Trim repeated markup and large inline assets before widening usage.");

    const actionCount = countMatches(html, /<(a|button|form)\b/gi);
    const imageCount = countMatches(html, /<(img|picture|video)\b/gi);
    if (actionCount === 0) warnings.push("The published page rendered without an obvious action surface. Recheck the live route before treating this as ready.");
    if (response.ok && fetchMs <= 3000 && heavyInlineMediaCount === 0 && html.length < 250_000) {
      strengths.push("The first live check stayed within the current response-time and payload guardrails.");
    }

    const tone = warnings.length ? "watch" : "clear";
    const summary = warnings.length
      ? warnings[0]
      : "Live page responded cleanly on the first post-publish check.";

    return {
      label: PUBLISH_AUDIT_LABEL,
      tone,
      summary,
      warnings: Array.from(new Set(warnings)).slice(0, 3),
      strengths: Array.from(new Set(strengths)).slice(0, 2),
      metrics: {
        fetchMs,
        htmlChars: html.length,
        inlineMediaCount: inlineMediaMatches.length,
        heavyInlineMediaCount,
        imageCount,
        actionCount,
      },
      checkedAt,
      liveUrl,
    };
  } catch {
    return {
      label: PUBLISH_AUDIT_LABEL,
      tone: "watch",
      summary: "Published, but the live page could not be checked right after publish.",
      warnings: ["The publish route could not fetch the live page right after publish."],
      strengths: [],
      metrics: { fetchMs: Date.now() - startedAt, htmlChars: 0, inlineMediaCount: 0, heavyInlineMediaCount: 0, imageCount: 0, actionCount: 0 },
      checkedAt,
      liveUrl,
    };
  }
}