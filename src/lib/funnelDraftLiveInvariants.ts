export type FunnelPageHtmlState = {
  customHtml?: string | null | undefined;
  draftHtml?: string | null | undefined;
};

function normalizeHtml(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function getFunnelPagePublishedHtml(page: FunnelPageHtmlState | null | undefined): string {
  return normalizeHtml(page?.customHtml);
}

export function getFunnelPageDraftHtml(page: FunnelPageHtmlState | null | undefined): string {
  return normalizeHtml(page?.draftHtml);
}

export function hasFunnelPageDraft(page: FunnelPageHtmlState | null | undefined): boolean {
  return getFunnelPageDraftHtml(page).trim().length > 0;
}

export function isFunnelPageDraftNewerThanLive(page: FunnelPageHtmlState | null | undefined): boolean {
  const draft = getFunnelPageDraftHtml(page).trim();
  if (!draft) return false;
  const published = getFunnelPagePublishedHtml(page).trim();
  return draft !== published;
}

export function getFunnelPageCurrentHtml(page: FunnelPageHtmlState | null | undefined): string {
  const draft = getFunnelPageDraftHtml(page);
  if (draft.trim()) return draft;
  return getFunnelPagePublishedHtml(page);
}

export function createFunnelPageDraftUpdate(html: string) {
  return { draftHtml: normalizeHtml(html) };
}

export function createFunnelPageMirroredHtmlUpdate(html: string) {
  const nextHtml = normalizeHtml(html);
  return {
    customHtml: nextHtml,
    draftHtml: nextHtml,
  };
}

export function createFunnelPagePublishUpdate(page: FunnelPageHtmlState | null | undefined) {
  const draft = getFunnelPageDraftHtml(page);
  if (!draft.trim()) return null;
  return {
    customHtml: draft,
    draftHtml: "",
  };
}