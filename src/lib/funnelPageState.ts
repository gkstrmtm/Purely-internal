import type { CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import { blocksToCustomHtmlDocument } from "@/lib/funnelBlocksToCustomHtmlDocument";
import {
  createFunnelPageDraftUpdate,
  createFunnelPageMirroredHtmlUpdate,
  createFunnelPagePublishUpdate,
  getFunnelPageCurrentHtml,
  getFunnelPageDraftHtml,
  getFunnelPagePublishedHtml,
  hasFunnelPageDraft,
  isFunnelPageDraftNewerThanLive,
} from "./funnelDraftLiveInvariants";

export type { FunnelPageHtmlState } from "./funnelDraftLiveInvariants";

type FunnelPageBlockSnapshotInput = {
  blocks: CreditFunnelBlock[];
  pageId: string;
  ownerId: string;
  bookingSiteSlug?: string;
  defaultBookingCalendarId?: string;
  basePath: string;
  title: string;
};

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
    ...createFunnelPageDraftUpdate(html),
  };
}

export {
  createFunnelPageDraftUpdate,
  createFunnelPageMirroredHtmlUpdate,
  createFunnelPagePublishUpdate,
  getFunnelPageCurrentHtml,
  getFunnelPageDraftHtml,
  getFunnelPagePublishedHtml,
  hasFunnelPageDraft,
  isFunnelPageDraftNewerThanLive,
};