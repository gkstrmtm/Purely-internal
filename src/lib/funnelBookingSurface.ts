import type { FunnelPageIntentProfile } from "@/lib/funnelPageIntent";

export type BookingSurfaceShellStyle = "default" | "editorial" | "showcase" | "concierge";
export type BookingSurfaceShellDensity = "compact" | "comfortable";
export type BookingRuntimeSlotName = string;
export type BookingSurfacePosture = "editor-preview" | "published" | "generated" | "exported-html" | "inline-upgrade" | "block";
export type BookingSurfaceRouteKind = "funnel-default" | "page-specific" | "step-specific" | "linked" | "placeholder";

export type BookingSurfaceIntentProfile = Partial<
  Pick<FunnelPageIntentProfile, "pageType" | "pageGoal" | "audience" | "offer" | "primaryCta" | "companyContext">
>;

export type BookingSurfaceContext = {
  shellStyle?: BookingSurfaceShellStyle | null;
  shellDensity?: BookingSurfaceShellDensity | null;
  kicker?: string | null;
  title?: string | null;
  body?: string | null;
  proofLabel?: string | null;
  proofBody?: string | null;
  note?: string | null;
};

export type ResolveBookingSurfaceContextInput = {
  posture?: BookingSurfacePosture | null;
  routeKind?: BookingSurfaceRouteKind | null;
  pageTitle?: string | null;
  calendarTitle?: string | null;
  pageIntent?: BookingSurfaceIntentProfile | null;
  previewDevice?: "desktop" | "mobile" | null;
  isDraft?: boolean;
  preferredShellStyle?: BookingSurfaceShellStyle | null;
  preferredShellDensity?: BookingSurfaceShellDensity | null;
  overrides?: BookingSurfaceContext | null;
};

