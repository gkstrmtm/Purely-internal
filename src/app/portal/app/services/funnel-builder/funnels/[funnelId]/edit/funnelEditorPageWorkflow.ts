import type { CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import { getFunnelPageCurrentHtml, hasFunnelPageDraft, type FunnelPageHtmlState } from "@/lib/funnelPageState";

export type FunnelEditorWorkflowPage = FunnelPageHtmlState & {
  id: string;
  title: string;
  slug: string;
  editorMode: "BLOCKS" | "CUSTOM_HTML" | "MARKDOWN";
};

export type FunnelEditorPageSaveUpdate = {
  editorMode?: "BLOCKS" | "CUSTOM_HTML";
  blocksJson?: CreditFunnelBlock[];
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

  if (selectedPage.editorMode === "BLOCKS") {
    const globalHeader = findGlobalHeaderBlock(saveableBlocks);
    if (globalHeader) return applyGlobalHeader(globalHeader);

    return savePage({
      editorMode: "BLOCKS",
      blocksJson: saveableBlocks,
    });
  }

  if (selectedPage.editorMode === "CUSTOM_HTML") {
    return savePage({
      editorMode: "CUSTOM_HTML",
      draftHtml: getFunnelPageCurrentHtml(selectedPage),
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
}): FunnelEditorPageSelectionDecision {
  const { busy, savingPage, nextPageId, selectedPageId, selectedPage, selectedPageDirty } = opts;

  if (busy || savingPage || nextPageId === selectedPageId) {
    return { kind: "ignore" };
  }

  if (selectedPage?.id && selectedPageDirty) {
    return { kind: "confirm-leave", nextPageId };
  }

  return { kind: "select", nextPageId };
}

export function getFunnelEditorWorkflowViewModel(opts: {
  selectedPage: FunnelEditorWorkflowPage | null;
  selectedPageDirty: boolean;
  customCodeModeActive: boolean;
  savingPage: boolean;
  publishingPage: boolean;
  selectedPageIsEntryPage: boolean;
}) {
  const { selectedPage, selectedPageDirty, customCodeModeActive, savingPage, publishingPage, selectedPageIsEntryPage } = opts;

  const hasDeployableDraft = Boolean(
    selectedPage && selectedPage.editorMode === "CUSTOM_HTML" && (selectedPageDirty || hasFunnelPageDraft(selectedPage)),
  );
  const saveButtonLabel = savingPage
    ? "Saving"
    : selectedPageDirty
      ? customCodeModeActive
        ? "Save draft"
        : "Save live"
      : customCodeModeActive
        ? "Draft saved"
        : "Live saved";
  const saveButtonTitle = customCodeModeActive
    ? "Save the current page as draft. Draft changes do not go live until you publish."
    : "Save the current block page. Saving updates the live hosted version immediately.";
  const publishButtonLabel = publishingPage ? "Publishing" : selectedPageDirty ? "Save + publish" : "Publish live";
  const workflowStatusTone = !selectedPage
    ? "muted"
    : selectedPageDirty
      ? "amber"
      : customCodeModeActive
        ? hasFunnelPageDraft(selectedPage)
          ? "blue"
          : "emerald"
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
    : selectedPageDirty
      ? customCodeModeActive
        ? "Unsaved draft changes"
        : "Unsaved live changes"
      : customCodeModeActive
        ? hasFunnelPageDraft(selectedPage)
          ? "Draft ready to publish"
          : "Live matches published page"
        : "Live on save";
  const workflowSummary = !selectedPage
    ? "Choose a page to edit."
    : customCodeModeActive
      ? selectedPageDirty
        ? "You are editing the page directly here. Save the draft first, then publish when you want it live."
        : hasFunnelPageDraft(selectedPage)
          ? "A saved draft is ready. Publish when you want this version to replace the live page."
          : "You are looking at the current live page version. New edits stay in draft until you publish them."
      : selectedPageDirty
        ? "You are editing the layout view. Save when you want these changes to update the live page."
        : "Layout view is for sections, text, buttons, forms, and media. Saving updates the live page right away.";
  const liveLinkLabel = selectedPageIsEntryPage ? "Open live" : "Open live page";
  const liveLinkHint = selectedPageIsEntryPage
    ? "Open the public version of this funnel in a new tab."
    : "Open the main public page for this funnel in a new tab.";
  const leavePageSummary = customCodeModeActive
    ? "You have unsaved full-page changes. Save them now if you want to keep this draft before switching pages."
    : "You have unsaved block changes. Save now if you want them to update the live page before you switch.";
  const leavePageConfirmLabel = customCodeModeActive ? "Save draft and continue" : "Save live and continue";

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