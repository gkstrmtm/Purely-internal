import type { Prisma } from "@prisma/client";

import { resolveCustomDomain, type ResolvedCustomDomain } from "@/lib/customDomainResolver";
import { prisma } from "@/lib/db";
import { publicKeyFromId } from "@/lib/publicHostedKeys";

const PUBLIC_FORM_SELECT = {
  id: true,
  ownerId: true,
  slug: true,
  name: true,
  status: true,
  schemaJson: true,
} satisfies Prisma.CreditFormSelect;

export type PublicResolvedCreditForm = Prisma.CreditFormGetPayload<{
  select: typeof PUBLIC_FORM_SELECT;
}>;

export type PublicFormResolutionMode = "hosted_key" | "custom_domain_slug" | "legacy_slug";

export type PublicFormResolution = {
  form: PublicResolvedCreditForm;
  mode: PublicFormResolutionMode;
  requestHost: string | null;
  customDomain: ResolvedCustomDomain | null;
};

function hostnameFromHeader(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim().toLowerCase() || "";
  if (!first) return null;
  return first.replace(/:\d+$/, "");
}

function parseHostnameFromUrl(raw: string | undefined): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

function addHostnameVariants(out: Set<string>, host: string) {
  const normalized = String(host || "").trim().toLowerCase();
  if (!normalized) return;
  out.add(normalized);

  const isIp = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized);
  if (isIp || !normalized.includes(".")) return;

  if (normalized.startsWith("www.")) out.add(normalized.slice(4));
  else out.add(`www.${normalized}`);
}

function isPlatformHostnameCandidate(host: string): boolean {
  const normalized = String(host || "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "localhost" || normalized === "127.0.0.1") return true;
  if (normalized === "purelyautomation.com" || normalized.endsWith(".purelyautomation.com")) return true;
  if (normalized.endsWith(".vercel.app")) return true;
  return false;
}

function platformHostnames(): Set<string> {
  const out = new Set<string>();
  addHostnameVariants(out, "localhost");
  addHostnameVariants(out, "127.0.0.1");
  addHostnameVariants(out, "purelyautomation.com");

  const candidates = [
    process.env.NEXT_PUBLIC_APP_CANONICAL_URL,
    process.env.APP_CANONICAL_URL,
    process.env.NEXTAUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ];

  for (const raw of candidates) {
    const host = parseHostnameFromUrl(raw);
    if (host && isPlatformHostnameCandidate(host)) addHostnameVariants(out, host);
  }

  return out;
}

const PLATFORM_HOSTNAMES = platformHostnames();

function normalizeSlug(raw: string): string {
  return String(raw || "").trim().toLowerCase();
}

function normalizeKey(raw: string | null | undefined): string | null {
  const value = String(raw || "").trim();
  return value || null;
}

export function publicFormKeyFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  return normalizeKey(url.searchParams.get("key"));
}

export function publicFormHostFromRequest(request: Request): string | null {
  return (
    hostnameFromHeader(request.headers.get("x-forwarded-host")) ||
    hostnameFromHeader(request.headers.get("host")) ||
    hostnameFromHeader(request.headers.get("x-original-host"))
  );
}

export async function resolvePublicCreditFormFromRequest(opts: {
  request: Request;
  slug: string;
  key?: string | null;
}): Promise<PublicFormResolution | null> {
  const slug = normalizeSlug(opts.slug);
  const key = normalizeKey(opts.key) ?? publicFormKeyFromRequest(opts.request);
  if (!slug) return null;

  const requestHost = publicFormHostFromRequest(opts.request);
  const hasCustomHostCandidate = Boolean(requestHost && !PLATFORM_HOSTNAMES.has(requestHost));
  const customDomain = hasCustomHostCandidate ? await resolveCustomDomain(requestHost).catch(() => null) : null;

  if (hasCustomHostCandidate && (!customDomain || customDomain.status !== "VERIFIED")) {
    return null;
  }

  if (key) {
    const form = await prisma.creditForm
      .findFirst({
        where: {
          slug,
          id: { endsWith: key },
          ...(customDomain ? { ownerId: customDomain.ownerId } : {}),
        },
        select: PUBLIC_FORM_SELECT,
      })
      .catch(() => null);

    if (!form || form.status === "ARCHIVED") return null;
    if (publicKeyFromId(form.id, key.length) !== key) return null;

    return {
      form,
      mode: "hosted_key",
      requestHost,
      customDomain,
    };
  }

  if (customDomain) {
    const form = await prisma.creditForm
      .findFirst({
        where: { ownerId: customDomain.ownerId, slug, status: "ACTIVE" },
        select: PUBLIC_FORM_SELECT,
      })
      .catch(() => null);

    if (!form) return null;
    return {
      form,
      mode: "custom_domain_slug",
      requestHost,
      customDomain,
    };
  }

  const form = await prisma.creditForm.findUnique({ where: { slug }, select: PUBLIC_FORM_SELECT }).catch(() => null);
  if (!form || form.status === "ARCHIVED") return null;

  return {
    form,
    mode: "legacy_slug",
    requestHost,
    customDomain: null,
  };
}