function escapeHtmlAttr(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeText(value: string | null | undefined) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function ensureSentence(value: string | null | undefined) {
  const text = normalizeText(value);
  if (!text) return null;
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function normalizeSlotName(value: string | null | undefined) {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "primary";
}

function toDisplayLabel(value: string | null | undefined) {
  const text = normalizeText(value);
  if (!text) return null;
  const display = text
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!display) return null;
  return display.charAt(0).toUpperCase() + display.slice(1);
}

function joinSentences(...parts: Array<string | null | undefined>) {
  return parts
    .map((part) => ensureSentence(part))
    .filter(Boolean)
    .join(" ");
}

function deriveDefaultShellStyle(input: ResolveBookingSurfaceContextInput) {
  if (input.preferredShellStyle) return input.preferredShellStyle;
  if (input.posture === "inline-upgrade") return "editorial";
  if (input.posture === "editor-preview" && input.previewDevice === "mobile") return "editorial";
  return "showcase";
}

function deriveDefaultShellDensity(input: ResolveBookingSurfaceContextInput) {
  if (input.preferredShellDensity) return input.preferredShellDensity;
  return input.previewDevice === "mobile" ? "compact" : "comfortable";
}

function buildDefaultBody(input: ResolveBookingSurfaceContextInput) {
  const posture = input.posture || "published";
  const routeKind = input.routeKind || "linked";
  const pageGoal = normalizeText(input.pageIntent?.pageGoal);
  const offer = normalizeText(input.pageIntent?.offer);

  const postureLine =
    posture === "editor-preview"
      ? "The scheduler stays attached to the page shell so you can edit the real booking handoff instead of approximating it with an embed"
      : posture === "generated" || posture === "inline-upgrade"
        ? "The scheduler stays inside the page flow so proof, promise, and next-step context remain visible while visitors choose a time"
        : posture === "block"
          ? "This booking block stays native inside the funnel instead of dropping into a detached embed"
          : posture === "exported-html"
            ? "The scheduler stays attached to the exported page shell so the handoff remains native when this page travels"
            : "The scheduler stays attached to this funnel page so visitors can choose a time without leaving the page context";

  const routeLine =
    routeKind === "funnel-default"
      ? "This surface inherits the funnel's linked calendar so the route stays consistent anywhere the page is rendered"
      : routeKind === "page-specific"
        ? "This page keeps its own linked calendar so the route stays attached to the page instead of falling back to a generic scheduler"
        : routeKind === "step-specific"
          ? "This booking step keeps its own linked calendar so the route stays pinned to this step"
          : routeKind === "placeholder"
            ? "Link a live calendar to replace this placeholder handoff with an active in-page scheduler"
            : "The linked calendar remains attached to this page shell instead of opening as a detached embed";

  const jobLine = pageGoal
    ? `The booking ask stays grounded in ${pageGoal}`
    : offer
      ? `The booking ask stays grounded in ${offer}`
      : null;

  return joinSentences(postureLine, routeLine, jobLine);
}

function buildDefaultProofBody(input: ResolveBookingSurfaceContextInput) {
  const posture = input.posture || "published";
  const pageTitle = normalizeText(input.pageTitle) || "this page";
  const pageGoal = normalizeText(input.pageIntent?.pageGoal);
  const audience = normalizeText(input.pageIntent?.audience);
  const offer = normalizeText(input.pageIntent?.offer);

  if (posture === "editor-preview") {
    return joinSentences(
      `${pageTitle} keeps the promise, proof, and scheduler in one surface`,
      "You can edit the actual handoff instead of approximating it with an embed",
    );
  }

  if (pageGoal || audience || offer) {
    return joinSentences(
      "Visitors keep the proof, promise, and scheduler in one surface",
      pageGoal ? `The handoff stays aligned with ${pageGoal}` : null,
      audience ? `The ask stays legible for ${audience}` : null,
      offer ? `The page still reads like a real next step for ${offer}` : null,
    );
  }

  return "Routing, theme, and booking state stay inside the funnel instead of dropping into a detached embed.";
}

function buildDefaultNote(input: ResolveBookingSurfaceContextInput) {
  const routeKind = input.routeKind || "linked";
  const calendarTitle = toDisplayLabel(input.calendarTitle);

  if (routeKind === "placeholder") {
    return "Link a live calendar to turn this from a placeholder handoff into an active routed scheduler.";
  }
  if (routeKind === "funnel-default" && calendarTitle) {
    return `Linked calendar: ${calendarTitle}. This page inherits the funnel default route.`;
  }
  if ((routeKind === "page-specific" || routeKind === "step-specific") && calendarTitle) {
    return `Linked calendar: ${calendarTitle}. This surface keeps its own route.`;
  }
  if (calendarTitle) {
    return `Linked calendar: ${calendarTitle}.`;
  }
  return "The linked calendar is mounted inline inside this page shell.";
}

export function resolveFunnelBookingSurfaceContext(input: ResolveBookingSurfaceContextInput): BookingSurfaceContext {
  const pageTitle = normalizeText(input.pageTitle);
  const calendarTitle = toDisplayLabel(input.calendarTitle);
  const overrides = normalizeBookingSurfaceContext(input.overrides);

  const base: BookingSurfaceContext = {
    shellStyle: deriveDefaultShellStyle(input),
    shellDensity: deriveDefaultShellDensity(input),
    kicker:
      input.posture === "editor-preview"
        ? input.isDraft
          ? "Draft booking handoff"
          : "Booking handoff"
        : input.posture === "inline-upgrade"
          ? "Inline scheduler"
          : input.routeKind === "placeholder"
            ? "Booking placeholder"
            : "Booking handoff",
    title: calendarTitle ? `Schedule ${calendarTitle}` : pageTitle ? `Schedule from ${pageTitle}` : "Book a time",
    body: buildDefaultBody(input),
    proofLabel: input.posture === "editor-preview" ? "Context kept in preview" : input.routeKind === "placeholder" ? "Routing status" : "Native booking shell",
    proofBody: buildDefaultProofBody(input),
    note: buildDefaultNote(input),
  };

  return mergeBookingSurfaceContext(base, overrides) || base;
}

export function normalizeBookingSurfaceContext(input?: BookingSurfaceContext | null): BookingSurfaceContext | null {
  if (!input) return null;
  const shellStyle =
    input.shellStyle === "editorial" || input.shellStyle === "showcase" || input.shellStyle === "concierge"
      ? input.shellStyle
      : input.shellStyle === "default"
        ? "default"
        : null;
  const shellDensity = input.shellDensity === "compact" ? "compact" : input.shellDensity === "comfortable" ? "comfortable" : null;

  const normalized: BookingSurfaceContext = {
    ...(shellStyle ? { shellStyle } : {}),
    ...(shellDensity ? { shellDensity } : {}),
  };

  const kicker = normalizeText(input.kicker);
  const title = normalizeText(input.title);
  const body = normalizeText(input.body);
  const proofLabel = normalizeText(input.proofLabel);
  const proofBody = normalizeText(input.proofBody);
  const note = normalizeText(input.note);

  if (kicker) normalized.kicker = kicker;
  if (title) normalized.title = title;
  if (body) normalized.body = body;
  if (proofLabel) normalized.proofLabel = proofLabel;
  if (proofBody) normalized.proofBody = proofBody;
  if (note) normalized.note = note;

  return Object.keys(normalized).length ? normalized : null;
}

export function mergeBookingSurfaceContext(
  base?: BookingSurfaceContext | null,
  override?: BookingSurfaceContext | null,
): BookingSurfaceContext | null {
  const normalizedBase = normalizeBookingSurfaceContext(base);
  const normalizedOverride = normalizeBookingSurfaceContext(override);
  if (!normalizedBase && !normalizedOverride) return null;
  return {
    ...(normalizedBase || {}),
    ...(normalizedOverride || {}),
  };
}

export function readBookingSurfaceContextFromElement(host: Element | null): BookingSurfaceContext | null {
  if (!host) return null;
  return normalizeBookingSurfaceContext({
    shellStyle: (host.getAttribute("data-pa-booking-shell-style") as BookingSurfaceShellStyle | null) || null,
    shellDensity: (host.getAttribute("data-pa-booking-shell-density") as BookingSurfaceShellDensity | null) || null,
    kicker: host.getAttribute("data-pa-booking-kicker"),
    title: host.getAttribute("data-pa-booking-title"),
    body: host.getAttribute("data-pa-booking-body"),
    proofLabel: host.getAttribute("data-pa-booking-proof-label"),
    proofBody: host.getAttribute("data-pa-booking-proof-body"),
    note: host.getAttribute("data-pa-booking-note"),
  });
}

export function readBookingRuntimeSlotNameFromElement(host: Element | null) {
  if (!host) return "primary";
  return normalizeSlotName(host.getAttribute("data-pa-booking-runtime"));
}

export function buildBookingRuntimePlaceholderHtml(input?: {
  ownerId?: string | null;
  calendarId?: string | null;
  slug?: string | null;
  slotName?: BookingRuntimeSlotName | null;
  surfaceContext?: BookingSurfaceContext | null;
}) {
  const attrs = [`data-pa-booking-runtime="${escapeHtmlAttr(normalizeSlotName(input?.slotName))}"`];
  const ownerId = normalizeText(input?.ownerId);
  const calendarId = normalizeText(input?.calendarId);
  const slug = normalizeText(input?.slug);
  const surfaceContext = normalizeBookingSurfaceContext(input?.surfaceContext);

  if (ownerId) attrs.push(`data-pa-booking-owner-id="${escapeHtmlAttr(ownerId)}"`);
  if (calendarId) attrs.push(`data-pa-booking-calendar-id="${escapeHtmlAttr(calendarId)}"`);
  if (slug) attrs.push(`data-pa-booking-slug="${escapeHtmlAttr(slug)}"`);

  if (surfaceContext?.shellStyle) attrs.push(`data-pa-booking-shell-style="${escapeHtmlAttr(surfaceContext.shellStyle)}"`);
  if (surfaceContext?.shellDensity) attrs.push(`data-pa-booking-shell-density="${escapeHtmlAttr(surfaceContext.shellDensity)}"`);
  if (surfaceContext?.kicker) attrs.push(`data-pa-booking-kicker="${escapeHtmlAttr(surfaceContext.kicker)}"`);
  if (surfaceContext?.title) attrs.push(`data-pa-booking-title="${escapeHtmlAttr(surfaceContext.title)}"`);
  if (surfaceContext?.body) attrs.push(`data-pa-booking-body="${escapeHtmlAttr(surfaceContext.body)}"`);
  if (surfaceContext?.proofLabel) attrs.push(`data-pa-booking-proof-label="${escapeHtmlAttr(surfaceContext.proofLabel)}"`);
  if (surfaceContext?.proofBody) attrs.push(`data-pa-booking-proof-body="${escapeHtmlAttr(surfaceContext.proofBody)}"`);
  if (surfaceContext?.note) attrs.push(`data-pa-booking-note="${escapeHtmlAttr(surfaceContext.note)}"`);

  return `<div ${attrs.join(" ")}></div>`;
}