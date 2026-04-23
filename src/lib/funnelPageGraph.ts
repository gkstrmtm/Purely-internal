import { coerceBlocksJson, type CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import {
  getFunnelPageCurrentHtml,
  getFunnelPageDraftHtml,
  getFunnelPagePublishedHtml,
  type FunnelPageHtmlState,
} from "@/lib/funnelPageState";

export type FunnelPageGraphSourceMode = "managed" | "custom-html" | "markdown";
export type FunnelPageGraphRenderStage = "draft" | "published" | "current";

export type FunnelPageGraphInput = FunnelPageHtmlState & {
  id?: string | null | undefined;
  title?: string | null | undefined;
  editorMode?: string | null | undefined;
  blocksJson?: unknown;
  contentMarkdown?: string | null | undefined;
};

export type FunnelPageGraph = {
  version: 1;
  pageId: string;
  title: string;
  sourceMode: FunnelPageGraphSourceMode;
  managedBlocks: CreditFunnelBlock[];
  html: {
    published: string;
    draft: string;
    current: string;
  };
  markdown: string;
  capabilities: {
    supportsStructuredLayout: boolean;
    supportsWholePageSource: boolean;
    supportsManagedModules: boolean;
    supportsScopedAiEdits: boolean;
  };
};

export type FunnelPageGraphRenderState =
  | { kind: "blocks"; blocks: CreditFunnelBlock[] }
  | { kind: "html"; html: string }
  | { kind: "markdown"; markdown: string };

export type FunnelPageLensUiModel = {
  structureTabLabel: string;
  structureTabTitle: string;
  wholePageTabLabel: string;
  wholePageTabTitle: string;
  wholePageDrawerLabel: string;
  wholePageDrawerSummary: string;
  workspaceSummary: string;
  wholePageStatusMessageWhenUnsynced: string;
  wholePageStatusMessageWhenSnapshotOnly: string;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeSourceMode(editorMode: unknown): FunnelPageGraphSourceMode {
  const value = typeof editorMode === "string" ? editorMode.trim().toUpperCase() : "";
  if (value === "BLOCKS") return "managed";
  if (value === "CUSTOM_HTML") return "custom-html";
  return "markdown";
}

export function buildFunnelPageGraph(page: FunnelPageGraphInput | null | undefined): FunnelPageGraph {
  const sourceMode = normalizeSourceMode(page?.editorMode);

  return {
    version: 1,
    pageId: normalizeString(page?.id),
    title: normalizeString(page?.title),
    sourceMode,
    managedBlocks: coerceBlocksJson(page?.blocksJson),
    html: {
      published: getFunnelPagePublishedHtml(page),
      draft: getFunnelPageDraftHtml(page),
      current: getFunnelPageCurrentHtml(page),
    },
    markdown: normalizeString(page?.contentMarkdown),
    capabilities: {
      supportsStructuredLayout: sourceMode === "managed",
      supportsWholePageSource: sourceMode === "custom-html",
      supportsManagedModules: sourceMode === "managed",
      supportsScopedAiEdits: sourceMode === "managed",
    },
  };
}

export function resolveFunnelPageRenderState(
  page: FunnelPageGraphInput | null | undefined,
  stage: FunnelPageGraphRenderStage = "current",
): FunnelPageGraphRenderState {
  const graph = buildFunnelPageGraph(page);

  if (graph.sourceMode === "managed") {
    return { kind: "blocks", blocks: graph.managedBlocks };
  }

  if (graph.sourceMode === "custom-html") {
    const html = stage === "published" ? graph.html.published : stage === "draft" ? graph.html.draft : graph.html.current;
    return { kind: "html", html };
  }

  return { kind: "markdown", markdown: graph.markdown };
}

export function isManagedFunnelPage(page: FunnelPageGraphInput | null | undefined) {
  return buildFunnelPageGraph(page).sourceMode === "managed";
}

export function isCustomHtmlFunnelPage(page: FunnelPageGraphInput | null | undefined) {
  return buildFunnelPageGraph(page).sourceMode === "custom-html";
}

export function getFunnelPageLensUiModel(page: FunnelPageGraphInput | null | undefined): FunnelPageLensUiModel {
  const graph = buildFunnelPageGraph(page);

  if (graph.sourceMode === "custom-html") {
    return {
      structureTabLabel: "Structure",
      structureTabTitle:
        "Convert this page into Structure. The current source will be imported into a draggable HTML block so you can add managed sections around it.",
      wholePageTabLabel: "Page",
      wholePageTabTitle: "Edit the current page source directly.",
      wholePageDrawerLabel: "Page editor",
      wholePageDrawerSummary: "Edit the page source directly.",
      workspaceSummary: "Preview shows the page. Source lets you edit it directly.",
      wholePageStatusMessageWhenUnsynced: "You are seeing the current page preview. Save the draft when you want the page source refreshed too.",
      wholePageStatusMessageWhenSnapshotOnly: "Preview is up to date. The page source is showing the latest saved draft until you save again.",
    };
  }

  if (graph.sourceMode === "managed") {
    return {
      structureTabLabel: "Structure",
      structureTabTitle: "Work visually with sections, text, buttons, forms, and page structure.",
      wholePageTabLabel: "Source",
      wholePageTabTitle: "Inspect the current full-page source output for this structure.",
      wholePageDrawerLabel: "Source snapshot",
      wholePageDrawerSummary: "Inspect the compiled page source without leaving the editor.",
      workspaceSummary: "Preview shows the current structure. Source shows the compiled page snapshot.",
      wholePageStatusMessageWhenUnsynced: "You are seeing the current page preview. Save the page when you want the source snapshot refreshed too.",
      wholePageStatusMessageWhenSnapshotOnly: "Preview is up to date. Source is showing the latest saved page snapshot until you save again.",
    };
  }

  return {
    structureTabLabel: "Structure",
    structureTabTitle: "Structure tools are unavailable for this page.",
    wholePageTabLabel: "Page",
    wholePageTabTitle: "Inspect this page as a whole.",
    wholePageDrawerLabel: "Page view",
    wholePageDrawerSummary: "Inspect the current page content without leaving the editor.",
    workspaceSummary: "Preview shows the page.",
    wholePageStatusMessageWhenUnsynced: "You are seeing the current page preview.",
    wholePageStatusMessageWhenSnapshotOnly: "Preview is up to date.",
  };
}