import type { CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import { blocksToCustomHtmlDocument } from "@/lib/funnelBlocksToCustomHtmlDocument";

export type FunnelPageHtmlState = {
  customHtml?: string | null | undefined;
  draftHtml?: string | null | undefined;
};

type FunnelPageBlockSnapshotInput = {
  blocks: CreditFunnelBlock[];
  pageId: string;
  ownerId: string;
  bookingSiteSlug?: string;
  defaultBookingCalendarId?: string;
  basePath: string;
  title: string;
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

export function createFunnelPageBlockSnapshotUpdate(input: FunnelPageBlockSnapshotInput) {
  const html = blocksToCustomHtmlDocument({
    blocks: input.blocks,
    pageId: input.pageId,
    ownerId: input.ownerId,
    bookingSiteSlug: input.bookingSiteSlug,
    defaultBookingCalendarId: input.defaultBookingCalendarId,
    basePath: input.basePath,
    title: input.title,
  });

  return {
    blocksJson: input.blocks as unknown,
    ...createFunnelPageMirroredHtmlUpdate(html),
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