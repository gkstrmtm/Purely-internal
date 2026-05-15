import type { CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import { buildFunnelPageGraph, isCustomHtmlFunnelPage, isManagedFunnelPage } from "@/lib/funnelPageGraph";
import {
  getFunnelPageCurrentHtml,
  getFunnelPagePublishedHtml,
  isFunnelPageDraftNewerThanLive,
  type FunnelPageHtmlState,
} from "@/lib/funnelPageState";

export type FunnelEditorWorkflowPage = FunnelPageHtmlState & {
  id: string;
  title: string;
  slug: string;
  editorMode: "BLOCKS" | "CUSTOM_HTML" | "MARKDOWN";
};

export type FunnelEditorPageSaveUpdate = {
  editorMode?: "BLOCKS" | "CUSTOM_HTML";
  blocksJson?: CreditFunnelBlock[];
  customHtml?: string;
  draftHtml?: string;
  customChatJson?: unknown;
};

export type FunnelEditorPageSelectionDecision =
  | { kind: "ignore" }
  | { kind: "confirm-leave"; nextPageId: string | null }
  | { kind: "select"; nextPageId: string | null };

export function findGlobalHeaderBlock(blocks: CreditFunnelBlock[]): CreditFunnelBlock | null {
  const walk = (items: CreditFunnelBlock[]): CreditFunnelBlock | null => {
    for (const block of items) {
      if (!block) continue;
      if (block.type === "headerNav" && (block.props as any)?.isGlobal === true) return block;

      if (block.type === "section") {
        const props: any = block.props;
        const keys = ["children", "leftChildren", "rightChildren"] as const;
        for (const key of keys) {
          const nested = Array.isArray(props?.[key]) ? (props[key] as CreditFunnelBlock[]) : [];
          const found = walk(nested);
          if (found) return found;
        }
      }

      if (block.type === "columns") {
        const props: any = block.props;
        const cols = Array.isArray(props?.columns) ? (props.columns as any[]) : [];
        for (const col of cols) {
          const nested = Array.isArray(col?.children) ? (col.children as CreditFunnelBlock[]) : [];
          const found = walk(nested);
          if (found) return found;
        }
      }
    }

    return null;
  };

  return walk(blocks.filter((block) => block.type !== "page"));
}

export async function saveCurrentFunnelEditorPage(opts: {
  selectedPage: FunnelEditorWorkflowPage | null;
  saveableBlocks: CreditFunnelBlock[];
  selectedChat: unknown;
  savePage: (update: FunnelEditorPageSaveUpdate) => Promise<boolean>;
  setEditorMode: (mode: "BLOCKS") => Promise<unknown>;
  applyGlobalHeader: (header: CreditFunnelBlock) => Promise<boolean>;
}): Promise<boolean> {
  const { selectedPage, saveableBlocks, selectedChat, savePage, setEditorMode, applyGlobalHeader } = opts;
  if (!selectedPage) return false;
  const pageGraph = buildFunnelPageGraph(selectedPage);

  if (isManagedFunnelPage(selectedPage)) {
    const globalHeader = findGlobalHeaderBlock(saveableBlocks);
    if (globalHeader) return applyGlobalHeader(globalHeader);

    return savePage({
      editorMode: "BLOCKS",
      blocksJson: saveableBlocks,
      customHtml: getFunnelPagePublishedHtml(selectedPage),
    });
  }

  if (isCustomHtmlFunnelPage(selectedPage)) {
    return savePage({
      editorMode: "CUSTOM_HTML",
      draftHtml: pageGraph.html.current || getFunnelPageCurrentHtml(selectedPage),
      customChatJson: selectedChat,
    });
  }

  await setEditorMode("BLOCKS");
  return true;
}

export function getFunnelEditorPageSelectionDecision(opts: {
  busy: boolean;
  savingPage: boolean;
  nextPageId: string | null;
  selectedPageId: string | null;
  selectedPage: FunnelEditorWorkflowPage | null;
  selectedPageDirty: boolean;
  sourceHasPendingChanges: boolean;
}): FunnelEditorPageSelectionDecision {
  const { busy, savingPage, nextPageId, selectedPageId, selectedPage, selectedPageDirty, sourceHasPendingChanges } = opts;

  if (busy || savingPage || nextPageId === selectedPageId) {
    return { kind: "ignore" };
  }

  if (selectedPage?.id && (selectedPageDirty || sourceHasPendingChanges)) {
    return { kind: "confirm-leave", nextPageId };
  }

  return { kind: "select", nextPageId };
}

export function getFunnelEditorWorkflowViewModel(opts: {
  selectedPage: FunnelEditorWorkflowPage | null;
  selectedPageDirty: boolean;
  sourceHasPendingChanges: boolean;
  customCodeModeActive: boolean;
  savingPage: boolean;
  publishingPage: boolean;
  selectedPageIsEntryPage: boolean;
}) {
  const { selectedPage, selectedPageDirty, sourceHasPendingChanges, customCodeModeActive, savingPage, publishingPage, selectedPageIsEntryPage } = opts;
  const pageGraph = buildFunnelPageGraph(selectedPage);
  const savedDraftIsNewerThanLive = Boolean(selectedPage && isFunnelPageDraftNewerThanLive(selectedPage));
  const hasPendingDraftChanges = Boolean(selectedPageDirty || sourceHasPendingChanges);

  const hasDeployableDraft = Boolean(selectedPage && pageGraph.sourceMode !== "markdown" && (selectedPageDirty || savedDraftIsNewerThanLive));
  const saveButtonLabel = savingPage
    ? "Saving"
    : hasPendingDraftChanges
      ? "Save draft"
      : hasDeployableDraft || customCodeModeActive
        ? "Draft saved"
        : "Draft saved";
  const saveButtonTitle = customCodeModeActive
    ? sourceHasPendingChanges
      ? "Save the staged source changes as draft. Draft changes do not go live until you publish."
      : selectedPageDirty
        ? "Save the current page as draft. Draft changes do not go live until you publish."
        : savedDraftIsNewerThanLive
          ? "This draft is saved, but the live page is still older. Publish when you want Open live to match this draft."
          : "This draft is saved and matches the live page."
    : selectedPageDirty
      ? "Save the current block page as draft. Open live keeps showing the last published version until you publish."
      : savedDraftIsNewerThanLive
        ? "A saved block draft is ready. Publish when you want Open live to match it."
        : sourceHasPendingChanges
          ? "Save the staged source changes as draft before leaving or publishing."
          : "This page's live version already matches the last saved draft.";
  const publishButtonLabel = publishingPage
    ? "Publishing"
    : hasDeployableDraft
      ? selectedPageDirty
        ? "Save draft and publish"
        : "Publish live"
      : "Live matches draft";
  const workflowStatusTone = !selectedPage
    ? "muted"
    : hasPendingDraftChanges
      ? "amber"
      : savedDraftIsNewerThanLive
        ? "blue"
        : "emerald";
  const workflowStatusClassName =
    workflowStatusTone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : workflowStatusTone === "blue"
        ? "border-blue-200 bg-blue-50 text-blue-800"
        : workflowStatusTone === "emerald"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-zinc-200 bg-zinc-50 text-zinc-600";
  const workflowStatusLabel = !selectedPage
    ? "No page selected"
    : hasPendingDraftChanges
      ? "Unsaved changes"
      : savedDraftIsNewerThanLive
        ? "Draft newer than live"
        : "Live matches draft";
  const workflowSummary = !selectedPage
    ? "Choose a page to start editing."
    : customCodeModeActive
      ? sourceHasPendingChanges
        ? "You have staged source changes. Save draft to keep them, then publish when you want the live page replaced."
        : selectedPageDirty
        ? "You are editing a private draft. Page and Source stay on that draft here. Save draft to keep it, then publish when you want the public page replaced."
        : savedDraftIsNewerThanLive
          ? "You are looking at the saved draft for this page. Open live still shows the live page until you publish this draft."
          : "You are looking at the saved draft for this page, and it already matches the live page."
      : hasPendingDraftChanges
        ? "You have unsaved block changes. Save draft to keep them private, then publish when you want the public page updated."
        : savedDraftIsNewerThanLive
          ? "A saved block draft is ready. Open live still shows the live page until you publish this draft."
          : "The live page already matches the last saved draft.";
  const liveLinkLabel = "Open live page";
  const liveLinkHint = customCodeModeActive && (selectedPageDirty || savedDraftIsNewerThanLive)
    ? selectedPageIsEntryPage
      ? "Open the published public version of this funnel. Draft edits in Page and Source stay private until you publish."
      : "Open this page's published public version. Saved drafts in Page and Source stay private until you publish."
    : selectedPageIsEntryPage
      ? "Open the current public version of this funnel in a new tab."
      : "Open this page's current public version in a new tab.";
  const leavePageSummary = sourceHasPendingChanges
    ? "You have staged source changes. Save draft now if you want to keep them before leaving this page."
    : customCodeModeActive
      ? "You have unsaved full-page changes. Save them now if you want to keep this draft before switching pages."
      : "You have unsaved block changes. Save draft now if you want to keep them before switching pages.";
  const leavePageConfirmLabel = "Save draft and continue";

  return {
    hasDeployableDraft,
    saveButtonLabel,
    saveButtonTitle,
    publishButtonLabel,
    workflowStatusClassName,
    workflowStatusLabel,
    workflowSummary,
    liveLinkLabel,
    liveLinkHint,
    leavePageSummary,
    leavePageConfirmLabel,
  };
}