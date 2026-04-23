"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { PutBlobResult } from "@vercel/blob";
import { upload as uploadToVercelBlob } from "@vercel/blob/client";
import { toPng } from "html-to-image";

import {
  coerceBlocksJson,
  renderCreditFunnelBlocks,
  sanitizeRichTextHtml,
  type BlockStyle,
  type CreditFunnelBlock,
} from "@/lib/creditFunnelBlocks";
import { AppConfirmModal, AppModal } from "@/components/AppModal";
import { LinkUrlModal } from "@/components/LinkUrlModal";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import PortalImageCropModal from "@/components/PortalImageCropModal";
import {
  PortalMediaPickerModal,
  type PortalMediaPickItem,
} from "@/components/PortalMediaPickerModal";
import { IconCopy, IconExport, IconRedo, IconSend, IconSendHover, IconUndo, IconUpload } from "@/app/portal/PortalIcons";
import { PortalFontDropdown } from "@/components/PortalFontDropdown";
import { PortalSelectDropdown } from "@/components/PortalSelectDropdown";
import { useToast } from "@/components/ToastProvider";
import { PORTAL_VARIANT_HEADER, type PortalVariant } from "@/lib/portalVariant";
import { FONT_PRESETS, applyFontPresetToStyle, fontPresetKeyFromStyle, googleFontImportCss } from "@/lib/fontPresets";
import { CreditFormTemplatePreview } from "@/components/CreditFormTemplatePreview";
import { CREDIT_FORM_TEMPLATES, coerceCreditFormTemplateKey, getCreditFormTemplate, type CreditFormTemplateKey } from "@/lib/creditFormTemplates";
import { CREDIT_FORM_THEMES, coerceCreditFormThemeKey, getCreditFormTheme, type CreditFormThemeKey } from "@/lib/creditFormThemes";
import {
  getFunnelPageCurrentHtml,
  getFunnelPageDraftHtml,
  getFunnelPagePublishedHtml,
} from "@/lib/funnelPageState";
import { buildFunnelPageGraph, getFunnelPageLensUiModel } from "@/lib/funnelPageGraph";
import {
  buildSuggestedPageNaming,
  buildResolvedFunnelFoundation,
  buildFunnelPageRouteLabel,
  extractFunnelPageIntentProfile,
  inferFunnelBriefProfile,
  inferFunnelPageIntentProfile,
  stripFunnelPageIntentMessages,
  type FunnelBriefProfile,
  type FunnelFoundationArtifact,
  type FunnelFoundationBusinessContext,
  type FunnelFoundationCapabilityInputs,
  type FunnelPageFormStrategy,
  type FunnelPageIntentProfile,
  type FunnelPageIntentType,
  type FunnelPageMediaMode,
  type FunnelPageMediaPlan,
} from "@/lib/funnelPageIntent";
import { assessFunnelSceneQuality } from "@/lib/funnelSceneQuality";
import { blocksToCustomHtmlDocument } from "@/lib/funnelBlocksToCustomHtmlDocument";
import { getFunnelShellFrame, listFunnelShellFrames } from "@/lib/funnelShellFrames";
import { hostedFunnelPath } from "@/lib/publicHostedKeys";
import { toPurelyHostedUrl } from "@/lib/publicHostedOrigin";
import {
  getFunnelEditorPageSelectionDecision,
  getFunnelEditorWorkflowViewModel,
  saveCurrentFunnelEditorPage,
} from "./funnelEditorPageWorkflow";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function SpinnerIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={classNames(className, "animate-spin")} fill="none">
      <circle cx="12" cy="12" r="9" className="opacity-20" stroke="currentColor" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function AiSparkIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z" />
    </svg>
  );
}

function BuilderRailNavButton({
  label,
  active,
  icon,
  badge,
  disabled,
  spanTwo,
  onClick,
}: {
  label: string;
  active: boolean;
  icon: ReactNode;
  badge?: string;
  disabled?: boolean;
  spanTwo?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={classNames(
        "rounded-[14px] px-1.5 py-1 text-left transition-[border-color,background-color,color,box-shadow,transform] duration-150",
        spanTwo ? "col-span-2" : "",
        active
          ? "border border-zinc-200 bg-white text-zinc-950 shadow-[0_8px_18px_rgba(15,23,42,0.05)]"
          : "border border-transparent bg-transparent text-zinc-700 hover:bg-white/80 hover:text-zinc-900",
        disabled ? "opacity-55" : "",
      )}
    >
      <div className="relative flex min-h-8 items-center justify-center">
        <div className="flex min-w-0 items-center justify-center">
          <span
            className={classNames(
              "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
              active
                ? "bg-zinc-950 text-white"
                : "bg-transparent text-zinc-500",
            )}
          >
            <span className="inline-flex h-4 w-4 items-center justify-center">{icon}</span>
          </span>
        </div>
        {badge ? (
          <span className={classNames(
            "absolute right-0 top-0 inline-flex shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold",
            active ? "border-zinc-200 bg-zinc-50 text-zinc-600" : "border-zinc-200 bg-white text-zinc-500",
          )}>
            {badge}
          </span>
        ) : null}
      </div>
    </button>
  );
}
function BuilderStageToggleButton({
  label,
  active,
  title,
  onClick,
}: {
  label: string;
  active: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title || label}
      className={classNames(
        "rounded-lg border px-3 py-1.5 text-sm font-semibold transition-[border-color,background-color,color,box-shadow] duration-150",
        active
          ? "border-zinc-300 bg-white text-zinc-950 shadow-[0_8px_20px_rgba(15,23,42,0.06)]"
          : "border-transparent text-zinc-700 hover:border-zinc-200 hover:bg-white",
      )}
    >
      {label}
    </button>
  );
}

function BuilderOutlineGlyph({ kind, active }: { kind: string; active: boolean }) {
  const strokeClassName = active ? "text-white" : "text-zinc-600";

  if (kind === "Section") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" className={classNames("h-4 w-4", strokeClassName)} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="14" height="12" rx="2" />
        <path d="M3 8h14" />
      </svg>
    );
  }

  if (kind === "Columns") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" className={classNames("h-4 w-4", strokeClassName)} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="14" height="12" rx="2" />
        <path d="M10 4v12" />
      </svg>
    );
  }

  if (kind === "Header") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" className={classNames("h-4 w-4", strokeClassName)} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h4" />
        <path d="M10 6h7" />
        <path d="M3 10h14" />
      </svg>
    );
  }

  if (kind === "Text" || kind === "H1" || kind === "H2" || kind === "H3") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" className={classNames("h-4 w-4", strokeClassName)} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6h12" />
        <path d="M4 10h8" />
        <path d="M4 14h10" />
      </svg>
    );
  }

  if (kind === "Button" || kind === "Commerce") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" className={classNames("h-4 w-4", strokeClassName)} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="6" width="12" height="8" rx="4" />
      </svg>
    );
  }

  if (kind === "Form" || kind === "Form link") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" className={classNames("h-4 w-4", strokeClassName)} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="3.5" width="12" height="13" rx="2" />
        <path d="M7 7h6" />
        <path d="M7 10h6" />
      </svg>
    );
  }

  if (kind === "Image" || kind === "Video") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" className={classNames("h-4 w-4", strokeClassName)} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="14" height="12" rx="2" />
        <circle cx="7.5" cy="8" r="1.25" />
        <path d="M17 13l-3.5-3.5L7 16" />
      </svg>
    );
  }

  if (kind === "Chatbot") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" className={classNames("h-4 w-4", strokeClassName)} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 6.5h10a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H9l-4 3v-3H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z" />
      </svg>
    );
  }

  if (kind === "Code") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" className={classNames("h-4 w-4", strokeClassName)} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="m7 6-4 4 4 4" />
        <path d="m13 6 4 4-4 4" />
      </svg>
    );
  }

  if (kind === "Spacer") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" className={classNames("h-4 w-4", strokeClassName)} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 10h12" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={classNames("h-4 w-4", strokeClassName)} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="12" height="12" rx="2" />
    </svg>
  );
}

function splitCodeLines(raw: string) {
  return String(raw || "").replace(/\r\n/g, "\n").split("\n");
}

type CodeTokenTone = "plain" | "comment" | "doctype" | "tagDelimiter" | "tagName" | "attrName" | "attrOperator" | "attrValue";

type CodeToken = {
  content: string;
  tone: CodeTokenTone;
};

const CODE_TONE_STYLES: Record<CodeTokenTone, { color: string; fontStyle?: "italic" }> = {
  plain: { color: "rgb(244 244 245)" },
  comment: { color: "rgb(134 163 131)", fontStyle: "italic" },
  doctype: { color: "rgb(206 145 120)" },
  tagDelimiter: { color: "rgb(128 128 128)" },
  tagName: { color: "rgb(86 156 214)" },
  attrName: { color: "rgb(156 220 254)" },
  attrOperator: { color: "rgb(206 145 120)" },
  attrValue: { color: "rgb(206 145 120)" },
} as const;

const CODE_TONE_STYLES_LIGHT: Record<CodeTokenTone, { color: string; fontStyle?: "italic" }> = {
  plain: { color: "#2c2c2c" },
  comment: { color: "#2c2c2c", fontStyle: "italic" },
  doctype: { color: "#2c2c2c" },
  tagDelimiter: { color: "#2c2c2c" },
  tagName: { color: "#2c2c2c" },
  attrName: { color: "#2c2c2c" },
  attrOperator: { color: "#2c2c2c" },
  attrValue: { color: "#2c2c2c" },
} as const;

function pushCodeToken(tokens: CodeToken[], content: string, tone: CodeTokenTone) {
  if (!content) return;
  tokens.push({ content, tone });
}

function tokenizeCodeTag(fragment: string): CodeToken[] {
  if (!fragment) return [] as CodeToken[];
  if (/^<!--/.test(fragment)) {
    return [{ content: fragment, tone: "comment" }];
  }

  const closing = fragment.startsWith("</");
  const special = fragment.startsWith("<!") && !fragment.startsWith("<!--");
  const ending = fragment.endsWith("/>") ? "/>" : ">";
  const opening = closing ? "</" : "<";
  const inner = fragment.slice(opening.length, fragment.length - ending.length);
  const tokens: CodeToken[] = [];

  pushCodeToken(tokens, opening, "tagDelimiter");

  if (special) {
    pushCodeToken(tokens, inner, "doctype");
    pushCodeToken(tokens, ending, "tagDelimiter");
    return tokens;
  }

  const tagNameMatch = inner.match(/^([^\s/>]+)/);
  if (!tagNameMatch) {
    pushCodeToken(tokens, inner, "plain");
    pushCodeToken(tokens, ending, "tagDelimiter");
    return tokens;
  }

  pushCodeToken(tokens, tagNameMatch[1], "tagName");
  let cursor = tagNameMatch[0].length;

  while (cursor < inner.length) {
    const remaining = inner.slice(cursor);
    const whitespaceMatch = remaining.match(/^\s+/);
    if (whitespaceMatch) {
      pushCodeToken(tokens, whitespaceMatch[0], "plain");
      cursor += whitespaceMatch[0].length;
      continue;
    }

    const attrNameMatch = remaining.match(/^[^\s=/>]+/);
    if (!attrNameMatch) {
      pushCodeToken(tokens, remaining, "plain");
      break;
    }

    pushCodeToken(tokens, attrNameMatch[0], "attrName");
    cursor += attrNameMatch[0].length;

    const afterName = inner.slice(cursor);
    const eqMatch = afterName.match(/^\s*=\s*/);
    if (!eqMatch) continue;

    const eqText = eqMatch[0];
    const eqIndex = eqText.indexOf("=");
    if (eqIndex > 0) pushCodeToken(tokens, eqText.slice(0, eqIndex), "plain");
    pushCodeToken(tokens, "=", "attrOperator");
    if (eqIndex + 1 < eqText.length) pushCodeToken(tokens, eqText.slice(eqIndex + 1), "plain");
    cursor += eqText.length;

    const valueMatch = inner.slice(cursor).match(/^("[^"]*"|'[^']*'|[^\s/>]+)/);
    if (!valueMatch) continue;
    pushCodeToken(tokens, valueMatch[0], "attrValue");
    cursor += valueMatch[0].length;
  }

  pushCodeToken(tokens, ending, "tagDelimiter");
  return tokens;
}

function tokenizeCodeLine(line: string): CodeToken[] {
  const fragmentPattern = /<!--.*?-->|<![^>]*>|<\/?[^>]*>/g;
  const tokens: CodeToken[] = [];
  let cursor = 0;

  for (const match of line.matchAll(fragmentPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      pushCodeToken(tokens, line.slice(cursor, index), "plain");
    }
    tokens.push(...tokenizeCodeTag(match[0] || ""));
    cursor = index + (match[0]?.length || 0);
  }

  if (cursor < line.length) {
    pushCodeToken(tokens, line.slice(cursor), "plain");
  }

  return tokens.length ? tokens : [{ content: line || "\u00A0", tone: "plain" }];
}

function isHighlightedCodeLine(lineNumber: number, lineHighlightRange?: { startLine: number; endLine: number } | null) {
  if (!lineHighlightRange) return false;
  return lineNumber >= lineHighlightRange.startLine && lineNumber <= lineHighlightRange.endLine;
}

function CodeSurfaceRenderedLines({
  lines,
  lineHighlightRange,
  tone = "dark",
}: {
  lines: string[];
  lineHighlightRange?: { startLine: number; endLine: number } | null;
  tone?: "dark" | "light";
}) {
  const tokenStyles = tone === "light" ? CODE_TONE_STYLES_LIGHT : CODE_TONE_STYLES;
  return (
    <div className="w-max min-w-full px-4 py-3">
      {lines.map((line, index) => {
        const highlighted = isHighlightedCodeLine(index + 1, lineHighlightRange);
        const tokens = tokenizeCodeLine(line);

        return (
          <div
            key={`code-line-${index}`}
            className={classNames(
              "min-h-6 whitespace-pre rounded-md",
              highlighted
                ? tone === "light"
                  ? "bg-sky-100 shadow-[inset_3px_0_0_rgba(14,165,233,0.5)]"
                  : "bg-cyan-400/10 shadow-[inset_3px_0_0_rgba(103,232,249,0.55)]"
                : "",
            )}
          >
            {tokens.map((token, tokenIndex) => (
              <span key={`code-line-${index}-token-${tokenIndex}`} style={tokenStyles[token.tone]}>
                {token.content}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

type HtmlDiffSummary = {
  addedLines: number;
  removedLines: number;
  currentStartLine: number | null;
  currentEndLine: number | null;
  addedPreview: string[];
  removedPreview: string[];
  changed: boolean;
};

type HtmlChangeActivityItem = {
  id: string;
  pageId: string;
  kind: "ai-update" | "no-change" | "restore";
  scopeLabel: string;
  prompt: string;
  summary: string;
  at: string;
  diff: HtmlDiffSummary;
  previewChanged: boolean;
};

type BuilderDiffSummary = {
  addedBlocks: number;
  removedBlocks: number;
  updatedBlocks: number;
  movedBlocks: number;
  addedPreview: string[];
  removedPreview: string[];
  updatedPreview: string[];
  movedPreview: string[];
  changed: boolean;
};

type CustomCodeDiffSummary = {
  html: HtmlDiffSummary;
  css: HtmlDiffSummary;
  htmlChanged: boolean;
  cssChanged: boolean;
  totalAddedLines: number;
  totalRemovedLines: number;
};

type CustomCodeAuditKind = "ai-update" | "no-change" | "question" | "restore";

type BuilderChangeActivityItem = {
  id: string;
  pageId: string;
  kind: "ai-update" | "no-change" | "restore";
  scopeLabel: string;
  prompt: string;
  summary: string;
  at: string;
  diff: BuilderDiffSummary;
  previewChanged: boolean;
  targetBlockId?: string | null;
  customCodeDiff?: CustomCodeDiffSummary | null;
};

type CustomCodeAuditEntry = {
  id: string;
  at: string;
  prompt: string;
  summary: string;
  kind?: CustomCodeAuditKind;
  previewChanged: boolean;
  builderDiff: BuilderDiffSummary | null;
  customCodeDiff: CustomCodeDiffSummary | null;
  source: "activity" | "thread" | "persisted";
};

type ChatThreadRound = {
  id: string;
  at: string;
  label: string;
  diffSummary: string | null;
};

type BlockChatRound = {
  user: BlockChatMessage;
  assistant: BlockChatMessage | null;
};

type SavedChangeFeedTone = "sky" | "emerald" | "zinc" | "amber" | "violet" | "slate";

type SavedChangeFeedItem = {
  id: string;
  at: string;
  headline: string;
  countLabel: string;
  tone: SavedChangeFeedTone;
};

const RECENT_SAVED_CHANGE_LIMIT = 3;
const CUSTOM_CODE_THREAD_WINDOW_LIMIT = 3;

function diffPreviewLines(lines: string[], limit = 3) {
  return lines
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function collectCustomCodeBlocks(blocks: CreditFunnelBlock[]) {
  const found: CreditFunnelBlock[] = [];

  const visit = (items: CreditFunnelBlock[]) => {
    for (const block of items) {
      if (!block || typeof block !== "object") continue;
      if (block.type === "customCode") found.push(block);

      if (block.type === "section") {
        const props: any = block.props || {};
        for (const key of ["children", "leftChildren", "rightChildren"] as const) {
          const nested = Array.isArray(props[key]) ? (props[key] as CreditFunnelBlock[]) : [];
          visit(nested);
        }
      }

      if (block.type === "columns") {
        const columns = Array.isArray((block.props as any)?.columns) ? ((block.props as any).columns as any[]) : [];
        for (const column of columns) {
          const nested = Array.isArray(column?.children) ? (column.children as CreditFunnelBlock[]) : [];
          visit(nested);
        }
      }
    }
  };

  visit(blocks);
  return found;
}

function isMeaningfulCustomCodeBlock(block: CreditFunnelBlock | null | undefined) {
  if (!block || block.type !== "customCode") return false;
  const props: any = block.props || {};
  const html = String(props.html || "").trim();
  const css = String(props.css || "").trim();
  const chat = Array.isArray(props.chatJson) ? props.chatJson : [];
  return Boolean(html || css || chat.length);
}

function flattenBlocksForDiff(blocks: CreditFunnelBlock[]) {
  const entries: Array<{ id: string; type: string; label: string; signature: string; order: number }> = [];
  let order = 0;

  const visit = (items: CreditFunnelBlock[]) => {
    for (const block of items) {
      if (!block || typeof block !== "object") continue;
      const props: any = block.props || {};
      const label = (() => {
        if (block.type === "heading") return `Heading: ${String(props.text || "").trim().slice(0, 48) || "Untitled"}`;
        if (block.type === "paragraph") return `Text: ${String(props.text || "").trim().slice(0, 48) || "Paragraph"}`;
        if (block.type === "button") return `Button: ${String(props.text || "").trim().slice(0, 48) || "Button"}`;
        if (block.type === "section") return `Section${props.anchorLabel ? `: ${String(props.anchorLabel).slice(0, 36)}` : ""}`;
        if (block.type === "columns") return "Columns";
        if (block.type === "customCode") return "Custom code";
        if (block.type === "formEmbed") return `Form embed: ${String(props.formSlug || "").slice(0, 36)}`;
        if (block.type === "calendarEmbed") return `Calendar: ${String(props.calendarId || "").slice(0, 36)}`;
        if (block.type === "image") return `Image${props.alt ? `: ${String(props.alt).slice(0, 36)}` : ""}`;
        if (block.type === "video") return `Video${props.name ? `: ${String(props.name).slice(0, 36)}` : ""}`;
        if (block.type === "headerNav") return "Header navigation";
        return block.type;
      })();

      entries.push({
        id: String(block.id || `${block.type}-${order}`),
        type: block.type,
        label,
        signature: JSON.stringify(
          block.type === "customCode"
            ? {
                ...block,
                props: (() => {
                  const diffProps = { ...(props || {}) };
                  delete (diffProps as any).chatJson;
                  delete (diffProps as any).aiHistoryJson;
                  return diffProps;
                })(),
              }
            : block,
        ),
        order,
      });
      order += 1;

      if (block.type === "section") {
        const keys = ["children", "leftChildren", "rightChildren"] as const;
        for (const key of keys) {
          const nested = Array.isArray(props[key]) ? (props[key] as CreditFunnelBlock[]) : [];
          visit(nested);
        }
      }

      if (block.type === "columns") {
        const columns = Array.isArray(props.columns) ? (props.columns as any[]) : [];
        for (const column of columns) {
          const nested = Array.isArray(column?.children) ? (column.children as CreditFunnelBlock[]) : [];
          visit(nested);
        }
      }
    }
  };

  visit(blocks);
  return entries;
}

function summarizeBuilderDiff(previousBlocksRaw: unknown, nextBlocksRaw: unknown): BuilderDiffSummary {
  const previousBlocks = flattenBlocksForDiff(coerceBlocksJson(previousBlocksRaw));
  const nextBlocks = flattenBlocksForDiff(coerceBlocksJson(nextBlocksRaw));
  const previousMap = new Map(previousBlocks.map((entry) => [entry.id, entry]));
  const nextMap = new Map(nextBlocks.map((entry) => [entry.id, entry]));

  const added = nextBlocks.filter((entry) => !previousMap.has(entry.id));
  const removed = previousBlocks.filter((entry) => !nextMap.has(entry.id));
  const updated = nextBlocks.filter((entry) => {
    const prev = previousMap.get(entry.id);
    return Boolean(prev && prev.signature !== entry.signature);
  });
  const moved = nextBlocks.filter((entry) => {
    const prev = previousMap.get(entry.id);
    return Boolean(prev && prev.signature === entry.signature && prev.order !== entry.order);
  });

  return {
    addedBlocks: added.length,
    removedBlocks: removed.length,
    updatedBlocks: updated.length,
    movedBlocks: moved.length,
    addedPreview: added.map((entry) => entry.label).slice(0, 3),
    removedPreview: removed.map((entry) => entry.label).slice(0, 3),
    updatedPreview: updated.map((entry) => entry.label).slice(0, 3),
    movedPreview: moved.map((entry) => entry.label).slice(0, 3),
    changed: added.length > 0 || removed.length > 0 || updated.length > 0 || moved.length > 0,
  };
}

function summarizeCustomCodeDiff(opts: {
  previousHtml: string;
  nextHtml: string;
  previousCss: string;
  nextCss: string;
}): CustomCodeDiffSummary {
  const html = summarizeHtmlDiff(opts.previousHtml, opts.nextHtml);
  const css = summarizeHtmlDiff(opts.previousCss, opts.nextCss);

  return {
    html,
    css,
    htmlChanged: html.changed,
    cssChanged: css.changed,
    totalAddedLines: html.addedLines + css.addedLines,
    totalRemovedLines: html.removedLines + css.removedLines,
  };
}

function summarizeHtmlDiff(previousHtml: string, nextHtml: string): HtmlDiffSummary {
  const previousLines = splitCodeLines(previousHtml);
  const nextLines = splitCodeLines(nextHtml);
  const maxShared = Math.min(previousLines.length, nextLines.length);

  let start = 0;
  while (start < maxShared && previousLines[start] === nextLines[start]) start += 1;

  let previousEnd = previousLines.length - 1;
  let nextEnd = nextLines.length - 1;
  while (previousEnd >= start && nextEnd >= start && previousLines[previousEnd] === nextLines[nextEnd]) {
    previousEnd -= 1;
    nextEnd -= 1;
  }

  const removedChunk = start <= previousEnd ? previousLines.slice(start, previousEnd + 1) : [];
  const addedChunk = start <= nextEnd ? nextLines.slice(start, nextEnd + 1) : [];
  const changed = addedChunk.length > 0 || removedChunk.length > 0;

  let currentStartLine: number | null = null;
  let currentEndLine: number | null = null;

  if (changed) {
    if (addedChunk.length > 0) {
      currentStartLine = start + 1;
      currentEndLine = start + addedChunk.length;
    } else {
      const anchorLine = Math.min(start + 1, Math.max(nextLines.length, 1));
      currentStartLine = anchorLine;
      currentEndLine = anchorLine;
    }
  }

  return {
    addedLines: addedChunk.length,
    removedLines: removedChunk.length,
    currentStartLine,
    currentEndLine,
    addedPreview: diffPreviewLines(addedChunk),
    removedPreview: diffPreviewLines(removedChunk),
    changed,
  };
}

function formatActivityTimestamp(raw: string) {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "Just now";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function compactActivityText(value: string, maxLen = 220) {
  const compact = String(value || "").replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (compact.length <= maxLen) return compact;
  return `${compact.slice(0, Math.max(0, maxLen - 3)).trimEnd()}...`;
}

function trimActivitySentence(value: string) {
  return String(value || "").replace(/[\s.!?]+$/g, "").trim();
}

function sentenceFromActivityFragment(value: string) {
  const trimmed = trimActivitySentence(value);
  if (!trimmed) return "";
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}.`;
}

function lowercaseLeadingCharacter(value: string) {
  if (!value) return "";
  return `${value.charAt(0).toLowerCase()}${value.slice(1)}`;
}

function joinReadablePhrases(parts: string[]) {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts[0]}, ${parts[1]}, and ${parts.length - 2} more`;
}

function isGenericSavedActivityText(value: string) {
  const normalized = trimActivitySentence(value).toLowerCase();
  if (!normalized) return true;
  return [
    "saved layout and styling changes in this area",
    "saved layout or content changes in this area",
    "saved styling changes in this area",
    "saved changes around this custom code area",
    "saved page structure changes",
    "saved structure changes around this area",
    "saved new page elements around this area",
    "saved a new change in this area",
    "saved a new page source update",
    "saved changes to",
    "updated page structure",
    "updated page source",
    "updated the builder with ai",
    "updated a custom code block in the builder",
    "prepared the next page update",
    "your custom code block has been successfully generated",
    "feel free to preview it now",
  ].some((prefix) => normalized === prefix || normalized.startsWith(`${prefix} `));
}

function tokenizeActivityText(value: string) {
  return Array.from(
    new Set(
      String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]+/g, " ")
        .split(/\s+/)
        .filter((part) => part.length >= 4)
        .filter((part) => !["this", "that", "with", "from", "into", "your", "page", "area", "block", "change", "changes", "saved", "apply", "applied", "review", "reviewed"].includes(part)),
    ),
  );
}

function isPromptEchoSavedSummary(summary: string, prompt: string) {
  const normalizedSummary = trimActivitySentence(summary).toLowerCase();
  const normalizedPrompt = trimActivitySentence(prompt).toLowerCase();
  if (!normalizedSummary || !normalizedPrompt) return false;

  const summaryTokens = tokenizeActivityText(normalizedSummary);
  const promptTokens = tokenizeActivityText(normalizedPrompt);
  if (!summaryTokens.length || !promptTokens.length) return false;

  const sharedTokens = summaryTokens.filter((token) => promptTokens.includes(token));
  const sharesPromptLanguage = sharedTokens.length >= Math.min(4, Math.max(2, Math.floor(promptTokens.length * 0.5)));
  const startsLikeLegacySummary = /^(applied|reviewed)\b/.test(normalizedSummary);
  const containsPromptLead = normalizedSummary.includes("what i need you to do is") || normalizedSummary.includes(normalizedPrompt.slice(0, 24));

  return startsLikeLegacySummary && (sharesPromptLanguage || containsPromptLead);
}

function isCorrectiveComplaintSavedSummary(summary: string, prompt = "") {
  const normalizedSummary = trimActivitySentence(summary).toLowerCase();
  if (!normalizedSummary) return false;

  const startsLikeGeneratedSummary = /^(refined|updated|reworked|reviewed)\b/.test(normalizedSummary);
  const readsLikeComplaint =
    normalizedSummary.includes("there's still") ||
    normalizedSummary.includes("there is still") ||
    /\b(still|overlap|overlapping|wrong|broken|complaining|aren't|isn't|doesn't|not working|header area|too big|misaligned)\b/.test(normalizedSummary);
  const promptTokens = tokenizeActivityText(prompt);
  const summaryTokens = tokenizeActivityText(normalizedSummary);
  const mirrorsPromptComplaint =
    promptTokens.length > 0 && summaryTokens.filter((token) => promptTokens.includes(token)).length >= Math.min(3, promptTokens.length);

  return startsLikeGeneratedSummary && readsLikeComplaint && (mirrorsPromptComplaint || normalizedSummary.includes("there's still"));
}

function isLegacyBoilerplateSavedSummary(summary: string) {
  const normalized = trimActivitySentence(summary).toLowerCase();
  if (!normalized) return true;
  return (
    normalized.startsWith("your custom code block has been successfully generated") ||
    normalized.startsWith("feel free to preview it now")
  );
}

function normalizeActivityTargetLabel(value: string) {
  const compact = compactActivityText(value, 48);
  if (!compact) return "";
  if (/^custom code$/i.test(compact)) return "custom code";
  return lowercaseLeadingCharacter(compact);
}

function buildActivityPreviewLabel(previews: string[]) {
  const labels = Array.from(new Set(previews.map(normalizeActivityTargetLabel).filter(Boolean)));
  return joinReadablePhrases(labels.slice(0, 3));
}

function pickMeaningfulSavedSummary(summary: string, prompt = "") {
  const compact = compactActivityText(summary, 96);
  if (!compact || isGenericSavedActivityText(compact) || isPromptEchoSavedSummary(compact, prompt) || isCorrectiveComplaintSavedSummary(compact, prompt)) return "";
  return sentenceFromActivityFragment(compact);
}

function extractActivityFocus(summary: string, prompt: string) {
  const compact = compactActivityText(summary, 72);
  if (
    !compact ||
    isGenericSavedActivityText(compact) ||
    isLegacyBoilerplateSavedSummary(compact) ||
    isPromptEchoSavedSummary(compact, prompt) ||
    isCorrectiveComplaintSavedSummary(compact, prompt)
  ) {
    return "";
  }

  let focus = compact
    .split(/[.?!]/)[0]
    .replace(/^(please\s+|can you\s+|could you\s+|help me\s+|make sure\s+)/i, "")
    .replace(/^(applied|reviewed|created|enhanced|tightened|redesigned|updated|update|change|edit|adjust|refine|improve|clean up|cleanup|rework|rewrite|restyle|polish|move|shift|set|switch|turn|replace|add|remove|save|fix|make)\s+/i, "")
    .replace(/^(the|this|that|my|our)\s+/i, "")
    .replace(/\s+(with|using|while|so that|so the|to keep|to make)\b.*$/i, "")
    .trim();

  focus = trimActivitySentence(focus).replace(/^["']+|["']+$/g, "").trim();
  if (!focus) return "";
  if (/^(it|this|that|here|there)$/i.test(focus)) return "";
  return lowercaseLeadingCharacter(compactActivityText(focus, 60));
}

function parseStoredCount(value: unknown, max = 4000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.max(0, Math.min(max, Math.floor(parsed)));
}

function parseStoredLineNumber(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.max(1, Math.floor(parsed));
}

function parseStoredPreviewLines(value: unknown, limit = 4) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .filter((line) => typeof line === "string")
    .map((line) => String(line).trim())
    .filter(Boolean)
    .slice(0, limit);
}

function emptyStoredHtmlDiffSummary(): HtmlDiffSummary {
  return {
    addedLines: 0,
    removedLines: 0,
    currentStartLine: null,
    currentEndLine: null,
    addedPreview: [],
    removedPreview: [],
    changed: false,
  };
}

function readPersistedHtmlDiffSummary(raw: unknown): HtmlDiffSummary | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entry = raw as Record<string, unknown>;
  const addedLines = parseStoredCount(entry.addedLines, 2000);
  const removedLines = parseStoredCount(entry.removedLines, 2000);
  const addedPreview = parseStoredPreviewLines(entry.addedPreview);
  const removedPreview = parseStoredPreviewLines(entry.removedPreview);
  const currentStartLine = parseStoredLineNumber(entry.currentStartLine);
  const currentEndLineRaw = parseStoredLineNumber(entry.currentEndLine);
  const currentEndLine = currentStartLine && currentEndLineRaw && currentEndLineRaw < currentStartLine ? currentStartLine : currentEndLineRaw;
  const changed = entry.changed === true || addedLines > 0 || removedLines > 0 || addedPreview.length > 0 || removedPreview.length > 0;

  return {
    addedLines,
    removedLines,
    currentStartLine,
    currentEndLine,
    addedPreview,
    removedPreview,
    changed,
  };
}

function readPersistedBuilderDiffSummary(raw: unknown): BuilderDiffSummary | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entry = raw as Record<string, unknown>;
  const addedBlocks = parseStoredCount(entry.addedBlocks, 2000);
  const removedBlocks = parseStoredCount(entry.removedBlocks, 2000);
  const updatedBlocks = parseStoredCount(entry.updatedBlocks, 2000);
  const movedBlocks = parseStoredCount(entry.movedBlocks, 2000);
  const addedPreview = parseStoredPreviewLines(entry.addedPreview);
  const removedPreview = parseStoredPreviewLines(entry.removedPreview);
  const updatedPreview = parseStoredPreviewLines(entry.updatedPreview);
  const movedPreview = parseStoredPreviewLines(entry.movedPreview);
  const changed =
    entry.changed === true ||
    addedBlocks > 0 ||
    removedBlocks > 0 ||
    updatedBlocks > 0 ||
    movedBlocks > 0 ||
    addedPreview.length > 0 ||
    removedPreview.length > 0 ||
    updatedPreview.length > 0 ||
    movedPreview.length > 0;

  return {
    addedBlocks,
    removedBlocks,
    updatedBlocks,
    movedBlocks,
    addedPreview,
    removedPreview,
    updatedPreview,
    movedPreview,
    changed,
  };
}

function readPersistedCustomCodeDiffSummary(raw: unknown): CustomCodeDiffSummary | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entry = raw as Record<string, unknown>;
  const html = readPersistedHtmlDiffSummary(entry.html) || emptyStoredHtmlDiffSummary();
  const css = readPersistedHtmlDiffSummary(entry.css) || emptyStoredHtmlDiffSummary();
  const htmlChanged = entry.htmlChanged === true || html.changed;
  const cssChanged = entry.cssChanged === true || css.changed;
  const totalAddedLines = parseStoredCount(entry.totalAddedLines, 4000) || html.addedLines + css.addedLines;
  const totalRemovedLines = parseStoredCount(entry.totalRemovedLines, 4000) || html.removedLines + css.removedLines;

  return {
    html,
    css,
    htmlChanged,
    cssChanged,
    totalAddedLines,
    totalRemovedLines,
  };
}

function readPersistedCustomCodeAuditTrail(raw: unknown): CustomCodeAuditEntry[] {
  if (!Array.isArray(raw)) return [];

  const entries: CustomCodeAuditEntry[] = [];

  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;

    const item = entry as Record<string, unknown>;
    const prompt = compactActivityText(typeof item.prompt === "string" ? item.prompt : "", 220);
    const summary = compactActivityText(typeof item.summary === "string" ? item.summary : "", 220);
    const at = typeof item.at === "string" ? item.at : "";
    const kindRaw = typeof item.kind === "string" ? item.kind : "ai-update";
    const kind: CustomCodeAuditKind =
      kindRaw === "no-change" || kindRaw === "question" || kindRaw === "restore" ? kindRaw : "ai-update";
    const customCodeDiff = readPersistedCustomCodeDiffSummary(item.customCodeDiff);
    const builderDiff = readPersistedBuilderDiffSummary(item.builderDiff);
    const previewChanged =
      item.previewChanged === true ||
      Boolean(customCodeDiff?.htmlChanged || customCodeDiff?.cssChanged || builderDiff?.changed);

    if (!prompt && !summary && !customCodeDiff && !builderDiff) return;

    entries.push({
      id: typeof item.id === "string" && item.id.trim() ? item.id : `persisted-custom-code-audit-${index + 1}`,
      at,
      prompt,
      summary: summary || (kind === "question" ? "AI asked for one more detail before changing this block." : "Saved custom code update."),
      kind,
      previewChanged,
      builderDiff,
      customCodeDiff,
      source: "persisted" as const,
    });
  });

  return entries;
}

function isGenericAssistantLine(line: string): boolean {
  return /^(page updated|the page (has been|is now)|your custom code block has been successfully generated|feel free to preview it now|preview it|here'?s the updated|i'?ve updated|i'?ve made|done\.|updated\.|great news|looks great|all set|the changes)/i.test(
    line.trim(),
  );
}

function buildHtmlActivityTone(item: Pick<HtmlChangeActivityItem, "kind" | "diff">): SavedChangeFeedTone {
  if (item.kind === "restore") return "violet";
  if (item.kind === "no-change" || !item.diff.changed) return "zinc";
  return "emerald";
}

function buildHtmlActivityLabel(item: Pick<HtmlChangeActivityItem, "scopeLabel" | "kind" | "prompt" | "summary" | "diff">) {
  if (item.kind === "restore") return "Restored an earlier saved source version.";
  const savedSummary = pickMeaningfulSavedSummary(item.summary || "", item.prompt || "");
  if (savedSummary) return savedSummary;
  const focus = extractActivityFocus(item.summary || "", item.prompt || "");
  if (focus) return `Updated ${focus}.`;
  if (item.scopeLabel && !/whole page/i.test(item.scopeLabel)) {
    return `Saved changes to ${item.scopeLabel.toLowerCase()}.`;
  }
  return "Updated page source.";
}

function buildHtmlActivityCountLabel(item: Pick<HtmlChangeActivityItem, "kind" | "diff">) {
  if (item.kind === "restore") {
    const touched = item.diff.addedLines + item.diff.removedLines;
    return touched > 0 ? `${touched} lines` : "Restore";
  }
  const parts: string[] = [];
  if (item.diff.addedLines > 0) parts.push(`+${item.diff.addedLines}`);
  if (item.diff.removedLines > 0) parts.push(`-${item.diff.removedLines}`);
  if (!parts.length) return "0 lines";
  return `${parts.join(" ")} lines`;
}

function buildBuilderActivityTone(item: Pick<BuilderChangeActivityItem, "kind" | "previewChanged">): SavedChangeFeedTone {
  if (item.kind === "restore") return "violet";
  if (item.kind === "no-change" || !item.previewChanged) return "zinc";
  return "sky";
}

function buildBuilderActivityHeadline(item: Pick<BuilderChangeActivityItem, "scopeLabel" | "kind" | "prompt" | "summary" | "previewChanged" | "diff" | "customCodeDiff">) {
  if (item.kind === "restore") {
    return item.scopeLabel === "Custom code block"
      ? "Restored an earlier saved version of this area."
      : "Restored an earlier saved page version.";
  }

  const savedSummary = pickMeaningfulSavedSummary(item.summary || "", item.prompt || "");
  if (savedSummary) return savedSummary;

  const focus = extractActivityFocus(item.summary || "", item.prompt || "");
  const previewFocus = buildActivityPreviewLabel([
    ...item.diff.updatedPreview,
    ...item.diff.addedPreview,
    ...item.diff.removedPreview,
    ...item.diff.movedPreview,
  ]);
  const subject = previewFocus || focus;

  if (item.customCodeDiff?.htmlChanged && item.customCodeDiff?.cssChanged) {
    return subject ? `Reworked ${subject}.` : "Reworked markup and styles.";
  }
  if (item.customCodeDiff?.htmlChanged) return subject ? `Updated ${subject}.` : "Updated markup.";
  if (item.customCodeDiff?.cssChanged) return subject ? `Refined ${subject}.` : "Refined styles.";
  if (item.diff.addedBlocks > 0 && item.scopeLabel === "Structure + insert") {
    return previewFocus ? `Added ${previewFocus}.` : `Added ${item.diff.addedBlocks} page element${item.diff.addedBlocks === 1 ? "" : "s"}.`;
  }
  if (item.diff.updatedBlocks > 0 && previewFocus) return `Updated ${previewFocus}.`;
  if (item.diff.movedBlocks > 0 && previewFocus) return `Reordered ${previewFocus}.`;
  if (item.diff.removedBlocks > 0 && previewFocus) return `Removed ${previewFocus}.`;
  if (subject) return `Updated ${subject}.`;
  if (item.scopeLabel === "Custom code block") return "Updated custom code.";
  return "Updated page structure.";
}

function buildBuilderActivityCountLabel(item: Pick<BuilderChangeActivityItem, "kind" | "diff" | "customCodeDiff">) {
  if (item.customCodeDiff && (item.customCodeDiff.htmlChanged || item.customCodeDiff.cssChanged)) {
    const parts: string[] = [];
    if (item.customCodeDiff.totalAddedLines > 0) parts.push(`+${item.customCodeDiff.totalAddedLines}`);
    if (item.customCodeDiff.totalRemovedLines > 0) parts.push(`-${item.customCodeDiff.totalRemovedLines}`);
    if (parts.length) return `${parts.join(" ")} lines`;
  }

  const touchedBlocks = item.diff.addedBlocks + item.diff.updatedBlocks + item.diff.movedBlocks + item.diff.removedBlocks;
  if (touchedBlocks > 0) return `${touchedBlocks} block${touchedBlocks === 1 ? "" : "s"}`;
  if (item.kind === "restore") return "Restore";
  return "0 blocks";
}

function getSavedChangeToneClasses(tone: SavedChangeFeedTone) {
  if (tone === "amber") {
    return {
      dot: "bg-amber-400",
      shell: "border-zinc-200 bg-white",
      eyebrow: "text-zinc-500",
      timestamp: "text-zinc-400",
    };
  }
  if (tone === "violet") {
    return {
      dot: "bg-violet-400",
      shell: "border-zinc-200 bg-white",
      eyebrow: "text-zinc-500",
      timestamp: "text-zinc-400",
    };
  }
  if (tone === "emerald") {
    return {
      dot: "bg-emerald-400",
      shell: "border-zinc-200 bg-white",
      eyebrow: "text-zinc-500",
      timestamp: "text-zinc-400",
    };
  }
  if (tone === "sky") {
    return {
      dot: "bg-sky-400",
      shell: "border-zinc-200 bg-white",
      eyebrow: "text-zinc-500",
      timestamp: "text-zinc-400",
    };
  }
  return {
    dot: tone === "slate" ? "bg-zinc-400" : "bg-zinc-300",
    shell: "border-zinc-200 bg-white",
    eyebrow: "text-zinc-500",
    timestamp: "text-zinc-400",
  };
}

function isSavedHtmlActivityItem(item: HtmlChangeActivityItem) {
  return item.kind === "restore" || item.diff.changed;
}

function isSavedBuilderActivityItem(item: BuilderChangeActivityItem) {
  return item.kind === "restore" || item.previewChanged;
}

function isSavedCustomCodeAuditEntry(entry: CustomCodeAuditEntry) {
  return entry.kind === "restore" || entry.previewChanged;
}

function getCustomCodeAuditTone(entry: CustomCodeAuditEntry) {
  if (entry.kind === "question") return "amber" as const;
  if (entry.kind === "restore") return "violet" as const;
  if (entry.kind === "no-change" || !entry.previewChanged) return "slate" as const;
  return "sky" as const;
}

function getCustomCodeAuditHeadline(entry: CustomCodeAuditEntry) {
  if (entry.kind === "question") return entry.summary || "AI needs one more detail before it can save this area.";
  if (entry.kind === "restore") return "Restored an earlier saved version of this area.";

  if (entry.kind === "no-change" || !entry.previewChanged) return "Latest pass did not save a change in this area.";

  const savedSummary = pickMeaningfulSavedSummary(entry.summary || "", entry.prompt || "");
  if (savedSummary) return savedSummary;

  const focus = extractActivityFocus(entry.summary || "", entry.prompt || "");
  const previewFocus = buildActivityPreviewLabel([
    ...(entry.builderDiff?.updatedPreview || []),
    ...(entry.builderDiff?.addedPreview || []),
    ...(entry.builderDiff?.removedPreview || []),
    ...(entry.builderDiff?.movedPreview || []),
  ]);
  const subject = previewFocus || focus;

  if (entry.customCodeDiff?.htmlChanged && entry.customCodeDiff?.cssChanged) return subject ? `Reworked ${subject}.` : "Reworked markup and styles.";
  if (entry.customCodeDiff?.htmlChanged) return subject ? `Updated ${subject}.` : "Updated markup.";
  if (entry.customCodeDiff?.cssChanged) return subject ? `Refined ${subject}.` : "Refined styles.";

  if (entry.builderDiff?.changed) {
    if (entry.builderDiff.addedBlocks > 0 && previewFocus) return `Added ${previewFocus}.`;
    if (entry.builderDiff.updatedBlocks > 0 && previewFocus) return `Updated ${previewFocus}.`;
    if (entry.builderDiff.movedBlocks > 0 && previewFocus) return `Reordered ${previewFocus}.`;
    if (entry.builderDiff.removedBlocks > 0 && previewFocus) return `Removed ${previewFocus}.`;
  }

  if (subject) return `Updated ${subject}.`;
  return "Updated custom code.";
}

function getCustomCodeAuditCountLabel(entry: CustomCodeAuditEntry) {
  if (entry.customCodeDiff && (entry.customCodeDiff.htmlChanged || entry.customCodeDiff.cssChanged)) {
    const parts: string[] = [];
    if (entry.customCodeDiff.totalAddedLines > 0) parts.push(`+${entry.customCodeDiff.totalAddedLines}`);
    if (entry.customCodeDiff.totalRemovedLines > 0) parts.push(`-${entry.customCodeDiff.totalRemovedLines}`);
    if (parts.length) return `${parts.join(" ")} lines`;
  }

  const touchedBlocks =
    (entry.builderDiff?.addedBlocks || 0) +
    (entry.builderDiff?.updatedBlocks || 0) +
    (entry.builderDiff?.movedBlocks || 0) +
    (entry.builderDiff?.removedBlocks || 0);
  if (touchedBlocks > 0) return `${touchedBlocks} block${touchedBlocks === 1 ? "" : "s"}`;
  if (entry.kind === "restore") return "Restore";
  return "Saved";
}

function synthesizeThreadLabel(_prompt: string, response: string): string {
  // Prefer the changelog summary line if it's substantive (comes from buildChangelogAssistantMessage)
  const firstLine = response.split("\n")[0].trim();
  if (firstLine && firstLine.length >= 8 && firstLine.length <= 100 && !isGenericAssistantLine(firstLine)) {
    return firstLine;
  }
  return response.trim() ? "Continued thread" : "New thread turn";
}

function readPersistedHtmlChangeActivity(raw: unknown): HtmlChangeActivityItem[] {
  if (!Array.isArray(raw)) return [];

  const entries: HtmlChangeActivityItem[] = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const entry = item as Record<string, unknown>;
    const diff = readPersistedHtmlDiffSummary(entry.diff);
    if (!diff) return;

    const kindRaw = typeof entry.kind === "string" ? entry.kind : "ai-update";
    const kind: HtmlChangeActivityItem["kind"] =
      kindRaw === "no-change" || kindRaw === "restore" ? kindRaw : "ai-update";

    entries.push({
      id: typeof entry.id === "string" && entry.id.trim() ? entry.id : `html-activity-${index + 1}`,
      pageId: typeof entry.pageId === "string" ? entry.pageId : "",
      kind,
      scopeLabel: compactActivityText(typeof entry.scopeLabel === "string" ? entry.scopeLabel : "", 120),
      prompt: compactActivityText(typeof entry.prompt === "string" ? entry.prompt : "", 220),
      summary: compactActivityText(typeof entry.summary === "string" ? entry.summary : "", 220),
      at: typeof entry.at === "string" ? entry.at : "",
      diff,
      previewChanged: entry.previewChanged === true || diff.changed,
    });
  });

  return entries.filter((item) => item.pageId).slice(0, 24);
}

function parseCustomChatThread(raw: unknown): ChatThreadRound[] {
  const cleanRaw = stripFunnelPageIntentMessages(raw);
  if (!Array.isArray(cleanRaw)) return [];
  const rounds: ChatThreadRound[] = [];
  for (let i = 0; i < cleanRaw.length; i++) {
    const msg = cleanRaw[i];
    if (!msg || typeof msg !== "object") continue;
    if ((msg as any).role !== "user") continue;
    const userContent = typeof (msg as any).content === "string" ? (msg as any).content.trim() : "";
    const userAt = typeof (msg as any).at === "string" ? (msg as any).at : "";
    const next = cleanRaw[i + 1];
    const hasNext = Boolean(next && typeof next === "object" && (next as any).role === "assistant");
    const assistantContent = hasNext ? (typeof (next as any).content === "string" ? (next as any).content.trim() : "") : "";
    const assistantAt = hasNext ? (typeof (next as any).at === "string" ? (next as any).at : userAt) : userAt;
    if (!userContent && !assistantContent) continue;
    rounds.push({
      id: `thread-${i}-${userAt}`,
      at: assistantAt || userAt,
      label: synthesizeThreadLabel(userContent, assistantContent),
      diffSummary: null,
    });
    if (hasNext) i++;
  }
  return rounds.reverse();
}

function parseBlockChatRounds(messages: BlockChatMessage[]): BlockChatRound[] {
  const rounds: BlockChatRound[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message || message.role !== "user") continue;
    const next = messages[index + 1];
    const assistant = next && next.role === "assistant" ? next : null;
    rounds.push({ user: message, assistant });
    if (assistant) index += 1;
  }
  return rounds;
}

function buildCustomCodeThreadAssistantLine(prompt: string, response: string) {
  const compactPrompt = compactActivityText(prompt, 220);
  const compactResponse = compactActivityText(response, 220);
  if (!compactResponse) return "";
  if (/[?]$/.test(compactResponse)) return compactResponse;

  const savedSummary = pickMeaningfulSavedSummary(compactResponse, compactPrompt);
  if (savedSummary) return savedSummary;
  if (
    isLegacyBoilerplateSavedSummary(compactResponse) ||
    isGenericSavedActivityText(compactResponse) ||
    isPromptEchoSavedSummary(compactResponse, compactPrompt) ||
    isCorrectiveComplaintSavedSummary(compactResponse, compactPrompt)
  ) {
    return "";
  }

  return sentenceFromActivityFragment(compactResponse);
}

function isBriefCorrectiveFollowUpPrompt(value: string) {
  const compact = compactActivityText(value, 140).toLowerCase();
  if (!compact) return false;
  if (compact.length > 120) return false;
  return /\b(still|fix|wrong|off|overlap|overlapping|button|header|padding|spacing|align|misaligned|broken|issue|problem)\b/.test(compact);
}

function buildCustomCodeActiveThreadMessages(
  messages: BlockChatMessage[],
  nextPrompt: string,
  maxRounds = CUSTOM_CODE_THREAD_WINDOW_LIMIT,
) {
  const rounds = parseBlockChatRounds(messages);
  if (!rounds.length) return [] as BlockChatMessage[];

  const nextPromptTokens = tokenizeActivityText(nextPrompt);
  const minimumRoundsToKeep = isBriefCorrectiveFollowUpPrompt(nextPrompt) ? Math.min(2, rounds.length) : 1;
  let anchorTokens = [...nextPromptTokens];
  const kept: BlockChatMessage[] = [];
  let keptRoundCount = 0;

  for (let index = rounds.length - 1; index >= 0 && keptRoundCount < maxRounds; index -= 1) {
    const round = rounds[index];
    const promptLine = compactActivityText(round.user.content, 320);
    const assistantLine = buildCustomCodeThreadAssistantLine(promptLine, round.assistant?.content || "");
    const roundTokens = tokenizeActivityText([promptLine, assistantLine].filter(Boolean).join(" "));
    const isLatestRound = keptRoundCount === 0;
    const sharesNextPrompt = nextPromptTokens.length > 0 && roundTokens.some((token) => nextPromptTokens.includes(token));
    const sharesAnchor = anchorTokens.length > 0 && roundTokens.some((token) => anchorTokens.includes(token));

    if (!isLatestRound && keptRoundCount >= minimumRoundsToKeep && !sharesNextPrompt && !sharesAnchor) break;

    if (assistantLine) {
      kept.unshift({
        role: "assistant",
        content: assistantLine,
        ...(round.assistant?.at ? { at: round.assistant.at } : {}),
      });
    }
    if (promptLine) {
      kept.unshift({
        role: "user",
        content: promptLine,
        ...(round.user.at ? { at: round.user.at } : {}),
      });
    }

    anchorTokens = Array.from(new Set([...anchorTokens, ...roundTokens])).slice(0, 24);
    keptRoundCount += 1;
  }

  return kept.slice(-(maxRounds * 2));
}

function prependPersistedCustomCodeAuditEntry(existingRaw: unknown, entry: Omit<CustomCodeAuditEntry, "source">) {
  const nextEntries = [{ ...entry, source: "persisted" as const }, ...readPersistedCustomCodeAuditTrail(existingRaw)].slice(0, 12);
  return nextEntries.map((item) => ({
    id: item.id,
    at: item.at,
    prompt: item.prompt,
    summary: item.summary,
    ...(item.kind ? { kind: item.kind } : {}),
    previewChanged: item.previewChanged,
    builderDiff: item.builderDiff || null,
    customCodeDiff: item.customCodeDiff || null,
  }));
}

function countMeaningfulCodeLines(value: string) {
  return splitCodeLines(value).filter((line) => line.trim()).length;
}

type AiCheckpointChangelogEntry = {
  section: string;
  what: string;
  why?: string;
};

type AiCheckpointChangelog = {
  summary?: string | null;
  changes: AiCheckpointChangelogEntry[];
  preserved: string[];
  conversionNotes: string[];
};

function coerceAiCheckpointChangelog(raw: unknown): AiCheckpointChangelog | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as Record<string, unknown>;
  const changes = Array.isArray(parsed.changes)
    ? parsed.changes
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const record = item as Record<string, unknown>;
          const section = typeof record.section === "string" ? record.section.trim().slice(0, 80) : "";
          const what = typeof record.what === "string" ? record.what.trim().slice(0, 220) : "";
          const why = typeof record.why === "string" ? record.why.trim().slice(0, 220) : "";
          if (!section || !what) return null;
          return { section, what, ...(why ? { why } : {}) };
        })
        .filter((item): item is AiCheckpointChangelogEntry => item !== null)
    : [];
  const preserved = Array.isArray(parsed.preserved)
    ? parsed.preserved.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim().slice(0, 180)).slice(0, 4)
    : [];
  const conversionNotes = Array.isArray(parsed.conversionNotes)
    ? parsed.conversionNotes.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim().slice(0, 180)).slice(0, 4)
    : [];
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 240) : "";
  if (!changes.length && !preserved.length && !conversionNotes.length && !summary) return null;
  return {
    ...(summary ? { summary } : {}),
    changes,
    preserved,
    conversionNotes,
  };
}

type AiCheckpoint = {
  pageId: string;
  surface: "structure" | "source";
  prompt: string;
  summary: string;
  warnings: string[];
  at: string;
  backgroundReviewStatus?: "pending" | "complete";
  backgroundReviewSummary?: string | null;
  backgroundReviewMode?: "visual" | "structural" | null;
  changelog?: AiCheckpointChangelog | null;
  previousPage: Pick<Page, "editorMode" | "blocksJson" | "customHtml" | "draftHtml" | "customChatJson">;
};

function PageContinuityPanel({
  thread,
  latestCheckpoint,
  onRestoreLatest,
  restoreDisabled,
  heading = "Direction thread",
  description,
  emptyState = "Prompt and assistant turns will appear here. Saved results stay above.",
}: {
  thread: ChatThreadRound[];
  latestCheckpoint: AiCheckpoint | null;
  onRestoreLatest: () => void;
  restoreDisabled: boolean;
  heading?: string;
  description?: string;
  emptyState?: string;
}) {
  const entries: ChatThreadRound[] =
    thread.length === 0 && latestCheckpoint
      ? [
          {
            id: "checkpoint-fallback",
            at: latestCheckpoint.at,
            label: latestCheckpoint.surface === "source" ? "Saved source checkpoint" : "Saved structure checkpoint",
            diffSummary: null,
          },
        ]
      : thread;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-3.5 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{heading}</div>
          <div className="mt-1 text-xs leading-5 text-zinc-500">
            {description || (entries.length > 0 ? `${entries.length} recent thread turn${entries.length === 1 ? "" : "s"}. Saved results stay in the change list above.` : "Recent prompt and assistant continuity will appear here.")}
          </div>
        </div>
        <div className="shrink-0 text-[11px] font-semibold text-zinc-400">
          {entries.length > 0 ? `${entries.length} turns` : "Thread"}
        </div>
        {latestCheckpoint ? (
          <button
            type="button"
            onClick={onRestoreLatest}
            disabled={restoreDisabled}
            className="text-[11px] font-medium text-zinc-400 transition-colors hover:text-zinc-700 disabled:opacity-40"
          >
            Restore prior
          </button>
        ) : null}
      </div>

      {latestCheckpoint && (latestCheckpoint.backgroundReviewStatus === "pending" || latestCheckpoint.warnings.length || latestCheckpoint.backgroundReviewSummary) ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
            {latestCheckpoint.backgroundReviewStatus === "pending"
              ? "Visual Review Running"
              : latestCheckpoint.backgroundReviewMode === "visual"
                ? "Visual Review"
                : "Fallback Review"}
          </div>
          {latestCheckpoint.backgroundReviewStatus === "pending" ? (
            <div className="mt-1 text-[12px] leading-5 text-amber-800">
              A second pass is checking hierarchy, proof placement, and the conversion path in the background.
            </div>
          ) : null}
          {latestCheckpoint.backgroundReviewStatus === "complete" && latestCheckpoint.backgroundReviewSummary ? (
            <div className="mt-1 text-[12px] leading-5 text-amber-900">{latestCheckpoint.backgroundReviewSummary}</div>
          ) : null}
          {latestCheckpoint.backgroundReviewStatus === "complete" && latestCheckpoint.backgroundReviewMode === "structural" ? (
            <div className="mt-1 text-[11px] leading-5 text-amber-800">
              Screenshot review did not resolve cleanly for this pass, so the fallback structural review was kept instead.
            </div>
          ) : null}
          {latestCheckpoint.warnings.length ? (
            <div className="mt-1.5 space-y-1 text-[12px] leading-5 text-amber-900">
              {latestCheckpoint.warnings.map((warning, index) => (
                <div key={`${latestCheckpoint.at}-warning-${index}`}>{warning}</div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {entries.length ? (
        <div className="relative mt-3 max-h-72 overflow-y-auto pl-4.5 pr-1">
          <div className="absolute bottom-1 left-1.25 top-1 w-px" style={{ background: "rgb(228 228 231)" }} />
          <div className="space-y-4">
            {entries.map((round) => (
              <div key={round.id} className="relative">
                <div className="absolute -left-3.25 top-1 h-1.75 w-1.75 rounded-full border border-zinc-300 bg-white" />
                <div className="min-w-0 text-[13px] font-medium leading-4.5 text-zinc-800 line-clamp-2">{round.label}</div>
                <div className="mt-0.5 text-[11px] text-zinc-400">{formatActivityTimestamp(round.at)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3 text-[12px] leading-5 text-zinc-500">
          {emptyState}
        </div>
      )}
    </div>
  );
}

function SavedChangeFeed({
  entries,
  emptyState,
  onSelect,
}: {
  entries: SavedChangeFeedItem[];
  emptyState: string;
  onSelect?: (entry: SavedChangeFeedItem) => void;
}) {
  if (!entries.length) {
    return <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-3 py-4 text-sm text-zinc-600">{emptyState}</div>;
  }

  return (
    <div className="space-y-1.5">
      {entries.map((entry) => {
        const toneClasses = getSavedChangeToneClasses(entry.tone);
        const content = (
          <div className={classNames("rounded-xl border px-3 py-2.5", toneClasses.shell, onSelect ? "hover:border-zinc-300" : "") }>
            <div className="flex items-start gap-2">
              <span className={classNames("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", toneClasses.dot)} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium leading-5 text-zinc-900">{entry.headline}</div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-400">
                  <span>{entry.countLabel}</span>
                  <span aria-hidden="true">/</span>
                  <span>{formatActivityTimestamp(entry.at)}</span>
                </div>
              </div>
            </div>
          </div>
        );

        if (!onSelect) return <div key={entry.id}>{content}</div>;

        return (
          <button key={entry.id} type="button" onClick={() => onSelect(entry)} className="block w-full text-left">
            {content}
          </button>
        );
      })}
    </div>
  );
}

function DirectionWorkbenchPanel({
  routeLabel,
  pageTypeLabel,
  scopeLabel,
  foundationStatusLabel,
  foundationStatusClassName,
  foundationSummary,
  foundationNarrative,
  assumption,
  pageConversionFocus,
  shellFrame,
  sectionPlanItems,
  pageGoalUsesDefault,
  pageAnatomy,
  thread,
  latestCheckpoint,
  onRestoreLatest,
  restoreDisabled,
  onOpenBrief,
  onPrepareClarify,
  onPrepareDraft,
}: {
  routeLabel: string;
  pageTypeLabel: string;
  scopeLabel: string;
  foundationStatusLabel: string;
  foundationStatusClassName: string;
  foundationSummary: string;
  foundationNarrative: string;
  assumption: string | null;
  pageConversionFocus: {
    headline: string;
    summary: string;
    metricLabel: string;
    metricValue: string;
    mechanismLabel: string;
    mechanismValue: string;
    ctaLabel: string;
    ctaValue: string;
  };
  shellFrame: null | {
    label: string;
    summary: string;
    sectionPlan?: string;
    visualTone: string;
    proofModel: string;
    ctaRhythm: string;
    designDirectives?: string[];
  };
  sectionPlanItems: string[];
  pageGoalUsesDefault: boolean;
  pageAnatomy: {
    rootBlocks: number;
    totalBlocks: number;
    sections: number;
    layoutBlocks: number;
    textNodes: number;
    actions: number;
    forms: number;
    media: number;
    codeIslands: number;
    headers: number;
    onlyCodeIsland: boolean;
  };
  thread: ChatThreadRound[];
  latestCheckpoint: AiCheckpoint | null;
  onRestoreLatest: () => void;
  restoreDisabled: boolean;
  onOpenBrief: () => void;
  onPrepareClarify: (promptHint: string) => void;
  onPrepareDraft: (promptHint: string) => void;
}) {
  const directionScrollRef = useRef<HTMLDivElement | null>(null);
  const proofResolved = Boolean(shellFrame?.proofModel && shellFrame.proofModel !== "Not resolved yet.");
  const ctaResolved = Boolean(pageConversionFocus.ctaValue && !/not resolved|tbd|unknown/i.test(pageConversionFocus.ctaValue));
  const designIntentLoose = Boolean(assumption) || pageGoalUsesDefault;
  const sceneQuality = assessFunnelSceneQuality({
    pageAnatomy,
    proofResolved,
    ctaResolved,
    sectionPlanItems,
    proofModel: shellFrame?.proofModel,
    designIntentLoose,
  });
  const {
    importedSlab,
    openingFrameResolved,
    hierarchyResolved,
    rhythmResolved,
    proofStagingResolved,
    actionPlacementResolved,
    compositionResolved,
    textHeavy,
    pageQualityChecks,
  } = sceneQuality;

  const goodPageEssentials = [
    {
      title: "A real first screen",
      description: "The top of the page needs an intentional opening frame: clear visual anchor, real spacing, and an immediate action path. Not loose text dropped into a blank canvas.",
    },
    {
      title: "Hierarchy you can feel",
      description: "Strong pages separate headline, support, proof, and action with scale, contrast, containment, and spacing. Design has to direct the eye before copy does.",
    },
    {
      title: "Section rhythm",
      description: "A page should expand and contract as you move down it. Alternating density, background shifts, media, and grouped content keep it from reading as one long slab.",
    },
    {
      title: "Staged proof",
      description: "Proof needs its own designed moments: logos, outcomes, testimonial clusters, examples, screenshots, or trust bands. It should not be buried in paragraphs.",
    },
    {
      title: "CTA anchors",
      description: "The ask needs visible placement and repetition. One button floating inside a generic hero is not enough if the page keeps going.",
    },
    {
      title: "Composable structure",
      description: "The page has to be built from real sections and layout primitives. If it stays one imported slab, the system cannot shape hierarchy, rhythm, or proof placement reliably.",
    },
  ];

  const failedChecks = pageQualityChecks.filter((item) => item.tone === "bad");
  const weakChecks = pageQualityChecks.filter((item) => item.tone === "warn");
  const healthyChecks = pageQualityChecks.filter((item) => item.tone === "good");
  const supportedSignalCount = healthyChecks.length;
  const totalSignalCount = pageQualityChecks.length;
  const idealSkeletonBeats = (shellFrame?.sectionPlan ? parseSectionPlanItems(shellFrame.sectionPlan) : sectionPlanItems)
    .filter(Boolean)
    .slice(0, 6);
  const shellGuardrails = (shellFrame?.designDirectives || []).slice(0, 2);
  const observedSignals = [
    importedSlab ? "One imported custom-code block" : `${pageAnatomy.sections} sections, ${pageAnatomy.layoutBlocks} layout blocks, ${pageAnatomy.totalBlocks} editable blocks`,
    `CTA path: ${ctaResolved ? pageConversionFocus.ctaValue : "still loose"}`,
    `Proof model: ${proofResolved ? (shellFrame?.proofModel || "defined") : "not resolved"}`,
    `Shell posture: ${shellFrame?.label || "still open"}`,
    `Section plan: ${(idealSkeletonBeats.length ? idealSkeletonBeats : sectionPlanItems).slice(0, 3).join(" -> ") || "not resolved"}`,
  ];

  const structuralPriorities = [
    importedSlab
      ? {
          title: "Decompose the page into real sections",
          detail: "Break the imported markup into editable hero, proof, detail, and CTA sections before judging polish.",
        }
      : null,
    !openingFrameResolved
      ? {
          title: "Rebuild the first screen",
          detail: "Give the page a stronger opening frame with clearer containment, spacing, and an immediate action path.",
        }
      : null,
    !hierarchyResolved
      ? {
          title: "Strengthen hierarchy",
          detail: "Use stronger containers, contrast shifts, grouped modules, and fewer uninterrupted text runs.",
        }
      : null,
    !rhythmResolved
      ? {
          title: "Create section cadence",
          detail: "Alternate dense and light sections so the page has real scroll rhythm instead of one continuous slab.",
        }
      : null,
    !proofStagingResolved
      ? {
          title: "Stage proof visually",
          detail: "Give credibility its own designed surfaces near the first serious ask and before the close.",
        }
      : null,
    !actionPlacementResolved
      ? {
          title: "Re-anchor the CTA",
          detail: "Place the ask at the right structural beats instead of relying on one isolated action point.",
        }
      : null,
    !compositionResolved && !importedSlab
      ? {
          title: "Add composable structure",
          detail: "Increase the number of real layout blocks so hierarchy and pacing can be tuned intentionally.",
        }
      : null,
  ].filter(Boolean) as Array<{ title: string; detail: string }>;

  while (structuralPriorities.length < 3) {
    structuralPriorities.push(
      structuralPriorities.length === 0
        ? {
            title: "Refine the strongest section",
            detail: "Tighten the section carrying the most weight instead of restyling the whole page at once.",
          }
        : structuralPriorities.length === 1
          ? {
              title: "Preserve what is already working",
              detail: "Keep the current structural strengths stable while you improve the weaker beats.",
            }
          : {
              title: "Save polish for later",
              detail: "Finish the structural pass before typography and copy refinements take over the iteration.",
            },
    );
  }

  const structuralPassPlan = structuralPriorities.slice(0, 3);

  const skeletonStatusForBeat = (item: string) => {
    const normalized = item.toLowerCase();
    if (importedSlab) return { label: "Blocked", tone: "bad" as const };
    if (/hero|promise|confirmation|order summary/.test(normalized)) {
      return { label: openingFrameResolved ? "Covered" : "Missing", tone: openingFrameResolved ? ("good" as const) : ("warn" as const) };
    }
    if (/proof|credibility|testimonial|case stud|speaker|trust|guarantee/.test(normalized)) {
      return { label: proofStagingResolved ? "Covered" : "Missing", tone: proofStagingResolved ? ("good" as const) : ("warn" as const) };
    }
    if (/faq|objection|reassurance|qualification|who this is for|expectation/.test(normalized)) {
      const resolved = pageAnatomy.sections >= 4 || pageAnatomy.layoutBlocks >= 3;
      return { label: resolved ? "Present" : "Compressed", tone: resolved ? ("good" as const) : ("warn" as const) };
    }
    if (/cta|form|booking|checkout|register|apply|submit/.test(normalized)) {
      return { label: actionPlacementResolved ? "Anchored" : "Weak", tone: actionPlacementResolved ? ("good" as const) : ("warn" as const) };
    }
    if (/problem|stakes|solution|outcomes|benefits|agenda|next steps/.test(normalized)) {
      return { label: rhythmResolved ? "Sequenced" : "Compressed", tone: rhythmResolved ? ("good" as const) : ("warn" as const) };
    }
    return { label: compositionResolved ? "Supported" : "Thin", tone: compositionResolved ? ("good" as const) : ("warn" as const) };
  };

  const dominantIssue = importedSlab
    ? {
        title: "This page is not structurally legible yet",
        detail: "The editor is still looking at one imported code slab. That means users cannot confidently iterate on hierarchy, pacing, proof, or CTA placement because the page is not composed as real sections.",
      }
    : !hierarchyResolved && textHeavy
      ? {
          title: "This page feels flat because it is carrying too much text without enough structure",
          detail: "The visual system is weak. There are not enough layout breaks, contrast shifts, grouped modules, or proof moments to create a readable top-to-bottom experience.",
        }
      : !rhythmResolved
        ? {
            title: "This page feels monotonous because the section rhythm is weak",
            detail: "The scroll experience is not expanding and contracting with intent. Visitors are moving through one continuous content run instead of distinct designed beats.",
          }
        : !actionPlacementResolved
          ? {
              title: "This page asks without enough structural support",
              detail: "The action path is present, but it is not anchored at enough moments in the layout to feel earned and usable as the visitor moves down the page.",
            }
          : !proofStagingResolved
            ? {
                title: "This page has claims, but not enough designed proof",
                detail: "Trust is not being staged visually. Proof needs dedicated surfaces so the page feels credible before it asks for action.",
              }
            : {
                title: "This page is structurally viable for refinement",
                detail: "The page has enough layout logic to support focused design iteration, so the next passes can tighten hierarchy, proof moments, and copy instead of rebuilding from scratch.",
              };

  const readinessTone = importedSlab || failedChecks.length > 0 ? "bad" : weakChecks.length >= 3 ? "warn" : "good";
  const readinessLabel = importedSlab
    ? "Not ready for confident iteration"
    : failedChecks.length > 0
      ? "Needs structural redesign"
      : weakChecks.length >= 3
        ? "Ready for a focused structure pass"
        : "Ready for polish and refinement";
  const readinessConfidenceLabel = importedSlab
    ? "Early read"
    : readinessTone === "bad"
      ? "Clear issue"
      : readinessTone === "warn"
        ? "Useful next pass"
        : "Ready to refine";
  const readinessSummary = importedSlab
    ? "Break the imported slab into real sections before judging style decisions too confidently."
    : readinessTone === "bad"
      ? "The page still has structural design problems that will make styling passes feel cosmetic."
      : readinessTone === "warn"
        ? "The page has a usable backbone, but one major structural pass should happen before polish work."
        : "The page has a credible design spine, so the next iterations can focus on refinement instead of reconstruction.";
  const inferenceTone = importedSlab ? "bad" : pageAnatomy.sections < 2 || pageAnatomy.totalBlocks < 6 ? "warn" : "good";
  const inferenceLabel = importedSlab
    ? "Low inference confidence"
    : inferenceTone === "warn"
      ? "Partial inference confidence"
      : "Stronger inference confidence";
  const inferenceSummary = importedSlab
    ? "Direction is mostly inferring from intent, shell, CTA path, and the fact that the page is one imported slab. It cannot inspect real editable hierarchy yet."
    : inferenceTone === "warn"
      ? "Direction has some usable structure signals, but the page anatomy is still thin enough that the read should be treated as directional, not final."
      : "Direction has enough editable structure to make a more credible structural read, but it is still not pixel-accurate visual critique.";
  const iterationCount = Math.max(1, thread.length + 1);
  const supportedWeakSignals = pageQualityChecks.filter((item) => item.tone !== "good").slice(0, 3);
  const preservedStrengths = pageQualityChecks.filter((item) => item.tone === "good").slice(0, 2);
  const recentDirectionHistory = thread.slice(0, 3).map((item, index) => {
    const diff = item.diffSummary ? ` (${item.diffSummary})` : "";
    return `${index + 1}. ${item.label}${diff}`;
  });

  const primaryStructuralMove = importedSlab
    ? "Turn the imported markup into real sections first. Until the page is decomposed, every design judgment is partially blind."
    : !openingFrameResolved
      ? "Rebuild the first screen so it has a stronger anchor, clearer containment, and an immediate action path."
      : !hierarchyResolved
        ? "Create clearer hierarchy with stronger section containers, contrast shifts, and grouped modules instead of one continuous text run."
        : !rhythmResolved
          ? "Introduce section cadence by alternating density, proof bands, and content grouping so the page has real scroll rhythm."
          : !proofStagingResolved
            ? "Design dedicated proof moments before touching polish. Trust needs its own visual surfaces."
            : !actionPlacementResolved
              ? "Re-anchor the CTA in the layout so the ask appears at the right structural beats, not just once."
              : "Tighten the strongest existing sections instead of redesigning the entire page again.";

  const primaryActionLabel = importedSlab ? "Build the first editable pass" : "Build the recommended next pass";
  const primaryActionDetail = importedSlab
    ? "Break this page into real sections so future edits can improve it intentionally."
    : primaryStructuralMove;
  const secondaryActionLabel = "Ask one question before changing the page";
  const secondaryActionDetail = "Use this when one missing answer would materially change the next pass.";
  const briefActionLabel = "Review the page brief and goals";
  const briefActionDetail = "Check the promise, audience, CTA, and structure settings feeding this guidance.";
  const pageIntentSummary = `${pageConversionFocus.metricLabel}: ${pageConversionFocus.metricValue}. ${pageConversionFocus.ctaLabel}: ${pageConversionFocus.ctaValue}.`;

  const avoidThisPass = importedSlab
    ? "Avoid debating typography or copy polish while the page is still one imported slab."
    : textHeavy
      ? "Avoid adding more copy to solve a layout problem. The page needs structure, not more text."
      : "Avoid broad restyling before the next structural move is resolved.";
  const buildDirectionPassPrompt = (mode: "draft" | "clarify") => {
    const idealStructure = (idealSkeletonBeats.length ? idealSkeletonBeats : sectionPlanItems).slice(0, 6).join(" -> ");
    const weakSignalSummary = supportedWeakSignals.length
      ? supportedWeakSignals.map((item, index) => `${index + 1}. ${item.title}: ${item.detail}`).join(" ")
      : "No failing structural checks are currently detected. Tighten the strongest sections without broad redesign.";
    const preservedStrengthSummary = preservedStrengths.length
      ? preservedStrengths.map((item) => `${item.title}: ${item.detail}`).join(" ")
      : "No strong structural elements are locked yet; preserve only what clearly supports the page goal.";
    const historySummary = recentDirectionHistory.length
      ? `Recent direction history: ${recentDirectionHistory.join(" ")}`
      : "Recent direction history: no earlier structural pass is attached to this draft yet.";

    if (mode === "clarify") {
      return [
        `Direction structural pass ${iterationCount} for ${routeLabel} (${pageTypeLabel} page).`,
        `Ask only one short question if the answer would materially change this pass.`,
        `Primary diagnosis: ${dominantIssue.title}. ${dominantIssue.detail}`,
        `Current move: ${primaryStructuralMove}`,
        `Weak structural signals: ${weakSignalSummary}`,
        `Signals used for this read: ${observedSignals.join(" | ")}`,
        `Confidence: ${inferenceLabel}. ${inferenceSummary}`,
        `This workflow expects multiple passes. Do not ask about copy polish or visual garnish.`,
      ].join("\n");
    }

    return [
      `Direction structural pass ${iterationCount} for ${routeLabel} (${pageTypeLabel} page).`,
      `This is one pass in a multi-pass workflow. Do not try to perfect the whole page in one response.`,
      `Primary diagnosis: ${dominantIssue.title}. ${dominantIssue.detail}`,
      `Best next move: ${primaryStructuralMove}`,
      `Do not spend this pass on: ${avoidThisPass}`,
      `Confidence: ${inferenceLabel}. ${inferenceSummary}`,
      `Signals used for this read: ${observedSignals.join(" | ")}`,
      `Weak structural signals to address now: ${weakSignalSummary}`,
      `Structural strengths to preserve: ${preservedStrengthSummary}`,
      `Ideal structure: ${idealStructure}`,
      `Execute only these moves in order: ${structuralPassPlan.map((item, index) => `${index + 1}. ${item.title} - ${item.detail}`).join(" ")}`,
      ...(shellGuardrails.length ? [`Guardrails: ${shellGuardrails.join(" ")}`] : []),
      historySummary,
      `Return a stronger shell that is intentionally more precise than the previous pass, while preserving any working structure.`
    ].join("\n");
  };

  const qualityToneClassNames = {
    good: "border-emerald-200 bg-emerald-50 text-emerald-950",
    warn: "border-amber-200 bg-amber-50 text-amber-950",
    bad: "border-rose-200 bg-rose-50 text-rose-950",
  } as const;

  useEffect(() => {
    directionScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [routeLabel]);

  return (
    <div className="flex min-h-[50vh] flex-1 flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-[linear-gradient(180deg,#fbfcfe_0%,#f5f7fb_100%)]">
      <div className="border-b border-zinc-200/80 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 max-w-3xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Direction</div>
            <div className="mt-1 text-base font-semibold text-zinc-950">Running read for {routeLabel}</div>
            <div className="mt-1 text-sm leading-6 text-zinc-600">
              Direction reads the current draft, explains the main conversion problem, and lines up the next useful pass.
            </div>
            <div className="mt-2 text-xs leading-5 text-zinc-500">
              Grounded in the current draft, shell, CTA path, section plan, and recent history instead of a fixed pass/fail checklist.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={classNames("rounded-full border px-3 py-1 text-[11px] font-semibold", foundationStatusClassName)}>{foundationStatusLabel}</span>
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-700">Scope {scopeLabel}</span>
          </div>
        </div>
      </div>

      <div ref={directionScrollRef} className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        <div className="mx-auto w-full max-w-4xl space-y-4">
          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.04)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">What this page is trying to do</div>
            <div className="mt-2 text-lg font-semibold leading-7 text-zinc-950">{pageConversionFocus.headline}</div>
            <div className="mt-2 text-sm leading-6 text-zinc-600">{pageConversionFocus.summary}</div>
            <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-600">{pageIntentSummary}</div>
          </div>

          <div className={classNames("rounded-3xl border p-5 shadow-[0_14px_34px_rgba(15,23,42,0.04)]", qualityToneClassNames[readinessTone])}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 max-w-3xl">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-70">Current read</div>
                  <div className="mt-2 text-xl font-semibold leading-8">{readinessLabel}</div>
                  <div className="mt-2 text-sm leading-6 opacity-90">{readinessSummary}</div>
                </div>
                <span className="rounded-full border border-current/15 bg-white/55 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">
                  {readinessConfidenceLabel}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                <div className="rounded-2xl border border-current/15 bg-white/55 px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-70">Main thing holding it back</div>
                  <div className="mt-2 text-sm font-semibold">{dominantIssue.title}</div>
                  <div className="mt-2 text-sm leading-6 opacity-90">{dominantIssue.detail}</div>
                </div>
                <div className="rounded-2xl border border-current/15 bg-white/55 px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-70">Best next step</div>
                  <div className="mt-2 text-sm leading-6 opacity-90">{primaryStructuralMove}</div>
                </div>
                <div className="rounded-2xl border border-current/15 bg-white/55 px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-70">Skip for now</div>
                  <div className="mt-2 text-sm leading-6 opacity-90">{avoidThisPass}</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] opacity-70">
                <span className="rounded-full border border-current/15 bg-white/55 px-3 py-1">One main issue</span>
                <span className="rounded-full border border-current/15 bg-white/55 px-3 py-1">One best next step</span>
                <span className="rounded-full border border-current/15 bg-white/55 px-3 py-1">One thing to skip</span>
              </div>
            </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.04)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Recommended next step</div>
              <div className="mt-2 text-lg font-semibold leading-7 text-zinc-950">{primaryStructuralMove}</div>
              <div className="mt-2 text-sm leading-6 text-zinc-600">
                If this read feels right, make one focused pass now. If one missing answer would change the pass in a meaningful way, ask that one question first.
              </div>
              <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-600">
                Pass {iterationCount}: fix the highest-value page problem, save the result, then reopen Direction for the next read. This works best as a sequence of focused passes, not one giant rewrite.
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:max-w-xl">
                <button
                  type="button"
                  onClick={() => onPrepareDraft(buildDirectionPassPrompt("draft"))}
                  className="rounded-xl border border-zinc-200 bg-zinc-950 px-3 py-3 text-left text-white transition-colors hover:bg-zinc-800"
                >
                  <div className="text-sm font-semibold">{primaryActionLabel}</div>
                  <div className="mt-1 text-xs leading-5 text-white/75">{primaryActionDetail}</div>
                </button>
                <button
                  type="button"
                  onClick={() => onPrepareClarify(buildDirectionPassPrompt("clarify"))}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-left text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-white"
                >
                  <div className="text-sm font-semibold">{secondaryActionLabel}</div>
                  <div className="mt-1 text-xs leading-5 text-zinc-500">{secondaryActionDetail}</div>
                </button>
                <button
                  type="button"
                  onClick={onOpenBrief}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-left text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-white"
                >
                  <div className="text-sm font-semibold">{briefActionLabel}</div>
                  <div className="mt-1 text-xs leading-5 text-zinc-500">{briefActionDetail}</div>
                </button>
              </div>
            </div>

          <details className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.04)]">
            <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-900">Why these suggestions show up</summary>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">How to use Direction</div>
                <div className="mt-2 space-y-2 text-sm leading-6 text-zinc-600">
                  <div>Direction does not change the page by itself.</div>
                  <div>It reads the live draft, the shell, the CTA path, and the recent history to decide what the next useful pass should be.</div>
                  <div>Use it when you want a grounded recommendation instead of guessing what to ask AI next.</div>
                  <div>After you make that pass, reopen Direction to see the next read.</div>
                </div>
              </div>

              <div className={classNames("rounded-2xl border p-4", qualityToneClassNames[inferenceTone])}>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold">Read confidence</div>
                  <span className="rounded-full border border-current/15 bg-white/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">
                    {supportedSignalCount}/{totalSignalCount} signals in place
                  </span>
                </div>
                <div className="mt-2 text-sm leading-6 opacity-90">{inferenceSummary}</div>
                <div className="mt-4 space-y-2">
                  {observedSignals.map((item) => (
                    <div key={item} className="rounded-2xl border border-current/15 bg-white/55 px-3 py-2.5 text-sm leading-6 opacity-90">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </details>

          <details className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.04)]">
            <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-900">Open structural audit</summary>
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Current design read</div>
                <div className="mt-2 text-base font-semibold text-zinc-950">{foundationSummary}</div>
                <div className="mt-2 text-sm leading-6 text-zinc-700">{foundationNarrative}</div>
                {assumption ? (
                  <div className="mt-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-xs leading-6 text-zinc-600">
                    Working assumption: {assumption}
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Ideal {pageTypeLabel.toLowerCase()} skeleton</div>
                  <div className="mt-4 space-y-2.5">
                    {(idealSkeletonBeats.length ? idealSkeletonBeats : goodPageEssentials.map((item) => item.title)).slice(0, 6).map((item, index) => {
                      const status = skeletonStatusForBeat(item);
                      return (
                        <div key={`${item}-${index}`} className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-[10px] font-semibold text-zinc-700">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="text-sm font-semibold text-zinc-900">{item}</div>
                              <span className={classNames("rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]", qualityToneClassNames[status.tone])}>
                                {status.label}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">This pass plan</div>
                  <div className="mt-4 space-y-3">
                    {structuralPassPlan.map((item, index) => (
                      <div key={item.title} className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-[10px] font-semibold text-zinc-700">
                            {index + 1}
                          </span>
                          <div>
                            <div className="text-sm font-semibold text-zinc-900">{item.title}</div>
                            <div className="mt-1 text-sm leading-6 text-zinc-600">{item.detail}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {shellGuardrails.length ? (
                    <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Guardrails</div>
                      <div className="mt-2 space-y-1.5 text-sm leading-6 text-zinc-600">
                        {shellGuardrails.map((item) => (
                          <div key={item}>{item}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Structural checks</div>
                <div className="mt-3 space-y-2.5">
                  {pageQualityChecks.map((item) => (
                    <div key={item.title} className={classNames("rounded-2xl border px-4 py-3", qualityToneClassNames[item.tone])}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="text-sm font-semibold">{item.title}</div>
                        <div className="rounded-full border border-current/15 bg-white/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">
                          {item.state}
                        </div>
                      </div>
                      <div className="mt-2 text-sm leading-6 opacity-90">{item.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </details>

          <PageContinuityPanel
            heading="Direction thread"
            description="Keep the latest page reads, clarifications, and applied moves attached to this draft."
            emptyState="Direction notes and applied page moves will appear here."
            thread={thread}
            latestCheckpoint={latestCheckpoint}
            onRestoreLatest={onRestoreLatest}
            restoreDisabled={restoreDisabled}
          />
        </div>
      </div>
    </div>
  );
}

function CodeSurface({
  value,
  onChange,
  placeholder,
  readOnly = false,
  lineHighlightRange,
  seamless = false,
  tone = "dark",
}: {
  value: string;
  onChange?: (next: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  lineHighlightRange?: { startLine: number; endLine: number } | null;
  seamless?: boolean;
  tone?: "dark" | "light";
}) {
  const code = String(value || "");
  const lines = splitCodeLines(code || placeholder || "");
  const renderedLines = splitCodeLines(readOnly ? code || placeholder || "" : code);
  const contentHeightPx = Math.max(lines.length + 2, 30) * 24;
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!lineHighlightRange?.startLine || !scrollRef.current) return;
    const targetTop = Math.max((lineHighlightRange.startLine - 4) * 24, 0);
    scrollRef.current.scrollTo({ top: targetTop, behavior: "smooth" });
  }, [lineHighlightRange?.endLine, lineHighlightRange?.startLine]);

  const isLight = tone === "light";

  return (
    <div className={classNames(
      "flex h-full min-h-0 flex-col overflow-hidden",
      isLight ? "text-[#1e1e1e]" : "text-zinc-100",
      seamless ? "bg-transparent" : isLight ? "rounded-[20px] bg-white" : "rounded-[20px] bg-zinc-950",
    )}>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto">
        <div className="grid min-w-full grid-cols-[auto_minmax(0,1fr)] font-mono text-[12px] leading-6" style={{ minHeight: contentHeightPx }}>
          <div className={classNames(
            "select-none px-3 py-3 text-right",
            isLight
              ? "border-r border-zinc-200 bg-[#f3f3f3] text-zinc-400"
              : "border-r border-zinc-900 bg-zinc-950 text-zinc-500",
            seamless ? "bg-transparent" : "",
          )}>
            {lines.map((_, index) => (
              <div
                key={index}
                className={classNames(
                  "rounded-md px-2 transition-colors",
                  lineHighlightRange && index + 1 >= lineHighlightRange.startLine && index + 1 <= lineHighlightRange.endLine
                    ? isLight ? "bg-sky-100 text-sky-700" : "bg-cyan-400/18 text-cyan-200"
                    : "",
                )}
              >
                {index + 1}
              </div>
            ))}
          </div>

          {readOnly ? (
            <div className="min-w-0 overflow-x-auto">
              <CodeSurfaceRenderedLines lines={renderedLines} lineHighlightRange={lineHighlightRange} tone={tone} />
            </div>
          ) : (
            <div className="relative min-w-0 overflow-x-auto">
              <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                <CodeSurfaceRenderedLines lines={renderedLines} lineHighlightRange={lineHighlightRange} tone={tone} />
              </div>
              <textarea
                value={code}
                onChange={(e) => onChange?.(e.target.value)}
                wrap="off"
                spellCheck={false}
                style={{ height: contentHeightPx }}
                className={classNames(
                  "relative z-10 w-max min-w-full resize-none overflow-hidden bg-transparent px-4 py-3 text-transparent outline-none",
                  isLight ? "caret-sky-600 placeholder:text-zinc-400 selection:bg-sky-200/60" : "caret-cyan-300 placeholder:text-zinc-500 selection:bg-white/15",
                )}
                placeholder={placeholder}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CustomHtmlPreviewFrame({
  html,
  title,
  previewDevice,
  heightClassName,
  selectedRegionKey,
  selectionState,
}: {
  html: string;
  title: string;
  previewDevice: "desktop" | "mobile";
  heightClassName: string;
  selectedRegionKey?: string | null;
  selectionState?: "idle" | "pending" | "settled";
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const applyRegionSelection = useCallback(
    (scrollBehavior: ScrollBehavior) => {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      applyHtmlPreviewRegionSelection(doc, selectedRegionKey || null, scrollBehavior, selectionState || "idle");
    },
    [selectedRegionKey, selectionState],
  );

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const handleLoad = () => {
      applyRegionSelection("auto");
    };

    iframe.addEventListener("load", handleLoad);
    if (iframe.contentDocument?.readyState === "complete") handleLoad();

    return () => {
      iframe.removeEventListener("load", handleLoad);
    };
  }, [applyRegionSelection]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument || iframe.contentDocument.readyState !== "complete") return;
    applyRegionSelection("smooth");
  }, [applyRegionSelection]);

  return (
    <div className={classNames("mx-auto w-full", previewDevice === "mobile" ? "h-full max-w-98" : "max-w-5xl")}>
      <div className={classNames(previewDevice === "mobile" ? "h-full overflow-hidden rounded-[28px] bg-white" : "h-[82vh] overflow-hidden bg-white")}>
          <iframe
            ref={iframeRef}
            title={title}
            sandbox="allow-forms allow-popups allow-scripts allow-same-origin"
            allow="microphone"
            srcDoc={html}
            className={classNames("block w-full bg-white", previewDevice === "mobile" ? heightClassName : "h-full")}
          />
      </div>
    </div>
  );
}

function AiPromptComposer({
  value,
  onChange,
  onSubmit,
  onAttach,
  placeholder,
  busy,
  busyLabel,
  attachCount,
  className,
  tone = "light",
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  onAttach: () => void;
  placeholder: string;
  busy: boolean;
  busyLabel: string;
  attachCount: number;
  className?: string;
  tone?: "light" | "dark";
}) {
  const canSubmit = !busy && value.trim().length > 0;
  const darkTone = tone === "dark";
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, 220)}px`;
  }, [value]);

  return (
    <div
      className={classNames(
        "flex items-end gap-2 border-b px-1 py-1 transition-colors",
        darkTone ? "border-zinc-700 text-zinc-100 focus-within:border-zinc-500" : "border-zinc-300/75 text-zinc-900 focus-within:border-zinc-500",
        className,
      )}
    >
      <AiSparkIcon className={classNames("mb-2 h-3.5 w-3.5 shrink-0", darkTone ? "text-zinc-500" : "text-zinc-400")} />
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && canSubmit) {
            e.preventDefault();
            onSubmit();
          }
        }}
        className={classNames(
          "min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-1 py-2 text-[14px] leading-5 tracking-[-0.01em] outline-none",
          darkTone ? "text-zinc-50 placeholder:text-zinc-500" : "text-zinc-900 placeholder:text-zinc-400",
        )}
        style={{ minHeight: 40, maxHeight: 220 }}
        rows={1}
        placeholder={placeholder}
      />

      {busy ? <span className={classNames("mb-2 hidden shrink-0 text-[11px] font-medium tracking-[0.01em] sm:inline", darkTone ? "text-zinc-500" : "text-zinc-500")}>{busyLabel}</span> : null}

      <button
        type="button"
        disabled={busy}
        onClick={onAttach}
        className={classNames(
          "relative mb-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-60",
          darkTone ? "text-zinc-500 hover:text-zinc-100" : "text-zinc-400 hover:text-zinc-700",
          attachCount ? "text-brand-blue" : "",
        )}
        title={attachCount ? `${attachCount} image${attachCount === 1 ? "" : "s"} attached` : "Attach images to AI"}
        aria-label={attachCount ? `${attachCount} image${attachCount === 1 ? "" : "s"} attached` : "Attach images to AI"}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
        {attachCount ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-brand-blue px-1 text-[10px] font-semibold leading-4 text-white">
            {attachCount > 9 ? "9+" : attachCount}
          </span>
        ) : null}
      </button>

      <button
        type="button"
        disabled={!canSubmit}
        onClick={onSubmit}
        className={classNames(
          "group mb-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-100 hover:scale-105 disabled:opacity-50",
          darkTone ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-500 hover:text-zinc-900",
          canSubmit ? "" : darkTone ? "pointer-events-none text-zinc-700" : "pointer-events-none text-zinc-300",
        )}
        title={busy ? busyLabel : "Send prompt to AI"}
        aria-label={busy ? busyLabel : "Send prompt to AI"}
      >
        {busy ? (
          <SpinnerIcon className="h-4 w-4" />
        ) : (
          <>
            <span className="group-hover:hidden">
              <IconSend size={16} />
            </span>
            <span className="hidden group-hover:inline">
              <IconSendHover size={16} />
            </span>
          </>
        )}
      </button>
    </div>
  );
}

function escapeEditorPreviewText(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function readEditorPreviewAttr(attrs: string, name: string) {
  const match = attrs.match(new RegExp(`\\b${name}=(['\"])([\\s\\S]*?)\\1`, "i"));
  return match ? String(match[2] || "") : "";
}

function getEditorPreviewEmbedHeight(attrs: string) {
  const style = readEditorPreviewAttr(attrs, "style");
  const styleHeight = style.match(/(?:^|;)\s*height\s*:\s*(\d+)px/i);
  if (styleHeight) return Math.max(120, Math.min(2000, Number(styleHeight[1] || 0)));

  const rawHeight = readEditorPreviewAttr(attrs, "height");
  const parsedHeight = Number(rawHeight || 0);
  if (Number.isFinite(parsedHeight) && parsedHeight > 0) {
    return Math.max(120, Math.min(2000, parsedHeight));
  }

  return 420;
}

function buildEditorEmbedPlaceholder(title: string, src: string, heightPx: number) {
  const safeTitle = escapeEditorPreviewText(title || "Embedded content");
  const safeSrc = escapeEditorPreviewText(src || "");
  return `<div data-editor-embed-placeholder="1" style="width:100%;min-height:${heightPx}px;border:1px solid #e4e4e7;border-radius:18px;background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);display:flex;align-items:center;justify-content:center;padding:24px;"><div style="width:min(100%,420px);text-align:center;color:#334155;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"><div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;">Editor preview</div><div style="margin-top:10px;font-size:18px;font-weight:700;color:#0f172a;">${safeTitle}</div><div style="margin-top:8px;font-size:13px;line-height:1.5;color:#475569;">Live embeds are paused in the editor preview so blocks and whole-page stay on the same page surface.</div><div style="margin-top:14px;display:inline-flex;max-width:100%;align-items:center;gap:8px;border:1px solid #e2e8f0;border-radius:999px;background:#ffffff;padding:8px 12px;font-size:12px;color:#64748b;">${safeSrc}</div></div></div>`;
}

function buildEditorPreviewHtml(html: string) {
  if (!html.trim()) return "";

  return html.replace(/<iframe\b([\s\S]*?)\bsrc=(['\"])(.*?)\2([\s\S]*?)><\/iframe>/gi, (match, beforeSrc, _quote, rawSrc, afterSrc) => {
    const src = String(rawSrc || "").trim();
    if (!src) return match;

    const normalized = src.toLowerCase();
    const isEditorSensitiveEmbed =
      normalized.includes("/forms/") ||
      normalized.includes("/book/u/") ||
      normalized.includes("/embed/chatbot") ||
      normalized.includes("embed=1");

    if (!isEditorSensitiveEmbed) return match;

    const attrs = `${beforeSrc || ""} ${afterSrc || ""}`;
    const title = readEditorPreviewAttr(attrs, "title") || "Embedded content";
    const heightPx = getEditorPreviewEmbedHeight(attrs);
    return buildEditorEmbedPlaceholder(title, src, heightPx);
  });
}

async function convertPreviewImageDataUrlToPngDataUrl(
  dataUrl: string,
  options?: { maxWidth?: number; maxHeight?: number },
): Promise<string> {
  const maxWidth = Math.max(120, Math.min(2400, Number(options?.maxWidth || 1600) || 1600));
  const maxHeight = Math.max(120, Math.min(3200, Number(options?.maxHeight || 1800) || 1800));

  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Invalid preview image"));
  });

  const srcW = Math.max(1, img.naturalWidth || img.width || 1);
  const srcH = Math.max(1, img.naturalHeight || img.height || 1);
  const ratio = Math.min(1, maxWidth / srcW, maxHeight / srcH);
  const dstW = Math.max(1, Math.floor(srcW * ratio));
  const dstH = Math.max(1, Math.floor(srcH * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.clearRect(0, 0, dstW, dstH);
  ctx.drawImage(img, 0, 0, dstW, dstH);
  return canvas.toDataURL("image/png");
}

function waitForFrameLoad(frame: HTMLIFrameElement) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Preview frame timed out"));
    }, 8000);

    const cleanup = () => {
      window.clearTimeout(timeout);
      frame.removeEventListener("load", onLoad);
      frame.removeEventListener("error", onError);
    };

    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Preview frame failed to load"));
    };

    frame.addEventListener("load", onLoad);
    frame.addEventListener("error", onError);
  });
}

function waitForAnimationFrames(count: number) {
  return new Promise<void>((resolve) => {
    const step = (remaining: number) => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(() => step(remaining - 1));
    };
    step(Math.max(1, count));
  });
}

async function captureRenderedPreviewDataUrl(input: {
  html: string;
  previewDevice: "desktop" | "mobile";
}) {
  if (typeof document === "undefined") return "";
  const html = String(input.html || "").trim();
  if (!html) return "";

  const host = document.createElement("div");
  const frame = document.createElement("iframe");
  const width = input.previewDevice === "mobile" ? 430 : 1280;
  const height = input.previewDevice === "mobile" ? 1200 : 1500;

  host.style.position = "fixed";
  host.style.left = "-20000px";
  host.style.top = "0";
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  host.style.opacity = "0";
  host.style.pointerEvents = "none";
  host.style.overflow = "hidden";

  frame.setAttribute("sandbox", "allow-forms allow-popups allow-scripts allow-same-origin");
  frame.setAttribute("aria-hidden", "true");
  frame.style.width = `${width}px`;
  frame.style.height = `${height}px`;
  frame.style.border = "0";
  frame.srcdoc = html;
  host.appendChild(frame);
  document.body.appendChild(host);

  try {
    await waitForFrameLoad(frame);
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) return "";
    if (doc.fonts?.ready) {
      await Promise.race([
        doc.fonts.ready,
        new Promise<void>((resolve) => window.setTimeout(resolve, 1200)),
      ]).catch(() => null);
    }
    await waitForAnimationFrames(2);
    const root = (doc.documentElement || doc.body) as HTMLElement | null;
    if (!root) return "";
    const rawDataUrl = await toPng(root, {
      cacheBust: true,
      pixelRatio: 1,
      backgroundColor: "#ffffff",
      canvasWidth: width,
      canvasHeight: Math.max(height, root.scrollHeight || height),
      skipAutoScale: true,
    });
    return await convertPreviewImageDataUrlToPngDataUrl(rawDataUrl, {
      maxWidth: input.previewDevice === "mobile" ? 900 : 1600,
      maxHeight: input.previewDevice === "mobile" ? 1600 : 1800,
    });
  } finally {
    host.remove();
  }
}

function buildStandaloneCustomCodePreviewHtml(html: string, css: string) {
  const bodyHtml = String(html || "").trim();
  const styleCss = String(css || "").trim();
  if (!bodyHtml && !styleCss) return "";

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '  <title>Custom code preview</title>',
    "  <style>",
    "    html, body { margin: 0; padding: 0; background: #ffffff; color: #0f172a; }",
    "    body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }",
    "    .editor-preview-shell { min-height: 100vh; padding: 0; }",
    styleCss,
    "  </style>",
    "</head>",
    '<body><div class="editor-preview-shell">',
    bodyHtml,
    "</div></body>",
    "</html>",
  ].join("\n");
}

type HtmlRegionScope = {
  key: string;
  label: string;
  summary: string;
  html: string;
  sourceIndex: number;
};

function normalizeInlineText(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getHtmlRegionElements(doc: Document): Element[] {
  const isIgnoredTag = (tagName: string) => ["script", "style", "meta", "link", "noscript"].includes(tagName.toLowerCase());

  let container: Element = doc.body;
  const bodyChildren = Array.from(doc.body.children).filter((el) => !isIgnoredTag(el.tagName));
  if (bodyChildren.length === 1) {
    const only = bodyChildren[0];
    const grandchildren = Array.from(only.children).filter((el) => !isIgnoredTag(el.tagName));
    if (grandchildren.length >= 2) container = only;
  }

  return Array.from(container.children)
    .filter((el) => !isIgnoredTag(el.tagName))
    .filter((el) => normalizeInlineText(el.textContent || "") || el.querySelector("img, form, iframe, video, section, article, footer, header, nav"));
}

function buildHtmlRegionScope(el: Element, sourceIndex: number): HtmlRegionScope {
  const meta = normalizeInlineText(
    [
      el.tagName,
      el.getAttribute("id") || "",
      el.getAttribute("class") || "",
      el.getAttribute("aria-label") || "",
      el.getAttribute("role") || "",
    ].join(" "),
  ).toLowerCase();
  const heading = normalizeInlineText(el.querySelector("h1, h2, h3")?.textContent || "");
  const text = normalizeInlineText(el.textContent || "").toLowerCase();

  let label = "";
  if (/^(header|nav)$/i.test(el.tagName) || /\b(nav|menu|header)\b/.test(meta)) {
    label = "Header";
  } else if (/^footer$/i.test(el.tagName) || /\bfooter\b/.test(meta)) {
    label = "Footer";
  } else if (sourceIndex === 0 && (el.querySelector("h1") || /\bhero\b/.test(meta))) {
    label = "Hero";
  } else if (el.querySelector("form") || /\b(form|apply|signup|sign up|contact)\b/.test(text)) {
    label = /\b(book|schedule|calendar)\b/.test(text) ? "Booking" : "Form";
  } else if (/\b(testimonial|testimonials|review|reviews|results|success stor)\b/.test(`${text} ${meta}`)) {
    label = "Testimonials";
  } else if (/\b(faq|question|questions|common questions)\b/.test(`${text} ${meta}`)) {
    label = "FAQ";
  } else if (/\b(pricing|plans|packages)\b/.test(`${text} ${meta}`)) {
    label = "Pricing";
  } else if (/\b(shop|product|products|checkout|cart|buy now|offer)\b/.test(`${text} ${meta}`)) {
    label = "Offer";
  } else if (/\b(cta|get started|start now|apply now|book now)\b/.test(`${text} ${meta}`)) {
    label = "CTA";
  } else if (heading) {
    label = heading.slice(0, 48);
  } else {
    label = `Section ${sourceIndex + 1}`;
  }

  const summary = heading || normalizeInlineText(el.textContent || "").slice(0, 180) || `${label} region`;
  return {
    key: `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "section"}-${sourceIndex}`,
    label,
    summary,
    html: el.outerHTML.slice(0, 24000),
    sourceIndex,
  };
}

const HTML_PREVIEW_REGION_STYLE_ID = "pa-html-preview-region-style";

function clearHtmlPreviewRegionSelection(doc: Document) {
  doc.querySelectorAll('[data-ai-region-selected="true"]').forEach((node) => {
    node.removeAttribute("data-ai-region-selected");
    node.removeAttribute("data-ai-region-state");
  });
  doc.querySelectorAll('[data-ai-region-frame="true"]').forEach((node) => {
    node.parentNode?.removeChild(node);
  });
}

function ensureHtmlPreviewRegionStyle(doc: Document) {
  if (doc.getElementById(HTML_PREVIEW_REGION_STYLE_ID)) return;

  const style = doc.createElement("style");
  style.id = HTML_PREVIEW_REGION_STYLE_ID;
  style.textContent = `
    @keyframes pa-ai-region-pulse {
      0%, 100% {
        transform: scale(1);
        opacity: 1;
      }
      50% {
        transform: scale(1.004);
        opacity: 1;
      }
    }
    @keyframes pa-ai-region-settle {
      0% {
        transform: scale(1.006);
      }
      100% {
        transform: scale(1);
      }
    }
    [data-ai-region-selected="true"] {
      isolation: isolate !important;
      position: relative !important;
      scroll-margin-top: 36px !important;
    }
    [data-ai-region-frame="true"] {
      position: absolute;
      inset: 12px;
      z-index: 2147483646;
      pointer-events: none;
      border-radius: 24px;
      border: 1.5px solid rgba(24, 24, 27, 0.34);
      background: linear-gradient(180deg, rgba(15, 23, 42, 0.028) 0%, rgba(15, 23, 42, 0.01) 100%);
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.55) inset,
        0 10px 24px rgba(15, 23, 42, 0.08),
        0 0 0 1px rgba(39, 44, 56, 0.06);
      transition:
        border-color 180ms ease,
        box-shadow 180ms ease,
        opacity 180ms ease,
        transform 180ms ease;
    }
    [data-ai-region-frame="true"][data-ai-region-state="pending"] {
      border-color: rgba(24, 24, 27, 0.5);
      background: linear-gradient(180deg, rgba(15, 23, 42, 0.05) 0%, rgba(15, 23, 42, 0.018) 100%);
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.62) inset,
        0 16px 30px rgba(15, 23, 42, 0.1),
        0 0 0 1px rgba(24, 24, 27, 0.08);
      animation: pa-ai-region-pulse 1.2s ease-in-out infinite;
    }
    [data-ai-region-frame="true"][data-ai-region-state="settled"] {
      border-color: rgba(24, 24, 27, 0.42);
      animation: pa-ai-region-settle 720ms cubic-bezier(0.22, 1, 0.36, 1) 1;
    }
    [data-ai-region-selected="true"]::after {
      content: "";
      position: absolute;
      inset: 14px;
      border-radius: 22px;
      pointer-events: none;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.3);
    }
  `;
  (doc.head || doc.documentElement).appendChild(style);
}

function applyHtmlPreviewRegionSelection(
  doc: Document,
  selectedRegionKey: string | null,
  scrollBehavior: ScrollBehavior,
  selectionState: "idle" | "pending" | "settled" = "idle",
) {
  if (!doc.body) return;

  ensureHtmlPreviewRegionStyle(doc);
  clearHtmlPreviewRegionSelection(doc);

  if (!selectedRegionKey) return;

  const regionElements = getHtmlRegionElements(doc).slice(0, 8);
  const regionScopes = regionElements.map((el, index) => buildHtmlRegionScope(el, index));
  const selectedRegion = regionScopes.find((region) => region.key === selectedRegionKey) || null;
  if (!selectedRegion) return;

  const target = regionElements[selectedRegion.sourceIndex];
  if (!target) return;

  target.setAttribute("data-ai-region-selected", "true");
  if (selectionState !== "idle") target.setAttribute("data-ai-region-state", selectionState);
  const frame = doc.createElement("div");
  frame.setAttribute("data-ai-region-frame", "true");
  frame.setAttribute("data-ai-region-state", selectionState);
  target.appendChild(frame);

  target.scrollIntoView({ behavior: scrollBehavior, block: "center", inline: "nearest" });
}

function detectHtmlRegionScopes(html: string): HtmlRegionScope[] {
  if (!html.trim() || typeof DOMParser === "undefined") return [];

  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return getHtmlRegionElements(doc)
      .slice(0, 8)
      .map((el, index) => buildHtmlRegionScope(el, index));
  } catch {
    return [];
  }
}

function formatMoney(cents: number | null | undefined, currency: string) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "";
  const curr = (currency || "usd").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: curr }).format(cents / 100);
  } catch {
    return `${curr} ${(cents / 100).toFixed(2)}`;
  }
}

function describeBuilderAiTarget(block: CreditFunnelBlock | null) {
  if (!block) return "the builder";

  switch (block.type) {
    case "customCode":
      return "the selected code block";
    case "section":
      return "the selected section";
    case "columns":
      return "the selected columns block";
    case "heading":
      return "the selected heading";
    case "paragraph":
      return "the selected text block";
    case "formEmbed":
    case "formLink":
      return "the selected form block";
    case "calendarEmbed":
      return "the selected booking block";
    case "image":
    case "video":
      return "the selected media block";
    default:
      return "the selected block";
  }
}

function describeBuilderBlockNoun(block: CreditFunnelBlock | null) {
  const described = describeBuilderAiTarget(block);
  if (described.startsWith("the selected ")) return described.slice("the selected ".length);
  if (described.startsWith("the ")) return described.slice("the ".length);
  return described;
}

type Funnel = {
  id: string;
  slug: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
  assignedDomain?: string | null;
  bookingCalendarId?: string | null;
  seo?: FunnelSeo | null;
  brief?: FunnelBriefProfile | null;
};

type FunnelSeo = {
  title?: string;
  description?: string;
  imageUrl?: string;
  noIndex?: boolean;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  at?: string;
};

type BlockChatMessage = ChatMessage;

type BusinessProfileSummary = FunnelFoundationBusinessContext & {
  businessName: string;
};

function normalizeBusinessProfileGoals(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const goals: string[] = [];
  for (const item of value) {
    const next = String(item || "").trim();
    if (!next || goals.includes(next)) continue;
    goals.push(next);
    if (goals.length >= 6) break;
  }
  return goals;
}

const PAGE_INTENT_TYPE_LABELS: Record<FunnelPageIntentType, string> = {
  landing: "Landing",
  "lead-capture": "Lead capture",
  booking: "Booking",
  sales: "Sales",
  checkout: "Checkout",
  "thank-you": "Thank you",
  application: "Application",
  webinar: "Webinar",
  home: "Home",
  custom: "Custom",
};

const PAGE_FORM_STRATEGY_LABELS: Record<FunnelPageFormStrategy, string> = {
  none: "No special integration",
  "embed-form": "Embed an existing form",
  "link-form": "Link to an existing form",
  "auto-create-form": "Auto-create or stage a form",
  booking: "Use booking/calendar",
  checkout: "Use checkout or payment",
  chatbot: "Use chatbot handoff",
  application: "Use application flow",
};

function parseSectionPlanItems(raw: string) {
  return String(raw || "")
    .split(/->|\n|•|\u2022/g)
    .map((item) => item.replace(/^[-\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 10);
}

function buildPrimaryCtaSuggestions(pageType: FunnelPageIntentType, current: string) {
  const presets: Record<FunnelPageIntentType, string[]> = {
    landing: ["Get started", "See how it works", "Talk to our team"],
    "lead-capture": ["Get the offer", "Get the guide", "Request a quote"],
    booking: ["Book a call", "Schedule a consultation", "Talk to our team"],
    sales: ["Buy now", "See pricing", "Get started"],
    checkout: ["Complete purchase", "Continue to payment", "Secure my order"],
    "thank-you": ["See next steps", "Keep going", "Back to dashboard"],
    application: ["Apply now", "Start application", "Check eligibility"],
    webinar: ["Reserve your seat", "Save my spot", "Register now"],
    home: ["Get started", "See how it works", "Talk to our team"],
    custom: ["Get started", "Talk to our team", "See next steps"],
  };

  const out = [...presets[pageType]];
  const nextCurrent = String(current || "").trim();
  if (nextCurrent && !out.includes(nextCurrent)) out.unshift(nextCurrent);
  return out;
}

function defaultPageGoalForIntentUi(pageType: FunnelPageIntentType) {
  if (pageType === "booking") return "Convert qualified visitors into booked consultations";
  if (pageType === "sales") return "Convert buying intent into a confident purchase";
  if (pageType === "checkout") return "Finish the purchase with minimal friction";
  if (pageType === "lead-capture") return "Convert interest into a captured lead with a clear value exchange";
  if (pageType === "application") return "Convert qualified interest into completed applications";
  if (pageType === "webinar") return "Convert interest into webinar registrations";
  if (pageType === "thank-you") return "Confirm success and route the visitor to the next step";
  if (pageType === "home") return "Route visitors into the highest-fit conversion path";
  return "Explain the offer clearly and convert the visitor into the primary CTA";
}

function normalizeIntentSentence(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isDefaultPageGoalForIntent(pageType: FunnelPageIntentType, pageGoal: string) {
  return normalizeIntentSentence(pageGoal) === normalizeIntentSentence(defaultPageGoalForIntentUi(pageType));
}

function buildPageConversionFocus(intent: FunnelPageIntentProfile) {
  const primaryCta = String(intent.primaryCta || "").trim() || "Get started";
  const defaultGoal = defaultPageGoalForIntentUi(intent.pageType);
  const pageGoal = String(intent.pageGoal || "").trim() || defaultGoal;

  if (intent.pageType === "booking") {
    return {
      headline: pageGoal,
      summary: "This page should build enough trust, relevance, and momentum that the consultation feels like the obvious next move.",
      metricLabel: "Primary metric",
      metricValue: "Booked consultations",
      mechanismLabel: "Conversion mechanism",
      mechanismValue: "Trust -> fit -> booking handoff",
      ctaLabel: "Main action",
      ctaValue: primaryCta,
    };
  }

  if (intent.pageType === "lead-capture") {
    return {
      headline: pageGoal,
      summary: "This page should make the value exchange feel specific and worth claiming right now.",
      metricLabel: "Primary metric",
      metricValue: "Captured leads",
      mechanismLabel: "Conversion mechanism",
      mechanismValue: "Value exchange -> low-friction capture",
      ctaLabel: "Main action",
      ctaValue: primaryCta,
    };
  }

  if (intent.pageType === "sales" || intent.pageType === "checkout") {
    return {
      headline: pageGoal,
      summary: "This page should resolve friction fast and make the purchase feel safe, clear, and immediate.",
      metricLabel: "Primary metric",
      metricValue: intent.pageType === "checkout" ? "Completed checkouts" : "Purchases",
      mechanismLabel: "Conversion mechanism",
      mechanismValue: "Offer clarity -> proof -> CTA commitment",
      ctaLabel: "Main action",
      ctaValue: primaryCta,
    };
  }

  if (intent.pageType === "application") {
    return {
      headline: pageGoal,
      summary: "This page should attract the right people, screen lightly, and make the application feel worth completing.",
      metricLabel: "Primary metric",
      metricValue: "Completed applications",
      mechanismLabel: "Conversion mechanism",
      mechanismValue: "Fit framing -> expectations -> application handoff",
      ctaLabel: "Main action",
      ctaValue: primaryCta,
    };
  }

  if (intent.pageType === "webinar") {
    return {
      headline: pageGoal,
      summary: "This page should make the event promise feel specific enough that registering feels irrational to delay.",
      metricLabel: "Primary metric",
      metricValue: "Registrations",
      mechanismLabel: "Conversion mechanism",
      mechanismValue: "Promise -> proof -> registration",
      ctaLabel: "Main action",
      ctaValue: primaryCta,
    };
  }

  return {
    headline: pageGoal,
    summary: "This page should move the visitor decisively toward the next conversion step instead of merely explaining the business.",
    metricLabel: "Primary metric",
    metricValue: "Primary CTA conversions",
    mechanismLabel: "Conversion mechanism",
    mechanismValue: "Clarity -> trust -> next-step momentum",
    ctaLabel: "Main action",
    ctaValue: primaryCta,
  };
}

function getLatestBlockChatMessage(messages: BlockChatMessage[], role: BlockChatMessage["role"]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === role) return message;
  }
  return null;
}

function ToggleSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
      <input
        type="checkbox"
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="h-6 w-11 rounded-full bg-zinc-200 transition peer-checked:bg-(--color-brand-blue) peer-focus-visible:ring-2 peer-focus-visible:ring-brand-ink/40 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white peer-disabled:opacity-60" />
      <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
    </span>
  );
}

function normalizeSlug(raw: string) {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-/, "")
    .replace(/-$/, "");
  return cleaned;
}

function formatSavedAtLabel(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;

  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 1) return "Saved just now";
  if (diffMinutes < 60) return `Saved ${diffMinutes}m ago`;

  return `Saved ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function createImportedLayoutBlockId(prefix = "blk") {
  const uuid =
    typeof globalThis !== "undefined" && globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uuid}`.replace(/[^a-zA-Z0-9-_]/g, "");
}

function splitCustomHtmlForLayoutImport(rawHtml: string) {
  const source = String(rawHtml || "").trim();
  if (!source) return { html: "", css: "" };

  if (typeof DOMParser === "undefined") {
    return { html: source, css: "" };
  }

  try {
    const doc = new DOMParser().parseFromString(source, "text/html");
    const styleNodes = Array.from(doc.querySelectorAll("style"));
    const css = styleNodes
      .map((node) => String(node.textContent || "").trim())
      .filter(Boolean)
      .join("\n\n");

    styleNodes.forEach((node) => node.remove());

    const bodyHtml = String(doc.body?.innerHTML || "").trim();
    return {
      html: bodyHtml || source,
      css,
    };
  } catch {
    return { html: source, css: "" };
  }
}

function estimateImportedLayoutHeightPx(html: string) {
  const trimmed = String(html || "").trim();
  if (!trimmed) return 480;

  const lines = trimmed.split(/\n+/).length;
  const tags = (trimmed.match(/<[^>]+>/g) || []).length;
  const estimate = 320 + lines * 12 + tags * 10;
  return Math.max(420, Math.min(1600, estimate));
}

function coerceImportedLayoutChatJson(raw: unknown): BlockChatMessage[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  const chat = raw
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const role = (entry as { role?: unknown }).role;
      const content = (entry as { content?: unknown }).content;
      const at = (entry as { at?: unknown }).at;
      if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
      return {
        role,
        content,
        ...(typeof at === "string" && at.trim() ? { at } : {}),
      } satisfies BlockChatMessage;
    })
    .filter((entry): entry is BlockChatMessage => Boolean(entry))
    .slice(-40);

  return chat.length ? chat : undefined;
}

function buildLayoutBlocksFromCustomHtml(rawHtml: string, chatJsonRaw?: unknown) {
  const { html, css } = splitCustomHtmlForLayoutImport(rawHtml);
  const importedBlockId = createImportedLayoutBlockId("imported-html");
  const importedChatJson = coerceImportedLayoutChatJson(chatJsonRaw);

  const blocks: CreditFunnelBlock[] = [
    {
      id: importedBlockId,
      type: "customCode",
      props: {
        html,
        ...(css ? { css } : {}),
        heightPx: estimateImportedLayoutHeightPx(html),
        ...(importedChatJson ? { chatJson: importedChatJson } : {}),
      },
    },
  ];

  return { blocks, importedBlockId };
}

function isHexColor(value: string) {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

function coerceBlockStyle(raw: unknown): BlockStyle | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o: any = raw;

  const s = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const n = (v: unknown, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : undefined;

  const align = o.align === "left" || o.align === "center" || o.align === "right" ? (o.align as any) : undefined;

  const next: BlockStyle = {
    textColor: s(o.textColor, 40) || undefined,
    backgroundColor: s(o.backgroundColor, 40) || undefined,
    backgroundImageUrl: s(o.backgroundImageUrl, 800) || undefined,
    backgroundVideoUrl: s(o.backgroundVideoUrl, 800) || undefined,
    backgroundVideoPosterUrl: s(o.backgroundVideoPosterUrl, 800) || undefined,
    fontSizePx: n(o.fontSizePx, 8, 96),
    fontFamily: s(o.fontFamily, 120) || undefined,
    fontGoogleFamily: s(o.fontGoogleFamily, 120) || undefined,
    align,
    marginTopPx: n(o.marginTopPx, 0, 240),
    marginBottomPx: n(o.marginBottomPx, 0, 240),
    paddingPx: n(o.paddingPx, 0, 240),
    borderRadiusPx: n(o.borderRadiusPx, 0, 160),
    borderColor: s(o.borderColor, 40) || undefined,
    borderWidthPx: n(o.borderWidthPx, 0, 24),
    maxWidthPx: n(o.maxWidthPx, 120, 1400),
  };

  const hasAny = Object.values(next).some((v) => v !== undefined && v !== "");
  return hasAny ? next : undefined;
}

function migrateLegacyAnchorBlocksIntoSections(blocks: CreditFunnelBlock[]): CreditFunnelBlock[] {
  let changed = false;

  const walkArray = (arr: CreditFunnelBlock[]): CreditFunnelBlock[] => {
    let pending: { anchorId: string; label?: string } | null = null;
    const out: CreditFunnelBlock[] = [];

    for (const b of arr) {
      if (!b) continue;
      if (b.type === "anchor") {
        const anchorId = String((b.props as any)?.anchorId || "").trim();
        const label = String((b.props as any)?.label || "").trim();
        changed = true;
        pending = anchorId ? { anchorId, ...(label ? { label } : null) } : null;
        continue;
      }

      if (b.type === "section") {
        const prevProps: any = b.props || {};
        let nextProps: any = prevProps;
        let propsChanged = false;

        if (pending?.anchorId) {
          const existingAnchorId = String(prevProps.anchorId || "").trim();
          const existingLabel = String(prevProps.anchorLabel || "").trim();
          if (!existingAnchorId) {
            nextProps = nextProps === prevProps ? { ...prevProps } : nextProps;
            nextProps.anchorId = pending.anchorId;
            propsChanged = true;
          }
          if (!existingLabel && pending.label) {
            nextProps = nextProps === prevProps ? { ...prevProps } : nextProps;
            nextProps.anchorLabel = pending.label;
            propsChanged = true;
          }
          pending = null;
        }

        ("children,leftChildren,rightChildren".split(",") as Array<"children" | "leftChildren" | "rightChildren">).forEach((k) => {
          const rawNested = Array.isArray(prevProps[k]) ? (prevProps[k] as CreditFunnelBlock[]) : null;
          if (!rawNested) return;
          const nextNested = walkArray(rawNested);
          if (nextNested !== rawNested) {
            nextProps = nextProps === prevProps ? { ...prevProps } : nextProps;
            nextProps[k] = nextNested;
            propsChanged = true;
          }
        });

        if (propsChanged) {
          changed = true;
          out.push({ ...b, props: nextProps } as CreditFunnelBlock);
        } else {
          out.push(b);
        }
        continue;
      }

      if (b.type === "columns") {
        const prevProps: any = b.props || {};
        const cols = Array.isArray(prevProps.columns) ? (prevProps.columns as any[]) : null;
        if (!cols) {
          out.push(b);
          continue;
        }

        let colsChanged = false;
        const nextCols = cols.map((c) => {
          if (!c || typeof c !== "object") return c;
          const rawChildren = Array.isArray((c as any).children) ? ((c as any).children as CreditFunnelBlock[]) : null;
          if (!rawChildren) return c;
          const nextChildren = walkArray(rawChildren);
          if (nextChildren === rawChildren) return c;
          colsChanged = true;
          return { ...c, children: nextChildren };
        });

        if (colsChanged) {
          changed = true;
          out.push({ ...b, props: { ...prevProps, columns: nextCols } } as CreditFunnelBlock);
        } else {
          out.push(b);
        }
        continue;
      }

      out.push(b);
    }

    // If a legacy anchor wasn't attached to a following section, we drop it.
    // This is intentional: anchors are now section-based.
    if (pending) changed = true;

    return out;
  };

  const next = walkArray(blocks);
  return changed ? next : blocks;
}

function normalizeHexInput(value: string) {
  const v = value.trim();
  if (!v) return "";
  if (v.startsWith("#")) return v;
  return "#" + v;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.trim();
  if (!isHexColor(h)) return null;
  const raw = h.slice(1);
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const num = Number.parseInt(full, 16);
  if (!Number.isFinite(num)) return null;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex(r: number, g: number, b: number) {
  const to = (x: number) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function parseCssColor(value: string | undefined | null): { hex: string; alpha: number } {
  const v = String(value || "").trim();
  if (!v) return { hex: "#000000", alpha: 1 };

  if (v.toLowerCase() === "transparent") return { hex: "#ffffff", alpha: 0 };
  if (isHexColor(v)) return { hex: v, alpha: 1 };

  const rgba = v.match(/^rgba\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0|0?\.\d+|1|1\.0)\)\s*$/i);
  if (rgba) {
    const r = clamp(Number(rgba[1]), 0, 255);
    const g = clamp(Number(rgba[2]), 0, 255);
    const b = clamp(Number(rgba[3]), 0, 255);
    const a = clamp(Number(rgba[4]), 0, 1);
    return { hex: rgbToHex(r, g, b), alpha: a };
  }

  const rgb = v.match(/^rgb\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\)\s*$/i);
  if (rgb) {
    const r = clamp(Number(rgb[1]), 0, 255);
    const g = clamp(Number(rgb[2]), 0, 255);
    const b = clamp(Number(rgb[3]), 0, 255);
    return { hex: rgbToHex(r, g, b), alpha: 1 };
  }

  return { hex: "#000000", alpha: 1 };
}

function formatColorWithAlpha(hex: string, alpha: number): string {
  const a = clamp(alpha, 0, 1);
  if (a >= 0.999) return hex;
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const rounded = Math.round(a * 1000) / 1000;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${rounded})`;
}

function maybeHexFromCssColor(raw: string | undefined | null): string | null {
  const v = String(raw || "").trim();
  if (!v) return null;

  const lower = v.toLowerCase();
  if (
    lower === "transparent" ||
    lower === "inherit" ||
    lower === "initial" ||
    lower === "unset" ||
    lower === "currentcolor"
  ) {
    return null;
  }

  if (v.startsWith("#")) {
    const normalized = normalizeHexInput(v);
    return isHexColor(normalized) ? normalized : null;
  }

  if (lower.startsWith("rgb(")) {
    const rgb = v.match(/^rgb\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\)\s*$/i);
    if (!rgb) return null;
    const parsed = parseCssColor(v);
    return isHexColor(parsed.hex) ? parsed.hex : null;
  }

  if (lower.startsWith("rgba(")) {
    const rgba = v.match(
      /^rgba\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0|0?\.\d+|1|1\.0)\)\s*$/i,
    );
    if (!rgba) return null;
    const parsed = parseCssColor(v);
    return isHexColor(parsed.hex) ? parsed.hex : null;
  }

  return null;
}

function collectHexSwatchesFromUnknown(value: unknown, out: string[], depth = 0) {
  if (depth > 10) return;
  if (value == null) return;

  if (typeof value === "string") {
    const hex = maybeHexFromCssColor(value);
    if (hex) out.push(hex);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectHexSwatchesFromUnknown(item, out, depth + 1);
    return;
  }

  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "string") {
        const looksLikeColor =
          k.toLowerCase().includes("color") || v.trim().startsWith("#") || v.trim().toLowerCase().startsWith("rgb");
        if (looksLikeColor) {
          const hex = maybeHexFromCssColor(v);
          if (hex) out.push(hex);
          continue;
        }
      }
      collectHexSwatchesFromUnknown(v, out, depth + 1);
    }
  }
}

function ColorPickerField({
  label,
  value,
  onChange,
  swatches,
  allowAlpha,
}: {
  label: string;
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  swatches: string[];
  allowAlpha?: boolean;
}) {
  const parsed = parseCssColor(value);
  const currentHex = parsed.hex;
  const currentAlpha = parsed.alpha;

  return (
    <div className="block">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          value={currentHex}
          onChange={(e) => {
            const hex = e.target.value;
            const next = allowAlpha ? formatColorWithAlpha(hex, currentAlpha) : hex;
            onChange(next);
          }}
          className="h-9 w-12 shrink-0 rounded-lg border border-zinc-200 bg-white"
        />
        <input
          value={String(value || "")}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (!raw) {
              onChange(undefined);
              return;
            }
            const normalized = isHexColor(normalizeHexInput(raw)) ? normalizeHexInput(raw) : raw;
            if (allowAlpha) {
              const p = parseCssColor(normalized);
              onChange(formatColorWithAlpha(p.hex, p.alpha));
              return;
            }
            onChange(normalized);
          }}
          className="min-w-45 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
          placeholder="#0f172a or rgba(0,0,0,0.6)"
        />
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
        >
          Clear
        </button>
      </div>

      {allowAlpha ? (
        <div className="mt-2 flex items-center gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Opacity</div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(currentAlpha * 100)}
            onChange={(e) => {
              const pct = clamp(Number(e.target.value) || 0, 0, 100);
              const next = formatColorWithAlpha(currentHex, pct / 100);
              onChange(next);
            }}
            className="flex-1"
          />
          <div className="w-12 text-right text-xs font-semibold text-zinc-700">{Math.round(currentAlpha * 100)}%</div>
        </div>
      ) : null}

      {swatches.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {swatches.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                const next = allowAlpha ? formatColorWithAlpha(c, currentAlpha) : c;
                onChange(next);
              }}
              className="h-8 w-8 rounded-full border border-zinc-200"
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CollapsibleGroup({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen ?? true} className="rounded-2xl border border-zinc-200 bg-white">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-zinc-900">
        {title}
      </summary>
      <div className="border-t border-zinc-200 p-4">{children}</div>
    </details>
  );
}

function PaddingPicker({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  max?: number;
}) {
  const v = typeof value === "number" ? value : 0;
  const maxV = max ?? 120;
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative h-10 w-10 rounded-xl border border-zinc-200 bg-white">
          <div
            className="absolute rounded-lg bg-zinc-100"
            style={{
              inset: `${Math.min(14, Math.round((v / Math.max(1, maxV)) * 14))}px`,
            }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={maxV}
          value={Math.round(v)}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="min-w-40 flex-1"
        />
        <input
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value) || 0)}
          className="w-24 shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
          placeholder="Auto"
        />
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function RichTextField({
  valueHtml,
  placeholder,
  onCommit,
  singleLine,
}: {
  valueHtml: string | undefined;
  placeholder: string;
  onCommit: (nextHtml: string | undefined, nextText: string) => void;
  singleLine?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [localHtml, setLocalHtml] = useState<string>(valueHtml || "");
  const editorRef = useRef<HTMLDivElement | null>(null);
  const linkRangeRef = useRef<Range | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);

  useEffect(() => {
    if (focused) return;
    setLocalHtml(valueHtml || "");
  }, [valueHtml, focused]);

  const exec = (cmd: "bold" | "italic" | "underline" | "createLink" | "unlink") => {
    try {
      if (cmd === "createLink") {
        const selection = document.getSelection();
        const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
        linkRangeRef.current = range;
        setShowLinkModal(true);
        return;
      }
      document.execCommand(cmd);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {(
          [
            { cmd: "bold" as const, label: "B" },
            { cmd: "italic" as const, label: "I" },
            { cmd: "underline" as const, label: "U" },
            { cmd: "createLink" as const, label: "Link" },
            { cmd: "unlink" as const, label: "Unlink" },
          ] as const
        ).map((b) => (
          <button
            key={b.cmd}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec(b.cmd)}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
          >
            {b.label}
          </button>
        ))}
      </div>

      <div
        className={classNames(
          "min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm",
          "focus-within:border-(--color-brand-blue)",
        )}
      >
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          className={classNames(
            "outline-none",
            singleLine ? "whitespace-nowrap" : "whitespace-pre-wrap",
          )}
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            setFocused(false);
            const rawHtml = (e.currentTarget as any)?.innerHTML ?? "";
            const rawText = (e.currentTarget as any)?.textContent ?? "";
            const cleanedHtml = sanitizeRichTextHtml(rawHtml);
            const cleanedText = singleLine ? String(rawText).replace(/\s+/g, " ").trim() : String(rawText);
            setLocalHtml(cleanedHtml || "");
            onCommit(cleanedHtml, cleanedText);
          }}
          onKeyDown={(e) => {
            if (singleLine && e.key === "Enter") {
              e.preventDefault();
              (e.currentTarget as any)?.blur?.();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              (e.currentTarget as any)?.blur?.();
            }
          }}
          dangerouslySetInnerHTML={{ __html: localHtml || "" }}
        />
        {!localHtml ? <div className="pointer-events-none -mt-6 text-sm text-zinc-400">{placeholder}</div> : null}
      </div>

      <LinkUrlModal
        open={showLinkModal}
        onClose={() => {
          setShowLinkModal(false);
          linkRangeRef.current = null;
        }}
        onSubmit={(url) => {
          setShowLinkModal(false);
          queueMicrotask(() => {
            try {
              editorRef.current?.focus();
              const selection = document.getSelection();
              if (selection) {
                selection.removeAllRanges();
                if (linkRangeRef.current) selection.addRange(linkRangeRef.current);
              }
              document.execCommand("createLink", false, url);
            } finally {
              linkRangeRef.current = null;
            }
          });
        }}
      />
    </div>
  );
}

function RadiusPicker({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  max?: number;
}) {
  const v = typeof value === "number" ? value : 0;
  const maxV = max ?? 64;
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div
            className="absolute inset-2 border border-zinc-200 bg-zinc-50"
            style={{ borderRadius: Math.round(v) }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={maxV}
          value={Math.round(v)}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="min-w-40 flex-1"
        />
        <input
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value) || 0)}
          className="w-24 shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
          placeholder="Auto"
        />
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function compactStyle(style: BlockStyle | undefined): BlockStyle | undefined {
  if (!style) return undefined;
  const next: any = { ...style };
  for (const k of Object.keys(next)) {
    if (next[k] === undefined || next[k] === null || next[k] === "") delete next[k];
  }
  return Object.keys(next).length ? (next as BlockStyle) : undefined;
}

function applyStylePatch(prev: BlockStyle | undefined, patch: Partial<BlockStyle>) {
  return compactStyle({ ...(prev || {}), ...patch });
}

type FunnelEditorDialog =
  | { type: "rename-funnel"; value: string }
  | { type: "rename-page"; value: string }
  | { type: "slug-page"; value: string }
  | {
      type: "create-page";
      slug: string;
      title: string;
      pageType: FunnelPageIntentType;
      primaryCta: string;
      heroAssetMode: FunnelPageMediaMode;
      audience: string;
      offer: string;
    }
  | { type: "create-form"; slug: string; name: string; templateKey: CreditFormTemplateKey; themeKey: CreditFormThemeKey }
  | { type: "leave-page"; nextPageId: string | null }
  | { type: "delete-page" }
  | { type: "delete-block"; blockId: string; label: string }
  | null;

type SidebarPanelMode = "structure" | "activity" | "settings" | "selected";

/* DISABLED: broken intermediate refactor (kept temporarily for reference)
export function FunnelEditorClient({ basePath, funnelId }: { basePath: string; funnelId: string }) {
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [pages, setPages] = useState<Page[] | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPage = useMemo(
    () => (pages || []).find((p) => p.id === selectedPageId) || null,
    [pages, selectedPageId],
  );

  const load = async () => {
    setError(null);
    const [fRes, pRes] = await Promise.all([
      fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}`, { cache: "no-store" }),
      fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages`, { cache: "no-store" }),
    ]);
    const fJson = (await fRes.json().catch(() => null)) as any;
    const pJson = (await pRes.json().catch(() => null)) as any;
    if (!fRes.ok || !fJson || fJson.ok !== true) throw new Error(fJson?.error || "Failed to load funnel");
    if (!pRes.ok || !pJson || pJson.ok !== true) throw new Error(pJson?.error || "Failed to load pages");
    setFunnel(fJson.funnel as Funnel);
    const nextPages = Array.isArray(pJson.pages) ? (pJson.pages as Page[]) : [];
    setPages(nextPages);
    setSelectedPageId((prev) => prev || nextPages[0]?.id || null);
  };

  useEffect(() => {
    let cancelled = false;

    if (funnel !== null && pages !== null) return;

    void load().catch((e) => {
      if (cancelled) return;
      setError(e?.message ? String(e.message) : "Failed to load");
    });

    return () => {
      cancelled = true;
    };
    // Intentionally omit `load` from deps to avoid re-creating it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnelId, funnel, pages]);
    type StripeProductLite = {
      id: string;
      name: string;
      description: string | null;
      defaultPrice: null | { id: string; unitAmount: number | null; currency: string };
    };
    const [stripeProducts, setStripeProducts] = useState<StripeProductLite[]>([]);
    const [stripeProductsBusy, setStripeProductsBusy] = useState(false);
    const [stripeProductsError, setStripeProductsError] = useState<string | null>(null);
    const [newStripeProductName, setNewStripeProductName] = useState("");
    const [newStripeProductPriceCents, setNewStripeProductPriceCents] = useState<number>(4900);
    const [newStripeProductCurrency, setNewStripeProductCurrency] = useState("usd");

  const createPage = async () => {
    const slug = normalizeSlug(PROMPT_DISABLED("Page slug (e.g. landing)") || "");
    if (!slug) return;
    const title = (PROMPT_DISABLED("Page title (optional)") || "").trim();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, title: title || undefined, contentMarkdown: "" }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to create page");
      const createdId = (json.page?.id ? String(json.page.id) : "").trim();
      if (createdId) {
        await fetch(
          `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/${encodeURIComponent(createdId)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ editorMode: "BLOCKS", blocksJson: [] }),
          },
        ).catch(() => null);
      }
      await load();
      setSelectedPageId(createdId || json.page?.id || null);
      setSelectedBlockId(null);
    } catch (e) {
      setError((e as any)?.message ? String((e as any).message) : "Failed to create page");
    } finally {
      setBusy(false);
    }
  };

  const savePage = async (
    patch: Partial<
      Pick<
        Page,
        "title" | "slug" | "sortOrder" | "contentMarkdown" | "editorMode" | "blocksJson" | "customHtml" | "draftHtml" | "customChatJson"
      >
    >,
  ) => {
    if (!selectedPage) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/${encodeURIComponent(selectedPage.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to save");
      await load();
      setSelectedPageId(json.page?.id || selectedPage.id);
    } catch (e) {
      setError((e as any)?.message ? String((e as any).message) : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const newId = () => {
    try {
      const maybeCrypto = globalThis.crypto as Crypto | undefined;

          const setEditorMode = async (mode: "BLOCKS" | "CUSTOM_HTML") => {
            if (!selectedPage) return;
            if (selectedPage.editorMode === mode) return;

            if (mode === "CUSTOM_HTML" && selectedPage.editorMode === "BLOCKS") {
              setBusy(true);
              setError(null);
              try {
                const res = await fetch(
                  `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/${encodeURIComponent(selectedPage.id)}/export-custom-html`,
                  {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ blocksJson: selectedBlocks, setEditorMode: "CUSTOM_HTML" }),
                  },
                );
                const json = (await res.json().catch(() => null)) as any;
                if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to export HTML");
                const page = json.page as Partial<Page> | undefined;
                if (page?.id) {
                  setPages((prev) => (prev || []).map((p) => (p.id === page.id ? ({ ...p, ...page } as Page) : p)));
                  setSelectedPageId(String(page.id));
                } else {
                  await load();
                }
              } catch (e) {
                setError((e as any)?.message ? String((e as any).message) : "Failed to export HTML");
              } finally {
                setBusy(false);
              }
              return;
            }

            setSelectedPageLocal({ editorMode: mode });
            await savePage({ editorMode: mode });
          };

          const saveCurrentPage = async () => {
            if (!selectedPage) return;
            if (selectedPage.editorMode === "BLOCKS") {
              await savePage({ editorMode: "BLOCKS", blocksJson: selectedBlocks });
              return;
            }
            if (selectedPage.editorMode === "CUSTOM_HTML") {
              await savePage({ editorMode: "CUSTOM_HTML", draftHtml: getFunnelPageCurrentHtml(selectedPage), customChatJson: selectedChat });
              return;
            }
            await setEditorMode("BLOCKS");
          };

          return (
            <div className="flex min-h-screen flex-col lg:h-dvh lg:overflow-hidden">
              <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/85 backdrop-blur">
                <div className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href={pathname.startsWith("/credit") ? "/credit/app/services/funnel-builder" : "/portal/app/services/funnel-builder"}
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                    >
                      ← Back
                    </Link>

                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-brand-ink">{funnel?.name || "…"}</div>
                    </div>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const name = (PROMPT_DISABLED("Funnel name", funnel?.name || "") || "").trim();
                        if (name) saveFunnelMeta({ name });
                      }}
                      className={classNames(
                        "rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50",
                        busy ? "opacity-60" : "",
                      )}
                    >
                      Rename funnel
                    </button>

                    <button
                      type="button"
                      disabled={busy || !selectedPage}
                      onClick={() => void setEditorMode("BLOCKS")}
                      className={classNames(
                        "rounded-xl border px-3 py-2 text-sm font-semibold",
                        selectedPage?.editorMode === "BLOCKS"
                          ? "border-(--color-brand-blue) bg-blue-50 text-blue-800"
                          : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
                      )}
                    >
                      Builder
                    </button>
                    <button
                      type="button"
                      disabled={busy || !selectedPage}
                      onClick={() => void setEditorMode("CUSTOM_HTML")}
                      className={classNames(
                        "inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold text-white disabled:opacity-60",
                        "bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink) hover:opacity-90 shadow-sm",
                      )}
                    >
                      <AiSparkIcon className="h-4 w-4" />
                      Page code
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <PortalListboxDropdown
                      value={selectedPageId || ""}
                      onChange={(v) => {
                        const nextId = v || null;
                        setSelectedPageId(nextId);
                        setSelectedBlockId(null);
                      }}
                      options={[
                        { value: "", label: "Select a page…", disabled: true },
                        ...(pages || []).map((p) => ({ value: p.id, label: p.title })),
                      ]}
                      className="min-w-55"
                      buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                      disabled={busy || !pages || pages.length === 0}
                    />

                    <button
                      type="button"
                      disabled={busy || !selectedPage}
                      onClick={() => {
                        if (!selectedPage) return;
                        const title = (PROMPT_DISABLED("Page title", selectedPage.title) || "").trim();
                        if (title) savePage({ title });
                      }}
                      className={classNames(
                        "rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50",
                        busy ? "opacity-60" : "",
                      )}
                    >
                      Rename page
                    </button>

                    <button
                      type="button"
                      disabled={busy || !selectedPage}
                      onClick={() => {
                        if (!selectedPage) return;
                        const slug = normalizeSlug(PROMPT_DISABLED("Page slug", selectedPage.slug) || "");
                        if (slug) savePage({ slug });
                      }}
                      className={classNames(
                        "rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50",
                        busy ? "opacity-60" : "",
                      )}
                    >
                      Slug
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={createPage}
                      className={classNames(
                        "rounded-xl px-3 py-2 text-sm font-semibold text-white",
                        busy ? "bg-zinc-400" : "bg-(--color-brand-blue) hover:bg-blue-700",
                      )}
                    >
                      + Page
                    </button>

                    <button
                      type="button"
                      disabled={busy || !selectedPage || !selectedPageDirty}
                      onClick={() => void saveCurrentPage()}
                      className={classNames(
                        "rounded-xl px-4 py-2 text-sm font-semibold text-white",
                        busy ? "bg-zinc-400" : "bg-brand-ink hover:opacity-95",
                      )}
                    >
                      {busy ? "Saving…" : selectedPageDirty ? "Save" : "Saved"}
                    </button>

                    <button
                      type="button"
                      disabled={busy || !selectedPage}
                      onClick={deletePage}
                      className={classNames(
                        "rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50",
                        busy ? "opacity-60" : "",
                      )}
                    >
                      Delete
                    </button>

                  </div>
                </div>
              </header>

              {error ? <div className="mx-4 mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

              {selectedPage && selectedPage.editorMode !== "MARKDOWN" ? (
                <div className="mx-4 mt-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Mode context</div>
                  {selectedPage.editorMode === "BLOCKS" ? (
                    <div className="mt-1 text-zinc-700">
                      <span className="font-semibold text-zinc-900">Builder page.</span> Templates, sections, columns, and drag/drop control the structure. Ask AI stays inside this page: it edits a selected custom code block or inserts modular blocks where they belong.
                    </div>
                  ) : (
                    <div className="mt-1 text-zinc-700">
                      <span className="font-semibold text-zinc-900">Whole-page code.</span> Ask AI edits the full page source for this page only. Builder blocks are a separate structure unless you intentionally switch back to the builder.
                    </div>
                  )}
                </div>
              ) : null}

              <div className="flex flex-1 flex-col overflow-auto lg:min-h-0 lg:flex-row lg:overflow-hidden">
                <aside className="w-full shrink-0 border-b border-zinc-200 bg-white p-4 lg:min-h-0 lg:w-95 lg:overflow-y-auto lg:border-b-0 lg:border-r">
                  {!selectedPage ? (
                    <div className="text-sm text-zinc-600">Select a page to edit.</div>
                  ) : selectedPage.editorMode === "MARKDOWN" ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Legacy mode</div>
                      <div className="mt-2 font-semibold">This page is in Markdown mode.</div>
                      <div className="mt-2 text-amber-800">Markdown editing is disabled in this editor. Pick a supported mode to continue.</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void setEditorMode("BLOCKS")}
                          className={classNames(
                            "rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100",
                            busy ? "opacity-60" : "",
                          )}
                        >
                          Switch to Builder
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void setEditorMode("CUSTOM_HTML")}
                          className={classNames(
                            "rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100",
                            busy ? "opacity-60" : "",
                          )}
                        >
                          Switch to Page code
                        </button>
                      </div>
                    </div>
                  ) : selectedPage.editorMode === "BLOCKS" ? (
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">Builder</div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {(
                          [
                            { type: "heading", label: "Heading" },
                            { type: "paragraph", label: "Text" },
                            { type: "button", label: "Button" },
                            { type: "salesCheckoutButton", label: "Checkout" },
                            { type: "formLink", label: "Form link" },
                            { type: "image", label: "Image" },
                            { type: "video", label: "Video" },
                            { type: "spacer", label: "Spacer" },
                          ] as const
                        ).map((b) => (
                          <button
                            key={b.type}
                            type="button"
                            disabled={busy}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/x-block-type", b.type);
                              e.dataTransfer.effectAllowed = "copy";
                            }}
                            onClick={() => addBlock(b.type)}
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                            title="Drag into canvas or click to add"
                          >
                            {b.label}
                          </button>
                        ))}
                      </div>

                      <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                        <div className="text-sm font-semibold text-zinc-900">Selected</div>
                        {!selectedBlock ? (
                          <div className="mt-2 text-sm text-zinc-600">Click a block in the preview.</div>
                        ) : (
                          <div className="mt-3 space-y-3">
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{selectedBlock.type}</div>

                            {selectedBlock.type === "heading" ? (
                              <div className="space-y-2">
                                <input
                                  value={selectedBlock.props.text}
                                  onChange={(e) =>
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: { ...selectedBlock.props, text: e.target.value },
                                    })
                                  }
                                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                  placeholder="Heading text"
                                />
                                <PortalSelectDropdown
                                  value={selectedBlock.props.level ?? 2}
                                  onChange={(level) =>
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: { ...selectedBlock.props, level },
                                    })
                                  }
                                  options={[
                                    { value: 1, label: "H1" },
                                    { value: 2, label: "H2" },
                                    { value: 3, label: "H3" },
                                  ]}
                                  className="w-full"
                                  buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                                />
                              </div>
                            ) : null}

                            {selectedBlock.type === "paragraph" ? (
                              <textarea
                                value={selectedBlock.props.text}
                                onChange={(e) => upsertBlock({ ...selectedBlock, props: { ...selectedBlock.props, text: e.target.value } })}
                                className="min-h-30 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                placeholder="Paragraph text"
                              />
                            ) : null}

                            {selectedBlock.type === "button" ? (
                              <div className="space-y-2">
                                <input
                                  value={selectedBlock.props.text}
                                  onChange={(e) => upsertBlock({ ...selectedBlock, props: { ...selectedBlock.props, text: e.target.value } })}
                                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                  placeholder="Button text"
                                />
                                <input
                                  value={selectedBlock.props.href}
                                  onChange={(e) => upsertBlock({ ...selectedBlock, props: { ...selectedBlock.props, href: e.target.value } })}
                                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                  placeholder={`${basePath}/forms/your-form-slug`}
                                />
                                <PortalListboxDropdown
                                  value={selectedBlock.props.variant ?? "primary"}
                                  onChange={(variant) =>
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: { ...selectedBlock.props, variant },
                                    })
                                  }
                                  options={[
                                    { value: "primary", label: "Primary" },
                                    { value: "secondary", label: "Secondary" },
                                  ]}
                                  className="w-full"
                                  buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                                />
                              </div>
                            ) : null}

                            {selectedBlock.type === "salesCheckoutButton" ? (
                              <div className="space-y-2">
                                <input
                                  value={selectedBlock.props.text ?? ""}
                                  onChange={(e) =>
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: { ...selectedBlock.props, text: e.target.value },
                                    })
                                  }
                                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                  placeholder="Button text (e.g. Buy now)"
                                />

                                <input
                                  value={selectedBlock.props.priceId ?? ""}
                                  onChange={(e) =>
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: { ...selectedBlock.props, priceId: e.target.value.trim() },
                                    })
                                  }
                                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-mono"
                                  placeholder="Stripe price id (price_...)"
                                />

                                <input
                                  type="number"
                                  min={1}
                                  max={20}
                                  value={String(selectedBlock.props.quantity ?? 1)}
                                  onChange={(e) =>
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: {
                                        ...selectedBlock.props,
                                        quantity: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                                      },
                                    })
                                  }
                                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                  placeholder="Quantity"
                                />

                                <PortalListboxDropdown
                                  value={selectedBlock.props.priceId ?? ""}
                                  onChange={(nextPriceId) => {
                                    const priceId = String(nextPriceId || "").trim();
                                    const picked = stripeProducts.find((p) => String(p?.defaultPrice?.id || "").trim() === priceId) || null;
                                    const nextProductName = (picked?.name ? String(picked.name) : "").trim();
                                    const nextProductDescription = (picked?.description ? String(picked.description) : "").trim();

                                    const prevName = String((selectedBlock.props as any)?.productName || "").trim();
                                    const prevDesc = String((selectedBlock.props as any)?.productDescription || "").trim();

                                    upsertBlock({
                                      ...selectedBlock,
                                      props: {
                                        ...selectedBlock.props,
                                        priceId,
                                        ...(priceId && !prevName && nextProductName ? { productName: nextProductName } : null),
                                        ...(priceId && !prevDesc && nextProductDescription ? { productDescription: nextProductDescription } : null),
                                      },
                                    });
                                  }}
                                  placeholder={stripeProductsBusy ? "Loading Stripe products…" : "Select a Stripe product"}
                                  options={(
                                    [
                                      {
                                        value: "",
                                        label: "(None)",
                                        hint: "Paste a price id or select a product",
                                      },
                                      ...stripeProducts
                                        .filter((p) => p && p.defaultPrice && p.defaultPrice.id)
                                        .map((p) => ({
                                          value: p.defaultPrice!.id,
                                          label: p.name,
                                          hint: `${formatMoney(p.defaultPrice!.unitAmount, p.defaultPrice!.currency)} • ${p.defaultPrice!.id}`,
                                        })),
                                    ]
                                  )}
                                  className="w-full"
                                  buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                                  disabled={stripeProductsBusy}
                                />

                                {stripeProductsError ? (
                                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                    {stripeProductsError}
                                  </div>
                                ) : null}

                                <div className="text-[11px] text-zinc-500">Stripe products auto-load.</div>

                                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Create Stripe product</div>
                                  <div className="mt-2 space-y-2">
                                    <input
                                      value={newStripeProductName}
                                      onChange={(e) => setNewStripeProductName(e.target.value)}
                                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                      placeholder="Product name"
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                      <input
                                        type="number"
                                        min={50}
                                        value={String(newStripeProductPriceCents)}
                                        onChange={(e) => setNewStripeProductPriceCents(Number(e.target.value) || 0)}
                                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                        placeholder="Price (cents)"
                                      />
                                      <input
                                        value={newStripeProductCurrency}
                                        onChange={(e) => setNewStripeProductCurrency(e.target.value)}
                                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                        placeholder="Currency (usd)"
                                      />
                                    </div>

                                    <button
                                      type="button"
                                      disabled={stripeProductsBusy}
                                      onClick={async () => {
                                        const created = await createStripeProduct();
                                        const priceId = String((created as any)?.defaultPrice?.id || "").trim();
                                        if (created && priceId) {
                                          upsertBlock({
                                            ...selectedBlock,
                                            props: { ...selectedBlock.props, priceId },
                                          });
                                        }
                                      }}
                                      className={classNames(
                                        "w-full rounded-xl px-3 py-2 text-sm font-semibold text-white",
                                        stripeProductsBusy ? "bg-zinc-400" : "bg-(--color-brand-blue) hover:bg-blue-700",
                                      )}
                                    >
                                      Create product
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : null}

                            {selectedBlock.type === "formLink" ? (
                              <div className="space-y-2">
                                <input
                                  value={selectedBlock.props.formSlug}
                                  onChange={(e) =>
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: { ...selectedBlock.props, formSlug: normalizeSlug(e.target.value) },
                                    })
                                  }
                                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                  placeholder="form-slug"
                                />
                                <input
                                  value={selectedBlock.props.text ?? ""}
                                  onChange={(e) => upsertBlock({ ...selectedBlock, props: { ...selectedBlock.props, text: e.target.value } })}
                                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                  placeholder="CTA text"
                                />
                              </div>
                            ) : null}

                            {selectedBlock.type === "image" ? (
                              <div className="space-y-2">
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      setMediaPickerTarget({ type: "image-block", blockId: selectedBlock.id });
                                      setMediaPickerOpen(true);
                                    }}
                                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                                  >
                                    Choose from media
                                  </button>
                                  <label
                                    className={classNames(
                                      "cursor-pointer rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50",
                                      uploadingImageBlockId === selectedBlock.id ? "opacity-60" : "",
                                    )}
                                  >
                                    {uploadingImageBlockId === selectedBlock.id ? "Uploading…" : "Upload image"}
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      disabled={busy || uploadingImageBlockId === selectedBlock.id}
                                      onChange={(e) => {
                                        const files = Array.from(e.target.files || []);
                                        e.currentTarget.value = "";
                                        if (files.length === 0) return;
                                        if (!selectedBlock || selectedBlock.type !== "image") return;
                                        setUploadingImageBlockId(selectedBlock.id);
                                        setError(null);
                                        void (async () => {
                                          try {
                                            const created = await uploadToMediaLibrary(files, { maxFiles: 1 });
                                            const it = created[0];
                                            if (!it) return;
                                            const nextSrc = String((it as any).shareUrl || (it as any).previewUrl || (it as any).openUrl || (it as any).downloadUrl || "").trim();
                                            if (!nextSrc) return;
                                            upsertBlock({
                                              ...selectedBlock,
                                              props: {
                                                ...selectedBlock.props,
                                                src: nextSrc,
                                                alt: (selectedBlock.props.alt || "").trim() ? selectedBlock.props.alt : it.fileName,
                                              },
                                            });
                                            toast.success("Image uploaded and selected");
                                          } catch (err) {
                                            const msg = (err as any)?.message ? String((err as any).message) : "Upload failed";
                                            toast.error(msg);
                                          } finally {
                                            setUploadingImageBlockId(null);
                                          }
                                        })();
                                      }}
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    disabled={busy || !selectedBlock.props.src}
                                    onClick={() => upsertBlock({ ...selectedBlock, props: { ...selectedBlock.props, src: "" } })}
                                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                                  >
                                    Clear
                                  </button>

                                  <button
                                    type="button"
                                    disabled={busy || !selectedBlock.props.src}
                                    onClick={() => setImageCropTarget({ blockId: selectedBlock.id, src: selectedBlock.props.src })}
                                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                                  >
                                    Edit image
                                  </button>
                                </div>

                                {selectedBlock.props.src ? (
                                  <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">Image selected.</div>
                                ) : (
                                  <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">No image selected.</div>
                                )}

                                <label className="block">
                                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Image name</div>
                                  <input
                                    value={selectedBlock.props.alt ?? ""}
                                    onChange={(e) => upsertBlock({ ...selectedBlock, props: { ...selectedBlock.props, alt: e.target.value } })}
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                    placeholder="e.g. hero-image.png"
                                  />
                                  <div className="mt-1 text-xs text-zinc-500">Saved as the image alt text.</div>
                                </label>

                                <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                                  <span className="font-semibold text-zinc-900">Show frame</span>
                                  <ToggleSwitch
                                    checked={(selectedBlock.props as any)?.showFrame !== false}
                                    disabled={busy}
                                    onChange={(checked) =>
                                      upsertBlock({
                                        ...selectedBlock,
                                        props: { ...(selectedBlock.props as any), showFrame: checked },
                                      } as any)
                                    }
                                  />
                                </label>
                              </div>
                            ) : null}

                            {selectedBlock.type === "video" ? (
                              <div className="space-y-2">
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      setMediaPickerTarget({ type: "video-block", blockId: selectedBlock.id });
                                      setMediaPickerOpen(true);
                                    }}
                                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                                  >
                                    Choose from media
                                  </button>

                                  <label
                                    className={classNames(
                                      "cursor-pointer rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50",
                                      uploadingImageBlockId === selectedBlock.id ? "opacity-60" : "",
                                    )}
                                  >
                                    {uploadingImageBlockId === selectedBlock.id ? "Uploading…" : "Upload video"}
                                    <input
                                      type="file"
                                      accept="video/*"
                                      className="hidden"
                                      disabled={busy || uploadingImageBlockId === selectedBlock.id}
                                      onChange={(e) => {
                                        const files = Array.from(e.target.files || []);
                                        e.currentTarget.value = "";
                                        if (files.length === 0) return;
                                        if (!selectedBlock || selectedBlock.type !== "video") return;
                                        const file = files[0];
                                        if (!file) return;
                                        setUploadingImageBlockId(selectedBlock.id);
                                        setError(null);
                                        void (async () => {
                                          try {
                                            const uploaded = await uploadToUploads(file);
                                            const nextSrc = String(uploaded.mediaItem?.shareUrl || uploaded.url || "").trim();
                                            if (!nextSrc) return;
                                            const prevName = String((selectedBlock.props as any)?.name || "").trim();
                                            upsertBlock({
                                              ...selectedBlock,
                                              props: {
                                                ...(selectedBlock.props as any),
                                                src: nextSrc,
                                                ...(prevName ? null : { name: uploaded.mediaItem?.fileName || file.name }),
                                              },
                                            } as any);
                                            toast.success("Video uploaded and selected");
                                          } catch (err) {
                                            const msg = (err as any)?.message ? String((err as any).message) : "Upload failed";
                                            toast.error(msg);
                                          } finally {
                                            setUploadingImageBlockId(null);
                                          }
                                        })();
                                      }}
                                    />
                                  </label>

                                  <button
                                    type="button"
                                    disabled={busy || !String((selectedBlock.props as any).src || "").trim()}
                                    onClick={() =>
                                      upsertBlock({
                                        ...selectedBlock,
                                        props: { ...(selectedBlock.props as any), src: "" },
                                      } as any)
                                    }
                                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                                  >
                                    Clear
                                  </button>

                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      setVideoSettingsBlockId((prev) => (prev === selectedBlock.id ? null : selectedBlock.id))
                                    }
                                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                                  >
                                    {videoSettingsBlockId === selectedBlock.id ? "Hide settings" : "Edit video"}
                                  </button>
                                </div>

                                {String((selectedBlock.props as any).src || "").trim() ? (
                                  <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">Video selected.</div>
                                ) : (
                                  <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">No video selected.</div>
                                )}

                                <label className="block">
                                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Video name</div>
                                  <input
                                    value={String((selectedBlock.props as any)?.name || "")}
                                    onChange={(e) =>
                                      upsertBlock({
                                        ...selectedBlock,
                                        props: { ...(selectedBlock.props as any), name: e.target.value.slice(0, 200) },
                                      } as any)
                                    }
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                    placeholder="e.g. intro-video.mp4"
                                  />
                                </label>

                                {videoSettingsBlockId === selectedBlock.id ? (
                                  <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Video settings</div>

                                    <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                                      <span className="font-semibold text-zinc-900">Show controls</span>
                                      <ToggleSwitch
                                        checked={(selectedBlock.props as any)?.controls !== false}
                                        disabled={busy}
                                        onChange={(checked) =>
                                          upsertBlock({
                                            ...selectedBlock,
                                            props: { ...(selectedBlock.props as any), controls: checked },
                                          } as any)
                                        }
                                      />
                                    </label>

                                    <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                                      <span className="font-semibold text-zinc-900">Autoplay</span>
                                      <ToggleSwitch
                                        checked={Boolean((selectedBlock.props as any)?.autoplay)}
                                        disabled={busy}
                                        onChange={(checked) =>
                                          upsertBlock({
                                            ...selectedBlock,
                                            props: {
                                              ...(selectedBlock.props as any),
                                              autoplay: checked,
                                              muted: checked ? true : (selectedBlock.props as any)?.muted,
                                            },
                                          } as any)
                                        }
                                      />
                                    </label>

                                    <div className="grid grid-cols-2 gap-2">
                                      <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                                        <span className="font-semibold text-zinc-900">Loop</span>
                                        <ToggleSwitch
                                          checked={Boolean((selectedBlock.props as any)?.loop)}
                                          disabled={busy}
                                          onChange={(checked) =>
                                            upsertBlock({
                                              ...selectedBlock,
                                              props: { ...(selectedBlock.props as any), loop: checked },
                                            } as any)
                                          }
                                        />
                                      </label>

                                      <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                                        <span className="font-semibold text-zinc-900">Muted</span>
                                        <ToggleSwitch
                                          checked={Boolean((selectedBlock.props as any)?.muted)}
                                          disabled={busy}
                                          onChange={(checked) =>
                                            upsertBlock({
                                              ...selectedBlock,
                                              props: { ...(selectedBlock.props as any), muted: checked },
                                            } as any)
                                          }
                                        />
                                      </label>
                                    </div>

                                    <label className="block">
                                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Fit</div>
                                      <PortalListboxDropdown
                                        value={String((selectedBlock.props as any)?.fit || "contain")}
                                        onChange={(fit) =>
                                          upsertBlock({
                                            ...selectedBlock,
                                            props: { ...(selectedBlock.props as any), fit: String(fit || "contain") },
                                          } as any)
                                        }
                                        options={[
                                          { value: "contain", label: "Contain (no crop)" },
                                          { value: "cover", label: "Cover (crop to fill)" },
                                        ]}
                                        className="w-full"
                                        buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                                      />
                                    </label>

                                    <label className="block">
                                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Aspect ratio</div>
                                      <PortalListboxDropdown
                                        value={String((selectedBlock.props as any)?.aspectRatio || "auto")}
                                        onChange={(aspectRatio) =>
                                          upsertBlock({
                                            ...selectedBlock,
                                            props: { ...(selectedBlock.props as any), aspectRatio: String(aspectRatio || "auto") },
                                          } as any)
                                        }
                                        options={[
                                          { value: "auto", label: "Auto" },
                                          { value: "16:9", label: "16:9" },
                                          { value: "9:16", label: "9:16" },
                                          { value: "4:3", label: "4:3" },
                                          { value: "1:1", label: "1:1" },
                                        ]}
                                        className="w-full"
                                        buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                                      />
                                    </label>

                                    <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                                      <span className="font-semibold text-zinc-900">Show frame</span>
                                      <ToggleSwitch
                                        checked={(selectedBlock.props as any)?.showFrame !== false}
                                        disabled={busy}
                                        onChange={(checked) =>
                                          upsertBlock({
                                            ...selectedBlock,
                                            props: { ...(selectedBlock.props as any), showFrame: checked },
                                          } as any)
                                        }
                                      />
                                    </label>

                                    <div className="space-y-2">
                                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Poster image</div>
                                      <div className="flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          disabled={busy}
                                          onClick={() => {
                                            setMediaPickerTarget({ type: "video-poster", blockId: selectedBlock.id });
                                            setMediaPickerOpen(true);
                                          }}
                                          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                                        >
                                          Choose from media
                                        </button>

                                        <label
                                          className={classNames(
                                            "cursor-pointer rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50",
                                            uploadingImageBlockId === selectedBlock.id ? "opacity-60" : "",
                                          )}
                                        >
                                          {uploadingImageBlockId === selectedBlock.id ? "Uploading…" : "Upload poster"}
                                          <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            disabled={busy || uploadingImageBlockId === selectedBlock.id}
                                            onChange={(e) => {
                                              const files = Array.from(e.target.files || []);
                                              e.currentTarget.value = "";
                                              if (files.length === 0) return;
                                              if (!selectedBlock || selectedBlock.type !== "video") return;
                                              const file = files[0];
                                              if (!file) return;
                                              setUploadingImageBlockId(selectedBlock.id);
                                              setError(null);
                                              void (async () => {
                                                try {
                                                  const created = await uploadToMediaLibrary([file], { maxFiles: 1 });
                                                  const it = created[0];
                                                  const nextPoster = String(it?.shareUrl || it?.previewUrl || "").trim();
                                                  if (!nextPoster) return;
                                                  upsertBlock({
                                                    ...selectedBlock,
                                                    props: { ...(selectedBlock.props as any), posterUrl: nextPoster },
                                                  } as any);
                                                  toast.success("Poster uploaded and selected");
                                                } catch (err) {
                                                  const msg = (err as any)?.message ? String((err as any).message) : "Upload failed";
                                                  toast.error(msg);
                                                } finally {
                                                  setUploadingImageBlockId(null);
                                                }
                                              })();
                                            }}
                                          />
                                        </label>

                                        <button
                                          type="button"
                                          disabled={busy || !String((selectedBlock.props as any)?.posterUrl || "").trim()}
                                          onClick={() =>
                                            upsertBlock({
                                              ...selectedBlock,
                                              props: { ...(selectedBlock.props as any), posterUrl: "" },
                                            } as any)
                                          }
                                          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                                        >
                                          Clear
                                        </button>
                                      </div>

                                      {String((selectedBlock.props as any)?.posterUrl || "").trim() ? (
                                        <div className="rounded-xl border border-zinc-200 bg-white p-3">
                                          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Selected poster</div>
                                          <div className="mt-1 break-all font-mono text-xs text-zinc-700">{String((selectedBlock.props as any)?.posterUrl || "").trim()}</div>
                                        </div>
                                      ) : (
                                        <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">No poster selected.</div>
                                      )}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}

                            {selectedBlock.type === "spacer" ? (
                              <input
                                type="number"
                                value={String(selectedBlock.props.height ?? 24)}
                                onChange={(e) => upsertBlock({ ...selectedBlock, props: { ...selectedBlock.props, height: Number(e.target.value) } })}
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                placeholder="Height"
                              />
                            ) : null}

                          </div>
                        )}
                      </div>

                      <div className="mt-4 text-xs text-zinc-500">Tip: drag blocks into the preview to add; drag blocks in preview to reorder.</div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">Custom code (AI)</div>
                      <div className="mt-3 max-h-[40vh] space-y-2 overflow-auto rounded-2xl border border-zinc-200 bg-white p-3">
                        {selectedChat.length === 0 ? (
                          <div className="text-sm text-zinc-600">Ask for a page structure and CTA flow. Then follow up with edits like “tighten the headline hierarchy”.</div>
                        ) : (
                          selectedChat.map((m, idx) => (
                            <div
                              key={idx}
                              className={classNames(
                                "rounded-xl px-3 py-2 text-sm",
                                m.role === "user" ? "bg-blue-50 text-zinc-900" : "bg-zinc-50 text-zinc-800",
                              )}
                            >
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{m.role}</div>
                              <div className="mt-1 whitespace-pre-wrap break-words">{m.content}</div>
                            </div>
                          ))
                        )}
                      </div>

                      <textarea
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        className="mt-3 min-h-[110px] w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        placeholder="Describe what to build or change…"
                      />

                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          disabled={busy || !chatInput.trim()}
                          onClick={runAi}
                          className={classNames(
                            "flex-1 inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-white",
                            busy || !chatInput.trim() ? "bg-zinc-400" : "bg-linear-to-r from-[color:var(--color-brand-blue)] via-violet-500 to-[color:var(--color-brand-pink)] hover:opacity-90 shadow-sm",
                          )}
                        >
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z" />
                            <path d="M19 14l.8 2.6L22 17l-2.2.4L19 20l-.8-2.6L16 17l2.2-.4L19 14z" />
                          </svg>
                          <span>{busy ? BUSY_PHASES[busyPhaseIdx] : "Ask AI"}</span>
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setSelectedPageLocal({ customChatJson: [] });
                            savePage({ customChatJson: [] });
                          }}
                          className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                        >
                          Clear
                        </button>
                      </div>

                      <div className="mt-4 border-t border-zinc-200 pt-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">HTML</div>
                        <textarea
                          value={getFunnelPageCurrentHtml(selectedPage)}
                          onChange={(e) => setSelectedPageLocal({ draftHtml: e.target.value })}
                          className="mt-2 min-h-[240px] w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs"
                          placeholder="<!doctype html>…"
                        />
                        <div className="mt-2 text-xs text-zinc-500">Use Save in the top bar to persist changes.</div>
                      </div>
                    </div>
                  )}
                </aside>

                <main className="flex-1 overflow-auto bg-zinc-100 p-3 sm:p-4 lg:min-h-0 lg:overflow-hidden">
                  <div
                    className={classNames(
                      "flex h-full flex-col overflow-hidden border border-zinc-200 bg-white",
                      previewDevice === "mobile" ? "rounded-2xl" : "rounded-none",
                    )}
                  >
                    <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-900">{selectedPage?.title || "Preview"}</div>
                        {selectedPage ? <div className="truncate text-xs text-zinc-500">/{selectedPage.slug}</div> : null}
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-1">
                          <button
                            type="button"
                            onClick={() => setPreviewMode("edit")}
                            className={classNames(
                              "rounded-lg px-3 py-1.5 text-sm font-semibold",
                              previewMode === "edit" ? "bg-brand-ink text-white" : "text-zinc-700 hover:bg-zinc-50",
                            )}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreviewMode("preview")}
                            className={classNames(
                              "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold",
                              previewMode === "preview" ? "bg-brand-ink text-white" : "text-zinc-700 hover:bg-zinc-50",
                            )}
                          >
                            <AiSparkIcon className="h-4 w-4" />
                            Preview
                          </button>
                        </div>

                        <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-1">
                          <button
                            type="button"
                            onClick={() => setPreviewDevice("desktop")}
                            className={classNames(
                              "rounded-lg px-3 py-1.5 text-sm font-semibold",
                              previewDevice === "desktop" ? "bg-brand-ink text-white" : "text-zinc-700 hover:bg-zinc-50",
                            )}
                          >
                            Desktop
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreviewDevice("mobile")}
                            className={classNames(
                              "rounded-lg px-3 py-1.5 text-sm font-semibold",
                              previewDevice === "mobile" ? "bg-brand-ink text-white" : "text-zinc-700 hover:bg-zinc-50",
                            )}
                          >
                            Mobile
                          </button>
                        </div>

                        {funnelLiveHref ? (
                          <a
                            href={funnelLiveHref}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path
                                d="M1.5 12s4-7 10.5-7 10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12Z"
                                stroke="currentColor"
                                strokeWidth="1.8"
                              />
                              <path
                                d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                                stroke="currentColor"
                                strokeWidth="1.8"
                              />
                            </svg>
                            View live
                          </a>
                        ) : null}
                      </div>
                    </div>

                    <div
                      className="flex-1 overflow-auto p-8"
                      onDragOver={(e) => {
                        if (!selectedPage || selectedPage.editorMode !== "BLOCKS" || previewMode !== "edit") return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "copy";
                      }}
                      onDrop={(e) => {
                        if (!selectedPage || selectedPage.editorMode !== "BLOCKS" || previewMode !== "edit") return;
                        e.preventDefault();
                        const t = e.dataTransfer.getData("text/x-block-type");
                        if (t) addBlock(t as any);
                      }}
                    >
                      {!selectedPage ? (
                        <div className="text-sm text-zinc-600">Select a page to preview.</div>
                      ) : selectedPage.editorMode === "CUSTOM_HTML" ? (
                        <div
                          className={classNames(
                            "mx-auto w-full overflow-hidden border border-zinc-200 bg-white",
                            previewDevice === "mobile" ? "max-w-[420px] rounded-3xl" : "max-w-5xl rounded-none",
                          )}
                        >
                          <iframe
                            title={selectedPage.title}
                            sandbox="allow-forms allow-popups allow-scripts allow-same-origin"
                            allow="microphone"
                            srcDoc={getFunnelPageCurrentHtml(selectedPage)}
                            className="h-[78vh] w-full bg-white"
                          />
                        </div>
                      ) : (
                        <div
                          className={classNames(
                            "mx-auto w-full border border-zinc-200",
                            previewDevice === "mobile" ? "max-w-[420px] rounded-3xl" : "max-w-5xl rounded-none",
                          )}
                        >
                          {previewMode === "preview" ? (
                            <div className="min-h-[70vh]">
                              {renderCreditFunnelBlocks({
                                blocks: selectedBlocks,
                                basePath,
                                context: {
                                  bookingSiteSlug: bookingSiteSlug || undefined,
                                  defaultBookingCalendarId: funnel?.bookingCalendarId || undefined,
                                  funnelId: funnel?.id || undefined,
                                  funnelPageId: selectedPage?.id || "",
                                  funnelSlug: funnel?.slug || undefined,
                                  funnelPageSlug: selectedPage?.slug || undefined,
                                  previewDevice,
                                },
                              })}
                            </div>
                          ) : (
                            <div className="bg-white p-8">
                              {selectedBlocks.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
                                  Drag a block from the left, or click a block to add.
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  {selectedBlocks.map((b) => (
                                    <div
                                      key={b.id}
                                      draggable
                                      onDragStart={(e) => {
                                        e.dataTransfer.setData("text/x-block-id", b.id);
                                        e.dataTransfer.effectAllowed = "move";
                                      }}
                                      onDragOver={(e) => {
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = "move";
                                      }}
                                      onDrop={(e) => {
                                        e.preventDefault();
                                        const dragId = e.dataTransfer.getData("text/x-block-id");
                                        if (dragId) reorderBlocks(dragId, b.id);
                                      }}
                                      onClick={() => setSelectedBlockId(b.id)}
                                      className={classNames(
                                        "cursor-pointer rounded-2xl border p-4",
                                        selectedBlockId === b.id
                                          ? "border-[color:var(--color-brand-blue)] bg-blue-50"
                                          : "border-zinc-200 bg-white hover:bg-zinc-50",
                                      )}
                                    >
                                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{b.type}</div>
                                      <div className="mt-3">
                                        {renderCreditFunnelBlocks({
                                          blocks: [b],
                                          basePath,
                                          context: {
                                            bookingSiteSlug: bookingSiteSlug || undefined,
                                            defaultBookingCalendarId: funnel?.bookingCalendarId || undefined,
                                            funnelId: funnel?.id || undefined,
                                            funnelPageId: selectedPage?.id || "",
                                            funnelSlug: funnel?.slug || undefined,
                                            funnelPageSlug: selectedPage?.slug || undefined,
                                            previewDevice,
                                          },
                                          editor: {
                                            enabled: true,
                                            selectedBlockId,
                                            hoveredBlockId,
                                            onSelectBlockId: (id) => setSelectedBlockId(id),
                                            onHoverBlockId: (id) => setHoveredBlockId(id),
                                            onUpsertBlock: (next) => upsertBlock(next),
                                          },
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </main>
              </div>
            </div>
                              )}
                            >
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{m.role}</div>
                              <div className="mt-1 whitespace-pre-wrap break-words">{m.content}</div>
                            </div>
                          ))
                        )}
                      </div>

                      <textarea
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        className="mt-3 min-h-[110px] w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        placeholder="Describe what to build or change…"
                      />

                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          disabled={busy || !chatInput.trim()}
                          onClick={runAi}
                          className={classNames(
                            "flex-1 rounded-2xl px-4 py-2 text-sm font-semibold text-white",
                            busy ? "bg-zinc-400" : "bg-[color:var(--color-brand-blue)] hover:bg-blue-700",
                          )}
                        >
                          {busy ? BUSY_PHASES[busyPhaseIdx] : "Ask AI"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setSelectedPageLocal({ customChatJson: [] });
                            savePage({ customChatJson: [] });
                          }}
                          className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                        >
                          Clear
                        </button>
                      </div>

                      <div className="mt-4 border-t border-zinc-200 pt-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">HTML</div>
                        <textarea
                          value={getFunnelPageCurrentHtml(selectedPage)}
                          onChange={(e) => setSelectedPageLocal({ draftHtml: e.target.value })}
                          className="mt-2 min-h-[240px] w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs"
                          placeholder="<!doctype html>…"
                        />
                        <div className="mt-2 text-xs text-zinc-500">Use Save in the top bar to persist changes.</div>
                      </div>
                    </div>
                  )}
                </aside>

                <main className="flex-1 overflow-hidden bg-zinc-100 p-4 lg:min-h-0">
                  <div
                    className={classNames(
                      "flex h-full flex-col overflow-hidden border border-zinc-200 bg-white",
                      previewDevice === "mobile" ? "rounded-2xl" : "rounded-none",
                    )}
                  >
                    <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-900">{selectedPage?.title || "Preview"}</div>
                        {selectedPage ? <div className="truncate text-xs text-zinc-500">/{selectedPage.slug}</div> : null}
                      </div>
                      {funnelLiveHref ? (
                        <a
                          href={funnelLiveHref}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path
                              d="M1.5 12s4-7 10.5-7 10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12Z"
                              stroke="currentColor"
                              strokeWidth="1.8"
                            />
                            <path
                              d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                              stroke="currentColor"
                              strokeWidth="1.8"
                            />
                          </svg>
                          View live
                        </a>
                      ) : null}
                    </div>

                    <div
                      className="flex-1 overflow-auto p-8"
                      onDragOver={(e) => {
                        if (!selectedPage || selectedPage.editorMode !== "BLOCKS") return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "copy";
                      }}
                      onDrop={(e) => {
                        if (!selectedPage || selectedPage.editorMode !== "BLOCKS") return;
                        e.preventDefault();
                        const t = e.dataTransfer.getData("text/x-block-type");
                        if (t) addBlock(t as any);
                      }}
                    >
                      {!selectedPage ? (
                        <div className="text-sm text-zinc-600">Select a page to preview.</div>
                      ) : selectedPage.editorMode === "CUSTOM_HTML" ? (
                        <div
                          className={classNames(
                            "h-[78vh] overflow-hidden border border-zinc-200 bg-white",
                            previewDevice === "mobile" ? "rounded-2xl" : "rounded-none",
                          )}
                        >
                          <iframe
                            title={selectedPage.title}
                            sandbox="allow-forms allow-popups allow-scripts allow-same-origin"
                            allow="microphone"
                            srcDoc={getFunnelPageCurrentHtml(selectedPage)}
                            className="h-full w-full bg-white"
                          />
                        </div>
                      ) : (
                        <div
                          className={classNames(
                            "mx-auto w-full border border-zinc-200 bg-white p-8",
                            previewDevice === "mobile" ? "max-w-[420px] rounded-3xl" : "max-w-4xl rounded-none",
                          )}
                        >
                          {selectedBlocks.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
                              Drag a block from the left, or click a block to add.
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {selectedBlocks.map((b) => (
                                <div
                                  key={b.id}
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData("text/x-block-id", b.id);
                                    e.dataTransfer.effectAllowed = "move";
                                  }}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = "move";
                                  }}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    const dragId = e.dataTransfer.getData("text/x-block-id");
                                    if (dragId) reorderBlocks(dragId, b.id);
                                  }}
                                  onClick={() => setSelectedBlockId(b.id)}
                                  className={classNames(
                                    "cursor-pointer rounded-2xl border p-4",
                                    selectedBlockId === b.id
                                      ? "border-[color:var(--color-brand-blue)] bg-blue-50"
                                      : "border-zinc-200 bg-white hover:bg-zinc-50",
                                  )}
                                >
                                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{b.type}</div>
                                  <div className="mt-3">{renderCreditFunnelBlocks({ blocks: [b], basePath })}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </main>
              </div>
            </div>
    </div>
  );
}

*/

type PageSeo = {
  title?: string;
  description?: string;
  imageUrl?: string;
  noIndex?: boolean;
  faviconUrl?: string;
};

type PageExecutionMetrics = {
  page_view: number;
  cta_click: number;
  form_submitted: number;
  booking_created: number;
  checkout_started: number;
  add_to_cart: number;
};

type PageExecutionSummary = {
  trackingReady: boolean;
  metaPixelReady: boolean;
  metaPixelId: string | null;
  metrics: PageExecutionMetrics;
};

type Page = {
  id: string;
  funnelId: string;
  title: string;
  slug: string;
  sortOrder: number;
  contentMarkdown: string;
  editorMode: "BLOCKS" | "CUSTOM_HTML" | "MARKDOWN";
  blocksJson: unknown;
  customHtml: string;
  draftHtml: string;
  customChatJson: unknown;
  seo: PageSeo | null;
  brief?: FunnelPageIntentProfile | null;
  executionSummary?: PageExecutionSummary | null;
  createdAt: string;
  updatedAt: string;
};

const FUNNEL_EDITOR_DRAFT_CACHE_PREFIX = "pa:funnel-editor-draft:v1:";

type FunnelEditorDraftCache = {
  version: 1;
  selectedPageId: string | null;
  dirtyPages: Page[];
  funnelBrief: FunnelBriefProfile | null;
  funnelBriefDirty: boolean;
  savedAt: string;
};

function getFunnelEditorDraftCacheKey(funnelId: string) {
  return `${FUNNEL_EDITOR_DRAFT_CACHE_PREFIX}${String(funnelId || "").trim()}`;
}

function clonePageDraftForCache(page: Page): Page {
  return {
    ...page,
    seo: page.seo ? { ...page.seo } : null,
    brief: page.brief ? { ...page.brief } : null,
  };
}

function cloneFunnelBriefForCache(brief: FunnelBriefProfile | null | undefined): FunnelBriefProfile | null {
  return brief ? { ...brief } : null;
}

function readFunnelEditorDraftCache(funnelId: string): FunnelEditorDraftCache | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(getFunnelEditorDraftCacheKey(funnelId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FunnelEditorDraftCache | null;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.dirtyPages)) return null;
    return {
      version: 1,
      selectedPageId: typeof parsed.selectedPageId === "string" && parsed.selectedPageId.trim() ? parsed.selectedPageId : null,
      dirtyPages: parsed.dirtyPages.filter((page) => page && typeof page === "object" && typeof page.id === "string"),
      funnelBrief: cloneFunnelBriefForCache(parsed.funnelBrief),
      funnelBriefDirty: Boolean(parsed.funnelBriefDirty),
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

type CreditForm = {
  id: string;
  slug: string;
  name: string;
};

type BookingCalendarLite = {
  id: string;
  title?: string;
  enabled?: boolean;
};

type BuilderSurfaceMode = "blocks" | "whole-page";
type WholePageViewMode = "preview" | "source" | "direction";

const WHOLE_PAGE_VIEW_META: Record<WholePageViewMode, { label: string; summary: string }> = {
  preview: {
    label: "Preview",
    summary: "See the current draft as the visitor would.",
  },
  source: {
    label: "Source",
    summary: "Inspect source and prepare scoped edits.",
  },
  direction: {
    label: "Direction",
    summary: "Review the page-design thread before you change the draft.",
  },
};

export function FunnelEditorClient({ basePath, funnelId }: { basePath: string; funnelId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const initialPageIdFromUrlRef = useRef<string | null>(null);
  const initialPageSelectionConsumedRef = useRef(false);
  const blankPageWizardAutoOpenRef = useRef<string | null>(null);
  useEffect(() => {
    if (initialPageIdFromUrlRef.current !== null) return;
    const pid = String(searchParams?.get("pageId") || "").trim();
    initialPageIdFromUrlRef.current = pid ? pid.slice(0, 120) : null;
  }, [searchParams]);

  type StripeProductLite = {
    id: string;
    name: string;
    description: string | null;
    defaultPrice: null | { id: string; unitAmount: number | null; currency: string };
  };
  const [stripeProducts, setStripeProducts] = useState<StripeProductLite[]>([]);
  const [stripeProductsBusy, setStripeProductsBusy] = useState(false);
  const [stripeProductsError, setStripeProductsError] = useState<string | null>(null);

  const loadStripeProducts = useCallback(async () => {
    if (stripeProductsBusy) return;
    setStripeProductsBusy(true);
    setStripeProductsError(null);
    try {
      const res = await fetch("/api/portal/funnel-builder/sales/products", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) {
        throw new Error((json && typeof json.error === "string" && json.error) || "Unable to load Stripe products");
      }
      const items = Array.isArray(json.products) ? (json.products as any[]) : [];
      const coerced: StripeProductLite[] = items
        .filter((p) => p && typeof p === "object")
        .map((p) => {
          const defaultPriceRaw = (p as any).defaultPrice;
          const defaultPrice =
            defaultPriceRaw && typeof defaultPriceRaw === "object"
              ? {
                  id: typeof defaultPriceRaw.id === "string" ? String(defaultPriceRaw.id) : "",
                  unitAmount:
                    typeof defaultPriceRaw.unitAmount === "number" && Number.isFinite(defaultPriceRaw.unitAmount)
                      ? defaultPriceRaw.unitAmount
                      : null,
                  currency: typeof defaultPriceRaw.currency === "string" ? String(defaultPriceRaw.currency) : "usd",
                }
              : null;

          return {
            id: typeof (p as any).id === "string" ? String((p as any).id) : "",
            name: typeof (p as any).name === "string" ? String((p as any).name) : "",
            description: typeof (p as any).description === "string" ? String((p as any).description) : null,
            defaultPrice: defaultPrice && defaultPrice.id ? defaultPrice : null,
          };
        })
        .filter((p) => p.id && p.name);
      setStripeProducts(coerced);
    } catch (e) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as any).message) : "Unable to load Stripe products";
      setStripeProductsError(msg || "Unable to load Stripe products");
    } finally {
      setStripeProductsBusy(false);
    }
  }, [stripeProductsBusy]);

  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [pages, setPages] = useState<Page[] | null>(null);
  const [dirtyPageIds, setDirtyPageIds] = useState<Record<string, boolean>>({});
  const [forms, setForms] = useState<CreditForm[] | null>(null);

  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedHeaderNavItemId, setSelectedHeaderNavItemId] = useState<string | null>(null);
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [pageIntentProfile, setPageIntentProfile] = useState<FunnelPageIntentProfile>(() => inferFunnelPageIntentProfile());
  const [briefPanelOpen, setBriefPanelOpen] = useState(false);
  const [foundationWizardStep, setFoundationWizardStep] = useState(0);
  const [aiSidebarCustomCodeBlockId, setAiSidebarCustomCodeBlockId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savingPage, setSavingPage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [seoDirty, setSeoDirty] = useState(false);
  const [seoBusy, setSeoBusy] = useState(false);
  const [seoError, setSeoError] = useState<string | null>(null);
  const [funnelBookingDirty, setFunnelBookingDirty] = useState(false);
  const [funnelBookingBusy, setFunnelBookingBusy] = useState(false);
  const [funnelBookingError, setFunnelBookingError] = useState<string | null>(null);
  const [funnelBriefDirty, setFunnelBriefDirty] = useState(false);

  const [uploadingImageBlockId, setUploadingImageBlockId] = useState<string | null>(null);
  const [uploadingHeaderLogoBlockId, setUploadingHeaderLogoBlockId] = useState<string | null>(null);

  const [aiContextOpen, setAiContextOpen] = useState(false);
  const [aiContextKeys, setAiContextKeys] = useState<string[]>([]);
  void setAiContextKeys; // kept for API compatibility
  const [aiContextMedia, setAiContextMedia] = useState<Array<{ url: string; fileName?: string; mimeType?: string }>>([]);
  const [aiContextUploadBusy, setAiContextUploadBusy] = useState(false);
  const [lastAiRun, setLastAiRun] = useState<AiCheckpoint | null>(null);
  const aiContextUploadInputRef = useRef<HTMLInputElement | null>(null);

  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [previewMode, setPreviewMode] = useState<"edit" | "preview">("edit");
  const [builderSurfaceMode, setBuilderSurfaceMode] = useState<BuilderSurfaceMode>("blocks");
  const [wholePageViewMode, setWholePageViewMode] = useState<WholePageViewMode>("source");
  const [, setCustomCodeContextOpen] = useState(false);
  const [wholePageSyncNotice, setWholePageSyncNotice] = useState<string | null>(null);
  const [selectedHtmlRegionKey, setSelectedHtmlRegionKey] = useState<string | null>(null);
  const [htmlScopePickerOpen, setHtmlScopePickerOpen] = useState(false);
  const [busyPhaseIdx, setBusyPhaseIdx] = useState(0);
  const [aiResultBanner, setAiResultBanner] = useState<{ summary: string; at: string; tone: "success" | "warning" } | null>(null);
  const [aiWorkFocus, setAiWorkFocus] = useState<null | {
    mode: "builder" | "page";
    label: string;
    phase: "pending" | "settled";
    regionKey: string | null;
    blockId: string | null;
  }>(null);
  const [htmlChangeActivity, setHtmlChangeActivity] = useState<HtmlChangeActivityItem[]>([]);
  const [builderChangeActivity, setBuilderChangeActivity] = useState<BuilderChangeActivityItem[]>([]);
  const [sidebarPanel, setSidebarPanel] = useState<SidebarPanelMode>("structure");

  const [dialog, setDialog] = useState<FunnelEditorDialog>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const portalVariant: PortalVariant = basePath === "/credit" ? "credit" : "portal";
  // hostedBasePath is the public-facing URL prefix used in generated block embed URLs
  // (formEmbed, calendarEmbed). Different from basePath which is the portal nav path.
  const hostedBasePath = portalVariant === "credit" ? "/credit" : "";
  const builderTopLevelPanel = sidebarPanel;

  const platformTargetHost = useMemo(() => {
    if (typeof window !== "undefined") return window.location.hostname || null;

    const raw = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
    if (!raw) return null;
    try {
      return new URL(raw).hostname || null;
    } catch {
      return null;
    }
  }, []);

  const isLocalPreview = useMemo(() => {
    const h = (platformTargetHost || "").trim().toLowerCase();
    return h === "localhost" || h.endsWith(".local") || h === "127.0.0.1";
  }, [platformTargetHost]);

  const allFontPreviewGoogleCss = useMemo(() => {
    const lines = FONT_PRESETS.map((p) => googleFontImportCss(p.googleFamily)).filter(Boolean) as string[];
    return lines.length ? lines.join("\n") : null;
  }, []);

  const funnelLiveHref = useMemo(() => {
    const assignedDomain = String(funnel?.assignedDomain || "").trim().toLowerCase();
    const slug = String(funnel?.slug || "").trim();
    const funnelId = String(funnel?.id || "").trim();
    if (!slug) return null;

    if (assignedDomain) {
      if (isLocalPreview) return `/domain-router/${encodeURIComponent(assignedDomain)}/${encodeURIComponent(slug)}`;
      return `https://${assignedDomain}/${encodeURIComponent(slug)}`;
    }

    const hostedPath = hostedFunnelPath(slug, funnelId);
    return hostedPath ? toPurelyHostedUrl(hostedPath) : null;
  }, [funnel?.assignedDomain, funnel?.slug, funnel?.id, isLocalPreview]);

  const [brandPalette, setBrandPalette] = useState<null | { primary?: string; accent?: string; text?: string }>(null);
  const [businessProfileSummary, setBusinessProfileSummary] = useState<BusinessProfileSummary | null>(null);
  const [foundationArtifact, setFoundationArtifact] = useState<FunnelFoundationArtifact | null>(null);
  const [foundationArtifactBusy, setFoundationArtifactBusy] = useState(false);
  const [foundationArtifactError, setFoundationArtifactError] = useState<string | null>(null);

  const [aiReceptionistChatAgentId, setAiReceptionistChatAgentId] = useState<string | null>(null);
  const [availableAgentOptions, setAvailableAgentOptions] = useState<Array<{ id: string; name?: string }>>([]);

  const [bookingCalendars, setBookingCalendars] = useState<BookingCalendarLite[]>([]);
  const [bookingSiteSlug, setBookingSiteSlug] = useState<string | null>(null);

  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] = useState<
    | null
    | { type: "ai-context" }
    | { type: "image-block"; blockId: string }
    | { type: "video-block"; blockId: string }
    | { type: "video-poster"; blockId: string }
    | { type: "header-logo"; blockId: string }
    | { type: "section-background"; blockId: string }
    | { type: "section-background-video"; blockId: string }
    | { type: "chatbot-launcher"; blockId: string }
  >(null);

  const [imageCropTarget, setImageCropTarget] = useState<null | { blockId: string; src: string }>(null);

  const [videoSettingsBlockId, setVideoSettingsBlockId] = useState<string | null>(null);

  const [pageFaviconPickerOpen, setPageFaviconPickerOpen] = useState(false);

  const selectedPage = useMemo(
    () => (pages || []).find((p) => p.id === selectedPageId) || null,
    [pages, selectedPageId],
  );
  const pagesRef = useRef<Page[] | null>(null);
  const dirtyPageIdsRef = useRef<Record<string, boolean>>({});
  const selectedPageIdRef = useRef<string | null>(null);
  const restoredPageUiStateRef = useRef<Record<string, boolean>>({});
  const restoredHtmlActivityRef = useRef<string | null>(null);
  const funnelRef = useRef<Funnel | null>(null);
  const funnelBriefDirtyRef = useRef(false);
  const pageLocalVersionRef = useRef<Record<string, number>>({});
  const pageSaveRequestRef = useRef<Record<string, number>>({});
  const funnelBriefVersionRef = useRef(0);
  const foundationArtifactRequestRef = useRef(0);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    dirtyPageIdsRef.current = dirtyPageIds;
  }, [dirtyPageIds]);

  useEffect(() => {
    selectedPageIdRef.current = selectedPageId;
  }, [selectedPageId]);

  useEffect(() => {
    funnelRef.current = funnel;
  }, [funnel]);

  useEffect(() => {
    funnelBriefDirtyRef.current = funnelBriefDirty;
  }, [funnelBriefDirty]);
  const routeScopedIntentProfile = useMemo(
    () => inferFunnelPageIntentProfile({
      existing: selectedPage?.brief || extractFunnelPageIntentProfile(selectedPage?.customChatJson),
      funnelBrief: funnel?.brief ?? null,
      funnelName: funnel?.name,
      funnelSlug: funnel?.slug,
      pageTitle: selectedPage?.title,
      pageSlug: selectedPage?.slug,
    }),
    [funnel?.brief, funnel?.name, funnel?.slug, selectedPage?.brief, selectedPage?.customChatJson, selectedPage?.slug, selectedPage?.title],
  );
  const selectedPageGraph = useMemo(() => buildFunnelPageGraph(selectedPage), [selectedPage]);
  const selectedPageLensUi = useMemo(() => getFunnelPageLensUiModel(selectedPage), [selectedPage]);
  const selectedPageEditorMode = selectedPage?.editorMode ?? null;
  const selectedPageSupportsBlocksSurface = useMemo(() => {
    if (!selectedPage) return false;
    return selectedPageGraph.capabilities.supportsStructuredLayout;
  }, [selectedPage, selectedPageGraph.capabilities.supportsStructuredLayout]);

  useEffect(() => {
    if (!selectedPageId || !selectedPageEditorMode) {
      stageAutoStateRef.current = { pageId: null, editorMode: null, sourceMode: null, onlyCodeIsland: false };
      setBuilderSurfaceMode("blocks");
      setWholePageViewMode("source");
      setSelectedHtmlRegionKey(null);
      setWholePageSyncNotice(null);
    }
  }, [selectedPageEditorMode, selectedPageId]);

  useEffect(() => {
    setPageIntentProfile(routeScopedIntentProfile);
  }, [routeScopedIntentProfile]);

  useEffect(() => {
    if (!funnelId) return;
    if (restoredHtmlActivityRef.current === funnelId) return;
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(`funnel-builder:html-activity:${funnelId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        const restored = readPersistedHtmlChangeActivity(parsed);
        if (restored.length) setHtmlChangeActivity(restored);
      }
    } catch {
      // ignore restore failures
    }

    restoredHtmlActivityRef.current = funnelId;
  }, [funnelId]);

  useEffect(() => {
    if (!funnelId || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(`funnel-builder:html-activity:${funnelId}`, JSON.stringify(htmlChangeActivity.slice(0, 24)));
    } catch {
      // ignore persistence failures
    }
  }, [funnelId, htmlChangeActivity]);

  const selectedPageHtmlChangeActivity = useMemo(() => {
    if (!selectedPage?.id) return [] as HtmlChangeActivityItem[];
    return htmlChangeActivity.filter((item) => item.pageId === selectedPage.id).slice(0, 8);
  }, [htmlChangeActivity, selectedPage?.id]);
  const selectedPageBuilderChangeActivity = useMemo(() => {
    if (!selectedPage?.id) return [] as BuilderChangeActivityItem[];
    return builderChangeActivity.filter((item) => item.pageId === selectedPage.id).slice(0, 8);
  }, [builderChangeActivity, selectedPage?.id]);
  const selectedPageThreadRounds = useMemo(() => parseCustomChatThread(selectedPage?.customChatJson), [selectedPage?.customChatJson]);
  const selectedPageChatThread = useMemo<ChatThreadRound[]>(() => selectedPageThreadRounds, [selectedPageThreadRounds]);

  const selectedPageLatestAiCheckpoint = useMemo(() => {
    if (!selectedPage?.id || !lastAiRun || lastAiRun.pageId !== selectedPage.id) return null;
    return lastAiRun;
  }, [lastAiRun, selectedPage?.id]);
  const requestBackgroundVisualReview = useCallback(
    async (input: {
      funnelId: string;
      pageId: string;
      surface: "structure" | "source";
      prompt: string;
      html: string;
      css?: string;
      renderHtml?: string | null;
      previewDevice: "desktop" | "mobile";
      at: string;
      intentProfile?: Record<string, unknown> | null;
      funnelBrief?: Record<string, unknown> | null;
    }) => {
      const settle = (result: { warnings: string[]; summary?: string | null; visualReviewed?: boolean }) => {
        setLastAiRun((current) => {
          if (!current || current.pageId !== input.pageId || current.at !== input.at) return current;
          return {
            ...current,
            warnings: Array.from(new Set([...(current.warnings || []), ...result.warnings])).slice(0, 4),
            backgroundReviewStatus: "complete",
            backgroundReviewSummary: result.summary?.trim() ? result.summary.trim() : current.backgroundReviewSummary || null,
            backgroundReviewMode: result.visualReviewed ? "visual" : "structural",
          };
        });
      };

      if (!String(input.html || "").trim() && !String(input.css || "").trim()) {
        settle({ warnings: [] });
        return;
      }

      try {
        const previewImageDataUrl = input.renderHtml
          ? await captureRenderedPreviewDataUrl({ html: input.renderHtml, previewDevice: input.previewDevice }).catch(() => "")
          : "";
        const res = await fetch("/api/portal/funnel-builder/visual-review", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            funnelId: input.funnelId,
            pageId: input.pageId,
            surface: input.surface,
            prompt: input.prompt,
            html: input.html,
            css: input.css || "",
            previewImageDataUrl,
            intentProfile: input.intentProfile || null,
            funnelBrief: input.funnelBrief || null,
          }),
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json || json.ok !== true) {
          settle({ warnings: [] });
          return;
        }

        const warnings = Array.isArray(json?.warnings)
          ? json.warnings
              .filter((item: unknown) => typeof item === "string" && item.trim())
              .map((item: string) => item.trim())
          : [];
        const backgroundReviewSummary = typeof json?.summary === "string" ? json.summary.trim() : "";
        settle({ warnings, summary: backgroundReviewSummary, visualReviewed: Boolean(json?.visualReviewed) });
      } catch {
        settle({ warnings: [] });
      }
    },
    [],
  );
  const selectedPageIndex = useMemo(() => {
    if (!pages || !selectedPageId) return -1;
    return pages.findIndex((page) => page.id === selectedPageId);
  }, [pages, selectedPageId]);
  const selectedPageIsEntryPage = selectedPageIndex === 0;

  const writeDraftCache = useCallback(() => {
    if (typeof window === "undefined") return;

    try {
      const dirtyIds = Object.keys(dirtyPageIdsRef.current).filter((pageId) => dirtyPageIdsRef.current[pageId]);
      const dirtyPages = (pagesRef.current || [])
        .filter((page) => dirtyIds.includes(page.id))
        .slice(0, 12)
        .map((page) => clonePageDraftForCache(page));

      if (!dirtyPages.length && !funnelBriefDirtyRef.current) {
        window.sessionStorage.removeItem(getFunnelEditorDraftCacheKey(funnelId));
        return;
      }

      const payload: FunnelEditorDraftCache = {
        version: 1,
        selectedPageId: selectedPageIdRef.current,
        dirtyPages,
        funnelBrief: funnelBriefDirtyRef.current ? cloneFunnelBriefForCache(funnelRef.current?.brief) : null,
        funnelBriefDirty: funnelBriefDirtyRef.current,
        savedAt: new Date().toISOString(),
      };

      window.sessionStorage.setItem(getFunnelEditorDraftCacheKey(funnelId), JSON.stringify(payload));
    } catch {
      // Ignore draft cache write failures; local editor state still remains live in memory.
    }
  }, [funnelId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timeoutId = window.setTimeout(() => {
      writeDraftCache();
    }, 120);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [writeDraftCache, pages, dirtyPageIds, selectedPageId, funnel?.brief, funnelBriefDirty]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const flushDraftCache = () => {
      writeDraftCache();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushDraftCache();
    };

    window.addEventListener("pagehide", flushDraftCache);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushDraftCache);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [writeDraftCache]);

  const latestSelectedPageHtmlChange = selectedPageHtmlChangeActivity[0] || null;
  const pageActivityCount =
    selectedPageBuilderChangeActivity.length +
    selectedPageHtmlChangeActivity.length +
    selectedPageThreadRounds.length;
  const selectedPageRecentActivity = useMemo<SavedChangeFeedItem[]>(() => {
    const builderEntries = selectedPageBuilderChangeActivity.filter(isSavedBuilderActivityItem).map((item) => ({
      id: `builder-${item.id}`,
      at: item.at,
      headline: buildBuilderActivityHeadline(item),
      countLabel: buildBuilderActivityCountLabel(item),
      tone: buildBuilderActivityTone(item),
    }));
    const htmlEntries = selectedPageHtmlChangeActivity.filter(isSavedHtmlActivityItem).map((item) => ({
      id: `html-${item.id}`,
      at: item.at,
      headline: buildHtmlActivityLabel(item),
      countLabel: buildHtmlActivityCountLabel(item),
      tone: buildHtmlActivityTone(item),
    }));

    return [...builderEntries, ...htmlEntries]
      .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
      .slice(0, RECENT_SAVED_CHANGE_LIMIT);
  }, [selectedPageBuilderChangeActivity, selectedPageHtmlChangeActivity]);
  const directionFoundationStatusLabel =
    foundationArtifactBusy ? "Refreshing read" : foundationArtifact?.source === "ai" ? "AI synthesized" : "Structured fallback";
  const directionFoundationStatusClassName = foundationArtifactBusy
    ? "border-blue-200 bg-blue-50 text-blue-800"
    : foundationArtifact?.source === "ai"
      ? "border-violet-200 bg-violet-50 text-violet-800"
      : "border-zinc-200 bg-zinc-100 text-zinc-700";
  const enabledBookingCalendars = useMemo(
    () => bookingCalendars.filter((calendar) => calendar.enabled !== false),
    [bookingCalendars],
  );

  const latestSourceHighlightRange = useMemo(() => {
    if (!latestSelectedPageHtmlChange?.diff.changed) return null;
    const startLine = latestSelectedPageHtmlChange.diff.currentStartLine;
    const endLine = latestSelectedPageHtmlChange.diff.currentEndLine;
    if (!startLine || !endLine) return null;
    return { startLine, endLine };
  }, [latestSelectedPageHtmlChange]);

  const appendHtmlChangeActivity = useCallback((item: HtmlChangeActivityItem) => {
    setHtmlChangeActivity((prev) => [item, ...prev].slice(0, 24));
  }, []);
  const appendBuilderChangeActivity = useCallback((item: BuilderChangeActivityItem) => {
    setBuilderChangeActivity((prev) => [item, ...prev].slice(0, 24));
  }, []);

  type PageHistorySnapshot = Pick<Page, "editorMode" | "blocksJson" | "customHtml" | "draftHtml" | "customChatJson"> & {
    selectedBlockId: string | null;
  };

  type PageHistoryState = {
    undo: PageHistorySnapshot[];
    redo: PageHistorySnapshot[];
    last?: { actionKey: string; at: number };
  };

  const historyRef = useRef<Map<string, PageHistoryState>>(new Map());
  const restoringHistoryRef = useRef(false);
  const [historyTick, setHistoryTick] = useState(0);
  const stageAutoStateRef = useRef<{
    pageId: string | null;
    editorMode: Page["editorMode"] | null;
    sourceMode: ReturnType<typeof buildFunnelPageGraph>["sourceMode"] | null;
    onlyCodeIsland: boolean;
  }>({ pageId: null, editorMode: null, sourceMode: null, onlyCodeIsland: false });
  const pendingBlankPagePreviewRef = useRef<string | null>(null);

  const getPageHistory = useCallback((pageId: string): PageHistoryState => {
    const existing = historyRef.current.get(pageId);
    if (existing) return existing;
    const fresh: PageHistoryState = { undo: [], redo: [] };
    historyRef.current.set(pageId, fresh);
    return fresh;
  }, []);

  const captureSnapshot = useCallback(
    (p: Page): PageHistorySnapshot => ({
      editorMode: p.editorMode,
      blocksJson: p.blocksJson,
      customHtml: p.customHtml,
      draftHtml: p.draftHtml,
      customChatJson: p.customChatJson,
      selectedBlockId,
    }),
    [selectedBlockId],
  );

  const pushUndoSnapshot = useCallback(
    (actionKey: string, coalesceWindowMs: number) => {
      if (!selectedPage) return;
      if (restoringHistoryRef.current) return;
      const hist = getPageHistory(selectedPage.id);
      const now = Date.now();

      if (hist.last && hist.last.actionKey === actionKey && now - hist.last.at < coalesceWindowMs) {
        hist.last.at = now;
        return;
      }

      hist.undo.push(captureSnapshot(selectedPage));
      if (hist.undo.length > 100) hist.undo.splice(0, hist.undo.length - 100);
      hist.redo = [];
      hist.last = { actionKey, at: now };
      setHistoryTick((t) => t + 1);
    },
    [captureSnapshot, getPageHistory, selectedPage],
  );

  const canUndo = Boolean(selectedPage?.id && historyTick >= 0 && getPageHistory(selectedPage.id).undo.length > 0);
  const canRedo = Boolean(selectedPage?.id && historyTick >= 0 && getPageHistory(selectedPage.id).redo.length > 0);

  const applySnapshot = useCallback(
    (pageId: string, snap: PageHistorySnapshot) => {
      restoringHistoryRef.current = true;
      pageLocalVersionRef.current[pageId] = (pageLocalVersionRef.current[pageId] || 0) + 1;
      setDirtyPageIds((prev) => ({ ...prev, [pageId]: true }));
      setPages((prev) =>
        (prev || []).map((p) =>
          p.id === pageId
            ? ({
                ...p,
                editorMode: snap.editorMode,
                blocksJson: snap.blocksJson,
                customHtml: snap.customHtml,
                draftHtml: snap.draftHtml ?? "",
                customChatJson: snap.customChatJson,
              } as Page)
            : p,
        ),
      );
      setSelectedBlockId(snap.selectedBlockId);
      queueMicrotask(() => {
        restoringHistoryRef.current = false;
      });
    },
    [],
  );

  const undo = useCallback(() => {
    if (!selectedPage) return;
    const hist = getPageHistory(selectedPage.id);
    const prev = hist.undo.pop();
    if (!prev) return;
    hist.redo.push(captureSnapshot(selectedPage));
    hist.last = undefined;
    setHistoryTick((t) => t + 1);
    applySnapshot(selectedPage.id, prev);
  }, [applySnapshot, captureSnapshot, getPageHistory, selectedPage]);

  const redo = useCallback(() => {
    if (!selectedPage) return;
    const hist = getPageHistory(selectedPage.id);
    const next = hist.redo.pop();
    if (!next) return;
    hist.undo.push(captureSnapshot(selectedPage));
    hist.last = undefined;
    setHistoryTick((t) => t + 1);
    applySnapshot(selectedPage.id, next);
  }, [applySnapshot, captureSnapshot, getPageHistory, selectedPage]);

  useEffect(() => {
    historyRef.current.clear();
    setHistoryTick((t) => t + 1);
  }, [funnelId]);

  const removeBlockRef = useRef<(blockId: string) => void>(() => {
    // no-op until initialized
  });

  useEffect(() => {
    const isTextInputLike = (el: Element | null) => {
      if (!el) return false;
      const tag = (el as any).tagName ? String((el as any).tagName).toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      return Boolean((el as any).isContentEditable);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const keyboardBlocksSurfaceActive = Boolean(selectedPage && selectedPageSupportsBlocksSurface && builderSurfaceMode === "blocks");
      if (!selectedPage) return;
      if (!keyboardBlocksSurfaceActive) return;
      if (!selectedBlockId) return;
      if (busy) return;
      if (dialog) return;
      if (mediaPickerOpen) return;
      if (e.key !== "Backspace" && e.key !== "Delete") return;
      if (isTextInputLike(document.activeElement)) return;
      e.preventDefault();
      removeBlockRef.current(selectedBlockId);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedPage, selectedPageSupportsBlocksSurface, builderSurfaceMode, selectedBlockId, busy, dialog, mediaPickerOpen]);

  useEffect(() => {
    const isTextInputLike = (el: Element | null) => {
      if (!el) return false;
      const tag = (el as any).tagName ? String((el as any).tagName).toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      return Boolean((el as any).isContentEditable);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!selectedPage) return;
      if (busy) return;
      if (dialog) return;
      if (mediaPickerOpen) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (isTextInputLike(document.activeElement)) return;

      const key = (e.key || "").toLowerCase();
      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (key === "y") {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, dialog, mediaPickerOpen, redo, selectedPage, undo]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/portal/business-profile", {
          cache: "no-store",
          headers: { [PORTAL_VARIANT_HEADER]: portalVariant },
        });
        const json = (await res.json().catch(() => null)) as any;
        const p = json?.profile;
        const primary = typeof p?.brandPrimaryHex === "string" ? p.brandPrimaryHex.trim() : "";
        const accent = typeof p?.brandAccentHex === "string" ? p.brandAccentHex.trim() : "";
        const text = typeof p?.brandTextHex === "string" ? p.brandTextHex.trim() : "";
        const businessName = typeof p?.businessName === "string" ? p.businessName.trim() : "";
        const industry = typeof p?.industry === "string" ? p.industry.trim() : "";
        const businessModel = typeof p?.businessModel === "string" ? p.businessModel.trim() : "";
        const targetCustomer = typeof p?.targetCustomer === "string" ? p.targetCustomer.trim() : "";
        const brandVoice = typeof p?.brandVoice === "string" ? p.brandVoice.trim() : "";
        const businessContext = typeof p?.businessContext === "string" ? p.businessContext.trim() : "";
        const primaryGoals = normalizeBusinessProfileGoals(p?.primaryGoals);
        const next = {
          primary: isHexColor(primary) ? primary : undefined,
          accent: isHexColor(accent) ? accent : undefined,
          text: isHexColor(text) ? text : undefined,
        };
        if (!cancelled) {
          setBrandPalette(next.primary || next.accent || next.text ? next : null);
          setBusinessProfileSummary(
            businessName || industry || businessModel || targetCustomer || brandVoice || businessContext || primaryGoals.length
              ? {
                  businessName,
                  industry,
                  businessModel,
                  targetCustomer,
                  brandVoice,
                  businessContext,
                  primaryGoals,
                }
              : null,
          );
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [portalVariant]);

  const brandSwatches = useMemo(() => {
    if (!brandPalette) return [] as string[];
    return [brandPalette.primary, brandPalette.accent, brandPalette.text].filter((x): x is string => !!x && isHexColor(x));
  }, [brandPalette]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/portal/ai-receptionist/settings", {
          cache: "no-store",
          headers: { [PORTAL_VARIANT_HEADER]: portalVariant },
        });
        const json = (await res.json().catch(() => null)) as any;
        const chatId = typeof json?.settings?.chatAgentId === "string" ? json.settings.chatAgentId.trim() : "";
        if (!cancelled) {
          setAiReceptionistChatAgentId(chatId || null);
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [portalVariant]);

  const BUSY_PHASES = ["Planning structure", "Drafting page", "Repairing weak spots", "Preparing preview"];
  const busyPhasesLen = BUSY_PHASES.length;
  useEffect(() => {
    if (!busy) { setBusyPhaseIdx(0); return; }
    const id = setInterval(() => setBusyPhaseIdx((prev) => Math.min(prev + 1, busyPhasesLen - 1)), 2600);
    return () => clearInterval(id);
  }, [busy, busyPhasesLen]);

  useEffect(() => {
    if (!aiResultBanner) return;
    const id = setTimeout(() => setAiResultBanner(null), 7000);
    return () => clearTimeout(id);
  }, [aiResultBanner]);

  useEffect(() => {
    if (aiWorkFocus?.phase !== "settled") return;
    const id = setTimeout(() => {
      setAiWorkFocus((prev) => (prev?.phase === "settled" ? null : prev));
    }, 1600);
    return () => clearTimeout(id);
  }, [aiWorkFocus]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/portal/ai-agents", {
          cache: "no-store",
          headers: { [PORTAL_VARIANT_HEADER]: portalVariant },
        });
        const json = (await res.json().catch(() => null)) as any;
        const agents = Array.isArray(json?.agents) ? (json.agents as any[]) : [];
        const normalized = agents
          .map((a) => ({
            id: typeof a?.id === "string" ? a.id.trim() : "",
            name: typeof a?.name === "string" ? a.name.trim() : "",
          }))
          .filter((a) => a.id)
          .slice(0, 200);

        if (!cancelled) setAvailableAgentOptions(normalized);
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [portalVariant]);

  // NOTE: While the DB schema supports larger rows, many serverless hosts (incl. Vercel)
  // impose a relatively small request-body limit for function invocations. In practice,
  // uploads above a few MB may never reach our handler.
  const MAX_MEDIA_LIBRARY_BYTES = 4 * 1024 * 1024; // ~4MB per file (direct-to-API)
  const MAX_UPLOADS_BYTES = 250 * 1024 * 1024; // 250MB per file (disk-backed)

  const uploadToMediaLibrary = async (files: FileList | File[], opts?: { maxFiles?: number }) => {
    const maxFiles = Math.max(1, Math.min(20, Math.floor(opts?.maxFiles ?? 20)));
    const list = Array.from(files || []).filter(Boolean).slice(0, maxFiles);
    if (!list.length) return [] as PortalMediaPickItem[];

    const tooLarge = list.find((f) => f.size > MAX_MEDIA_LIBRARY_BYTES);
    if (tooLarge) {
      throw new Error(`"${tooLarge.name}" is too large (max ${Math.floor(MAX_MEDIA_LIBRARY_BYTES / (1024 * 1024))}MB)`);
    }

    const form = new FormData();
    for (const f of list) form.append("files", f);

    const res = await fetch("/api/portal/media/items", {
      method: "POST",
      headers: { [PORTAL_VARIANT_HEADER]: portalVariant },
      body: form,
    });
    const contentType = String(res.headers.get("content-type") || "").toLowerCase();
    const json = contentType.includes("application/json") ? ((await res.json().catch(() => null)) as any) : null;

    if (!res.ok) {
      if (res.status === 413) {
        throw new Error(
          `This file is too large to upload directly. Try a smaller file or configure external storage for larger uploads.`,
        );
      }
      throw new Error(typeof json?.error === "string" ? json.error : "Failed to upload media");
    }

    if (!json || json.ok !== true) throw new Error("Failed to upload media");
    return Array.isArray(json.items) ? (json.items as PortalMediaPickItem[]) : [];
  };

  const uploadToUploads = async (file: File): Promise<{ url: string; mediaItem?: PortalMediaPickItem | null }> => {
    if (!file) throw new Error("Missing file");
    if (file.size > MAX_UPLOADS_BYTES) {
      throw new Error(`"${file.name}" is too large (max ${Math.floor(MAX_UPLOADS_BYTES / (1024 * 1024))}MB)`);
    }

    // Prefer the DB-backed media library for any file within its size limit.
    // This works for small videos too and avoids relying on /api/uploads (filesystem) or Blob.
    if (file.size <= MAX_MEDIA_LIBRARY_BYTES) {
      const items = await uploadToMediaLibrary([file], { maxFiles: 1 });
      const first = items[0];
      const nextUrl = String(first?.shareUrl || "").trim();
      if (!nextUrl) throw new Error("Upload succeeded, but did not return a URL");
      return { url: nextUrl, mediaItem: first ?? null };
    }

    // At this point, the file is bigger than we allow storing in the DB. Upload via Blob.
    let blob: PutBlobResult;
    try {
      blob = await uploadToVercelBlob(file.name || "upload.bin", file, {
        access: "public",
        handleUploadUrl: "/api/portal/media/blob-upload",
        headers: { [PORTAL_VARIANT_HEADER]: portalVariant },
      });
    } catch (e) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as any).message) : "Blob upload failed";
      throw new Error(msg || "Blob upload failed");
    }

    // Create a media library item that points to the blob.
    const finalizeRes = await fetch("/api/portal/media/items/from-blob", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [PORTAL_VARIANT_HEADER]: portalVariant,
      },
      body: JSON.stringify({
        url: blob.url,
        fileName: file.name || blob.pathname || "upload.bin",
        mimeType: file.type || blob.contentType || "application/octet-stream",
        fileSize: Number.isFinite(file.size) ? file.size : 0,
        folderId: null,
      }),
    });
    const finalizeJson = (await finalizeRes.json().catch(() => null)) as any;
    if (!finalizeRes.ok || !finalizeJson || finalizeJson.ok !== true || !finalizeJson.item) {
      throw new Error(
        typeof finalizeJson?.error === "string"
          ? finalizeJson.error
          : "Upload succeeded, but could not add to media library",
      );
    }

    const mediaItem = finalizeJson.item as PortalMediaPickItem;
    const nextUrl = String(mediaItem.shareUrl || blob.url || "").trim();
    if (!nextUrl) throw new Error("Upload did not return a URL");
    return { url: nextUrl, mediaItem };
  };

  const uploadAiContextFiles = async (files: FileList | File[]) => {
    const list = Array.from(files || [])
      .filter(Boolean)
      .slice(0, 10);
    if (!list.length) return;

    setAiContextUploadBusy(true);
    try {
      const uploaded: Array<{ url: string; fileName?: string; mimeType?: string }> = [];

      for (const f of list) {
        const { url, mediaItem } = await uploadToUploads(f);
        const nextUrl = String(url || "").trim();
        if (!nextUrl) continue;
        uploaded.push({
          url: nextUrl,
          fileName: String(mediaItem?.fileName || f.name || "").trim() || undefined,
          mimeType: String(mediaItem?.mimeType || f.type || "").trim() || undefined,
        });
      }

      if (!uploaded.length) {
        toast.error("Upload finished, but no files were added");
        return;
      }

      setAiContextMedia((prev) => {
        const map = new Map<string, { url: string; fileName?: string; mimeType?: string }>();
        for (const it of prev || []) {
          const u = String(it?.url || "").trim();
          if (!u) continue;
          map.set(u, it);
        }
        for (const it of uploaded) map.set(it.url, it);
        return Array.from(map.values());
      });

      toast.success(`Uploaded ${uploaded.length} file${uploaded.length === 1 ? "" : "s"}`);
    } catch (e) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as any).message) : "Upload failed";
      toast.error(msg || "Upload failed");
    } finally {
      setAiContextUploadBusy(false);
    }
  };

  const closeDialog = () => {
    setDialog(null);
    setDialogError(null);
  };

  const openCreateForm = () => {
    setDialog({ type: "create-form", slug: "", name: "", templateKey: "credit-intake-premium", themeKey: "royal-indigo" });
    setDialogError(null);
  };

  const performCreateForm = async (args: { slug: string; name: string; templateKey: CreditFormTemplateKey; themeKey: CreditFormThemeKey }) => {
    const slug = normalizeSlug(args.slug);
    const name = args.name.trim();
    if (!slug) {
      setDialogError("Slug is required.");
      return;
    }

    setBusy(true);
    setDialogError(null);
    setError(null);

    try {
      const res = await fetch("/api/portal/funnel-builder/forms", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [PORTAL_VARIANT_HEADER]: portalVariant,
        },
        body: JSON.stringify({
          slug,
          name: name || undefined,
          templateKey: coerceCreditFormTemplateKey(args.templateKey),
          themeKey: coerceCreditFormThemeKey(args.themeKey),
        }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to create form");

      const created = json.form as CreditForm | undefined;
      await load();
      closeDialog();

      toast.success("Form created");
      if (created?.id) {
        router.push(`${basePath}/app/services/funnel-builder/forms/${encodeURIComponent(created.id)}/edit`, { scroll: false });
      }
    } catch (e) {
      const msg = (e as any)?.message ? String((e as any).message) : "Failed to create form";
      setDialogError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const formsBySlug = useMemo(() => {
    const m = new Map<string, CreditForm>();
    (forms || []).forEach((f) => m.set(f.slug, f));
    return m;
  }, [forms]);

  const selectedBlocks = useMemo(() => {
    if (!selectedPage) return [];
    const raw = coerceBlocksJson(selectedPage.blocksJson);
    return migrateLegacyAnchorBlocksIntoSections(raw);
  }, [selectedPage]);

  const pageSettingsBlock = useMemo(() => {
    const first = selectedBlocks[0];
    return first && first.type === "page" ? first : null;
  }, [selectedBlocks]);

  const editableBlocks = useMemo<CreditFunnelBlock[]>(() => {
    return selectedBlocks.filter((b) => b.type !== "page") as CreditFunnelBlock[];
  }, [selectedBlocks]);

  const saveableBlocks = useMemo(() => {
    return pageSettingsBlock ? [pageSettingsBlock, ...editableBlocks] : editableBlocks;
  }, [pageSettingsBlock, editableBlocks]);

  const blockTreeNeedsServerWholePageExport = useCallback((blocks: CreditFunnelBlock[]) => {
    const walk = (items: CreditFunnelBlock[]): boolean => {
      for (const block of items) {
        if (!block || typeof block !== "object") continue;
        if (block.type === "calendarEmbed") return true;

        if (block.type === "section") {
          const props = (block.props || {}) as Record<string, unknown>;
          const nestedKeys = ["children", "leftChildren", "rightChildren"] as const;
          for (const key of nestedKeys) {
            const nested = Array.isArray(props[key]) ? (props[key] as CreditFunnelBlock[]) : [];
            if (walk(nested)) return true;
          }
        }

        if (block.type === "columns") {
          const columns = Array.isArray((block.props as any)?.columns) ? ((block.props as any).columns as any[]) : [];
          for (const column of columns) {
            const nested = Array.isArray(column?.children) ? (column.children as CreditFunnelBlock[]) : [];
            if (walk(nested)) return true;
          }
        }
      }
      return false;
    };

    return walk(blocks);
  }, []);

  const buildWholePageDraftHtml = useCallback(
    (page: Pick<Page, "id" | "title">, blocks: CreditFunnelBlock[]): string | null => {
      const normalizedBlocks = Array.isArray(blocks) ? blocks.filter((block) => block && typeof block === "object") : [];
      if (blockTreeNeedsServerWholePageExport(normalizedBlocks)) return null;

      return blocksToCustomHtmlDocument({
        blocks: normalizedBlocks,
        pageId: page.id,
        ownerId: "",
        basePath: hostedBasePath,
        title: page.title || "Funnel page",
      });
    },
    [blockTreeNeedsServerWholePageExport, hostedBasePath],
  );

  const documentSwatches = useMemo(() => {
    if (!selectedBlocks.length) return [] as string[];
    const found: string[] = [];
    collectHexSwatchesFromUnknown(selectedBlocks, found);
    const unique = Array.from(new Set(found));
    return unique.slice(0, 28);
  }, [selectedBlocks]);

  const colorSwatches = useMemo(() => {
    const defaults = [
      "#ffffff",
      "#000000",
      "#0f172a",
      "#111827",
      "#1d4ed8",
      "#2563eb",
      "#10b981",
      "#f59e0b",
      "#ef4444",
      "#a855f7",
    ];
    // Put brand colors first so they are always easy to find.
    const all = [...brandSwatches, ...documentSwatches, ...defaults].filter((c) => isHexColor(c));
    return Array.from(new Set(all));
  }, [brandSwatches, documentSwatches]);

  const selectedChat = useMemo(() => {
    if (!selectedPage) return [];
    return Array.isArray(selectedPage.customChatJson)
      ? (stripFunnelPageIntentMessages<ChatMessage>(selectedPage.customChatJson) as ChatMessage[])
      : [];
  }, [selectedPage]);

  type BlockContainerKey = "root" | "children" | "leftChildren" | "rightChildren";
  type BlockContainerPath =
    | { key: "root" }
    | { key: "children" | "leftChildren" | "rightChildren"; sectionId: string }
    | { key: "columnChildren"; sectionId: string; columnIndex: number };

  const findBlockInTree = useCallback(
    (
      blocks: CreditFunnelBlock[],
      id: string,
      container: BlockContainerPath = { key: "root" },
    ): { block: CreditFunnelBlock; container: BlockContainerPath } | null => {
      for (const b of blocks) {
        if (b.id === id) return { block: b, container };
        if (b.type !== "section" && b.type !== "columns") continue;
        const props: any = b.props;
        if (b.type === "section") {
          const keys = ["children", "leftChildren", "rightChildren"] as const;
          for (const key of keys) {
            const arr = Array.isArray(props[key]) ? (props[key] as CreditFunnelBlock[]) : [];
            const nested = findBlockInTree(arr, id, { key, sectionId: b.id });
            if (nested) return nested;
          }
        }
        if (b.type === "columns") {
          const columns = Array.isArray(props.columns) ? (props.columns as any[]) : [];
          for (let i = 0; i < columns.length; i++) {
            const col = columns[i];
            const arr = col && typeof col === "object" && Array.isArray((col as any).children) ? ((col as any).children as CreditFunnelBlock[]) : [];
            const nested = findBlockInTree(arr, id, { key: "columnChildren", sectionId: b.id, columnIndex: i });
            if (nested) return nested;
          }
        }
      }
      return null;
    },
    [],
  );

  const replaceBlockInTree = useCallback((blocks: CreditFunnelBlock[], next: CreditFunnelBlock): CreditFunnelBlock[] => {
    let changed = false;
    const out = blocks.map((b) => {
      if (b.id === next.id) {
        changed = true;
        return next;
      }
      if (b.type !== "section" && b.type !== "columns") return b;
      const props: any = b.props;
      let propsChanged = false;
      const patched: any = { ...props };
      if (b.type === "section") {
        const keys = ["children", "leftChildren", "rightChildren"] as const;
        for (const key of keys) {
          const arr = Array.isArray(props[key]) ? (props[key] as CreditFunnelBlock[]) : undefined;
          if (!arr) continue;
          const nextArr = replaceBlockInTree(arr, next);
          if (nextArr !== arr) {
            patched[key] = nextArr;
            propsChanged = true;
          }
        }
      }
      if (b.type === "columns") {
        const columns = Array.isArray(props.columns) ? (props.columns as any[]) : [];
        if (columns.length) {
          const nextColumns = columns.map((c) => {
            if (!c || typeof c !== "object") return c;
            const arr = Array.isArray((c as any).children) ? ((c as any).children as CreditFunnelBlock[]) : undefined;
            if (!arr) return c;
            const nextArr = replaceBlockInTree(arr, next);
            if (nextArr === arr) return c;
            propsChanged = true;
            return { ...c, children: nextArr };
          });
          if (propsChanged) patched.columns = nextColumns;
        }
      }
      if (!propsChanged) return b;
      changed = true;
      return { ...b, props: patched } as CreditFunnelBlock;
    });
    return changed ? out : blocks;
  }, []);

  const removeBlockFromTree = useCallback((blocks: CreditFunnelBlock[], id: string): CreditFunnelBlock[] => {
    let changed = false;
    const out: CreditFunnelBlock[] = [];
    for (const b of blocks) {
      if (b.id === id) {
        changed = true;
        continue;
      }
      if (b.type !== "section" && b.type !== "columns") {
        out.push(b);
        continue;
      }
      const props: any = b.props;
      let propsChanged = false;
      const patched: any = { ...props };
      if (b.type === "section") {
        const keys = ["children", "leftChildren", "rightChildren"] as const;
        for (const key of keys) {
          const arr = Array.isArray(props[key]) ? (props[key] as CreditFunnelBlock[]) : undefined;
          if (!arr) continue;
          const nextArr = removeBlockFromTree(arr, id);
          if (nextArr !== arr) {
            patched[key] = nextArr.length ? nextArr : undefined;
            propsChanged = true;
          }
        }
      }
      if (b.type === "columns") {
        const columns = Array.isArray(props.columns) ? (props.columns as any[]) : [];
        if (columns.length) {
          const nextColumns = columns.map((c) => {
            if (!c || typeof c !== "object") return c;
            const arr = Array.isArray((c as any).children) ? ((c as any).children as CreditFunnelBlock[]) : undefined;
            if (!arr) return c;
            const nextArr = removeBlockFromTree(arr, id);
            if (nextArr === arr) return c;
            propsChanged = true;
            return { ...c, children: nextArr.length ? nextArr : undefined };
          });
          if (propsChanged) patched.columns = nextColumns;
        }
      }
      if (propsChanged) {
        changed = true;
        out.push({ ...b, props: patched } as CreditFunnelBlock);
      } else {
        out.push(b);
      }
    }
    return changed ? out : blocks;
  }, []);

  const findContainerForBlock = useCallback(
    (blocks: CreditFunnelBlock[], id: string): BlockContainerPath | null => {
      const found = findBlockInTree(blocks, id);
      if (!found) return null;
      const { container } = found;
      return container;
    },
    [findBlockInTree],
  );

  const findTopLevelBlockId = useCallback(
    (blocks: CreditFunnelBlock[], id: string): string | null => {
      for (const block of blocks) {
        if (block.id === id) return block.id;
        if (block.type !== "section" && block.type !== "columns") continue;
        if (findBlockInTree([block], id)) return block.id;
      }
      return null;
    },
    [findBlockInTree],
  );

  const selectedBlock = useMemo(() => {
    if (!selectedBlockId) return null;
    return findBlockInTree(editableBlocks, selectedBlockId)?.block || null;
  }, [editableBlocks, selectedBlockId, findBlockInTree]);

  const pageCustomCodeBlocks = useMemo(() => collectCustomCodeBlocks(editableBlocks), [editableBlocks]);
  const pageUiStateStorageKey = useMemo(
    () => (selectedPage?.id ? `funnel-builder:page-ui:${funnelId}:${selectedPage.id}` : null),
    [funnelId, selectedPage?.id],
  );

  const canonicalCustomCodeBlock = useMemo(() => {
    if (selectedBlock && selectedBlock.type === "customCode") return selectedBlock;

    if (aiSidebarCustomCodeBlockId) {
      const sidebarBlock = pageCustomCodeBlocks.find((block) => block.id === aiSidebarCustomCodeBlockId) || null;
      if (sidebarBlock) return sidebarBlock;
    }

    return pageCustomCodeBlocks.find((block) => isMeaningfulCustomCodeBlock(block)) || pageCustomCodeBlocks[0] || null;
  }, [aiSidebarCustomCodeBlockId, pageCustomCodeBlocks, selectedBlock]);

  const selectedOrCanonicalCustomCodeBlock = useMemo(() => {
    if (selectedBlock?.type === "customCode") return selectedBlock;
    return canonicalCustomCodeBlock;
  }, [canonicalCustomCodeBlock, selectedBlock]);

  useEffect(() => {
    if (!selectedPage?.id || !pageUiStateStorageKey) return;
    if (restoredPageUiStateRef.current[selectedPage.id]) return;
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(pageUiStateStorageKey);
      if (!raw) {
        restoredPageUiStateRef.current[selectedPage.id] = true;
        return;
      }

      const parsed = JSON.parse(raw) as {
        sidebarPanel?: unknown;
        selectedBlockId?: unknown;
        aiSidebarCustomCodeBlockId?: unknown;
      };

      const storedCustomCodeId = typeof parsed.aiSidebarCustomCodeBlockId === "string" ? parsed.aiSidebarCustomCodeBlockId : "";
      const storedSelectedBlockId = typeof parsed.selectedBlockId === "string" ? parsed.selectedBlockId : "";
      const storedSidebarPanel =
        parsed.sidebarPanel === "selected" || parsed.sidebarPanel === "structure"
          ? parsed.sidebarPanel
          : parsed.sidebarPanel === "ai"
            ? "activity"
            : parsed.sidebarPanel === "page"
              ? "settings"
              : parsed.sidebarPanel === "activity" || parsed.sidebarPanel === "settings"
                ? parsed.sidebarPanel
                : null;

      if (storedCustomCodeId && pageCustomCodeBlocks.some((block) => block.id === storedCustomCodeId)) {
        setAiSidebarCustomCodeBlockId(storedCustomCodeId);
      }

      if (storedSelectedBlockId && findBlockInTree(editableBlocks, storedSelectedBlockId)?.block) {
        setSelectedBlockId(storedSelectedBlockId);
      }

      if (storedSidebarPanel === "selected" && (storedSelectedBlockId || storedCustomCodeId || canonicalCustomCodeBlock)) {
        setSidebarPanel("selected");
      }

      restoredPageUiStateRef.current[selectedPage.id] = true;
    } catch {
      restoredPageUiStateRef.current[selectedPage.id] = true;
    }
  }, [canonicalCustomCodeBlock, editableBlocks, findBlockInTree, pageCustomCodeBlocks, pageUiStateStorageKey, selectedPage?.id]);

  useEffect(() => {
    if (!pageUiStateStorageKey || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        pageUiStateStorageKey,
        JSON.stringify({
          sidebarPanel,
          selectedBlockId,
          aiSidebarCustomCodeBlockId,
        }),
      );
    } catch {
      // ignore persistence failures
    }
  }, [aiSidebarCustomCodeBlockId, pageUiStateStorageKey, selectedBlockId, sidebarPanel]);

  useEffect(() => {
    if (sidebarPanel !== "selected") return;
    if (selectedBlock) return;
    if (canonicalCustomCodeBlock) {
      setSelectedBlockId(canonicalCustomCodeBlock.id);
      setAiSidebarCustomCodeBlockId((prev) => prev || canonicalCustomCodeBlock.id);
      return;
    }
    setSidebarPanel("structure");
  }, [canonicalCustomCodeBlock, selectedBlock, sidebarPanel]);

  const selectedCustomCodeSnapshot = useMemo(() => {
    if (!selectedOrCanonicalCustomCodeBlock || selectedOrCanonicalCustomCodeBlock.type !== "customCode") return null;

    const props = (selectedOrCanonicalCustomCodeBlock.props as any) || {};
    const chat = Array.isArray(props.chatJson) ? (props.chatJson as BlockChatMessage[]) : [];
    const persistedAuditTrail = readPersistedCustomCodeAuditTrail(props.aiHistoryJson);
    const html = String(props.html || "");
    const css = String(props.css || "");
    const heightPx = Number(props.heightPx);

    return {
      id: selectedOrCanonicalCustomCodeBlock.id,
      chat,
      persistedAuditTrail,
      html,
      css,
      htmlLineCount: countMeaningfulCodeLines(html),
      cssLineCount: countMeaningfulCodeLines(css),
      heightPx: Number.isFinite(heightPx) ? heightPx : 360,
      latestUserMessage: getLatestBlockChatMessage(chat, "user"),
      latestAssistantMessage: getLatestBlockChatMessage(chat, "assistant"),
    };
  }, [selectedOrCanonicalCustomCodeBlock]);

  const selectedCustomCodeActivity = useMemo(() => {
    if (!selectedPage?.id || !selectedOrCanonicalCustomCodeBlock || selectedOrCanonicalCustomCodeBlock.type !== "customCode") {
      return [] as CustomCodeAuditEntry[];
    }

    return builderChangeActivity
      .filter((item) => {
        if (item.pageId !== selectedPage.id) return false;
        if (item.targetBlockId) return item.targetBlockId === selectedOrCanonicalCustomCodeBlock.id;
        return item.scopeLabel === "Custom code block" && selectedOrCanonicalCustomCodeBlock.id === aiSidebarCustomCodeBlockId;
      })
      .slice(0, 4)
      .map((item) => ({
        id: item.id,
        at: item.at,
        prompt: compactActivityText(item.prompt, 180),
        summary: compactActivityText(item.summary, 180),
        kind: item.kind,
        previewChanged: item.previewChanged,
        builderDiff: item.diff,
        customCodeDiff: item.customCodeDiff || null,
        source: "activity" as const,
      }));
  }, [aiSidebarCustomCodeBlockId, builderChangeActivity, selectedOrCanonicalCustomCodeBlock, selectedPage?.id]);

  const selectedCustomCodeAuditTrail = useMemo(() => {
    const persistedAuditTrail = selectedCustomCodeSnapshot?.persistedAuditTrail;
    if (persistedAuditTrail?.length) return persistedAuditTrail;
    if (selectedCustomCodeActivity.length) return selectedCustomCodeActivity;
    return [] as CustomCodeAuditEntry[];
  }, [selectedCustomCodeActivity, selectedCustomCodeSnapshot]);
  const selectedCustomCodeSavedAuditTrail = useMemo(
    () => selectedCustomCodeAuditTrail.filter(isSavedCustomCodeAuditEntry).slice(0, RECENT_SAVED_CHANGE_LIMIT),
    [selectedCustomCodeAuditTrail],
  );
  useEffect(() => {
    if (!selectedBlock || selectedBlock.type !== "headerNav") {
      setSelectedHeaderNavItemId(null);
      return;
    }

    const items = Array.isArray((selectedBlock.props as any)?.items) ? (((selectedBlock.props as any).items as any[]) || []) : [];
    if (!items.length) {
      setSelectedHeaderNavItemId(null);
      return;
    }

    if (selectedHeaderNavItemId && items.some((item: any) => String(item?.id || "") === selectedHeaderNavItemId)) {
      return;
    }

    setSelectedHeaderNavItemId(String(items[0]?.id || ""));
  }, [selectedBlock, selectedHeaderNavItemId]);

  const blockOutlineItems = useMemo(() => {
    const items: Array<{ id: string; kind: string; detail: string; depth: number }> = [];

    const describeBlock = (block: CreditFunnelBlock) => {
      const props: any = block.props || {};
      const directText = normalizeInlineText(
        String(
          props.text ||
            props.label ||
            props.title ||
            props.formSlug ||
            props.calendarId ||
            props.anchorLabel ||
            props.mobileTriggerLabel ||
            "",
        ),
      );

      if (
        block.type === "salesCheckoutButton" ||
        block.type === "addToCartButton" ||
        block.type === "cartButton"
      ) {
        return { kind: "Commerce", detail: directText || "Checkout action" };
      }

      switch (block.type) {
        case "heading":
          return { kind: `H${props.level || 2}`, detail: directText || "Heading" };
        case "paragraph":
          return { kind: "Text", detail: directText || "Paragraph" };
        case "button":
          return { kind: "Button", detail: directText || "Button" };
        case "formEmbed":
          return { kind: "Form", detail: directText || "Embedded form" };
        case "formLink":
          return { kind: "Form link", detail: directText || "Open form" };
        case "image":
          return { kind: "Image", detail: directText || "Image block" };
        case "video":
          return { kind: "Video", detail: directText || "Video block" };
        case "columns":
          return { kind: "Columns", detail: `${Array.isArray(props.columns) ? props.columns.length : 0} columns` };
        case "section": {
          const firstHeading = Array.isArray(props.children)
            ? (props.children as CreditFunnelBlock[]).find((child) => child?.type === "heading")
            : null;
          const headingText = firstHeading ? normalizeInlineText(String((firstHeading.props as any)?.text || "")) : "";
          return { kind: "Section", detail: headingText || "Content section" };
        }
        case "customCode":
          return { kind: "Code", detail: "Custom block" };
        case "headerNav":
          return { kind: "Header", detail: "Navigation" };
        case "chatbot":
          return { kind: "Chatbot", detail: directText || "Assistant" };
        case "spacer":
          return { kind: "Spacer", detail: "Spacing" };
        default:
          return { kind: block.type, detail: directText || block.type };
      }
    };

    const visit = (blocks: CreditFunnelBlock[], depth: number) => {
      for (const block of blocks) {
        if (!block || typeof block !== "object") continue;
        const described = describeBlock(block);
        items.push({ id: block.id, kind: described.kind, detail: described.detail, depth });

        if (block.type === "section") {
          const props: any = block.props || {};
          const nestedKeys = ["children", "leftChildren", "rightChildren"] as const;
          for (const key of nestedKeys) {
            const nested = Array.isArray(props[key]) ? (props[key] as CreditFunnelBlock[]) : [];
            visit(nested, depth + 1);
          }
        }

        if (block.type === "columns") {
          const columns = Array.isArray((block.props as any)?.columns) ? ((block.props as any).columns as any[]) : [];
          for (const column of columns) {
            const nested = Array.isArray(column?.children) ? (column.children as CreditFunnelBlock[]) : [];
            visit(nested, depth + 1);
          }
        }
      }
    };

    visit(editableBlocks, 0);
    return items;
  }, [editableBlocks]);

  const pageAnatomy = useMemo(() => {
    const summary = {
      rootBlocks: editableBlocks.length,
      totalBlocks: 0,
      sections: 0,
      layoutBlocks: 0,
      textNodes: 0,
      actions: 0,
      forms: 0,
      media: 0,
      codeIslands: 0,
      headers: 0,
      assistants: 0,
    };

    const visit = (blocks: CreditFunnelBlock[]) => {
      for (const block of blocks) {
        if (!block || typeof block !== "object") continue;
        summary.totalBlocks += 1;

        switch (block.type) {
          case "section":
            summary.sections += 1;
            break;
          case "columns":
          case "spacer":
            summary.layoutBlocks += 1;
            break;
          case "heading":
          case "paragraph":
            summary.textNodes += 1;
            break;
          case "button":
          case "salesCheckoutButton":
          case "addToCartButton":
          case "cartButton":
            summary.actions += 1;
            break;
          case "formEmbed":
          case "formLink":
          case "calendarEmbed":
            summary.forms += 1;
            break;
          case "image":
          case "video":
            summary.media += 1;
            break;
          case "customCode":
            summary.codeIslands += 1;
            break;
          case "headerNav":
            summary.headers += 1;
            break;
          case "chatbot":
            summary.assistants += 1;
            break;
          default:
            break;
        }

        if (block.type === "section") {
          const props: any = block.props || {};
          for (const key of ["children", "leftChildren", "rightChildren"] as const) {
            const nested = Array.isArray(props[key]) ? (props[key] as CreditFunnelBlock[]) : [];
            visit(nested);
          }
        }

        if (block.type === "columns") {
          const columns = Array.isArray((block.props as any)?.columns) ? ((block.props as any).columns as any[]) : [];
          for (const column of columns) {
            const nested = Array.isArray(column?.children) ? (column.children as CreditFunnelBlock[]) : [];
            visit(nested);
          }
        }
      }
    };

    visit(editableBlocks);

    return {
      ...summary,
      onlyCodeIsland: editableBlocks.length === 1 && editableBlocks[0]?.type === "customCode",
    };
  }, [editableBlocks]);
  const showCanvasDefaults = !pageAnatomy.onlyCodeIsland;

  useEffect(() => {
    const nextState = {
      pageId: selectedPageId,
      editorMode: selectedPageEditorMode,
      sourceMode: selectedPageGraph.sourceMode,
      onlyCodeIsland: pageAnatomy.onlyCodeIsland,
    };
    const prevState = stageAutoStateRef.current;
    stageAutoStateRef.current = nextState;

    if (!selectedPageId || !selectedPageEditorMode) return;

    const pageChanged = prevState.pageId !== nextState.pageId;
    const modeChanged = prevState.editorMode !== nextState.editorMode || prevState.sourceMode !== nextState.sourceMode;
    const becameOnlyCodeIsland = prevState.pageId === nextState.pageId && !prevState.onlyCodeIsland && nextState.onlyCodeIsland;

    if (!pageChanged && !modeChanged && !becameOnlyCodeIsland) return;

    const shouldOpenSource = nextState.sourceMode === "custom-html" || nextState.onlyCodeIsland;
    const shouldOpenPreview = Boolean(
      shouldOpenSource &&
        nextState.pageId &&
        pendingBlankPagePreviewRef.current === nextState.pageId &&
        nextState.sourceMode === "custom-html" &&
        !nextState.onlyCodeIsland,
    );
    setBuilderSurfaceMode(shouldOpenSource ? "whole-page" : "blocks");
    setWholePageViewMode(shouldOpenPreview ? "preview" : "source");
    setSelectedHtmlRegionKey(null);
    setWholePageSyncNotice(null);
    setSidebarPanel("structure");
    if (shouldOpenPreview) {
      pendingBlankPagePreviewRef.current = null;
      setBriefPanelOpen(false);
    }
  }, [pageAnatomy.onlyCodeIsland, selectedPageEditorMode, selectedPageGraph.sourceMode, selectedPageId]);

  const selectedBlockContainer = useMemo(
    () => (selectedBlockId ? findContainerForBlock(editableBlocks, selectedBlockId) : null),
    [editableBlocks, findContainerForBlock, selectedBlockId],
  );

  const selectedOutlineItem = useMemo(
    () => blockOutlineItems.find((item) => item.id === selectedBlockId) || null,
    [blockOutlineItems, selectedBlockId],
  );

  const selectedPageFlowAnchorId = useMemo(
    () => (selectedBlockId ? findTopLevelBlockId(editableBlocks, selectedBlockId) : null),
    [editableBlocks, findTopLevelBlockId, selectedBlockId],
  );

  const primaryBuilderAiPlaceholder = useMemo(() => {
    if (selectedBlock?.type === "customCode") return "Describe the source changes you want";
    if (selectedBlock) return `Change ${describeBuilderAiTarget(selectedBlock).replace(/^the /, "")}`;
    if (pageAnatomy.onlyCodeIsland) return "Describe changes to the imported page";
    if (editableBlocks.length === 0 && selectedChat.length === 0) return "Describe the business, audience, offer, and CTA for this page";
    return "Describe what you want AI to build or change";
  }, [editableBlocks.length, pageAnatomy.onlyCodeIsland, selectedBlock, selectedChat.length]);

  const emptyPageAiGuide = useMemo(() => {
    if (!selectedPage || editableBlocks.length > 0 || selectedChat.length > 0 || pageAnatomy.onlyCodeIsland) return null;

    const funnelLabel = String(funnel?.name || funnel?.slug || "this funnel").trim();
    const pageLabel = String(selectedPage.title || selectedPage.slug || "this page").trim();
    const routeLabel = buildFunnelPageRouteLabel(funnel?.slug, selectedPage.slug);

    return {
      routeLabel,
      prompts: [
        `Draft the strongest first version of the ${pageLabel} page for ${funnelLabel}. Infer the best-fit funnel type, offer framing, proof strategy, and CTA path from the available context, state any important assumption briefly, then build the page from that foundation.`,
        `Before you draft the ${pageLabel} page for ${funnelLabel}, only ask me up to 3 short questions if the uncertainty would materially change the shell, offer framing, CTA path, or platform choice.`,
        `Synthesize the strongest conceptual overview and shell for the ${pageLabel} page in ${funnelLabel}: audience, offer framing, proof strategy, CTA rhythm, next-step handling, and recommended section order.`,
      ],
    };
  }, [editableBlocks.length, funnel?.name, funnel?.slug, pageAnatomy.onlyCodeIsland, selectedChat.length, selectedPage]);
  const selectedPageRouteLabel = useMemo(
    () => buildFunnelPageRouteLabel(funnel?.slug, selectedPage?.slug),
    [funnel?.slug, selectedPage?.slug],
  );
  const foundationCapabilityInputs = useMemo<FunnelFoundationCapabilityInputs>(
    () => ({
      existingFormsCount: Array.isArray(forms) ? forms.length : 0,
      bookingCalendarsCount: bookingCalendars.filter((calendar) => calendar.enabled !== false).length,
      stripeProductsCount: stripeProducts.filter((product) => product.defaultPrice?.id).length,
      aiAgentsCount: availableAgentOptions.length,
      heroImageAttached: Boolean(pageIntentProfile.mediaPlan.heroImage?.url),
      heroVideoAttached: Boolean(pageIntentProfile.mediaPlan.heroVideo?.url),
    }),
    [availableAgentOptions.length, bookingCalendars, forms, pageIntentProfile.mediaPlan.heroImage?.url, pageIntentProfile.mediaPlan.heroVideo?.url, stripeProducts],
  );
  const foundationOverview = useMemo(
    () => buildResolvedFunnelFoundation({
      brief: funnel?.brief ?? null,
      intent: pageIntentProfile,
      routeLabel: selectedPageRouteLabel,
      funnelName: funnel?.name,
      pageTitle: selectedPage?.title,
      businessProfile: businessProfileSummary,
      capabilityInputs: foundationCapabilityInputs,
    }),
    [businessProfileSummary, foundationCapabilityInputs, funnel?.brief, funnel?.name, pageIntentProfile, selectedPage?.title, selectedPageRouteLabel],
  );
  const effectiveAiContextMedia = aiContextMedia;
  const pageTypeOptions = useMemo(
    () => Object.entries(PAGE_INTENT_TYPE_LABELS).map(([value, label]) => ({ value: value as FunnelPageIntentType, label })),
    [],
  );
  const formStrategyOptions = useMemo(
    () => Object.entries(PAGE_FORM_STRATEGY_LABELS).map(([value, label]) => ({ value: value as FunnelPageFormStrategy, label })),
    [],
  );
  const primaryCtaSuggestions = useMemo(
    () => buildPrimaryCtaSuggestions(pageIntentProfile.pageType, pageIntentProfile.primaryCta),
    [pageIntentProfile.pageType, pageIntentProfile.primaryCta],
  );
  const availableShellFrames = useMemo(
    () => listFunnelShellFrames(pageIntentProfile.pageType),
    [pageIntentProfile.pageType],
  );
  const selectedShellFrame = useMemo(
    () => getFunnelShellFrame(pageIntentProfile.shellFrameId) || availableShellFrames[0] || null,
    [availableShellFrames, pageIntentProfile.shellFrameId],
  );
  const quickPageTypeSuggestions = useMemo(() => {
    const preferred: FunnelPageIntentType[] = [
      pageIntentProfile.pageType,
      "booking",
      "lead-capture",
      "sales",
      "application",
      "webinar",
    ];
    return Array.from(new Set(preferred));
  }, [pageIntentProfile.pageType]);
  const pageConversionFocus = useMemo(
    () => buildPageConversionFocus(pageIntentProfile),
    [pageIntentProfile],
  );
  const pageGoalUsesDefault = useMemo(
    () => isDefaultPageGoalForIntent(pageIntentProfile.pageType, pageIntentProfile.pageGoal),
    [pageIntentProfile.pageGoal, pageIntentProfile.pageType],
  );
  const foundationWizardSteps = useMemo(
    () => [
      {
        key: "overview",
        eyebrow: "Step 1",
        title: "Check the recommended direction",
        description: "Start with the business read and the baseline recommendation before you steer anything.",
      },
      {
        key: "funnel-context",
        eyebrow: "Step 2",
        title: "Set the shared funnel context",
        description: "Add only the broad context every page in this funnel should inherit. Keep pricing and finer offer detail loose if needed because you can feed that in later while iterating.",
      },
      {
        key: "page-direction",
        eyebrow: "Step 3",
        title: "Steer this page",
        description: "Choose the CTA motion, opening style, and page-specific direction without turning this into a worksheet.",
      },
      {
        key: "shell",
        eyebrow: "Step 4",
        title: "Confirm the shell",
        description: "Make sure the draft lands with the right structure, then generate from here.",
      },
    ],
    [],
  );
  const sectionPlanItems = useMemo(
    () => (foundationOverview.sectionPlanItems.length ? foundationOverview.sectionPlanItems : parseSectionPlanItems(pageIntentProfile.sectionPlan)),
    [foundationOverview.sectionPlanItems, pageIntentProfile.sectionPlan],
  );
  const directionPageAnatomy = useMemo(
    () => ({
      rootBlocks: pageAnatomy.rootBlocks,
      totalBlocks: pageAnatomy.totalBlocks,
      sections: pageAnatomy.sections,
      layoutBlocks: pageAnatomy.layoutBlocks,
      textNodes: pageAnatomy.textNodes,
      actions: pageAnatomy.actions,
      forms: pageAnatomy.forms,
      media: pageAnatomy.media,
      codeIslands: pageAnatomy.codeIslands,
      headers: pageAnatomy.headers,
      onlyCodeIsland: pageAnatomy.onlyCodeIsland,
    }),
    [
      pageAnatomy.actions,
      pageAnatomy.codeIslands,
      pageAnatomy.forms,
      pageAnatomy.headers,
      pageAnatomy.layoutBlocks,
      pageAnatomy.media,
      pageAnatomy.onlyCodeIsland,
      pageAnatomy.rootBlocks,
      pageAnatomy.sections,
      pageAnatomy.textNodes,
      pageAnatomy.totalBlocks,
    ],
  );

  const storedPageSourceHtml = useMemo(() => getFunnelPageCurrentHtml(selectedPage), [selectedPage]);
  const currentPagePublishedHtml = useMemo(() => getFunnelPagePublishedHtml(selectedPage), [selectedPage]);
  const generatedBlockWholePageHtml = useMemo(() => {
    if (!selectedPage || !selectedPageSupportsBlocksSurface) return "";
    const nextHtml = buildWholePageDraftHtml(selectedPage, saveableBlocks);
    return nextHtml || "";
  }, [buildWholePageDraftHtml, saveableBlocks, selectedPage, selectedPageSupportsBlocksSurface]);
  const selectedPageDirty = Boolean(selectedPageId && dirtyPageIds[selectedPageId]);
  const blocksSurfaceActive = Boolean(selectedPage && selectedPageSupportsBlocksSurface && builderSurfaceMode === "blocks");
  const blankPageOnboardingActive = Boolean(emptyPageAiGuide && blocksSurfaceActive && selectedPage);
  const activeFoundationWizardStep = foundationWizardSteps[Math.min(foundationWizardStep, foundationWizardSteps.length - 1)] || foundationWizardSteps[0];
  const foundationWizardLastStepIndex = foundationWizardSteps.length - 1;
  const foundationWizardAtLastStep = foundationWizardStep >= foundationWizardLastStepIndex;
  const foundationWizardProgress = ((Math.min(foundationWizardStep, foundationWizardLastStepIndex) + 1) / foundationWizardSteps.length) * 100;
  const showFoundationOverviewStep = !blankPageOnboardingActive || foundationWizardStep === 0;
  const showInheritedFunnelContextStep = !blankPageOnboardingActive || foundationWizardStep === 1;
  const showPageDirectionStep = !blankPageOnboardingActive || foundationWizardStep === 2;
  const showShellStep = !blankPageOnboardingActive || foundationWizardStep === 3;
  const wholePageModeActive = Boolean(
    selectedPage && !blocksSurfaceActive && (selectedPageGraph.sourceMode === "custom-html" || builderSurfaceMode === "whole-page"),
  );
  const wholePageSourceEditable = Boolean(selectedPage && selectedPageGraph.capabilities.supportsWholePageSource && !blocksSurfaceActive);

  useEffect(() => {
    if (!briefPanelOpen || !blankPageOnboardingActive) {
      setFoundationWizardStep(0);
    }
  }, [blankPageOnboardingActive, briefPanelOpen, selectedPage?.id]);

  useEffect(() => {
    foundationArtifactRequestRef.current += 1;
    setFoundationArtifact(null);
    setFoundationArtifactBusy(false);
    setFoundationArtifactError(null);
  }, [selectedPage?.id]);

  useEffect(() => {
    if (!briefPanelOpen || !selectedPage) return;

    const requestId = foundationArtifactRequestRef.current + 1;
    foundationArtifactRequestRef.current = requestId;
    const timer = window.setTimeout(() => {
      void (async () => {
        setFoundationArtifactBusy(true);
        setFoundationArtifactError(null);
        try {
          const res = await fetch(
            `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/${encodeURIComponent(selectedPage.id)}/foundation`,
            {
              method: "POST",
              cache: "no-store",
              headers: {
                "content-type": "application/json",
                [PORTAL_VARIANT_HEADER]: portalVariant,
              },
              body: JSON.stringify({
                brief: funnel?.brief ?? null,
                intent: pageIntentProfile,
                businessProfile: businessProfileSummary,
                capabilityInputs: foundationCapabilityInputs,
              }),
            },
          );
          const json = (await res.json().catch(() => null)) as any;
          if (!res.ok || !json || json.ok !== true || !json.foundation) {
            throw new Error(json?.error || "Unable to resolve foundation");
          }
          if (foundationArtifactRequestRef.current !== requestId) return;
          setFoundationArtifact(json.foundation as FunnelFoundationArtifact);
        } catch (e) {
          if (foundationArtifactRequestRef.current !== requestId) return;
          const msg = e && typeof e === "object" && "message" in e ? String((e as any).message) : "Unable to resolve foundation";
          setFoundationArtifactError(msg || "Unable to resolve foundation");
        } finally {
          if (foundationArtifactRequestRef.current === requestId) setFoundationArtifactBusy(false);
        }
      })();
    }, 320);

    return () => window.clearTimeout(timer);
  }, [briefPanelOpen, businessProfileSummary, foundationCapabilityInputs, funnel?.brief, funnelId, pageIntentProfile, portalVariant, selectedPage, selectedPageRouteLabel]);

  useEffect(() => {
    const pageId = selectedPage?.id || null;
    if (!blankPageOnboardingActive || !pageId) {
      blankPageWizardAutoOpenRef.current = null;
      return;
    }
    if (blankPageWizardAutoOpenRef.current === pageId) return;
    blankPageWizardAutoOpenRef.current = pageId;
    setBriefPanelOpen(true);
  }, [blankPageOnboardingActive, selectedPage?.id]);

  const saveStatusLabel = (() => {
    if (!selectedPage) return null;
    if (selectedPageDirty) return wholePageSourceEditable ? "Unsaved draft" : "Unsaved";
    return formatSavedAtLabel((selectedPage as any).updatedAt) || (wholePageSourceEditable ? "Draft saved" : "Saved");
  })();
  const currentPageSourceHtml = useMemo(() => {
    if (!selectedPage) return "";
    if (selectedPageGraph.sourceMode === "custom-html") return storedPageSourceHtml;
    if (generatedBlockWholePageHtml) return generatedBlockWholePageHtml;
    if (!selectedPageDirty) return storedPageSourceHtml;
    return "";
  }, [generatedBlockWholePageHtml, selectedPage, selectedPageDirty, selectedPageGraph.sourceMode, storedPageSourceHtml]);
  const wholePageUsesLiveDraftSource = Boolean(!wholePageSourceEditable && generatedBlockWholePageHtml);
  const wholePageNeedsSaveForDeployableSource = !wholePageSourceEditable && selectedPageDirty && !generatedBlockWholePageHtml;
  const editorPreviewHtml = useMemo(() => buildEditorPreviewHtml(currentPageSourceHtml), [currentPageSourceHtml]);
  const wholePageStatusMessage = useMemo(() => {
    if (!wholePageModeActive) return wholePageSyncNotice;
    if (!selectedPage || !selectedPageSupportsBlocksSurface) return wholePageSyncNotice;
    if (!currentPageSourceHtml) {
      return selectedPageLensUi.wholePageStatusMessageWhenUnsynced;
    }
    if (wholePageNeedsSaveForDeployableSource) {
      return "This page includes a server-rendered block. Preview is showing the current draft, and deployable source regenerates when you save.";
    }
    if (!generatedBlockWholePageHtml) {
      return "Source reflects the latest saved structure.";
    }
    return wholePageSyncNotice || "Source stays on the same draft you are editing in structure.";
  }, [
    currentPageSourceHtml,
    generatedBlockWholePageHtml,
    selectedPage,
    selectedPageLensUi,
    selectedPageSupportsBlocksSurface,
    wholePageModeActive,
    wholePageNeedsSaveForDeployableSource,
    wholePageSyncNotice,
  ]);
  const wholePageSyncMeta = useMemo(() => {
    if (!selectedPage || !wholePageModeActive) return null;

    if (wholePageSourceEditable) {
      return selectedPageDirty ? "Unsaved draft" : formatSavedAtLabel((selectedPage as any).updatedAt) || "Draft saved";
    }

    if (wholePageUsesLiveDraftSource) return "Follows current draft";
    if (wholePageNeedsSaveForDeployableSource) return "Save to refresh source";
    return formatSavedAtLabel((selectedPage as any).updatedAt) || "Source current";
  }, [selectedPage, wholePageModeActive, wholePageNeedsSaveForDeployableSource, wholePageSourceEditable, wholePageUsesLiveDraftSource, selectedPageDirty]);

  useEffect(() => {
    setWholePageSyncNotice(null);
  }, [selectedPageId]);

  const htmlRegionScopes = useMemo(
    () => (currentPageSourceHtml ? detectHtmlRegionScopes(currentPageSourceHtml) : []),
    [currentPageSourceHtml],
  );
  const selectedHtmlRegion = useMemo(
    () => htmlRegionScopes.find((region) => region.key === selectedHtmlRegionKey) || null,
    [htmlRegionScopes, selectedHtmlRegionKey],
  );
  const sourceScopeLabel = selectedHtmlRegion ? selectedHtmlRegion.label : "Whole page";
  const pageStyle = (pageSettingsBlock as any)?.props?.style as BlockStyle | undefined;
  const pageCanvasFontPresetKey = fontPresetKeyFromStyle({
    fontFamily: (pageStyle as any)?.fontFamily,
    fontGoogleFamily: (pageStyle as any)?.fontGoogleFamily,
  });
  const htmlPreviewSelectionState =
    aiWorkFocus?.mode === "page" && aiWorkFocus.regionKey && aiWorkFocus.regionKey === selectedHtmlRegion?.key
      ? aiWorkFocus.phase
      : "idle";

  useEffect(() => {
    if (!selectedHtmlRegionKey) return;
    if (!htmlRegionScopes.some((region) => region.key === selectedHtmlRegionKey)) {
      setSelectedHtmlRegionKey(null);
    }
  }, [htmlRegionScopes, selectedHtmlRegionKey]);

  useEffect(() => {
    if (selectedPage?.editorMode !== "CUSTOM_HTML") {
      setHtmlScopePickerOpen(false);
    }
  }, [selectedPage?.editorMode]);

  const pageHasStripeProductButtons = useMemo(() => {
    const visit = (blocks: CreditFunnelBlock[] | undefined): boolean => {
      if (!blocks || blocks.length === 0) return false;
      for (const b of blocks) {
        if (!b) continue;
        if (b.type === "salesCheckoutButton" || b.type === "addToCartButton") return true;
        if (b.type === "section") {
          const props: any = b.props;
          const keys = ["children", "leftChildren", "rightChildren"] as const;
          for (const key of keys) {
            const arr = Array.isArray(props?.[key]) ? (props[key] as CreditFunnelBlock[]) : undefined;
            if (visit(arr)) return true;
          }
        }
        if (b.type === "columns") {
          const props: any = b.props;
          const cols = Array.isArray(props?.columns) ? (props.columns as any[]) : [];
          for (const c of cols) {
            const arr = Array.isArray(c?.children) ? (c.children as CreditFunnelBlock[]) : undefined;
            if (visit(arr)) return true;
          }
        }
      }
      return false;
    };

    return visit(editableBlocks);
  }, [editableBlocks]);

  const stripeProductsAutoLoadAttemptedRef = useRef(false);
  useEffect(() => {
    if (stripeProductsAutoLoadAttemptedRef.current) return;
    const selectedNeedsStripeProducts =
      selectedBlock?.type === "salesCheckoutButton" || selectedBlock?.type === "addToCartButton";
    if (!pageHasStripeProductButtons && !selectedNeedsStripeProducts) return;
    if (stripeProductsBusy) return;
    if (stripeProducts.length > 0) {
      stripeProductsAutoLoadAttemptedRef.current = true;
      return;
    }

    stripeProductsAutoLoadAttemptedRef.current = true;
    void loadStripeProducts();
  }, [loadStripeProducts, pageHasStripeProductButtons, selectedBlock, stripeProducts.length, stripeProductsBusy]);

  const newId = () => {
    try {
      const maybeCrypto = globalThis.crypto as Crypto | undefined;
      const id = typeof maybeCrypto?.randomUUID === "function" ? maybeCrypto.randomUUID() : "";
      if (typeof id === "string" && id) return id;
    } catch {
      // ignore
    }
    return `b_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  };

  const setSelectedPageLocal = useCallback((patch: Partial<Page>) => {
    if (!selectedPage) return;

    const nextPatch: Partial<Page> = { ...patch };
    if (patch.blocksJson !== undefined) {
      const nextBlocks = migrateLegacyAnchorBlocksIntoSections(coerceBlocksJson(patch.blocksJson));
      const nextDraftHtml = buildWholePageDraftHtml(
        {
          id: selectedPage.id,
          title: patch.title !== undefined ? String(patch.title || "") : selectedPage.title,
        },
        nextBlocks,
      );
      if (nextDraftHtml !== null) nextPatch.draftHtml = nextDraftHtml;
    }

    const actionKey =
      nextPatch.blocksJson !== undefined
        ? "blocks"
        : nextPatch.draftHtml !== undefined || nextPatch.customHtml !== undefined
          ? "customHtml"
          : nextPatch.customChatJson !== undefined
            ? "customChatJson"
            : nextPatch.editorMode !== undefined
              ? "editorMode"
              : "meta";
    const coalesceWindowMs = actionKey === "customHtml" ? 1200 : 250;
    pushUndoSnapshot(actionKey, coalesceWindowMs);
    pageLocalVersionRef.current[selectedPage.id] = (pageLocalVersionRef.current[selectedPage.id] || 0) + 1;

    setDirtyPageIds((prev) => ({ ...prev, [selectedPage.id]: true }));
    setPages((prev) =>
      (prev || []).map((p) => (p.id === selectedPage.id ? ({ ...p, ...nextPatch } as Page) : p)),
    );
  }, [buildWholePageDraftHtml, pushUndoSnapshot, selectedPage]);

  const load = useCallback(async () => {
    setError(null);
    const [fRes, pRes, formsRes, bookingCalendarsRes, bookingSettingsRes] = await Promise.all([
      fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}`, {
        cache: "no-store",
      }),
      fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages`, {
        cache: "no-store",
      }),
      fetch("/api/portal/funnel-builder/forms", {
        cache: "no-store",
        headers: { [PORTAL_VARIANT_HEADER]: portalVariant },
      }).catch(() => null as any),
      fetch("/api/portal/booking/calendars", { cache: "no-store" }).catch(() => null as any),
      fetch("/api/portal/booking/settings", { cache: "no-store" }).catch(() => null as any),
    ]);
    const fJson = (await fRes.json().catch(() => null)) as any;
    const pJson = (await pRes.json().catch(() => null)) as any;
    const formsJson = formsRes ? ((await formsRes.json().catch(() => null)) as any) : null;
    const bookingCalendarsJson = bookingCalendarsRes
      ? ((await bookingCalendarsRes.json().catch(() => null)) as any)
      : null;
    const bookingSettingsJson = bookingSettingsRes
      ? ((await bookingSettingsRes.json().catch(() => null)) as any)
      : null;
    if (!fRes.ok || !fJson || fJson.ok !== true)
      throw new Error(fJson?.error || "Failed to load funnel");
    if (!pRes.ok || !pJson || pJson.ok !== true)
      throw new Error(pJson?.error || "Failed to load pages");

    const cachedDraft = readFunnelEditorDraftCache(funnelId);
    const liveDirtyPages = (pagesRef.current || []).filter((page) => dirtyPageIdsRef.current[page.id]);
    const preservedPageDrafts = new Map<string, Page>();
    for (const page of cachedDraft?.dirtyPages || []) preservedPageDrafts.set(page.id, clonePageDraftForCache(page));
    for (const page of liveDirtyPages) preservedPageDrafts.set(page.id, clonePageDraftForCache(page));

    const serverPages = Array.isArray(pJson.pages) ? (pJson.pages as Page[]) : [];
    const nextPages = serverPages.map((page) => {
      const draft = preservedPageDrafts.get(page.id);
      return draft ? ({ ...page, ...draft } as Page) : page;
    });

    const nextDirtyPageIds = Array.from(
      new Set<string>([
        ...Object.keys(dirtyPageIdsRef.current).filter((pageId) => dirtyPageIdsRef.current[pageId]),
        ...Array.from(preservedPageDrafts.keys()),
      ]),
    ).reduce<Record<string, boolean>>((acc, pageId) => {
      if (nextPages.some((page) => page.id === pageId)) acc[pageId] = true;
      return acc;
    }, {});

    const baseFunnel = fJson.funnel as Funnel;
    const preferredFunnelBrief = funnelBriefDirtyRef.current
      ? cloneFunnelBriefForCache(funnelRef.current?.brief)
      : cachedDraft?.funnelBriefDirty
        ? cloneFunnelBriefForCache(cachedDraft.funnelBrief)
        : null;

    setFunnel(preferredFunnelBrief ? ({ ...baseFunnel, brief: preferredFunnelBrief } as Funnel) : baseFunnel);
    setFunnelBriefDirty(Boolean(funnelBriefDirtyRef.current || cachedDraft?.funnelBriefDirty));
    setPages(nextPages);
    setDirtyPageIds(nextDirtyPageIds);
    const preferredFromUrl = (() => {
      if (initialPageSelectionConsumedRef.current) return null;
      const pid = initialPageIdFromUrlRef.current;
      if (!pid) return null;
      return nextPages.some((p) => String((p as any)?.id || "").trim() === pid) ? pid : null;
    })();
    setSelectedPageId((prev) => {
      const current = prev && nextPages.some((p) => p.id === prev) ? prev : null;
      const cachedSelected = cachedDraft?.selectedPageId && nextPages.some((p) => p.id === cachedDraft.selectedPageId) ? cachedDraft.selectedPageId : null;
      const nextSelected = current || cachedSelected || preferredFromUrl || nextPages[0]?.id || null;
      if (nextSelected) initialPageSelectionConsumedRef.current = true;
      return nextSelected;
    });

    if (formsRes && formsRes.ok && formsJson?.ok === true) {
      setForms(Array.isArray(formsJson.forms) ? (formsJson.forms as CreditForm[]) : []);
    }

    if (bookingCalendarsRes?.ok && bookingCalendarsJson?.ok === true) {
      const raw = bookingCalendarsJson?.config?.calendars;
      const next = Array.isArray(raw)
        ? (raw
            .map((c: any) => ({
              id: typeof c?.id === "string" ? c.id : "",
              title: typeof c?.title === "string" ? c.title : undefined,
              enabled: typeof c?.enabled === "boolean" ? c.enabled : undefined,
            }))
            .filter((c: BookingCalendarLite) => !!c.id) as BookingCalendarLite[])
        : [];
      setBookingCalendars(next);
    } else {
      setBookingCalendars([]);
    }

    if (bookingSettingsRes?.ok && bookingSettingsJson?.ok === true) {
      const slug = typeof bookingSettingsJson?.site?.slug === "string" ? bookingSettingsJson.site.slug.trim() : "";
      setBookingSiteSlug(slug || null);
    } else {
      setBookingSiteSlug(null);
    }
  }, [funnelId, portalVariant]);

  useEffect(() => {
    setSeoDirty(false);
    setSeoError(null);
    setFunnelBookingDirty(false);
    setFunnelBookingError(null);
  }, [funnel?.id]);

  const saveFunnelSeo = useCallback(async () => {
    if (!funnel) return;
    setSeoBusy(true);
    setSeoError(null);
    try {
      const res = await fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seo: funnel.seo ?? null }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to save SEO");
      setFunnel(json.funnel as Funnel);
      setSeoDirty(false);
      toast.success("SEO saved");
    } catch (e) {
      const msg = (e as any)?.message ? String((e as any).message) : "Failed to save SEO";
      setSeoError(msg);
      toast.error(msg);
    } finally {
      setSeoBusy(false);
    }
  }, [funnel, funnelId, toast]);

  const saveFunnelBookingRouting = useCallback(async () => {
    if (!funnel) return;
    setFunnelBookingBusy(true);
    setFunnelBookingError(null);
    try {
      const res = await fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingCalendarId: funnel.bookingCalendarId ?? null }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to save booking route");
      setFunnel(json.funnel as Funnel);
      setFunnelBookingDirty(false);
      toast.success("Booking route saved");
    } catch (e) {
      const msg = (e as any)?.message ? String((e as any).message) : "Failed to save booking route";
      setFunnelBookingError(msg);
      toast.error(msg);
    } finally {
      setFunnelBookingBusy(false);
    }
  }, [funnel, funnelId, toast]);

  const saveFunnelBrief = useCallback(async (nextBrief: FunnelBriefProfile | null) => {
    if (!funnel) return false;
    const requestVersion = funnelBriefVersionRef.current;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brief: nextBrief }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to save funnel brief");
      const hasNewerLocalBrief = funnelBriefDirtyRef.current && funnelBriefVersionRef.current !== requestVersion;
      if (hasNewerLocalBrief) {
        setFunnel((prev) => (prev ? ({ ...(json.funnel as Funnel), brief: prev.brief } as Funnel) : (json.funnel as Funnel)));
      } else {
        setFunnel(json.funnel as Funnel);
        setFunnelBriefDirty(false);
      }
      return true;
    } catch (e) {
      setError((e as any)?.message ? String((e as any).message) : "Failed to save funnel brief");
      return false;
    } finally {
      setBusy(false);
    }
  }, [funnel, funnelId]);

  useEffect(() => {
    let cancelled = false;
    if (funnel !== null && pages !== null) return;

    void load().catch((e) => {
      if (cancelled) return;
      setError(e?.message ? String(e.message) : "Failed to load");
    });
    return () => {
      cancelled = true;
    };
  }, [funnel, load, pages]);

  const savePage = useCallback(
    async (
      patch: Partial<
        Pick<
          Page,
          | "title"
          | "slug"
          | "sortOrder"
          | "seo"
          | "contentMarkdown"
          | "editorMode"
          | "blocksJson"
          | "customHtml"
          | "draftHtml"
          | "customChatJson"
          | "brief"
        >
      >,
    ) => {
      if (!selectedPage) return false;
      const pageId = selectedPage.id;
      const requestVersion = pageLocalVersionRef.current[pageId] || 0;
      const requestSeq = (pageSaveRequestRef.current[pageId] || 0) + 1;
      pageSaveRequestRef.current[pageId] = requestSeq;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/${encodeURIComponent(pageId)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(patch),
          },
        );
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to save");
        const latestRequestSeq = pageSaveRequestRef.current[pageId] || 0;
        if (requestSeq !== latestRequestSeq) return true;

        const savedPage = json.page as Partial<Page> | undefined;
        const hasNewerLocalEdits = Boolean(dirtyPageIdsRef.current[pageId]) && (pageLocalVersionRef.current[pageId] || 0) !== requestVersion;

        if (savedPage?.id) {
          if (hasNewerLocalEdits) {
            setPages((prev) =>
              (prev || []).map((page) =>
                page.id === pageId
                  ? ({ ...savedPage, ...page } as Page)
                  : page,
              ),
            );
          } else {
            setPages((prev) =>
              (prev || []).map((page) =>
                page.id === pageId
                  ? ({ ...page, ...savedPage } as Page)
                  : page,
              ),
            );
            setDirtyPageIds((prev) => {
              const next = { ...prev };
              delete next[pageId];
              return next;
            });
          }
        } else if (!hasNewerLocalEdits) {
          await load();
        }
        return true;
      } catch (e) {
        setError((e as any)?.message ? String((e as any).message) : "Failed to save");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [funnelId, load, selectedPage],
  );

  const updatePageIntentProfile = useCallback(
    (patch: Partial<FunnelPageIntentProfile>, persist = false) => {
      if (!selectedPage) return;
      const currentAutoIntent = inferFunnelPageIntentProfile({
        existing: { ...pageIntentProfile, shellConcept: "", sectionPlan: "" },
        funnelBrief: funnel?.brief ?? null,
        funnelName: funnel?.name,
        funnelSlug: funnel?.slug,
        pageTitle: selectedPage.title,
        pageSlug: selectedPage.slug,
      });
      const nextExisting: Partial<FunnelPageIntentProfile> = { ...pageIntentProfile, ...patch };
      if (!Object.prototype.hasOwnProperty.call(patch, "shellConcept") && pageIntentProfile.shellConcept === currentAutoIntent.shellConcept) {
        nextExisting.shellConcept = "";
      }
      if (!Object.prototype.hasOwnProperty.call(patch, "sectionPlan") && pageIntentProfile.sectionPlan === currentAutoIntent.sectionPlan) {
        nextExisting.sectionPlan = "";
      }
      const nextIntent = inferFunnelPageIntentProfile({
        existing: nextExisting,
        funnelBrief: funnel?.brief ?? null,
        funnelName: funnel?.name,
        funnelSlug: funnel?.slug,
        pageTitle: selectedPage.title,
        pageSlug: selectedPage.slug,
      });
      setPageIntentProfile(nextIntent);
      setSelectedPageLocal({ brief: nextIntent });
      if (persist) void savePage({ brief: nextIntent });
    },
    [funnel?.brief, funnel?.name, funnel?.slug, pageIntentProfile, savePage, selectedPage, setSelectedPageLocal],
  );

  const applyShellFrame = useCallback(
    (frameId: string, persist = true) => {
      const frame = getFunnelShellFrame(frameId);
      if (!frame) return;
      updatePageIntentProfile(
        {
          shellFrameId: frame.id,
          shellConcept: frame.shellConcept,
          sectionPlan: frame.sectionPlan,
        },
        persist,
      );
    },
    [updatePageIntentProfile],
  );

  const updateFunnelBrief = useCallback(
    (patch: Partial<FunnelBriefProfile>, persist = false) => {
      const nextBrief = inferFunnelBriefProfile({
        existing: { ...(funnel?.brief || {}), ...patch },
        funnelName: funnel?.name,
        funnelSlug: funnel?.slug,
      });
      if (Object.keys(patch).length > 0) {
        funnelBriefVersionRef.current += 1;
        setFunnelBriefDirty(true);
      }
      setFunnel((prev) => (prev ? { ...prev, brief: nextBrief } : prev));
      if (persist) void saveFunnelBrief(nextBrief);
    },
    [funnel?.brief, funnel?.name, funnel?.slug, saveFunnelBrief],
  );

  const updatePageMediaPlan = useCallback(
    (patch: Partial<FunnelPageMediaPlan>, persist = false) => {
      updatePageIntentProfile({
        mediaPlan: {
          ...(pageIntentProfile.mediaPlan || { heroAssetMode: "auto", heroAssetNote: "" }),
          ...patch,
        },
      }, persist);
    },
    [pageIntentProfile.mediaPlan, updatePageIntentProfile],
  );

  const composePromptFromIntent = useCallback(
    (mode: "draft" | "clarify" | "brief" | "shell" | "retake") => {
      const intent = inferFunnelPageIntentProfile({
        existing: pageIntentProfile,
        funnelBrief: funnel?.brief ?? null,
        funnelName: funnel?.name,
        funnelSlug: funnel?.slug,
        pageTitle: selectedPage?.title,
        pageSlug: selectedPage?.slug,
      });
      const brief = inferFunnelBriefProfile({
        existing: funnel?.brief,
        funnelName: funnel?.name,
        funnelSlug: funnel?.slug,
      });
      const pageLabel = String(selectedPage?.title || selectedPage?.slug || "this page").trim();
      const funnelLabel = String(funnel?.name || funnel?.slug || "this funnel").trim();
      const routeLabel = buildFunnelPageRouteLabel(funnel?.slug, selectedPage?.slug);
      const foundation = buildResolvedFunnelFoundation({
        brief,
        intent,
        routeLabel,
        funnelName: funnel?.name,
        pageTitle: selectedPage?.title,
        businessProfile: businessProfileSummary,
        capabilityInputs: foundationCapabilityInputs,
      });
      const context = [
        foundation.businessNarrative ? `Operational read of the business: ${foundation.businessNarrative}` : "",
        brief.funnelGoal ? `Funnel type or job: ${brief.funnelGoal}.` : "",
        brief.offerSummary ? `Offer or pricing: ${brief.offerSummary}.` : "",
        brief.audienceSummary ? `Core audience: ${brief.audienceSummary}.` : "",
        intent.pageGoal ? `Page job: ${intent.pageGoal}.` : "",
        intent.audience ? `Audience: ${intent.audience}.` : "",
        intent.offer ? `Offer or conversion action: ${intent.offer}.` : "",
        intent.primaryCta ? `Primary CTA: ${intent.primaryCta}.` : "",
        intent.qualificationFields ? `Intake or application details: ${intent.qualificationFields}.` : brief.qualificationFields ? `Intake or application details: ${brief.qualificationFields}.` : "",
        intent.routingDestination ? `Next-step or tagging: ${intent.routingDestination}.` : brief.routingDestination ? `Next-step or tagging: ${brief.routingDestination}.` : "",
        intent.conditionalLogic ? `Conditional logic: ${intent.conditionalLogic}.` : brief.conditionalLogic ? `Conditional logic: ${brief.conditionalLogic}.` : "",
        intent.taggingPlan ? `Tagging plan: ${intent.taggingPlan}.` : brief.taggingPlan ? `Tagging plan: ${brief.taggingPlan}.` : "",
        intent.automationPlan ? `Automation handoff: ${intent.automationPlan}.` : brief.automationPlan ? `Automation handoff: ${brief.automationPlan}.` : "",
        intent.formStrategy !== "none" ? `Form or platform plan: ${PAGE_FORM_STRATEGY_LABELS[intent.formStrategy]}.` : brief.integrationPlan ? `Platform or fulfillment notes: ${brief.integrationPlan}.` : "",
        foundation.summary ? `Recommended foundation: ${foundation.summary}` : "",
        foundation.conversionPath ? `Recommended conversion path: ${foundation.conversionPath}` : "",
        foundation.assetPlanSummary ? `Hero media plan: ${foundation.assetPlanSummary}` : "",
        intent.shellConcept ? `Baseline shell concept: ${intent.shellConcept}.` : "",
        intent.sectionPlan ? `Section plan: ${intent.sectionPlan}.` : "",
      ].filter(Boolean).join(" ");

      if (mode === "clarify") {
        return `Before you draft the ${pageLabel} page for ${funnelLabel} at ${routeLabel}, infer the strongest baseline from the available context first. Treat any saved shell or foundation notes as working guidance, not a lock. Only ask me up to 3 short clarifying questions if the uncertainty would materially change the shell, offer framing, CTA path, or platform choice. ${context}`.trim();
      }
      if (mode === "shell" || mode === "brief") {
        return `Synthesize the strongest conceptual overview and baseline shell for the ${pageLabel} page in ${funnelLabel}. Route: ${routeLabel}. Page type: ${PAGE_INTENT_TYPE_LABELS[intent.pageType]}. ${context} Define the section order, narrative arc, proof placement, CTA rhythm, next-step handling, and what should stay stable across future retakes or redesigns. Treat older saved direction as revisable if newer runtime or page context suggests a better interpretation. Assume the user can steer from a strong recommendation instead of needing a full questionnaire first.`.trim();
      }
      if (mode === "retake") {
        return `Using the saved conceptual foundation, shell concept, and section plan only as the starting architecture for ${pageLabel} in ${funnelLabel}, regenerate the page from scratch. Route: ${routeLabel}. Upgrade or replace stale assumptions with the latest funnel brief, page context, runtime setup, and clearer understanding earned from recent edits. Keep the strategic logic intact only where it still serves the current page well, and give me a materially different design treatment I can iterate on. ${context}`.trim();
      }
      return `Draft the first version of the ${pageLabel} page for ${funnelLabel}. Route: ${routeLabel}. Page type: ${PAGE_INTENT_TYPE_LABELS[intent.pageType]}. Use the saved conceptual foundation, shell concept, and section plan as the baseline architecture, but treat them as revisable working guidance rather than frozen truth. Infer confidently from the available context, make the strongest reasonable assumptions, and give the user a foundation they can intelligently iterate on. ${context}`.trim();
    },
    [businessProfileSummary, foundationCapabilityInputs, funnel?.brief, funnel?.name, funnel?.slug, pageIntentProfile, selectedPage?.slug, selectedPage?.title],
  );

  const setPageFaviconUrl = useCallback(
    async (nextUrlRaw: string) => {
      if (!selectedPage) return;
      const nextUrl = String(nextUrlRaw || "")
        .trim()
        .slice(0, 500);

      const nextSeo = nextUrl ? { ...(selectedPage.seo || {}), faviconUrl: nextUrl } : null;
      setSelectedPageLocal({ seo: nextSeo });
      await savePage({ seo: nextSeo });
    },
    [savePage, selectedPage, setSelectedPageLocal],
  );

  const createPage = () => {
    const seededIntent = inferFunnelPageIntentProfile({
      existing: { pageType: "landing" },
      funnelBrief: funnel?.brief ?? null,
      funnelName: funnel?.name,
      funnelSlug: funnel?.slug,
    });
    setDialogError(null);
    setDialog({
      type: "create-page",
      slug: "",
      title: "",
      pageType: seededIntent.pageType,
      primaryCta: seededIntent.primaryCta,
      heroAssetMode: seededIntent.mediaPlan.heroAssetMode,
      audience: funnel?.brief?.audienceSummary || "",
      offer: funnel?.brief?.offerSummary || "",
    });
  };

  const performCreatePage = async ({
    slug,
    title,
    pageType,
    primaryCta,
    heroAssetMode,
    audience,
    offer,
  }: {
    slug: string;
    title: string;
    pageType: FunnelPageIntentType;
    primaryCta: string;
    heroAssetMode: FunnelPageMediaMode;
    audience: string;
    offer: string;
  }) => {
    const requestedSlug = slug.trim();
    const normalizedSlug = requestedSlug ? normalizeSlug(requestedSlug) : "";
    if (requestedSlug && !normalizedSlug) {
      setDialogError("Use letters, numbers, and dashes for the page path.");
      return;
    }

    if (normalizedSlug) {
      const conflict = (pages || []).find((p) => normalizeSlug(p.slug) === normalizedSlug);
      if (conflict) {
        setDialogError(`The path /${normalizedSlug} is already used by "${conflict.title || conflict.slug}". Try /${normalizedSlug}-2 or a different path.`);
        return;
      }
    }

    const trimmedTitle = title.trim();
    const trimmedPrimaryCta = primaryCta.trim();
    const trimmedAudience = audience.trim();
    const trimmedOffer = offer.trim();
    setBusy(true);
    setError(null);
    setDialogError(null);
    try {
      const res = await fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(normalizedSlug ? { slug: normalizedSlug } : null),
          ...(trimmedTitle ? { title: trimmedTitle } : null),
          pageType,
          ...(trimmedPrimaryCta ? { primaryCta: trimmedPrimaryCta } : null),
          ...(trimmedAudience ? { audience: trimmedAudience } : null),
          ...(trimmedOffer ? { offer: trimmedOffer } : null),
          heroAssetMode,
          contentMarkdown: "",
        }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to create page");

      const createdId = (json.page?.id ? String(json.page.id) : "").trim();
      if (createdId) {
        await fetch(
          `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/${encodeURIComponent(createdId)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ editorMode: "BLOCKS", blocksJson: [] }),
          },
        ).catch(() => null);
      }

      await load();
      setSelectedPageId(createdId || null);
      setSelectedBlockId(null);
      closeDialog();
    } catch (e) {
      const message = (e as any)?.message ? String((e as any).message) : "Failed to create page";
      setError(message);
      setDialogError(message);
    } finally {
      setBusy(false);
    }
  };

  const deletePage = () => {
    if (!selectedPage) return;
    setDialogError(null);
    setDialog({ type: "delete-page" });
  };

  const performDeletePage = async () => {
    if (!selectedPage) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/${encodeURIComponent(selectedPage.id)}`,
        { method: "DELETE" },
      );
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to delete");
      await load();
      setSelectedBlockId(null);
    } catch (e) {
      setError((e as any)?.message ? String((e as any).message) : "Failed to delete");
    } finally {
      setBusy(false);
    }
  };

  const convertCurrentPageToBlocks = async () => {
    if (!selectedPage || selectedPage.editorMode !== "CUSTOM_HTML") return;

    const currentHtml = getFunnelPageCurrentHtml(selectedPage);
    const { blocks: importedBlocks, importedBlockId } = buildLayoutBlocksFromCustomHtml(
      currentHtml,
      selectedPage.customChatJson,
    );

    setBusy(true);
    setError(null);
    setCustomCodeContextOpen(false);
    setPreviewMode("edit");
    setSelectedHtmlRegionKey(null);
    setWholePageSyncNotice(null);

    try {
      const res = await fetch(
        `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/${encodeURIComponent(selectedPage.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            editorMode: "BLOCKS",
            blocksJson: importedBlocks,
          }),
        },
      );
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) {
        throw new Error(json?.error || "Failed to convert this page into Structure");
      }

      const page = json.page as Partial<Page> | undefined;
      if (page?.id) {
        setPages((prev) =>
          (prev || []).map((p) =>
            p.id === page.id
              ? ({
                  ...p,
                  ...page,
                } as Page)
              : p,
          ),
        );
      } else {
        await load();
      }

      setBuilderSurfaceMode("whole-page");
      setWholePageViewMode("source");
      setAiSidebarCustomCodeBlockId(importedBlockId);
      setSelectedBlockId(importedBlockId);
      setSidebarPanel("structure");
      toast.success("Converted to Structure");
    } catch (e) {
      const message = (e as any)?.message ? String((e as any).message) : "Failed to convert this page into Structure";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const setEditorMode = async (mode: "BLOCKS" | "CUSTOM_HTML") => {
    if (!selectedPage) return;
    if (selectedPage.editorMode === mode) return;
    setError(null);

    if (mode === "CUSTOM_HTML" && selectedPage.editorMode === "BLOCKS") {
      setCustomCodeContextOpen(false);
      setSelectedBlockId(null);
      setWholePageSyncNotice(null);

      const nextDraftHtml = buildWholePageDraftHtml(selectedPage, saveableBlocks);
      setPages((prev) =>
        (prev || []).map((p) =>
          p.id === selectedPage.id
            ? ({
                ...p,
                editorMode: "CUSTOM_HTML",
                ...(nextDraftHtml !== null ? { draftHtml: nextDraftHtml } : null),
              } as Page)
            : p,
        ),
      );

      if (nextDraftHtml !== null) return;

      const runServerExport = async () => {
        try {
          const res = await fetch(
            `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/${encodeURIComponent(selectedPage.id)}/export-custom-html`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ blocksJson: saveableBlocks, setEditorMode: "CUSTOM_HTML" }),
            },
          );
          const json = (await res.json().catch(() => null)) as any;
          if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to sync whole-page source");
          setWholePageSyncNotice(null);

          const page = json.page as Partial<Page> | undefined;
          if (page?.id) {
            setPages((prev) =>
              (prev || []).map((p) =>
                p.id === page.id
                  ? ({
                      ...p,
                      ...page,
                      draftHtml:
                        typeof page.draftHtml === "string"
                          ? page.draftHtml
                          : typeof json.html === "string"
                            ? json.html
                            : p.draftHtml,
                    } as Page)
                  : p,
              ),
            );
            return;
          }

          await load();
        } catch (e) {
          const message = (e as any)?.message ? String((e as any).message) : "Failed to sync whole-page source";
          setWholePageSyncNotice(
            message === "Not found"
              ? "Whole-page source could not be refreshed from this page yet. The builder canvas is still available, and you can retry whole-page mode after saving."
              : `Whole-page source sync failed: ${message}`,
          );
        }
      };

      if (!selectedPage.draftHtml && !selectedPage.customHtml) {
        setBusy(true);
        setError(null);
        try {
          await runServerExport();
        } finally {
          setBusy(false);
        }
      } else {
        void runServerExport();
      }
      return;
    }

    if (mode === "BLOCKS" && selectedPage.editorMode === "CUSTOM_HTML") {
      await convertCurrentPageToBlocks();
      return;
    }

    setPages((prev) =>
      (prev || []).map((p) =>
        p.id === selectedPage.id
          ? ({ ...p, editorMode: mode } as Page)
          : p,
      ),
    );
    setSelectedBlockId(null);
  };

  const setBuilderMode = (mode: BuilderSurfaceMode) => {
    if (!selectedPage || selectedPage.editorMode === "MARKDOWN") return;
    if (mode === "blocks" && selectedPageGraph.sourceMode === "custom-html") {
      void convertCurrentPageToBlocks();
      return;
    }
    if (mode === "blocks" && !selectedPageSupportsBlocksSurface) return;

    setBuilderSurfaceMode(mode);
    setCustomCodeContextOpen(false);
    setSelectedHtmlRegionKey(null);
    setWholePageSyncNotice(null);

    if (mode === "whole-page") {
      setWholePageViewMode("source");
      return;
    }

    setSidebarPanel(selectedBlockId ? "selected" : "structure");
    setPreviewMode("edit");
  };

  const applyGlobalHeader = async (headerBlock: CreditFunnelBlock) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/global-header`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "apply", headerBlock }),
        },
      );
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to apply global header");
      await load();
      toast.success("Global header updated");
      return true;
    } catch (e) {
      const msg = (e as any)?.message ? String((e as any).message) : "Failed to apply global header";
      setError(msg);
      toast.error(msg);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveCurrentPage = async () => {
    if (!selectedPage) return false;
    setSavingPage(true);
    try {
      return await saveCurrentFunnelEditorPage({
        selectedPage:
          blocksSurfaceActive && selectedPage.editorMode === "CUSTOM_HTML"
            ? { ...selectedPage, editorMode: "BLOCKS" }
            : selectedPage,
        saveableBlocks,
        selectedChat,
        savePage,
        setEditorMode,
        applyGlobalHeader,
      });
    } finally {
      setSavingPage(false);
    }
  };

  const requestPageSelection = (nextPageId: string | null) => {
    const decision = getFunnelEditorPageSelectionDecision({
      busy,
      savingPage,
      nextPageId,
      selectedPageId,
      selectedPage,
      selectedPageDirty,
    });

    if (decision.kind === "ignore") return;
    if (decision.kind === "confirm-leave") {
      setDialogError(null);
      setDialog({ type: "leave-page", nextPageId: decision.nextPageId });
      return;
    }

    setSelectedPageId(decision.nextPageId);
    setSelectedBlockId(null);
  };

  const continuePageSelection = async (mode: "save" | "discard") => {
    if (dialog?.type !== "leave-page") return;

    const nextPageId = dialog.nextPageId;
    closeDialog();

    if (mode === "save") {
      const saved = await saveCurrentPage();
      if (!saved) return;
    } else {
      await load();
    }

    setSelectedPageId(nextPageId);
    setSelectedBlockId(null);
  };

  const upsertBlock = (block: CreditFunnelBlock) => {
    if (!selectedPage) return;
    const nextEditable = replaceBlockInTree(editableBlocks, block);
    setSelectedPageLocal({
      editorMode: "BLOCKS",
      blocksJson: pageSettingsBlock ? [pageSettingsBlock, ...nextEditable] : nextEditable,
    });
  };

  const insertBlock = (
    base: CreditFunnelBlock,
    opts?: {
      select?: boolean;
      sidebarPanel?: SidebarPanelMode;
    },
  ): string | null => {
    if (!selectedPage) return null;

    const selectedContainer = selectedBlockId ? findContainerForBlock(editableBlocks, selectedBlockId) : null;
    const nextEditable = (() => {
      if (base.type === "headerNav") {
        const next = [base, ...editableBlocks.filter((b) => b.id !== base.id)];
        return next;
      }

      if (selectedBlock && selectedBlock.type === "section") {
        const section = selectedBlock as any;
        const key: BlockContainerKey = section.props?.layout === "two" ? "leftChildren" : "children";
        const nextSection: CreditFunnelBlock = {
          ...section,
          props: {
            ...section.props,
            [key]: [...(Array.isArray(section.props?.[key]) ? section.props[key] : []), base],
          },
        };
        return replaceBlockInTree(editableBlocks, nextSection);
      }

      if (selectedBlockId && selectedContainer && selectedContainer.key !== "root") {
        const containerBlock = findBlockInTree(editableBlocks, selectedContainer.sectionId)?.block;
        if (containerBlock && (containerBlock.type === "section" || containerBlock.type === "columns")) {
          const props: any = containerBlock.props;
          if (containerBlock.type === "columns" && selectedContainer.key === "columnChildren") {
            const cols = Array.isArray(props.columns) ? (props.columns as any[]) : [];
            const col = cols[selectedContainer.columnIndex];
            const arr =
              col && typeof col === "object" && Array.isArray((col as any).children)
                ? ((col as any).children as CreditFunnelBlock[])
                : [];
            const idx = arr.findIndex((b) => b.id === selectedBlockId);
            const nextArr = [...arr];
            nextArr.splice(idx >= 0 ? idx + 1 : nextArr.length, 0, base);
            const nextCols = cols.map((c, i) =>
              i === selectedContainer.columnIndex ? { ...(c || {}), children: nextArr } : c,
            );
            const nextContainer: CreditFunnelBlock = {
              ...containerBlock,
              props: { ...props, columns: nextCols },
            } as any;
            return replaceBlockInTree(editableBlocks, nextContainer);
          }

          const arr = Array.isArray(props[selectedContainer.key]) ? (props[selectedContainer.key] as CreditFunnelBlock[]) : [];
          const idx = arr.findIndex((b) => b.id === selectedBlockId);
          const nextArr = [...arr];
          nextArr.splice(idx >= 0 ? idx + 1 : nextArr.length, 0, base);
          const nextContainer: CreditFunnelBlock = {
            ...containerBlock,
            props: { ...props, [selectedContainer.key]: nextArr },
          } as any;
          return replaceBlockInTree(editableBlocks, nextContainer);
        }
      }

      if (selectedBlockId && selectedContainer?.key === "root") {
        const idx = editableBlocks.findIndex((b) => b.id === selectedBlockId);
        if (idx >= 0) {
          const next = [...editableBlocks];
          next.splice(idx + 1, 0, base);
          return next;
        }
      }

      return [...editableBlocks, base];
    })();

    setSelectedPageLocal({
      editorMode: "BLOCKS",
      blocksJson: pageSettingsBlock ? [pageSettingsBlock, ...nextEditable] : nextEditable,
    });

    if (opts?.select !== false) setSelectedBlockId(base.id);
    if (opts?.sidebarPanel) setSidebarPanel(opts.sidebarPanel);
    return base.id;
  };

  const insertPageFlowBlocks = (
    bases: CreditFunnelBlock[],
    opts?: {
      select?: boolean;
      sidebarPanel?: SidebarPanelMode;
    },
  ): string | null => {
    if (!selectedPage) return null;
    const blocksToInsert = bases.filter((block) => block.type !== "page");
    if (!blocksToInsert.length) return null;

    const anchorId = selectedBlockId ? findTopLevelBlockId(editableBlocks, selectedBlockId) : null;
    const anchorIndex = anchorId ? editableBlocks.findIndex((block) => block.id === anchorId) : -1;
    const insertIndex = anchorIndex >= 0 ? anchorIndex + 1 : editableBlocks.length;
    const nextEditable = [...editableBlocks];
    nextEditable.splice(insertIndex, 0, ...blocksToInsert);

    setSelectedPageLocal({
      editorMode: "BLOCKS",
      blocksJson: pageSettingsBlock ? [pageSettingsBlock, ...nextEditable] : nextEditable,
    });

    if (opts?.select !== false) setSelectedBlockId(blocksToInsert[0].id);
    if (opts?.sidebarPanel) setSidebarPanel(opts.sidebarPanel);
    return blocksToInsert[0].id;
  };

  const ensurePageSettings = () => {
    if (pageSettingsBlock) return pageSettingsBlock;
    const id = newId();
    const next = { id, type: "page", props: { style: {} } } as any as CreditFunnelBlock;
    setSelectedPageLocal({ editorMode: "BLOCKS", blocksJson: [next, ...editableBlocks] });
    return next as any;
  };

  const updatePageStyle = (patch: Partial<BlockStyle>) => {
    const pg = ensurePageSettings() as any;
    const prev = (pg.props || {}).style as BlockStyle | undefined;
    const nextStyle = applyStylePatch(prev, patch);
    const nextPage = { ...pg, props: { ...pg.props, style: nextStyle } };
    setSelectedPageLocal({ editorMode: "BLOCKS", blocksJson: [nextPage, ...editableBlocks] });
  };

  const updateSelectedColumnsColumnStyle = (columnIndex: number, patch: Partial<BlockStyle>) => {
    if (!selectedBlock || selectedBlock.type !== "columns") return;
    const cols = Array.isArray((selectedBlock.props as any).columns) ? ((selectedBlock.props as any).columns as any[]) : [];
    if (columnIndex < 0 || columnIndex >= cols.length) return;
    const nextCols = cols.map((c, idx) => {
      if (idx !== columnIndex) return c;
      const prevStyle = c && typeof c === "object" ? (c as any).style : undefined;
      return { ...(c || {}), style: applyStylePatch(prevStyle, patch) };
    });
    upsertBlock({
      ...selectedBlock,
      props: {
        ...selectedBlock.props,
        columns: nextCols,
      } as any,
    });
  };

  const updateSelectedSectionSideStyle = (side: "leftStyle" | "rightStyle", patch: Partial<BlockStyle>) => {
    if (!selectedBlock || selectedBlock.type !== "section") return;
    upsertBlock({
      ...selectedBlock,
      props: {
        ...selectedBlock.props,
        [side]: applyStylePatch((selectedBlock.props as any)[side], patch),
      } as any,
    });
  };

  const addBlock = (type: Exclude<CreditFunnelBlock["type"], "page" | "anchor">): string | null => {
    if (!selectedPage) return null;
    setPreviewMode("edit");
    const id = newId();
    const base: CreditFunnelBlock =
      type === "headerNav"
        ? {
            id,
            type,
            props: {
              isGlobal: false,
              sticky: true,
              transparent: false,
              mobileMode: "dropdown",
              desktopMode: "inline",
              logoUrl: "",
              logoAlt: "",
              logoHref: "",
              items: [{ id: newId(), label: "Home", kind: "page", pageSlug: "" }],
            } as any,
          }
        : type === "heading"
        ? { id, type, props: { text: "Headline", level: 2 } }
        : type === "paragraph"
          ? { id, type, props: { text: "Write something compelling here." } }
          : type === "button"
            ? {
                id,
                type,
                props: {
                  text: "Get started",
                  href: `${basePath}/forms/your-form-slug`,
                  variant: "primary",
                },
              }
          : type === "salesCheckoutButton"
            ? {
                id,
                type,
                props: {
                  text: "Buy now",
                  priceId: "",
                  quantity: 1,
                },
              }
            : type === "addToCartButton"
              ? {
                  id,
                  type,
                  props: {
                    text: "Add to cart",
                    priceId: "",
                    quantity: 1,
                  },
                }
              : type === "cartButton"
                ? {
                    id,
                    type,
                    props: {
                      text: "Cart",
                    },
                  }
            : type === "image"
              ? { id, type, props: { src: "", alt: "" } }
              : type === "video"
                ? { id, type, props: { src: "", controls: true } as any }
              : type === "formLink"
                ? { id, type, props: { formSlug: "", text: "Open form" } }
                : type === "formEmbed"
                  ? { id, type, props: { formSlug: "" } }
                  : type === "calendarEmbed"
                    ? { id, type, props: { calendarId: "" } }
                  : type === "columns"
                    ? {
                        id,
                        type,
                        props: {
                          columns: [
                            {
                              markdown: "",
                              children: [
                                { id: newId(), type: "heading", props: { text: "Column 1", level: 3 } },
                                { id: newId(), type: "paragraph", props: { text: "Add your content…" } },
                              ],
                            },
                            {
                              markdown: "",
                              children: [
                                { id: newId(), type: "heading", props: { text: "Column 2", level: 3 } },
                                { id: newId(), type: "paragraph", props: { text: "Add your content…" } },
                              ],
                            },
                          ],
                          gapPx: 24,
                          stackOnMobile: true,
                        },
                      }
                    : type === "section"
                      ? {
                          id,
                          type,
                          props: {
                            layout: "one",
                            children: [],
                            gapPx: 24,
                            stackOnMobile: true,
                          },
                        }
                      : type === "customCode"
                        ? { id, type, props: { html: "", css: "", heightPx: 360, chatJson: [] } as any }
                        : type === "chatbot"
                          ? {
                              id,
                              type,
                              props: {
                                agentId: String(aiReceptionistChatAgentId || "").trim(),
                                primaryColor: "#1d4ed8",
                                launcherStyle: "bubble",
                                placementX: "right",
                                placementY: "bottom",
                              },
                            }
                          : { id, type: "spacer", props: { height: 24 } };

    return insertBlock(base, { select: true, sidebarPanel: "selected" });
  };

  type FunnelPresetKey = "hero" | "body" | "form" | "shop";

  const buildPresetBlocks = (preset: FunnelPresetKey): CreditFunnelBlock[] => {
    if (!selectedPage) return [];

    const blocks: CreditFunnelBlock[] = [];
    const firstFormSlug = (forms || []).find((f) => typeof f?.slug === "string" && f.slug.trim())?.slug || "";

    if (preset === "hero") {
      blocks.push({
        id: newId(),
        type: "section",
        props: {
          layout: "one",
          children: [
            { id: newId(), type: "heading", props: { text: "Hero headline", level: 1, style: { align: "center" } } },
            { id: newId(), type: "paragraph", props: { text: "Add your subheadline here.", style: { align: "center" } } },
            {
              id: newId(),
              type: "button",
              props: {
                text: "Get started",
                href: firstFormSlug
                  ? `${basePath}/forms/${encodeURIComponent(firstFormSlug)}`
                  : `${basePath}/forms/your-form-slug`,
                variant: "primary",
                style: { align: "center" },
              },
            },
          ],
          style: {
            backgroundColor: "#0f172a",
            textColor: "#ffffff",
            paddingPx: 48,
            borderRadiusPx: 24,
            marginBottomPx: 24,
          },
        },
      });
    }

    if (preset === "body") {
      blocks.push({
        id: newId(),
        type: "section",
        props: {
          layout: "one",
          children: [
            { id: newId(), type: "heading", props: { text: "Why this works", level: 2 } },
            {
              id: newId(),
              type: "paragraph",
              props: {
                text: "Add a short explanation of your offer and the outcomes customers should expect.",
              },
            },
            {
              id: newId(),
              type: "columns",
              props: {
                columns: [
                  {
                    markdown: "",
                    children: [
                      { id: newId(), type: "heading", props: { text: "Benefit 1", level: 3 } },
                      { id: newId(), type: "paragraph", props: { text: "A concise benefit statement." } },
                    ],
                  },
                  {
                    markdown: "",
                    children: [
                      { id: newId(), type: "heading", props: { text: "Benefit 2", level: 3 } },
                      { id: newId(), type: "paragraph", props: { text: "A concise benefit statement." } },
                    ],
                  },
                ],
                gapPx: 16,
                stackOnMobile: true,
              },
            },
          ],
          style: { paddingPx: 32, backgroundColor: "#f8fafc", borderRadiusPx: 24, marginBottomPx: 16 },
        },
      });
    }

    if (preset === "form") {
      blocks.push({
        id: newId(),
        type: "section",
        props: {
          layout: "one",
          children: [
            { id: newId(), type: "heading", props: { text: "Get started", level: 2 } },
            {
              id: newId(),
              type: "paragraph",
              props: {
                text: "Capture details with a hosted form.",
              },
            },
            firstFormSlug
              ? ({ id: newId(), type: "formEmbed", props: { formSlug: firstFormSlug, height: 720 } as any } as any)
              : ({ id: newId(), type: "formLink", props: { formSlug: "", text: "Open form" } as any } as any),
          ],
          style: { paddingPx: 32, backgroundColor: "#f8fafc", borderRadiusPx: 24, marginBottomPx: 16 },
        },
      });
    }

    if (preset === "shop") {
      const productCard = (label: string): CreditFunnelBlock[] => [
        { id: newId(), type: "heading", props: { text: label, level: 3 } },
        { id: newId(), type: "paragraph", props: { text: "Short description (optional)." } },
        { id: newId(), type: "addToCartButton", props: { text: "Add to cart", priceId: "", quantity: 1 } as any },
      ];

      blocks.push({
        id: newId(),
        type: "section",
        props: {
          layout: "one",
          children: [
            { id: newId(), type: "heading", props: { text: "Shop", level: 2 } },
            {
              id: newId(),
              type: "paragraph",
              props: {
                text: "Connect products to Stripe and let customers add multiple items before checkout.",
              },
            },
            { id: newId(), type: "cartButton", props: { text: "Cart" } as any },
            {
              id: newId(),
              type: "columns",
              props: {
                columns: [
                  { markdown: "", children: productCard("Product 1") },
                  { markdown: "", children: productCard("Product 2") },
                  { markdown: "", children: productCard("Product 3") },
                ],
                gapPx: 16,
                stackOnMobile: true,
              },
            },
          ],
          style: { paddingPx: 32, backgroundColor: "#f8fafc", borderRadiusPx: 24, marginBottomPx: 16 },
        },
      });
    }

    return blocks;
  };

  const addPresetSection = (preset: FunnelPresetKey) => {
    if (!selectedPage) return;
    setPreviewMode("edit");
    const blocks = buildPresetBlocks(preset);
    if (!blocks.length) return;
    insertPageFlowBlocks(blocks, { select: true, sidebarPanel: "selected" });
  };

  const removeBlock = useCallback((blockId: string) => {
    if (!selectedPage) return;
    const nextEditable = removeBlockFromTree(editableBlocks, blockId);
    setSelectedPageLocal({ blocksJson: pageSettingsBlock ? [pageSettingsBlock, ...nextEditable] : nextEditable });
    if (selectedBlockId === blockId) setSelectedBlockId(null);
  }, [editableBlocks, pageSettingsBlock, removeBlockFromTree, selectedBlockId, selectedPage, setSelectedPageLocal]);

  const requestDeleteBlock = useCallback((blockId: string) => {
    const targetBlock = findBlockInTree(editableBlocks, blockId)?.block || null;
    setDialog({ type: "delete-block", blockId, label: describeBuilderBlockNoun(targetBlock) });
  }, [editableBlocks, findBlockInTree]);

  removeBlockRef.current = removeBlock;

  const reorderBlocks = (dragId: string, dropId: string) => {
    if (dragId === dropId) return;
    const dragContainer = findContainerForBlock(editableBlocks, dragId);
    const dropContainer = findContainerForBlock(editableBlocks, dropId);
    if (!dragContainer || !dropContainer) return;
    if (dragContainer.key !== dropContainer.key) return;
    if (dragContainer.key !== "root") {
      if (dragContainer.sectionId !== (dropContainer as any).sectionId) return;
      if (dragContainer.key === "columnChildren" && (dragContainer as any).columnIndex !== (dropContainer as any).columnIndex) return;
    }

    const reorderInArray = <T extends { id: string }>(arr: T[]): T[] => {
      const fromIdx = arr.findIndex((b) => b.id === dragId);
      const toIdx = arr.findIndex((b) => b.id === dropId);
      if (fromIdx < 0 || toIdx < 0) return arr;
      const next = [...arr];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    };

    let nextEditable = editableBlocks;
    if (dragContainer.key === "root") {
      nextEditable = reorderInArray(editableBlocks);
    } else {
      const containerBlock = findBlockInTree(editableBlocks, dragContainer.sectionId)?.block;
      if (containerBlock && (containerBlock.type === "section" || containerBlock.type === "columns")) {
        const props: any = containerBlock.props;
        if (containerBlock.type === "columns" && dragContainer.key === "columnChildren") {
          const cols = Array.isArray(props.columns) ? (props.columns as any[]) : [];
          const col = cols[(dragContainer as any).columnIndex];
          const arr = col && typeof col === "object" && Array.isArray((col as any).children) ? ((col as any).children as CreditFunnelBlock[]) : [];
          const nextArr = reorderInArray(arr);
          const nextCols = cols.map((c, i) => (i === (dragContainer as any).columnIndex ? { ...(c || {}), children: nextArr } : c));
          const nextContainer: CreditFunnelBlock = { ...containerBlock, props: { ...props, columns: nextCols } } as any;
          nextEditable = replaceBlockInTree(editableBlocks, nextContainer);
        } else {
          const arr = Array.isArray(props[dragContainer.key]) ? (props[dragContainer.key] as CreditFunnelBlock[]) : [];
          const nextArr = reorderInArray(arr);
          const nextContainer: CreditFunnelBlock = { ...containerBlock, props: { ...props, [dragContainer.key]: nextArr } } as any;
          nextEditable = replaceBlockInTree(editableBlocks, nextContainer);
        }
      }
    }

    setSelectedPageLocal({ blocksJson: pageSettingsBlock ? [pageSettingsBlock, ...nextEditable] : nextEditable });
  };

  const canMoveBlock = (id: string, dir: "up" | "down") => {
    const delta = dir === "up" ? -1 : 1;
    const container = findContainerForBlock(editableBlocks, id);
    if (!container) return false;

    const canInArray = <T extends { id: string }>(arr: T[]) => {
      const idx = arr.findIndex((b) => b.id === id);
      if (idx < 0) return false;
      const nextIdx = idx + delta;
      return nextIdx >= 0 && nextIdx < arr.length;
    };

    if (container.key === "root") return canInArray(editableBlocks);

    const containerBlock = findBlockInTree(editableBlocks, container.sectionId)?.block;
    if (!containerBlock || (containerBlock.type !== "section" && containerBlock.type !== "columns")) return false;
    const props: any = containerBlock.props;

    if (container.key === "columnChildren") {
      if (containerBlock.type !== "columns") return false;
      const cols = Array.isArray(props.columns) ? (props.columns as any[]) : [];
      const col = cols[(container as any).columnIndex];
      const arr = col && typeof col === "object" && Array.isArray((col as any).children) ? ((col as any).children as CreditFunnelBlock[]) : [];
      return canInArray(arr);
    }

    const arr = Array.isArray(props[container.key]) ? (props[container.key] as CreditFunnelBlock[]) : [];
    return canInArray(arr);
  };

  const moveBlock = (id: string, dir: "up" | "down") => {
    if (!selectedPage) return;
    const delta = dir === "up" ? -1 : 1;
    const container = findContainerForBlock(editableBlocks, id);
    if (!container) return;

    const swapInArray = <T extends { id: string }>(arr: T[]): T[] => {
      const idx = arr.findIndex((b) => b.id === id);
      if (idx < 0) return arr;
      const nextIdx = idx + delta;
      if (nextIdx < 0 || nextIdx >= arr.length) return arr;
      const next = [...arr];
      const tmp = next[idx];
      next[idx] = next[nextIdx];
      next[nextIdx] = tmp;
      return next;
    };

    let nextEditable = editableBlocks;
    if (container.key === "root") {
      nextEditable = swapInArray(editableBlocks);
    } else {
      const containerBlock = findBlockInTree(editableBlocks, container.sectionId)?.block;
      if (containerBlock && (containerBlock.type === "section" || containerBlock.type === "columns")) {
        const props: any = containerBlock.props;
        if (container.key === "columnChildren") {
          if (containerBlock.type !== "columns") return;
          const cols = Array.isArray(props.columns) ? (props.columns as any[]) : [];
          const colIndex = (container as any).columnIndex as number;
          const col = cols[colIndex];
          const arr = col && typeof col === "object" && Array.isArray((col as any).children) ? ((col as any).children as CreditFunnelBlock[]) : [];
          const nextArr = swapInArray(arr);
          const nextCols = cols.map((c, i) => (i === colIndex ? { ...(c || {}), children: nextArr } : c));
          const nextContainer: CreditFunnelBlock = { ...containerBlock, props: { ...props, columns: nextCols } } as any;
          nextEditable = replaceBlockInTree(editableBlocks, nextContainer);
        } else {
          const arr = Array.isArray(props[container.key]) ? (props[container.key] as CreditFunnelBlock[]) : [];
          const nextArr = swapInArray(arr);
          const nextContainer: CreditFunnelBlock = { ...containerBlock, props: { ...props, [container.key]: nextArr } } as any;
          nextEditable = replaceBlockInTree(editableBlocks, nextContainer);
        }
      }
    }

    setSelectedPageLocal({ blocksJson: pageSettingsBlock ? [pageSettingsBlock, ...nextEditable] : nextEditable });
    setSelectedBlockId(id);
  };

  const runAi = async (promptOverride?: string) => {
    if (!selectedPage) return;
    const promptText = String(promptOverride ?? chatInput).trim();
    if (!promptText) return;
    const shouldUseWholePageForFirstDraft = Boolean(
      blankPageOnboardingActive && !canonicalCustomCodeBlock && editableBlocks.length === 0 && selectedChat.length === 0,
    );
    const previousPage = {
      editorMode: selectedPage.editorMode,
      blocksJson: selectedPage.blocksJson,
      customHtml: selectedPage.customHtml,
      draftHtml: selectedPage.draftHtml,
      customChatJson: selectedPage.customChatJson,
    };
    setBusy(true);
    setError(null);
    setChatInput("");
    try {
      if (aiUsesManagedStructure && !shouldUseWholePageForFirstDraft) {
        const existingBlock = canonicalCustomCodeBlock;
        const builderFocusBlock = existingBlock && existingBlock.type === "customCode" ? existingBlock : selectedBlock;

        if (builderFocusBlock?.id) setSelectedBlockId(builderFocusBlock.id);
        setAiWorkFocus({
          mode: "builder",
          label: `AI is updating ${describeBuilderAiTarget(builderFocusBlock ?? null)}`,
          phase: "pending",
          regionKey: null,
          blockId: builderFocusBlock?.id || null,
        });

        const currentHtml =
          existingBlock && existingBlock.type === "customCode"
            ? String((existingBlock.props as any).html || "")
            : "";
        const currentCss =
          existingBlock && existingBlock.type === "customCode"
            ? String((existingBlock.props as any).css || "")
            : "";

        const prevChat =
          existingBlock && existingBlock.type === "customCode" && Array.isArray((existingBlock.props as any).chatJson)
            ? ((existingBlock.props as any).chatJson as BlockChatMessage[])
            : [];
        const threadContextChat = buildCustomCodeActiveThreadMessages(prevChat, promptText);

        const res = await fetch("/api/portal/funnel-builder/custom-code-block/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            funnelId,
            pageId: selectedPage.id,
            prompt: promptText,
            currentHtml,
            currentCss,
            contextKeys: aiContextKeys,
            contextMedia: effectiveAiContextMedia,
            funnelBrief: funnel?.brief ?? null,
            intentProfile: pageIntentProfile,
            chatHistory: threadContextChat.map((message) => ({ role: message.role, content: message.content })),
          }),
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to generate builder content");
        const resultSummary = typeof json?.summary === "string" ? String(json.summary).trim() : "";

        const userMsg: BlockChatMessage = { role: "user", content: promptText, at: new Date().toISOString() };

        const insertCustomCodeBlock = (base: CreditFunnelBlock): CreditFunnelBlock[] => {
          const selectedContainer = selectedBlockId ? findContainerForBlock(editableBlocks, selectedBlockId) : null;

          if (selectedBlock && selectedBlock.type === "section") {
            const section = selectedBlock as any;
            const key: any = section.props?.layout === "two" ? "leftChildren" : "children";
            const nextSection: CreditFunnelBlock = {
              ...section,
              props: {
                ...section.props,
                [key]: [...(Array.isArray(section.props?.[key]) ? section.props[key] : []), base],
              },
            };
            return replaceBlockInTree(editableBlocks, nextSection);
          }

          if (selectedBlockId && selectedContainer && selectedContainer.key !== "root") {
            const containerBlock = findBlockInTree(editableBlocks, selectedContainer.sectionId)?.block;
            if (containerBlock && (containerBlock.type === "section" || containerBlock.type === "columns")) {
              const props: any = (containerBlock as any).props;
              if (containerBlock.type === "columns" && selectedContainer.key === "columnChildren") {
                const cols = Array.isArray(props.columns) ? (props.columns as any[]) : [];
                const col = cols[selectedContainer.columnIndex];
                const arr =
                  col && typeof col === "object" && Array.isArray((col as any).children)
                    ? ((col as any).children as CreditFunnelBlock[])
                    : [];
                const idx = arr.findIndex((b) => b.id === selectedBlockId);
                const nextArr = [...arr];
                nextArr.splice(idx >= 0 ? idx + 1 : nextArr.length, 0, base);
                const nextCols = cols.map((c, i) =>
                  i === selectedContainer.columnIndex ? { ...(c || {}), children: nextArr } : c,
                );
                const nextContainer: CreditFunnelBlock = {
                  ...containerBlock,
                  props: { ...props, columns: nextCols },
                } as any;
                return replaceBlockInTree(editableBlocks, nextContainer);
              }

              const arr = Array.isArray(props[selectedContainer.key])
                ? (props[selectedContainer.key] as CreditFunnelBlock[])
                : [];
              const idx = arr.findIndex((b) => b.id === selectedBlockId);
              const nextArr = [...arr];
              nextArr.splice(idx >= 0 ? idx + 1 : nextArr.length, 0, base);
              const nextContainer: CreditFunnelBlock = {
                ...containerBlock,
                props: { ...props, [selectedContainer.key]: nextArr },
              } as any;
              return replaceBlockInTree(editableBlocks, nextContainer);
            }
          }

          if (selectedBlockId && selectedContainer?.key === "root") {
            const idx = editableBlocks.findIndex((b) => b.id === selectedBlockId);
            if (idx >= 0) {
              const next = [...editableBlocks];
              next.splice(idx + 1, 0, base);
              return next;
            }
          }

          return [...editableBlocks, base];
        };

        const pruneEmptyCustomCodeArtifacts = (blocks: CreditFunnelBlock[], keepId: string | null) => {
          const customCodeBlocks = collectCustomCodeBlocks(blocks);
          const meaningfulBlocks = customCodeBlocks.filter((block) => isMeaningfulCustomCodeBlock(block));
          if (!meaningfulBlocks.length) return blocks;

          return customCodeBlocks.reduce((nextBlocks, block) => {
            if (block.id === keepId) return nextBlocks;
            if (isMeaningfulCustomCodeBlock(block)) return nextBlocks;
            return removeBlockFromTree(nextBlocks, block.id);
          }, blocks);
        };

        const question = typeof json?.question === "string" ? String(json.question).trim() : "";
        if (question) {
          const askedAt = new Date().toISOString();
          const assistantMsg: BlockChatMessage = { role: "assistant", content: question, at: askedAt };
          const nextChat = [...threadContextChat, userMsg, assistantMsg].slice(-((CUSTOM_CODE_THREAD_WINDOW_LIMIT + 1) * 2));
          if (existingBlock && existingBlock.type === "customCode") {
            const nextHistory = prependPersistedCustomCodeAuditEntry((existingBlock.props as any).aiHistoryJson, {
              id: newId(),
              kind: "question",
              at: askedAt,
              prompt: promptText,
              summary: question,
              previewChanged: false,
              builderDiff: null,
              customCodeDiff: null,
            });
            const nextEditable = replaceBlockInTree(
              editableBlocks,
              {
                ...existingBlock,
                props: {
                  ...(existingBlock.props as any),
                  chatJson: nextChat,
                  aiHistoryJson: nextHistory,
                },
              } as any,
            );
            const normalizedEditable = pruneEmptyCustomCodeArtifacts(nextEditable, existingBlock.id);
            const nextBlocksJson = pageSettingsBlock ? [pageSettingsBlock, ...normalizedEditable] : normalizedEditable;

            setSelectedPageLocal({ editorMode: "BLOCKS", blocksJson: nextBlocksJson });
            setAiSidebarCustomCodeBlockId(existingBlock.id);
            setSelectedBlockId(existingBlock.id);
            setSidebarPanel("selected");
            await savePage({
              editorMode: "BLOCKS",
              blocksJson: nextBlocksJson,
              brief: pageIntentProfile,
            });
          } else {
            setAiSidebarCustomCodeBlockId(null);
            setSidebarPanel("activity");
            setAiResultBanner({ summary: question, at: askedAt, tone: "warning" });
            setAiWorkFocus({
              mode: "builder",
              label: "AI needs one more detail before it can change this page",
              phase: "settled",
              regionKey: null,
              blockId: null,
            });
          }
          setLastAiRun(null);
          return;
        }

        const actions = Array.isArray(json?.actions) ? (json.actions as any[]) : [];
        if (actions.length) {
          const assistantText = typeof json?.assistantText === "string" ? String(json.assistantText).trim() : "";
          const assistantMsg: BlockChatMessage | null = assistantText
            ? { role: "assistant", content: assistantText, at: new Date().toISOString() }
            : null;
          const nextChat = [...threadContextChat, userMsg, ...(assistantMsg ? [assistantMsg] : [])].slice(-((CUSTOM_CODE_THREAD_WINDOW_LIMIT + 1) * 2));

          const s = (v: unknown, max = 240) => (typeof v === "string" ? v : "").trim().slice(0, max);

          const isSafeHref = (href: string) => {
            const raw = String(href || "").trim();
            if (!raw) return false;
            if (raw.startsWith("/") || raw.startsWith("#")) return true;
            try {
              const u = new URL(raw);
              return ["http:", "https:", "mailto:", "tel:"].includes(u.protocol);
            } catch {
              return false;
            }
          };

          const coerceAiBlock = (rawBlock: any): CreditFunnelBlock | null => {
            const type = s(rawBlock?.type, 40);
            const props =
              rawBlock?.props && typeof rawBlock.props === "object" && !Array.isArray(rawBlock.props)
                ? rawBlock.props
                : {};
            const id = newId();
            const style = coerceBlockStyle((props as any).style);

            if (type === "chatbot") {
              const agentId = s((props as any).agentId, 140);
              return {
                id,
                type: "chatbot",
                props: {
                  agentId: agentId || String(aiReceptionistChatAgentId || "").trim(),
                  primaryColor: s((props as any).primaryColor, 40) || "#1d4ed8",
                  launcherStyle:
                    (props as any).launcherStyle === "dots"
                      ? "dots"
                      : (props as any).launcherStyle === "spark"
                        ? "spark"
                        : "bubble",
                  launcherImageUrl: s((props as any).launcherImageUrl, 800) || "",
                  placementX:
                    (props as any).placementX === "left"
                      ? "left"
                      : (props as any).placementX === "center"
                        ? "center"
                        : "right",
                  placementY:
                    (props as any).placementY === "top"
                      ? "top"
                      : (props as any).placementY === "middle"
                        ? "middle"
                        : "bottom",
                  ...(style ? { style } : null),
                } as any,
              };
            }

            if (type === "image") {
              const src = s((props as any).src, 1200);
              return {
                id,
                type: "image",
                props: {
                  src,
                  alt: s((props as any).alt, 200),
                  ...(style ? { style } : null),
                },
              };
            }

            if (type === "video") {
              const src = s((props as any).src, 1200);
              if (!src) return null;
              const aspectRatioRaw = s((props as any).aspectRatio, 20);
              const aspectRatio = ["auto", "16:9", "9:16", "4:3", "1:1"].includes(aspectRatioRaw)
                ? (aspectRatioRaw as "auto" | "16:9" | "9:16" | "4:3" | "1:1")
                : undefined;
              const fitRaw = s((props as any).fit, 20);
              const fit = fitRaw === "cover" ? "cover" : fitRaw === "contain" ? "contain" : undefined;
              return {
                id,
                type: "video",
                props: {
                  src,
                  name: s((props as any).name, 200),
                  posterUrl: s((props as any).posterUrl, 1200),
                  controls: (props as any).controls !== false,
                  autoplay: Boolean((props as any).autoplay),
                  loop: Boolean((props as any).loop),
                  muted: Boolean((props as any).muted),
                  ...(aspectRatio ? { aspectRatio } : null),
                  ...(fit ? { fit } : null),
                  ...(typeof (props as any).showFrame === "boolean" ? { showFrame: (props as any).showFrame } : null),
                  ...(style ? { style } : null),
                },
              } as any;
            }

            if (type === "heading") {
              const text = s((props as any).text, 240) || "Heading";
              const level = [1, 2, 3].includes(Number((props as any).level))
                ? (Number((props as any).level) as 1 | 2 | 3)
                : 2;
              return { id, type: "heading", props: { text, level, ...(style ? { style } : null) } } as any;
            }

            if (type === "paragraph") {
              const text = s((props as any).text, 2000) || "";
              if (!text) return null;
              return { id, type: "paragraph", props: { text, ...(style ? { style } : null) } } as any;
            }

            if (type === "button") {
              const text = s((props as any).text, 120) || "Click";
              const hrefRaw = s((props as any).href, 800) || "#";
              const href = isSafeHref(hrefRaw) ? hrefRaw : "#";
              const variant = (props as any).variant === "secondary" ? "secondary" : "primary";
              return { id, type: "button", props: { text, href, variant, ...(style ? { style } : null) } } as any;
            }

            if (type === "spacer") {
              const heightNum = Number((props as any).height);
              const height = Number.isFinite(heightNum) ? Math.max(0, Math.min(240, heightNum)) : 24;
              return { id, type: "spacer", props: { height, ...(style ? { style } : null) } } as any;
            }

            if (type === "formLink") {
              const formSlug = s((props as any).formSlug, 160);
              if (!formSlug) return null;
              const text = s((props as any).text, 120) || "Open form";
              return { id, type: "formLink", props: { formSlug, text, ...(style ? { style } : null) } } as any;
            }

            if (type === "formEmbed") {
              const formSlug = s((props as any).formSlug, 160);
              if (!formSlug) return null;
              const heightNum = Number((props as any).height);
              const height = Number.isFinite(heightNum) ? Math.max(120, Math.min(1600, heightNum)) : undefined;
              return {
                id,
                type: "formEmbed",
                props: {
                  formSlug,
                  ...(typeof height === "number" ? { height } : {}),
                  ...(style ? { style } : null),
                },
              } as any;
            }

            if (type === "calendarEmbed") {
              const calendarId = s((props as any).calendarId, 160);
              if (!calendarId) return null;
              const heightNum = Number((props as any).height);
              const height = Number.isFinite(heightNum) ? Math.max(120, Math.min(1600, heightNum)) : undefined;
              return {
                id,
                type: "calendarEmbed",
                props: {
                  calendarId,
                  ...(typeof height === "number" ? { height } : {}),
                  ...(style ? { style } : null),
                },
              } as any;
            }

            if (type === "salesCheckoutButton") {
              const priceId = s((props as any).priceId, 140);
              const qtyNum = Number((props as any).quantity);
              const quantity = Number.isFinite(qtyNum) ? Math.max(1, Math.min(20, Math.floor(qtyNum))) : 1;
              const text = s((props as any).text, 120) || "Buy now";
              return { id, type: "salesCheckoutButton", props: { text, priceId, quantity, ...(style ? { style } : null) } } as any;
            }

            return null;
          };

          const insertAfterAnchor = (blocks: CreditFunnelBlock[], anchorId: string, block: CreditFunnelBlock): CreditFunnelBlock[] => {
            const container = anchorId ? findContainerForBlock(blocks, anchorId) : null;
            if (anchorId && container && container.key !== "root") {
              const containerBlock = findBlockInTree(blocks, container.sectionId)?.block;
              if (containerBlock && (containerBlock.type === "section" || containerBlock.type === "columns")) {
                const props: any = (containerBlock as any).props;
                if (containerBlock.type === "columns" && container.key === "columnChildren") {
                  const cols = Array.isArray(props.columns) ? (props.columns as any[]) : [];
                  const col = cols[container.columnIndex];
                  const arr =
                    col && typeof col === "object" && Array.isArray((col as any).children)
                      ? ((col as any).children as CreditFunnelBlock[])
                      : [];
                  const idx = arr.findIndex((b) => b.id === anchorId);
                  const nextArr = [...arr];
                  nextArr.splice(idx >= 0 ? idx + 1 : nextArr.length, 0, block);
                  const nextCols = cols.map((c, i) =>
                    i === container.columnIndex ? { ...(c || {}), children: nextArr } : c,
                  );
                  const nextContainer: CreditFunnelBlock = {
                    ...(containerBlock as any),
                    props: { ...props, columns: nextCols },
                  } as any;
                  return replaceBlockInTree(blocks, nextContainer);
                }

                const arr = Array.isArray(props[container.key]) ? (props[container.key] as CreditFunnelBlock[]) : [];
                const idx = arr.findIndex((b) => b.id === anchorId);
                const nextArr = [...arr];
                nextArr.splice(idx >= 0 ? idx + 1 : nextArr.length, 0, block);
                const nextContainer: CreditFunnelBlock = {
                  ...(containerBlock as any),
                  props: { ...props, [container.key]: nextArr },
                } as any;
                return replaceBlockInTree(blocks, nextContainer);
              }
            }

            if (anchorId && container?.key === "root") {
              const idx = blocks.findIndex((b) => b.id === anchorId);
              if (idx >= 0) {
                const next = [...blocks];
                next.splice(idx + 1, 0, block);
                return next;
              }
            }

            return [...blocks, block];
          };

          const customCodeId = existingBlock && existingBlock.type === "customCode" ? existingBlock.id : null;
          const customCodeDiff =
            existingBlock && existingBlock.type === "customCode"
              ? summarizeCustomCodeDiff({
                  previousHtml: currentHtml,
                  nextHtml: currentHtml,
                  previousCss: currentCss,
                  nextCss: currentCss,
                })
              : null;

          let nextEditable = editableBlocks;

          let anchorId = customCodeId || selectedBlockId || "";
          const insertedIds: string[] = [];

          for (const a of actions.slice(0, 6)) {
            if (!a || typeof a.type !== "string") continue;
            if (a.type === "insertAfter") {
              const nextBlock = coerceAiBlock((a as any).block);
              if (!nextBlock) continue;
              nextEditable = insertAfterAnchor(nextEditable, anchorId, nextBlock);
              anchorId = nextBlock.id;
              insertedIds.push(nextBlock.id);
              continue;
            }

            if (a.type === "insertPresetAfter") {
              const preset = String((a as any).preset || "").trim();
              if (preset !== "hero" && preset !== "body" && preset !== "form" && preset !== "shop") continue;
              const presetBlocks = buildPresetBlocks(preset as any);
              for (const b of presetBlocks.slice(0, 3)) {
                nextEditable = insertAfterAnchor(nextEditable, anchorId, b);
                anchorId = b.id;
                insertedIds.push(b.id);
              }
            }
          }

          nextEditable = pruneEmptyCustomCodeArtifacts(nextEditable, customCodeId);
          let nextBlocksJson = pageSettingsBlock ? [pageSettingsBlock, ...nextEditable] : nextEditable;
          const summaryText =
            resultSummary ||
            assistantText ||
            (insertedIds.length
              ? `Added ${insertedIds.length} builder block${insertedIds.length === 1 ? "" : "s"}.`
              : "Updated the builder with AI.");
          const diff = summarizeBuilderDiff(previousPage.blocksJson, nextBlocksJson);
          const runAt = new Date().toISOString();
          const structureReviewHtml = buildEditorPreviewHtml(buildWholePageDraftHtml(selectedPage, nextBlocksJson) || "");

          if (existingBlock && existingBlock.type === "customCode") {
            const nextHistory = prependPersistedCustomCodeAuditEntry((existingBlock.props as any).aiHistoryJson, {
              id: newId(),
              kind: diff.changed ? "ai-update" : "no-change",
              at: runAt,
              prompt: promptText,
              summary: summaryText,
              previewChanged: diff.changed,
              builderDiff: diff,
              customCodeDiff,
            });
            const updatedCustomCodeBlock: CreditFunnelBlock = {
              ...existingBlock,
              props: {
                ...(existingBlock.props as any),
                chatJson: nextChat,
                aiHistoryJson: nextHistory,
              },
            } as any;
            nextEditable = replaceBlockInTree(nextEditable, updatedCustomCodeBlock);
            nextEditable = pruneEmptyCustomCodeArtifacts(nextEditable, customCodeId);
            nextBlocksJson = pageSettingsBlock ? [pageSettingsBlock, ...nextEditable] : nextEditable;
          }

          setSelectedPageLocal({ editorMode: "BLOCKS", blocksJson: nextBlocksJson });
          setAiSidebarCustomCodeBlockId(customCodeId);
          setLastAiRun({
            pageId: selectedPage.id,
            surface: "structure",
            prompt: promptText,
            summary: summaryText,
            warnings: [],
            at: runAt,
            backgroundReviewStatus: "pending",
            backgroundReviewSummary: null,
            backgroundReviewMode: null,
            changelog: null,
            previousPage,
          });
          setAiResultBanner({ summary: summaryText, at: runAt, tone: diff.changed ? "success" : "warning" });
          appendBuilderChangeActivity({
            id: newId(),
            pageId: selectedPage.id,
            kind: diff.changed ? "ai-update" : "no-change",
            scopeLabel: insertedIds.length ? "Structure + insert" : "Structure",
            prompt: promptText,
            summary: summaryText,
            at: runAt,
            diff,
            previewChanged: diff.changed,
            targetBlockId: customCodeId,
            customCodeDiff,
          });
          setAiWorkFocus({
            mode: "builder",
            label: insertedIds.length
              ? `Added ${insertedIds.length} new block${insertedIds.length === 1 ? "" : "s"}`
              : `Updated ${describeBuilderAiTarget(builderFocusBlock ?? null)}`,
            phase: "settled",
            regionKey: null,
            blockId: insertedIds[0] || customCodeId,
          });

          if (insertedIds[0]) {
            setSelectedBlockId(insertedIds[0]);
            setSidebarPanel("selected");
          } else if (customCodeId) {
            setSelectedBlockId(customCodeId);
            setSidebarPanel("selected");
          } else {
            setSidebarPanel("selected");
          }

          await savePage({
            editorMode: "BLOCKS",
            blocksJson: nextBlocksJson,
            brief: pageIntentProfile,
          });
          void requestBackgroundVisualReview({
            funnelId,
            pageId: selectedPage.id,
            surface: "structure",
            prompt: promptText,
            html: structureReviewHtml,
            css: "",
            renderHtml: structureReviewHtml,
            previewDevice,
            at: runAt,
            intentProfile: pageIntentProfile,
            funnelBrief: funnel?.brief ?? null,
          });
          return;
        }

        const nextHtml = typeof json.html === "string" ? json.html : "";
        const nextCss = typeof json.css === "string" ? json.css : "";
        const assistantText = typeof json?.assistantText === "string" ? String(json.assistantText).trim() : "";
        const routeWarnings = Array.isArray(json?.warnings)
          ? json.warnings
              .filter((item: unknown) => typeof item === "string" && item.trim())
              .map((item: string) => item.trim())
          : [];
        const assistantMsg: BlockChatMessage | null = assistantText
          ? { role: "assistant", content: assistantText, at: new Date().toISOString() }
          : null;
        const nextChat = [...threadContextChat, userMsg, ...(assistantMsg ? [assistantMsg] : [])].slice(-((CUSTOM_CODE_THREAD_WINDOW_LIMIT + 1) * 2));

        const customCodeId = existingBlock && existingBlock.type === "customCode" ? existingBlock.id : newId();
        const summaryText = resultSummary || assistantText || "Updated a custom code block in the builder.";
        const customCodeDiff = summarizeCustomCodeDiff({
          previousHtml: currentHtml,
          nextHtml,
          previousCss: currentCss,
          nextCss,
        });
        const runAt = new Date().toISOString();
        const baseCustomCodeBlock: CreditFunnelBlock =
          existingBlock && existingBlock.type === "customCode"
            ? {
                ...existingBlock,
                props: {
                  ...(existingBlock.props as any),
                  html: nextHtml,
                  css: nextCss,
                  chatJson: nextChat,
                },
              }
            : {
                id: customCodeId,
                type: "customCode",
                props: { html: nextHtml, css: nextCss, heightPx: 360, chatJson: nextChat } as any,
              };
        const nextEditableBase =
          existingBlock && existingBlock.type === "customCode"
            ? replaceBlockInTree(editableBlocks, baseCustomCodeBlock as any)
            : insertCustomCodeBlock(baseCustomCodeBlock as any);
        let nextEditable = pruneEmptyCustomCodeArtifacts(nextEditableBase, customCodeId);
        let nextBlocksJson = pageSettingsBlock ? [pageSettingsBlock, ...nextEditable] : nextEditable;
        const diff = summarizeBuilderDiff(previousPage.blocksJson, nextBlocksJson);
        const nextHistory = prependPersistedCustomCodeAuditEntry(
          existingBlock && existingBlock.type === "customCode" ? (existingBlock.props as any).aiHistoryJson : undefined,
          {
            id: newId(),
            kind: customCodeDiff.htmlChanged || customCodeDiff.cssChanged || diff.changed ? "ai-update" : "no-change",
            at: runAt,
            prompt: promptText,
            summary: summaryText,
            previewChanged: customCodeDiff.htmlChanged || customCodeDiff.cssChanged,
            builderDiff: diff,
            customCodeDiff,
          },
        );
        const finalCustomCodeBlock: CreditFunnelBlock = {
          ...baseCustomCodeBlock,
          props: {
            ...((baseCustomCodeBlock as any).props || {}),
            aiHistoryJson: nextHistory,
          },
        } as any;
        nextEditable = replaceBlockInTree(nextEditable, finalCustomCodeBlock as any);
        nextEditable = pruneEmptyCustomCodeArtifacts(nextEditable, customCodeId);
        nextBlocksJson = pageSettingsBlock ? [pageSettingsBlock, ...nextEditable] : nextEditable;
        const structureReviewHtml = buildEditorPreviewHtml(
          buildWholePageDraftHtml(selectedPage, nextBlocksJson) || buildStandaloneCustomCodePreviewHtml(nextHtml, nextCss),
        );

        setSelectedPageLocal({ editorMode: "BLOCKS", blocksJson: nextBlocksJson });
        setAiSidebarCustomCodeBlockId(customCodeId);
        setSelectedBlockId(customCodeId);
        setSidebarPanel("selected");
        setLastAiRun({
          pageId: selectedPage.id,
          surface: "structure",
          prompt: promptText,
          summary: summaryText,
          warnings: routeWarnings,
          at: runAt,
          backgroundReviewStatus: "pending",
          backgroundReviewSummary: null,
          backgroundReviewMode: null,
          changelog: null,
          previousPage,
        });
        setAiResultBanner({ summary: summaryText, at: runAt, tone: diff.changed ? "success" : "warning" });
        appendBuilderChangeActivity({
          id: newId(),
          pageId: selectedPage.id,
          kind: diff.changed ? "ai-update" : "no-change",
          scopeLabel: "Custom code block",
          prompt: promptText,
          summary: summaryText,
          at: runAt,
          diff,
          previewChanged: customCodeDiff.htmlChanged || customCodeDiff.cssChanged || diff.changed,
          targetBlockId: customCodeId,
          customCodeDiff,
        });
        setAiWorkFocus({
          mode: "builder",
          label: `Updated ${describeBuilderAiTarget(builderFocusBlock ?? null)}`,
          phase: "settled",
          regionKey: null,
          blockId: customCodeId,
        });
        await savePage({
          editorMode: "BLOCKS",
          blocksJson: nextBlocksJson,
          brief: pageIntentProfile,
        });
        void requestBackgroundVisualReview({
          funnelId,
          pageId: selectedPage.id,
          surface: "structure",
          prompt: promptText,
          html: nextHtml,
          css: nextCss,
          renderHtml: structureReviewHtml,
          previewDevice,
          at: runAt,
          intentProfile: pageIntentProfile,
          funnelBrief: funnel?.brief ?? null,
        });
        return;
      }

      setAiWorkFocus({
        mode: "page",
        label: selectedHtmlRegion ? `AI is updating ${selectedHtmlRegion.label}` : "AI is updating the page",
        phase: "pending",
        regionKey: selectedHtmlRegion?.key || null,
        blockId: null,
      });

      const currentHtml = getFunnelPageCurrentHtml(selectedPage);
      const wasBlocksExport = false;

      const res = await fetch(
        `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/${encodeURIComponent(selectedPage.id)}/generate-html`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            prompt: promptText,
            currentHtml,
            wasBlocksExport,
            funnelBrief: funnel?.brief ?? null,
            intentProfile: pageIntentProfile,
            selectedRegion: selectedHtmlRegion
              ? {
                  key: selectedHtmlRegion.key,
                  label: selectedHtmlRegion.label,
                  summary: selectedHtmlRegion.summary,
                  html: selectedHtmlRegion.html,
                }
              : null,
            allRegions: htmlRegionScopes.map((r) => ({ key: r.key, label: r.label, summary: r.summary })),
            contextKeys: aiContextKeys,
            contextMedia: effectiveAiContextMedia,
          }),
        },
      );
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to generate HTML");

      const aiResult = json.aiResult && typeof json.aiResult === "object" ? json.aiResult : null;
      const page = json.page as Partial<Page> | undefined;
      let sourceReviewAt: string | null = null;
      let htmlChangedForRun = false;
      if (!json.question) {
        const nextHtml = getFunnelPageCurrentHtml(page);
        const diff = summarizeHtmlDiff(getFunnelPageCurrentHtml(previousPage), nextHtml);
        const runAt = typeof aiResult?.at === "string" && aiResult.at.trim() ? aiResult.at : new Date().toISOString();
        sourceReviewAt = runAt;
        const htmlChanged = diff.changed;
        htmlChangedForRun = htmlChanged;
        const changelog = coerceAiCheckpointChangelog(aiResult?.changelog);
        const noChangeSummary = selectedHtmlRegion
          ? `${selectedHtmlRegion.label} review finished, but the hosted page source did not change.`
          : "AI finished, but the hosted page source did not change.";
        const summaryText = htmlChanged
          ? typeof aiResult?.summary === "string" && aiResult.summary.trim()
            ? aiResult.summary.trim()
            : selectedHtmlRegion
              ? `Updated ${selectedHtmlRegion.label}.`
              : "Updated the page with AI."
          : noChangeSummary;
        const warnings = Array.isArray(aiResult?.warnings)
          ? aiResult.warnings
              .filter((item: unknown) => typeof item === "string" && item.trim())
              .map((item: string) => item.trim())
          : [];

        setLastAiRun({
          pageId: selectedPage.id,
          surface: "source",
          prompt: promptText,
          summary: summaryText,
          warnings: [...warnings, ...(htmlChanged ? [] : ["No hosted source lines changed in this run."])].slice(0, 4),
          at: runAt,
          backgroundReviewStatus: "pending",
          backgroundReviewSummary: null,
          backgroundReviewMode: null,
          changelog,
          previousPage,
        });
        setAiResultBanner({ summary: summaryText, at: runAt, tone: htmlChanged ? "success" : "warning" });
        appendHtmlChangeActivity({
          id: newId(),
          pageId: selectedPage.id,
          kind: htmlChanged ? "ai-update" : "no-change",
          scopeLabel: selectedHtmlRegion ? selectedHtmlRegion.label : "Whole page",
          prompt: promptText,
          summary: summaryText,
          at: runAt,
          diff,
          previewChanged: htmlChanged,
        });
      } else if (json.question) {
        setLastAiRun(null);
        setAiWorkFocus(null);
      }

      if (!json.question) {
        const latestDiff = summarizeHtmlDiff(getFunnelPageCurrentHtml(previousPage), getFunnelPageCurrentHtml(page) || currentHtml);
        setAiWorkFocus({
          mode: "page",
          label: latestDiff.changed
            ? selectedHtmlRegion
              ? `Updated ${selectedHtmlRegion.label}`
              : "Updated page"
            : selectedHtmlRegion
              ? `${selectedHtmlRegion.label} unchanged`
              : "Page unchanged",
          phase: "settled",
          regionKey: selectedHtmlRegion?.key || null,
          blockId: null,
        });
      }

      if (page?.id) {
        const reviewedHtml = getFunnelPageCurrentHtml(page);
        if (shouldUseWholePageForFirstDraft) {
          pendingBlankPagePreviewRef.current = page.id;
          setBuilderSurfaceMode("whole-page");
          setWholePageViewMode("preview");
          setSelectedBlockId(null);
          setSelectedHtmlRegionKey(null);
          setBriefPanelOpen(false);
        } else if (htmlChangedForRun && !selectedHtmlRegion && selectedPageGraph.sourceMode === "custom-html") {
          setBuilderSurfaceMode("whole-page");
          setWholePageViewMode("preview");
        }
        pushUndoSnapshot("ai-result", 0);
        setPages((prev) => (prev || []).map((p) => (p.id === page.id ? ({ ...p, ...page } as Page) : p)));
        if (!json.question) {
          void requestBackgroundVisualReview({
            funnelId,
            pageId: page.id,
            surface: "source",
            prompt: promptText,
            html: reviewedHtml,
            css: "",
            renderHtml: buildEditorPreviewHtml(reviewedHtml),
            previewDevice,
            at: sourceReviewAt || new Date().toISOString(),
            intentProfile: pageIntentProfile,
            funnelBrief: funnel?.brief ?? null,
          });
        }
      } else {
        await load();
      }
    } catch (e) {
      setAiWorkFocus(null);
      setError((e as any)?.message ? String((e as any).message) : "Failed to generate HTML");
    } finally {
      setBusy(false);
    }
  };

  const restoreLastAiRun = async () => {
    if (!selectedPage || !lastAiRun || lastAiRun.pageId !== selectedPage.id) return;
    const currentPage = {
      editorMode: selectedPage.editorMode,
      blocksJson: selectedPage.blocksJson,
      customHtml: selectedPage.customHtml,
      draftHtml: selectedPage.draftHtml,
      customChatJson: selectedPage.customChatJson,
    };
    const restoreAt = new Date().toISOString();
    setSelectedPageLocal(lastAiRun.previousPage);
    await savePage(lastAiRun.previousPage);
    if (currentPage.editorMode === "BLOCKS" || lastAiRun.previousPage.editorMode === "BLOCKS") {
      const diff = summarizeBuilderDiff(currentPage.blocksJson, lastAiRun.previousPage.blocksJson);
      appendBuilderChangeActivity({
        id: newId(),
        pageId: selectedPage.id,
        kind: "restore",
        scopeLabel: "Restore",
        prompt: lastAiRun.prompt,
        summary: "Restored the previous managed structure.",
        at: restoreAt,
        diff,
        previewChanged: diff.changed,
      });
      if (diff.changed) {
        setAiResultBanner({ summary: "Restored the previous managed structure.", at: restoreAt, tone: "success" });
      }
    }
    if (currentPage.editorMode === "CUSTOM_HTML" || lastAiRun.previousPage.editorMode === "CUSTOM_HTML") {
      const diff = summarizeHtmlDiff(
        getFunnelPageCurrentHtml(currentPage),
        getFunnelPageCurrentHtml(lastAiRun.previousPage),
      );
      appendHtmlChangeActivity({
        id: newId(),
        pageId: selectedPage.id,
        kind: "restore",
        scopeLabel: "Restore",
        prompt: lastAiRun.prompt,
        summary: "Restored the previous hosted page source.",
        at: restoreAt,
        diff,
        previewChanged: diff.changed,
      });
      setAiResultBanner({ summary: "Restored the previous hosted page source.", at: restoreAt, tone: "success" });
    }
    setLastAiRun(null);
    toast.success("Restored page before the last AI update");
  };

  const wholePageSurfaceActive = wholePageModeActive;
  const customCodeModeActive = wholePageSourceEditable;
  const wholePageManagedStructureAi = Boolean(wholePageSurfaceActive && !wholePageSourceEditable && selectedPageGraph.sourceMode === "managed");
  const wholePageUsesBuilderSidebar = Boolean(wholePageModeActive && selectedPageGraph.sourceMode === "managed" && selectedPageSupportsBlocksSurface);
  const wholePageSourcePanelLabel = "Source";
  const wholePageStageMeta = WHOLE_PAGE_VIEW_META[wholePageViewMode];
  const showWholePagePreviewPane = wholePageSurfaceActive && wholePageViewMode === "preview";
  const showWholePageSourcePane = wholePageSurfaceActive && wholePageViewMode === "source";
  const showWholePageDirectionPane = wholePageSurfaceActive && wholePageViewMode === "direction";
  const aiUsesManagedStructure = Boolean(blocksSurfaceActive || wholePageManagedStructureAi);
  const pageManagementUi = useMemo(() => {
    if (selectedPageGraph.sourceMode === "managed") {
      return {
        badgeLabel: "Managed structure",
        badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-800",
        summary: "Structure edits and AI update this page. Source shows the current HTML from that same page.",
        lensLabel: wholePageModeActive ? "Source" : "Structure",
      };
    }

    if (selectedPageGraph.sourceMode === "custom-html") {
      return {
        badgeLabel: "Advanced page",
        badgeClassName: "border-blue-200 bg-blue-50 text-blue-800",
        summary: "This page is being edited as direct source. Convert to Structure when you want managed sections, module-safe edits, and structure-level AI targeting.",
        lensLabel: wholePageModeActive ? "Source" : "Structure",
      };
    }

    return {
      badgeLabel: "Legacy page",
      badgeClassName: "border-amber-200 bg-amber-50 text-amber-800",
      summary: "This page is still in a legacy mode. Move it into Structure or Page editing to bring it onto the current draft model.",
      lensLabel: "Legacy lens",
    };
  }, [selectedPageGraph.sourceMode, wholePageModeActive]);

  const [publishingPage, setPublishingPage] = useState(false);
  const publishPage = async () => {
    if (!selectedPage || selectedPageGraph.sourceMode !== "custom-html") return;
    setPublishingPage(true);
    setError(null);
    try {
      // If there are unsaved local edits, save them as draft first.
      if (selectedPageDirty) {
        await savePage({ draftHtml: getFunnelPageCurrentHtml(selectedPage) });
      }
      const res = await fetch(
        `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/${encodeURIComponent(selectedPage.id)}/publish`,
        { method: "POST", headers: { "content-type": "application/json" } },
      );
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to publish");
      if (json.page?.id) {
        setPages((prev) => (prev || []).map((p) => (p.id === json.page.id ? ({ ...p, ...json.page } as Page) : p)));
        setDirtyPageIds((prev) => { const next = { ...prev }; delete next[selectedPage.id]; return next; });
      } else {
        await load();
      }
      toast.success("Page published");
    } catch (e) {
      const msg = (e as any)?.message ? String((e as any).message) : "Failed to publish";
      setError(msg);
      toast.error(msg);
    } finally {
      setPublishingPage(false);
    }
  };

  const copyLiveFunnelHref = useCallback(async () => {
    if (!funnelLiveHref) return;
    try {
      await navigator.clipboard.writeText(funnelLiveHref);
      toast.success("Live funnel URL copied");
    } catch {
      toast.error("Could not copy live funnel URL");
    }
  }, [funnelLiveHref, toast]);

  const workflowView = getFunnelEditorWorkflowViewModel({
    selectedPage,
    selectedPageDirty,
    customCodeModeActive,
    savingPage,
    publishingPage,
    selectedPageIsEntryPage,
  });
  const selectedPageExecutionSummary = selectedPage?.executionSummary || null;
  const selectedPageExecutionMetrics = selectedPageExecutionSummary?.metrics || {
    page_view: 0,
    cta_click: 0,
    form_submitted: 0,
    booking_created: 0,
    checkout_started: 0,
    add_to_cart: 0,
  };

  return (
    <div className="flex min-h-screen flex-col lg:h-dvh lg:overflow-hidden">
      {allFontPreviewGoogleCss ? <style>{allFontPreviewGoogleCss}</style> : null}

      <PortalMediaPickerModal
        open={mediaPickerOpen}
        onClose={() => {
          setMediaPickerOpen(false);
          setMediaPickerTarget(null);
        }}
        variant={portalVariant}
        accept={
          mediaPickerTarget?.type === "ai-context"
            ? "any"
            : mediaPickerTarget?.type === "video-block" || mediaPickerTarget?.type === "section-background-video"
              ? "video"
              : "image"
        }
        onPick={async (it) => {
          const target = mediaPickerTarget;
          setMediaPickerOpen(false);
          setMediaPickerTarget(null);
          if (!target) return;

          if (target.type === "ai-context") {
            const url = String(it.shareUrl || it.previewUrl || it.downloadUrl || "").trim();
            if (!url) return;
            setAiContextMedia((prev) => {
              const next = Array.isArray(prev) ? [...prev] : [];
              if (!next.some((m) => String(m.url || "").trim() === url)) {
                next.unshift({ url, fileName: it.fileName, mimeType: it.mimeType });
              }
              return next.slice(0, 24);
            });
            return;
          }

          if (target.type === "image-block") {
            const block = findBlockInTree(editableBlocks, target.blockId)?.block;
            if (!block || block.type !== "image") return;
            const nextSrc = String(it.shareUrl || it.previewUrl || "").trim();
            if (!nextSrc) return;
            upsertBlock({
              ...block,
              props: {
                ...block.props,
                src: nextSrc,
                alt: (block.props.alt || "").trim() ? block.props.alt : it.fileName,
              },
            });
            return;
          }

          if (target.type === "header-logo") {
            const block = findBlockInTree(editableBlocks, target.blockId)?.block;
            if (!block || block.type !== "headerNav") return;
            const nextUrl = String(it.shareUrl || it.previewUrl || "").trim();
            if (!nextUrl) return;
            const prevAlt = String((block.props as any)?.logoAlt || "").trim();
            upsertBlock({
              ...block,
              props: {
                ...(block.props as any),
                logoUrl: nextUrl,
                ...(prevAlt ? null : { logoAlt: it.fileName }),
              },
            } as any);
            return;
          }

          if (target.type === "video-block") {
            const block = findBlockInTree(editableBlocks, target.blockId)?.block;
            if (!block || block.type !== "video") return;
            const nextSrc = String(it.shareUrl || it.downloadUrl || "").trim();
            if (!nextSrc) return;
            const prevName = String((block.props as any)?.name || "").trim();
            upsertBlock({
              ...block,
              props: {
                ...(block.props as any),
                src: nextSrc,
                ...(prevName ? null : { name: it.fileName }),
              },
            } as any);
            return;
          }

          if (target.type === "video-poster") {
            const block = findBlockInTree(editableBlocks, target.blockId)?.block;
            if (!block || block.type !== "video") return;
            const nextPoster = String(it.shareUrl || it.previewUrl || "").trim();
            if (!nextPoster) return;
            upsertBlock({
              ...block,
              props: {
                ...(block.props as any),
                posterUrl: nextPoster,
              },
            } as any);
            return;
          }

          if (target.type === "section-background") {
            const block = findBlockInTree(editableBlocks, target.blockId)?.block;
            if (!block || block.type !== "section") return;
            const nextUrl = String(it.shareUrl || it.previewUrl || "").trim();
            if (!nextUrl) return;
            upsertBlock({
              ...block,
              props: {
                ...(block.props as any),
                style: applyStylePatch((block.props as any)?.style, { backgroundImageUrl: nextUrl }),
              },
            } as any);
            return;
          }

          if (target.type === "section-background-video") {
            const block = findBlockInTree(editableBlocks, target.blockId)?.block;
            if (!block || block.type !== "section") return;
            const nextUrl = String(it.shareUrl || it.downloadUrl || "").trim();
            if (!nextUrl) return;
            upsertBlock({
              ...block,
              props: {
                ...(block.props as any),
                style: applyStylePatch((block.props as any)?.style, { backgroundVideoUrl: nextUrl }),
              },
            } as any);
            return;
          }

          if (target.type === "chatbot-launcher") {
            const block = findBlockInTree(editableBlocks, target.blockId)?.block;
            if (!block || block.type !== "chatbot") return;
            const nextUrl = String(it.shareUrl || it.previewUrl || "").trim();
            if (!nextUrl) return;
            upsertBlock({
              ...block,
              props: {
                ...(block.props as any),
                launcherImageUrl: nextUrl,
              },
            } as any);
          }
        }}
      />

      <PortalImageCropModal
        open={!!imageCropTarget}
        imageUrl={imageCropTarget?.src ?? null}
        onClose={() => setImageCropTarget(null)}
        onSave={async (file) => {
          const target = imageCropTarget;
          if (!target) return;

          try {
            const created = await uploadToMediaLibrary([file], { maxFiles: 1 });
            const it = created[0];
            if (!it) return;
            const nextSrc = String((it as any).shareUrl || (it as any).previewUrl || (it as any).openUrl || (it as any).downloadUrl || "").trim();
            if (!nextSrc) return;

            const block = findBlockInTree(editableBlocks, target.blockId)?.block;
            if (!block || block.type !== "image") return;
            upsertBlock({
              ...block,
              props: {
                ...block.props,
                src: nextSrc,
              },
            });
            toast.success("Cropped image saved as a copy");
            setImageCropTarget(null);
          } catch (err) {
            const msg = (err as any)?.message ? String((err as any).message) : "Crop upload failed";
            toast.error(msg);
          }
        }}
      />

      <AppModal
        open={briefPanelOpen && !!selectedPage}
        title={blankPageOnboardingActive ? "Shape the First Draft Foundation" : "Foundation and Shell"}
        description={
          blankPageOnboardingActive
            ? "AI is already inferring the strongest starting direction from the available context. Refine that recommendation, shape the shell, and then generate the first draft from a coherent foundation."
            : "Edit the saved foundation and baseline shell AI should use for this funnel and the current page. This stays separate from chat history and feeds both builder and whole-page drafting."
        }
        onClose={() => setBriefPanelOpen(false)}
        widthClassName={blankPageOnboardingActive ? "w-[min(1080px,calc(100vw-24px))]" : "w-[min(960px,calc(100vw-32px))]"}
        footer={
          blankPageOnboardingActive ? (
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-1 text-xs text-zinc-500">
                <div className="font-semibold uppercase tracking-[0.16em] text-zinc-500">{activeFoundationWizardStep.eyebrow}</div>
                <div className="text-sm font-semibold text-zinc-900">
                  {activeFoundationWizardStep.title} <span className="font-normal text-zinc-500">{foundationWizardStep + 1} of {foundationWizardSteps.length}</span>
                </div>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                  onClick={() => setBriefPanelOpen(false)}
                >
                  Close for now
                </button>
                {foundationWizardStep > 0 ? (
                  <button
                    type="button"
                    className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                    onClick={() => setFoundationWizardStep((step) => Math.max(0, step - 1))}
                  >
                    Back
                  </button>
                ) : null}
                {foundationWizardAtLastStep ? (
                  <button
                    type="button"
                    className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                    onClick={() => {
                      setBriefPanelOpen(false);
                      void runAi(composePromptFromIntent("clarify"));
                    }}
                  >
                    Ask 3 high-impact questions
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  onClick={() => {
                    if (!foundationWizardAtLastStep) {
                      setFoundationWizardStep((step) => Math.min(foundationWizardLastStepIndex, step + 1));
                      return;
                    }
                    setBriefPanelOpen(false);
                    void runAi(composePromptFromIntent("draft"));
                  }}
                >
                  {foundationWizardAtLastStep ? "Generate first draft" : `Continue to ${foundationWizardSteps[foundationWizardStep + 1]?.title ?? "next step"}`}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <button
                type="button"
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                onClick={() => setBriefPanelOpen(false)}
              >
                Close
              </button>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                  onClick={() => {
                    setChatInput(composePromptFromIntent("shell"));
                    setBriefPanelOpen(false);
                  }}
                >
                  Map shell
                </button>
                <button
                  type="button"
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                  onClick={() => {
                    setChatInput(composePromptFromIntent("clarify"));
                    setBriefPanelOpen(false);
                  }}
                >
                  Clarify first
                </button>
                <button
                  type="button"
                  className="rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  onClick={() => {
                    setChatInput(composePromptFromIntent("draft"));
                    setBriefPanelOpen(false);
                  }}
                >
                  Draft from shell
                </button>
                <button
                  type="button"
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                  onClick={() => {
                    setChatInput(composePromptFromIntent("retake"));
                    setBriefPanelOpen(false);
                  }}
                >
                  Retake from shell
                </button>
              </div>
            </div>
          )
        }
      >
        {selectedPage ? (
          <div className="space-y-5">
            {blankPageOnboardingActive ? (
                          <div className="rounded-[28px] border border-zinc-200 bg-white px-5 py-4 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">First draft setup</div>
                                <div className="mt-1 text-lg font-semibold tracking-tight text-zinc-950">{activeFoundationWizardStep.title}</div>
                                <div className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600">{activeFoundationWizardStep.description}</div>
                              </div>
                              <div className="w-full max-w-65 shrink-0">
                                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                                  <span>Progress</span>
                                  <span>{foundationWizardStep + 1} of {foundationWizardSteps.length}</span>
                                </div>
                                <div className="mt-2 h-2 rounded-full bg-zinc-100">
                                  <div className="h-2 rounded-full bg-zinc-900 transition-all duration-200" style={{ width: `${foundationWizardProgress}%` }} />
                                </div>
                              </div>
                            </div>
                            <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                              {foundationWizardSteps.map((step, index) => {
                                const active = foundationWizardStep === index;
                                return (
                                  <button
                                    key={step.key}
                                    type="button"
                                    onClick={() => setFoundationWizardStep(index)}
                                    className={classNames(
                                      "rounded-2xl border px-3 py-3 text-left transition-colors",
                                      active ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300 hover:bg-white",
                                    )}
                                  >
                                    <div className={classNames("text-[11px] font-semibold uppercase tracking-[0.14em]", active ? "text-zinc-200" : "text-zinc-500")}>{step.eyebrow}</div>
                                    <div className="mt-1 text-sm font-semibold">{step.title}</div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}

                        {showFoundationOverviewStep ? (
                          <div className="rounded-[28px] border border-zinc-200 bg-[linear-gradient(180deg,#fbfdff_0%,#ffffff_74%)] px-5 py-4 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
                            <div className="flex flex-col gap-4">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                                    <span>First-draft foundation</span>
                                    <span className="h-1 w-1 rounded-full bg-zinc-300" />
                                    <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 font-mono normal-case tracking-normal text-zinc-700">{selectedPageRouteLabel}</span>
                                  </div>
                                  <div className="mt-2 text-lg font-semibold tracking-tight text-zinc-950">{foundationOverview.headline}</div>
                                  <div className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600">{foundationArtifact?.strategicSummary || foundationOverview.summary}</div>
                                </div>
                                <div className="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-700">
                                  {foundationOverview.readinessLabel}
                                </div>
                              </div>

                              <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="min-w-0 flex-1">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">What AI understands about the business</div>
                                    <div className="mt-1 text-sm leading-6 text-zinc-900">{foundationArtifact?.narrative || foundationOverview.businessNarrative}</div>
                                    <div className="mt-1 text-xs leading-5 text-zinc-500">{foundationOverview.contextSummary}</div>
                                    {foundationArtifact?.assumption ? (
                                      <div className="mt-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600">
                                        Current working assumption: {foundationArtifact.assumption}
                                      </div>
                                    ) : null}
                                  </div>
                                  {foundationOverview.missingContext.length ? (
                                    <div className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700">
                                      Still thin on {foundationOverview.missingContext.join(" and ")}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {foundationOverview.contextSignals.length ? (
                                    foundationOverview.contextSignals.map((signal, index) => (
                                      <span
                                        key={`${signal.source}-${signal.label}-${index}`}
                                        className={classNames(
                                          "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
                                          signal.source === "profile"
                                            ? "border-blue-200 bg-blue-50 text-blue-800"
                                            : signal.source === "funnel"
                                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                              : signal.source === "page"
                                                ? "border-zinc-200 bg-zinc-100 text-zinc-700"
                                                : "border-violet-200 bg-violet-50 text-violet-800",
                                        )}
                                      >
                                        <span className="uppercase tracking-wide text-[10px] opacity-70">{signal.label}</span>
                                        <span>{signal.value}</span>
                                      </span>
                                    ))
                                  ) : (
                                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-600">
                                      Mostly inferring from the route and the page cues right now
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
                                <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Recommended path</div>
                                  <div className="mt-1 text-sm leading-6 text-zinc-700">{foundationOverview.conversionPath}</div>
                                  <div className="mt-2 text-xs leading-5 text-zinc-500">{foundationOverview.assetPlanSummary}</div>
                                  <div className="mt-2 text-xs leading-5 text-zinc-600">{foundationOverview.capabilitySummary}</div>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {foundationOverview.capabilityGraph.map((capability) => (
                                      <span
                                        key={capability.key}
                                        className={classNames(
                                          "rounded-full border px-3 py-1.5 text-[11px] font-semibold",
                                          capability.status === "ready"
                                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                            : capability.status === "needs-setup"
                                              ? "border-amber-200 bg-amber-50 text-amber-800"
                                              : capability.status === "planned"
                                                ? "border-blue-200 bg-blue-50 text-blue-800"
                                                : "border-zinc-200 bg-zinc-100 text-zinc-700",
                                        )}
                                      >
                                        {capability.label} · {capability.status === "needs-setup" ? "setup needed" : capability.status === "not-needed" ? "not needed" : capability.status}
                                      </span>
                                    ))}
                                  </div>
                                  {blankPageOnboardingActive ? (
                                    <div className="mt-2 text-xs leading-5 text-zinc-500">
                                      The page is still blank, so this is where you steer the foundation before the first draft lands.
                                    </div>
                                  ) : null}
                                </div>
                                <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Baseline shell</div>
                                  <div className="mt-1 text-sm leading-6 text-zinc-700">{foundationOverview.shellConcept}</div>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {sectionPlanItems.map((item, index) => (
                                      <span key={`${item}-${index}`} className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11px] font-semibold text-zinc-700">
                                        {item}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {blankPageOnboardingActive && !showFoundationOverviewStep ? (
                          <div className="rounded-3xl border border-zinc-200 bg-[linear-gradient(180deg,#fcfcfd_0%,#ffffff_100%)] px-5 py-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                                  <span>{selectedPageRouteLabel}</span>
                                  <span className="h-1 w-1 rounded-full bg-zinc-300" />
                                  <span>{foundationOverview.readinessLabel}</span>
                                </div>
                                <div className="mt-1 text-base font-semibold text-zinc-950">{foundationOverview.headline}</div>
                                <div className="mt-1 text-sm leading-6 text-zinc-600">{foundationArtifact?.strategicSummary || foundationOverview.summary}</div>
                              </div>
                              <div className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-700">
                                {foundationOverview.assetPlanSummary}
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {showInheritedFunnelContextStep ? (
                          <section className="space-y-3 rounded-3xl border border-zinc-200 bg-white p-4">
                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Inherited funnel context</div>
                              <div className="mt-1 text-sm font-semibold text-zinc-900">Keep this light. This is the broad context every page should inherit.</div>
                              <div className="mt-1 text-xs leading-5 text-zinc-500">
                                You do not need the whole offer nailed down here. If pricing, packaging, proof, or the exact value exchange are still moving, leave them rough and add them later as you keep iterating on the page with AI.
                              </div>
                            </div>
                            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                              <label className="block">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Funnel type or job</div>
                                <input
                                  value={funnel?.brief?.funnelGoal || ""}
                                  onChange={(e) => updateFunnelBrief({ funnelGoal: e.target.value })}
                                  onBlur={() => updateFunnelBrief({}, true)}
                                  placeholder="Call booking funnel, direct-sale funnel, application funnel, lead capture funnel, etc."
                                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                                />
                              </label>

                              <label className="block">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Offer or pricing</div>
                                <input
                                  value={funnel?.brief?.offerSummary || ""}
                                  onChange={(e) => updateFunnelBrief({ offerSummary: e.target.value })}
                                  onBlur={() => updateFunnelBrief({}, true)}
                                  placeholder="Optional for now: core offer, pricing frame, or value exchange"
                                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                                />
                                <div className="mt-1 text-[11px] leading-5 text-zinc-500">A rough pricing frame is enough here. You can tighten or replace it later as the page evolves.</div>
                              </label>

                              <label className="block">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Core audience</div>
                                <input
                                  value={funnel?.brief?.audienceSummary || ""}
                                  onChange={(e) => updateFunnelBrief({ audienceSummary: e.target.value })}
                                  onBlur={() => updateFunnelBrief({}, true)}
                                  placeholder="Who most pages in this funnel are trying to move"
                                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                                />
                              </label>
                            </div>

                            <details className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                              <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-900">Platform, logic, and automation defaults</summary>
                              <div className="mt-3 grid grid-cols-1 gap-3">
                                <label className="block">
                                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Default next step or routing</div>
                                  <input
                                    value={funnel?.brief?.routingDestination || ""}
                                    onChange={(e) => updateFunnelBrief({ routingDestination: e.target.value })}
                                    onBlur={() => updateFunnelBrief({}, true)}
                                    placeholder="What most pages in this funnel should do after the main conversion"
                                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                                  />
                                </label>

                                <label className="block">
                                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Conditional logic defaults</div>
                                  <textarea
                                    value={funnel?.brief?.conditionalLogic || ""}
                                    onChange={(e) => updateFunnelBrief({ conditionalLogic: e.target.value })}
                                    onBlur={() => updateFunnelBrief({}, true)}
                                    placeholder="Default branching, qualification rules, or split logic this funnel should assume"
                                    className="mt-1 min-h-20 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                                  />
                                </label>

                                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                  <label className="block">
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Tagging defaults</div>
                                    <input
                                      value={funnel?.brief?.taggingPlan || ""}
                                      onChange={(e) => updateFunnelBrief({ taggingPlan: e.target.value })}
                                      onBlur={() => updateFunnelBrief({}, true)}
                                      placeholder="Tags or segments this funnel should apply by default"
                                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                                    />
                                  </label>

                                  <label className="block">
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Automation handoff</div>
                                    <input
                                      value={funnel?.brief?.automationPlan || ""}
                                      onChange={(e) => updateFunnelBrief({ automationPlan: e.target.value })}
                                      onBlur={() => updateFunnelBrief({}, true)}
                                      placeholder="Which automation should fire or what follow-up should happen"
                                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                                    />
                                  </label>
                                </div>

                                <label className="block">
                                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Platform or fulfillment notes</div>
                                  <textarea
                                    value={funnel?.brief?.integrationPlan || ""}
                                    onChange={(e) => updateFunnelBrief({ integrationPlan: e.target.value })}
                                    onBlur={() => updateFunnelBrief({}, true)}
                                    placeholder="Booking, forms, checkout, chatbot, tagging, routing rules, or internal handoffs this funnel should assume"
                                    className="mt-1 min-h-24 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                                  />
                                </label>
                              </div>
                            </details>
                          </section>
                        ) : null}

            <section className="space-y-3 rounded-3xl border border-zinc-200 bg-white p-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  {blankPageOnboardingActive && showShellStep && !showPageDirectionStep ? "Shell and handoff" : "Page steering"}
                </div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">
                  {blankPageOnboardingActive && showShellStep && !showPageDirectionStep
                    ? "Confirm the structure AI should build from before the first draft lands."
                    : "Steer the recommendation without turning this into a worksheet."}
                </div>
              </div>
              {showPageDirectionStep ? (
                <>
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,240px)_1fr]">
                      <label className="block">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Suggested page type</div>
                        </div>
                        <div className="mt-1 text-xs leading-5 text-zinc-500">This is already inferred from the route and inherited context. Most of the time you should only correct it if AI picked the wrong conversion motion.</div>
                        <PortalSelectDropdown
                          value={pageIntentProfile.pageType}
                          onChange={(value) => updatePageIntentProfile({ pageType: value }, true)}
                          options={pageTypeOptions}
                          className="mt-2 w-full"
                          buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                        />
                        <div className="mt-3 flex flex-wrap gap-2">
                          {quickPageTypeSuggestions.map((type) => {
                            const active = pageIntentProfile.pageType === type;
                            return (
                              <button
                                key={type}
                                type="button"
                                onClick={() => updatePageIntentProfile({ pageType: type }, true)}
                                className={classNames(
                                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-[transform,background-color,border-color,color] duration-150 hover:-translate-y-0.5",
                                  active
                                    ? "border-zinc-900 bg-zinc-900 text-white"
                                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50",
                                )}
                              >
                                {PAGE_INTENT_TYPE_LABELS[type]}
                              </button>
                            );
                          })}
                        </div>
                      </label>

                      <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Primary CTA direction</div>
                        <div className="mt-1 text-sm text-zinc-700">Pick the motion you want. AI can still phrase the actual button copy, but this tells it what conversion action the page is trying to win.</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {primaryCtaSuggestions.map((cta) => {
                            const active = pageIntentProfile.primaryCta === cta;
                            return (
                              <button
                                key={cta}
                                type="button"
                                onClick={() => updatePageIntentProfile({ primaryCta: cta }, true)}
                                className={classNames(
                                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                                  active
                                    ? "border-zinc-900 bg-zinc-900 text-white"
                                    : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300 hover:bg-white",
                                )}
                              >
                                {cta}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Hero media plan</div>
                        <div className="mt-1 text-sm font-semibold text-zinc-900">Decide whether the opening wants an image, a VSL, or no hero media at all.</div>
                        <div className="mt-1 text-xs leading-5 text-zinc-500">Choose how you want the page to open. You can swap visuals and test different assets after the first draft exists.</div>
                      </div>
                      <div className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-700">
                        {foundationOverview.assetPlanSummary}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {([
                        { value: "auto", label: "Auto" },
                        { value: "image", label: "Hero image" },
                        { value: "video", label: "VSL" },
                        { value: "none", label: "No hero media" },
                      ] as Array<{ value: FunnelPageMediaMode; label: string }>).map((option) => {
                        const active = pageIntentProfile.mediaPlan.heroAssetMode === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => updatePageMediaPlan({ heroAssetMode: option.value }, true)}
                            className={classNames(
                              "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                              active
                                ? "border-zinc-900 bg-zinc-900 text-white"
                                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50",
                            )}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>

                    {foundationOverview.assetSignals.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {foundationOverview.assetSignals.map((signal, index) => (
                          <span key={`${signal}-${index}`} className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-700">
                            {signal}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 lg:col-span-2">
                        <div className="text-sm font-semibold text-zinc-900">Pick the opening direction now. Pick the actual visual later.</div>
                        <div className="mt-2 text-xs leading-6 text-zinc-600">
                          Use this step to choose whether the page should open visually, with a VSL, or with no hero media at all. Once the first draft is on the canvas, you can try different images, swap the video, or remove the media entirely without locking yourself in here.
                        </div>
                      </div>

                      <label className="block lg:col-span-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Hero media guidance</div>
                        <input
                          value={pageIntentProfile.mediaPlan.heroAssetNote}
                          onChange={(e) => updatePageMediaPlan({ heroAssetNote: e.target.value })}
                          onBlur={() => updatePageMediaPlan({}, true)}
                          placeholder="Optional: how the opening should feel or what kind of visual angle the first draft should leave room for"
                          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="lg:col-span-2 rounded-[28px] border border-zinc-900 bg-[linear-gradient(180deg,#18181b_0%,#27272a_100%)] px-5 py-4 text-white shadow-[0_18px_40px_rgba(15,23,42,0.16)]">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-300">Conversion target</div>
                          <div className="mt-2 text-xl font-semibold tracking-tight text-white">{pageConversionFocus.headline}</div>
                          <div className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">{pageConversionFocus.summary}</div>
                        </div>
                        <div className="shrink-0 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[11px] font-semibold text-zinc-100">
                          {PAGE_INTENT_TYPE_LABELS[pageIntentProfile.pageType]} page
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{pageConversionFocus.metricLabel}</div>
                          <div className="mt-1 text-sm font-semibold text-white">{pageConversionFocus.metricValue}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{pageConversionFocus.mechanismLabel}</div>
                          <div className="mt-1 text-sm font-semibold text-white">{pageConversionFocus.mechanismValue}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{pageConversionFocus.ctaLabel}</div>
                          <div className="mt-1 text-sm font-semibold text-white">{pageConversionFocus.ctaValue}</div>
                        </div>
                      </div>
                    </div>

                    <details className={classNames(
                      "lg:col-span-2 rounded-2xl border px-4 py-3",
                      pageGoalUsesDefault ? "border-zinc-200 bg-zinc-50" : "border-blue-200 bg-blue-50",
                    )}>
                      <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-900">
                        {pageGoalUsesDefault ? "Override the conversion goal only if the default is wrong" : "Custom conversion goal is active"}
                      </summary>
                      <div className="mt-2 text-xs leading-5 text-zinc-600">
                        {pageGoalUsesDefault
                          ? "You do not need to explain the obvious here. If this is a booking page, AI already treats the page as a consultation-conversion asset. Only add something custom if this page has a more specific job than the default."
                          : "You have a custom page goal layered on top of the inferred page type. Keep it sharp and conversion-specific."}
                      </div>
                      <textarea
                        value={pageIntentProfile.pageGoal}
                        onChange={(e) => updatePageIntentProfile({ pageGoal: e.target.value })}
                        onBlur={() => updatePageIntentProfile({}, true)}
                        placeholder="Optional: narrow the goal further, like 'Convert cold traffic into booked strategy calls from operators doing $50k-$250k/mo'"
                        className="mt-3 min-h-24 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                      />
                    </details>

                    <label className="block">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Who is this page for?</div>
                      <input
                        value={pageIntentProfile.audience}
                        onChange={(e) => updatePageIntentProfile({ audience: e.target.value })}
                        onBlur={() => updatePageIntentProfile({}, true)}
                        placeholder="Who this page is specifically trying to move"
                        className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                      />
                    </label>

                    <label className="block">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Offer or promise</div>
                      <input
                        value={pageIntentProfile.offer}
                        onChange={(e) => updatePageIntentProfile({ offer: e.target.value })}
                        onBlur={() => updatePageIntentProfile({}, true)}
                        placeholder="What this page should sell, promise, or move the visitor toward"
                        className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                      />
                    </label>
                  </div>

                  <details className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-900">Intake, routing, and platform details</summary>
                    <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <label className="block">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Intake or application details</div>
                        <input
                          value={pageIntentProfile.qualificationFields}
                          onChange={(e) => updatePageIntentProfile({ qualificationFields: e.target.value })}
                          onBlur={() => updatePageIntentProfile({}, true)}
                          placeholder="What this page should capture, screen, or learn before the next step"
                          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                        />
                      </label>

                      <label className="block">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Next step or tagging</div>
                        <input
                          value={pageIntentProfile.routingDestination}
                          onChange={(e) => updatePageIntentProfile({ routingDestination: e.target.value })}
                          onBlur={() => updatePageIntentProfile({}, true)}
                          placeholder="Where this page should send the visitor next or how it should tag them"
                          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                        />
                      </label>

                      <label className="block lg:col-span-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Conditional logic or branching</div>
                        <textarea
                          value={pageIntentProfile.conditionalLogic}
                          onChange={(e) => updatePageIntentProfile({ conditionalLogic: e.target.value })}
                          onBlur={() => updatePageIntentProfile({}, true)}
                          placeholder="If the visitor qualifies, clicks a certain CTA, or chooses a certain path, what should change on this page or happen next?"
                          className="mt-1 min-h-20 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                        />
                      </label>

                      <label className="block">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Tagging plan</div>
                        <input
                          value={pageIntentProfile.taggingPlan}
                          onChange={(e) => updatePageIntentProfile({ taggingPlan: e.target.value })}
                          onBlur={() => updatePageIntentProfile({}, true)}
                          placeholder="Which tags, segments, or CRM states this page should set"
                          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                        />
                      </label>

                      <label className="block">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Automation handoff</div>
                        <input
                          value={pageIntentProfile.automationPlan}
                          onChange={(e) => updatePageIntentProfile({ automationPlan: e.target.value })}
                          onBlur={() => updatePageIntentProfile({}, true)}
                          placeholder="Which automation, nurture, or follow-up this page should trigger"
                          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                        />
                      </label>

                      <label className="block lg:col-span-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Form or platform plan</div>
                        <PortalSelectDropdown
                          value={pageIntentProfile.formStrategy}
                          onChange={(value) => updatePageIntentProfile({ formStrategy: value }, true)}
                          options={formStrategyOptions}
                          className="mt-1 w-full"
                          buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                        />
                      </label>
                    </div>
                  </details>
                </>
              ) : null}

              {showShellStep ? (
                <>
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Baseline shell</div>
                        <div className="mt-1 text-sm font-semibold text-zinc-900">Keep the architecture visible. Fine-tune only if the baseline is off.</div>
                      </div>
                      <button
                        type="button"
                        className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                        onClick={() => updatePageIntentProfile({ shellFrameId: "", shellConcept: "", sectionPlan: "" }, true)}
                      >
                        Reset shell from brief
                      </button>
                    </div>

                    <div className="mt-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Frame library</div>
                          <div className="mt-1 text-sm font-semibold text-zinc-900">Pick the kind of shell AI should build from.</div>
                          <div className="mt-1 text-xs leading-5 text-zinc-600">This replaces a lot of vague shell writing. Choose a frame, then only fine-tune the shell details if the baseline is off.</div>
                        </div>
                        {selectedShellFrame ? (
                          <div className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[11px] font-semibold text-zinc-700">
                            Active frame: {selectedShellFrame.label}
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
                        {availableShellFrames.map((frame) => {
                          const active = pageIntentProfile.shellFrameId === frame.id || (!pageIntentProfile.shellFrameId && selectedShellFrame?.id === frame.id);
                          return (
                            <button
                              key={frame.id}
                              type="button"
                              onClick={() => applyShellFrame(frame.id, true)}
                              className={classNames(
                                "rounded-2xl border px-4 py-4 text-left transition-[transform,border-color,background-color,box-shadow] duration-150 hover:-translate-y-0.5",
                                active
                                  ? "border-zinc-900 bg-zinc-900 text-white shadow-[0_18px_36px_rgba(15,23,42,0.14)]"
                                  : "border-zinc-200 bg-white text-zinc-900 hover:border-zinc-300 hover:bg-zinc-50",
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className={classNames("text-[11px] font-semibold uppercase tracking-[0.16em]", active ? "text-zinc-300" : "text-zinc-500")}>
                                    {PAGE_INTENT_TYPE_LABELS[pageIntentProfile.pageType]} frame
                                  </div>
                                  <div className="mt-1 text-sm font-semibold">{frame.label}</div>
                                  <div className={classNames("mt-2 text-sm leading-6", active ? "text-zinc-200" : "text-zinc-600")}>{frame.summary}</div>
                                </div>
                                <span className={classNames(
                                  "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                                  active ? "border-white/15 bg-white/10 text-white" : "border-zinc-200 bg-zinc-50 text-zinc-500",
                                )}>
                                  {frame.exhibit.designProfileId}
                                </span>
                              </div>
                              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                                <div className={classNames("rounded-xl border px-3 py-2", active ? "border-white/10 bg-white/5" : "border-zinc-200 bg-zinc-50")}>
                                  <div className={classNames("text-[10px] font-semibold uppercase tracking-[0.14em]", active ? "text-zinc-300" : "text-zinc-500")}>Visual tone</div>
                                  <div className={classNames("mt-1 text-xs leading-5", active ? "text-zinc-100" : "text-zinc-700")}>{frame.visualTone}</div>
                                </div>
                                <div className={classNames("rounded-xl border px-3 py-2", active ? "border-white/10 bg-white/5" : "border-zinc-200 bg-zinc-50")}>
                                  <div className={classNames("text-[10px] font-semibold uppercase tracking-[0.14em]", active ? "text-zinc-300" : "text-zinc-500")}>CTA rhythm</div>
                                  <div className={classNames("mt-1 text-xs leading-5", active ? "text-zinc-100" : "text-zinc-700")}>{frame.ctaRhythm}</div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm leading-7 text-zinc-700">
                      {foundationOverview.shellConcept}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {sectionPlanItems.map((item, index) => (
                        <span key={`${item}-${index}`} className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700">
                          {item}
                        </span>
                      ))}
                    </div>

                    <details className="mt-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                      <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-900">Fine-tune shell details</summary>
                      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                        <label className="block lg:col-span-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Narrative spine</div>
                          <textarea
                            value={pageIntentProfile.shellConcept}
                            onChange={(e) => updatePageIntentProfile({ shellConcept: e.target.value })}
                            onBlur={() => updatePageIntentProfile({}, true)}
                            placeholder="Describe the baseline architecture AI should build before styling or redesigning it"
                            className="mt-1 min-h-24 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                          />
                        </label>

                        <label className="block lg:col-span-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Section order</div>
                          <textarea
                            value={pageIntentProfile.sectionPlan}
                            onChange={(e) => updatePageIntentProfile({ sectionPlan: e.target.value })}
                            onBlur={() => updatePageIntentProfile({}, true)}
                            placeholder="Example: Hero -> proof strip -> offer breakdown -> intake section -> FAQ -> final CTA"
                            className="mt-1 min-h-20 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                          />
                        </label>
                      </div>
                    </details>
                  </div>

                  <label className="flex items-center gap-2 text-xs font-medium text-zinc-600">
                    <input
                      type="checkbox"
                      checked={pageIntentProfile.askClarifyingQuestions}
                      onChange={(e) => updatePageIntentProfile({ askClarifyingQuestions: e.target.checked }, true)}
                      className="h-4 w-4 rounded border-zinc-300 text-(--color-brand-blue) focus:ring-(--color-brand-blue)"
                    />
                    Ask clarifying questions first only when the direction is still materially ambiguous
                  </label>
                </>
              ) : null}
            </section>

            {showShellStep ? (
            <details className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs leading-5 text-zinc-600">
              <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-900">Resolved foundation and platform truth</summary>
              <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-xs leading-5 text-zinc-600">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-zinc-900">Resolved business and commercial read</div>
                    <span className={classNames(
                      "rounded-full border px-3 py-1 text-[11px] font-semibold",
                      foundationArtifactBusy
                        ? "border-blue-200 bg-blue-50 text-blue-800"
                        : foundationArtifact?.source === "ai"
                          ? "border-violet-200 bg-violet-50 text-violet-800"
                          : "border-zinc-200 bg-zinc-100 text-zinc-700",
                    )}>
                      {foundationArtifactBusy ? "Refreshing" : foundationArtifact?.source === "ai" ? "AI synthesized" : "Structured fallback"}
                    </span>
                  </div>
                  <div className="mt-2 text-sm leading-6 text-zinc-900">{foundationArtifact?.strategicSummary || foundationOverview.summary}</div>
                  <div className="mt-2 text-sm leading-6 text-zinc-700">{foundationArtifact?.narrative || foundationOverview.businessNarrative}</div>
                  {foundationArtifact?.assumption ? (
                    <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600">
                      Working assumption: {foundationArtifact.assumption}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={classNames("rounded-full border px-3 py-1 text-[11px] font-semibold", businessProfileSummary ? "border-blue-200 bg-blue-50 text-blue-800" : "border-zinc-200 bg-zinc-50 text-zinc-500")}>Business profile {businessProfileSummary ? "connected" : "thin"}</span>
                    <span className={classNames("rounded-full border px-3 py-1 text-[11px] font-semibold", funnel?.brief?.funnelGoal ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-zinc-200 bg-zinc-50 text-zinc-500")}>Funnel objective {funnel?.brief?.funnelGoal ? "set" : "open"}</span>
                    <span className={classNames("rounded-full border px-3 py-1 text-[11px] font-semibold", funnel?.brief?.offerSummary ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-zinc-200 bg-zinc-50 text-zinc-500")}>Offer framing {funnel?.brief?.offerSummary ? "present" : "light"}</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-xs leading-5 text-zinc-600">
                  <div className="font-semibold text-zinc-900">Capability truth and shell handoff</div>
                  <div className="mt-2 text-sm leading-6 text-zinc-700">{foundationOverview.capabilitySummary}</div>
                  <div className="mt-3 space-y-2">
                    {foundationOverview.capabilityGraph.map((capability) => (
                      <div key={capability.key} className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-zinc-900">{capability.label}</div>
                          <span className={classNames(
                            "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                            capability.status === "ready"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : capability.status === "needs-setup"
                                ? "border-amber-200 bg-amber-50 text-amber-800"
                                : capability.status === "planned"
                                  ? "border-blue-200 bg-blue-50 text-blue-800"
                                  : "border-zinc-200 bg-white text-zinc-600",
                          )}>
                            {capability.status === "needs-setup" ? "setup needed" : capability.status === "not-needed" ? "not needed" : capability.status}
                          </span>
                        </div>
                        <div className="mt-1 text-xs leading-5 text-zinc-600">{capability.summary}</div>
                      </div>
                    ))}
                  </div>
                  {foundationArtifact?.shellRationale.length ? (
                    <div className="mt-4 rounded-2xl border border-zinc-200 bg-white px-3 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Why this shell</div>
                      <div className="mt-2 space-y-2 text-sm leading-6 text-zinc-700">
                        {foundationArtifact.shellRationale.map((item, index) => (
                          <div key={`${item}-${index}`}>{item}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                {foundationArtifact?.conversionRisks.length || foundationArtifact?.nextMoves.length || foundationArtifactError ? (
                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-xs leading-5 text-zinc-600 xl:col-span-2">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <div>
                        <div className="font-semibold text-zinc-900">Current risks</div>
                        <div className="mt-2 space-y-2 text-sm leading-6 text-zinc-700">
                          {(foundationArtifact?.conversionRisks.length ? foundationArtifact.conversionRisks : ["No major conversion-risk note is persisted yet."]).map((item, index) => (
                            <div key={`${item}-${index}`}>{item}</div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="font-semibold text-zinc-900">Next moves</div>
                        <div className="mt-2 space-y-2 text-sm leading-6 text-zinc-700">
                          {(foundationArtifact?.nextMoves.length ? foundationArtifact.nextMoves : [foundationOverview.askForClarification ? "Answer one decisive clarification before generating." : "Generate from this shell and refine with live edits."]).map((item, index) => (
                            <div key={`${item}-${index}`}>{item}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                    {foundationArtifactError ? (
                      <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                        Foundation refresh failed, so this view is showing the structured fallback. {foundationArtifactError}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </details>
            ) : null}

            {emptyPageAiGuide && !blankPageOnboardingActive ? (
              <div className="flex flex-wrap gap-2">
                {emptyPageAiGuide.prompts.map((prompt, idx) => (
                  <button
                    key={`empty-page-ai-prompt-${idx}`}
                    type="button"
                    onClick={() => {
                      setChatInput(prompt);
                      setBriefPanelOpen(false);
                    }}
                    className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-left text-xs font-semibold text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-white"
                    title={prompt}
                  >
                    {idx === 0 ? "Draft from recommendation" : idx === 1 ? "Ask 3 high-impact questions" : "Map the foundation"}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </AppModal>

      <AppModal
        open={dialog?.type === "create-page"}
        title="Create page"
        description="Pick the page direction first. Route and title can be derived from that direction and refined before or after creation."
        onClose={closeDialog}
        widthClassName="w-[min(640px,calc(100vw-32px))]"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              onClick={closeDialog}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className={classNames(
                "rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700",
                busy ? "opacity-60" : "",
              )}
              disabled={busy}
              onClick={() => {
                if (dialog?.type !== "create-page") return;
                void performCreatePage({
                  slug: dialog.slug,
                  title: dialog.title,
                  pageType: dialog.pageType,
                  primaryCta: dialog.primaryCta,
                  heroAssetMode: dialog.heroAssetMode,
                  audience: dialog.audience,
                  offer: dialog.offer,
                });
              }}
            >
              Create
            </button>
          </div>
        }
      >
        {(() => {
          const pageType = dialog?.type === "create-page" ? dialog.pageType : "landing";
          const primaryCta = dialog?.type === "create-page" ? dialog.primaryCta : "";
          const heroAssetMode = dialog?.type === "create-page" ? dialog.heroAssetMode : "auto";
          const audience = dialog?.type === "create-page" ? dialog.audience : "";
          const offer = dialog?.type === "create-page" ? dialog.offer : "";
          const manualSlug = dialog?.type === "create-page" ? normalizeSlug(dialog.slug) : "";
          const manualTitle = dialog?.type === "create-page" ? dialog.title.trim() : "";
          const naming = buildSuggestedPageNaming({
            pageType,
            primaryCta,
            offer,
            fallbackSlug: manualSlug || undefined,
            fallbackTitle: manualTitle || undefined,
          });
          const previewIntent = inferFunnelPageIntentProfile({
            funnelBrief: funnel?.brief ?? null,
            funnelName: funnel?.name,
            funnelSlug: funnel?.slug,
            pageTitle: naming.title,
            pageSlug: naming.slug,
            pageType,
            primaryCta,
            audience,
            offer,
            heroAssetMode,
          });
          const previewFocus = buildPageConversionFocus(previewIntent);
          const ctaSuggestions = buildPrimaryCtaSuggestions(pageType, primaryCta);
          const slugConflict = naming.slug ? (pages || []).find((page) => normalizeSlug(page.slug) === naming.slug) : null;
          const routePreview = `/${[funnel?.slug || "", naming.slug].filter(Boolean).join("/")}`;

          return (
            <div className="space-y-5">
              <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">1. Direction</div>
                <div className="mt-1 text-sm text-zinc-700">Choose the page motion first. This drives the initial CTA, hero posture, route suggestion, and AI foundation.</div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(["landing", "lead-capture", "booking", "sales", "application", "thank-you"] as FunnelPageIntentType[]).map((type) => {
                    const active = pageType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          const nextIntent = inferFunnelPageIntentProfile({
                            funnelBrief: funnel?.brief ?? null,
                            funnelName: funnel?.name,
                            funnelSlug: funnel?.slug,
                            pageType: type,
                            audience,
                            offer,
                          });
                          setDialogError(null);
                          setDialog((prev) =>
                            prev?.type === "create-page"
                              ? {
                                  ...prev,
                                  pageType: type,
                                  primaryCta:
                                    prev.primaryCta.trim() && prev.primaryCta.trim() !== buildPrimaryCtaSuggestions(prev.pageType, prev.primaryCta)[0]
                                      ? prev.primaryCta
                                      : nextIntent.primaryCta,
                                  heroAssetMode: nextIntent.mediaPlan.heroAssetMode,
                                }
                              : prev,
                          );
                        }}
                        className={classNames(
                          "rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition-colors",
                          active ? "border-(--color-brand-blue) bg-blue-50 text-blue-900" : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-100",
                        )}
                      >
                        {PAGE_INTENT_TYPE_LABELS[type]}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Primary CTA</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ctaSuggestions.map((suggestion) => {
                      const active = primaryCta.trim() === suggestion;
                      return (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => {
                            setDialogError(null);
                            setDialog((prev) => (prev?.type === "create-page" ? { ...prev, primaryCta: suggestion } : prev));
                          }}
                          className={classNames(
                            "rounded-full border px-3 py-2 text-xs font-semibold transition-colors",
                            active ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                          )}
                        >
                          {suggestion}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Hero posture</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {([
                      { value: "auto", label: "Auto" },
                      { value: "image", label: "Image-led" },
                      { value: "video", label: "Video-led" },
                      { value: "none", label: "Text-led" },
                    ] as Array<{ value: FunnelPageMediaMode; label: string }>).map((option) => {
                      const active = heroAssetMode === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setDialogError(null);
                            setDialog((prev) => (prev?.type === "create-page" ? { ...prev, heroAssetMode: option.value } : prev));
                          }}
                          className={classNames(
                            "rounded-2xl border px-3 py-2 text-sm font-semibold transition-colors",
                            active ? "border-(--color-brand-blue) bg-blue-50 text-blue-900" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Audience (optional)</div>
                  <input
                    value={dialog?.type === "create-page" ? dialog.audience : ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDialogError(null);
                      setDialog((prev) => (prev?.type === "create-page" ? { ...prev, audience: v } : prev));
                    }}
                    placeholder="High-intent visitors who need a clear next step"
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                  />
                </label>

                <label className="block">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Offer or hook (optional)</div>
                  <input
                    value={dialog?.type === "create-page" ? dialog.offer : ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDialogError(null);
                      setDialog((prev) => (prev?.type === "create-page" ? { ...prev, offer: v } : prev));
                    }}
                    placeholder="Free audit, consultation, pricing, or next-step offer"
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                  />
                </label>
              </div>

              <div className="rounded-3xl border border-zinc-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">2. Route and title</div>
                <div className="mt-1 text-sm text-zinc-700">Leave these blank to use the suggested route and page name. You can rename either later.</div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Path override (optional)</div>
                    <input
                      autoFocus
                      value={dialog?.type === "create-page" ? dialog.slug : ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        const normalized = normalizeSlug(v);
                        const conflict = v.trim() && normalized ? (pages || []).find((page) => normalizeSlug(page.slug) === normalized) : null;
                        setDialogError(conflict ? `The path /${normalized} is already taken by "${conflict.title || conflict.slug}". Try /${normalized}-2.` : null);
                        setDialog((prev) => (prev?.type === "create-page" ? { ...prev, slug: v } : prev));
                      }}
                      placeholder={naming.slug}
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                    />
                    <div className="mt-1 font-mono text-[11px] text-zinc-500">
                      {routePreview}
                      {!manualSlug && slugConflict ? <span className="ml-2 text-amber-700">Suggested route is already used; creation will add a numeric suffix.</span> : null}
                    </div>
                  </label>

                  <label className="block">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Title override (optional)</div>
                    <input
                      value={dialog?.type === "create-page" ? dialog.title : ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDialogError(null);
                        setDialog((prev) => (prev?.type === "create-page" ? { ...prev, title: v } : prev));
                      }}
                      placeholder={naming.title}
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                    />
                    {!manualTitle ? <div className="mt-1 text-xs text-zinc-500">Suggested title: {naming.title}</div> : null}
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                <div className="font-semibold text-zinc-900">How AI will treat this new page</div>
                <div className="mt-2 leading-6">
                  AI will start this as a {PAGE_INTENT_TYPE_LABELS[previewIntent.pageType].toLowerCase()} page with a {previewFocus.metricValue.toLowerCase()} goal, route it toward the {previewIntent.primaryCta} action, and build the first shell around {previewIntent.offer.toLowerCase()}.
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-zinc-600 sm:grid-cols-3">
                  <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3">
                    <div className="font-semibold uppercase tracking-wide text-zinc-500">Page focus</div>
                    <div className="mt-1 text-sm text-zinc-800">{previewFocus.headline}</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3">
                    <div className="font-semibold uppercase tracking-wide text-zinc-500">Conversion path</div>
                    <div className="mt-1 text-sm text-zinc-800">{previewFocus.ctaValue}</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3">
                    <div className="font-semibold uppercase tracking-wide text-zinc-500">Hero plan</div>
                    <div className="mt-1 text-sm text-zinc-800">{heroAssetMode === "auto" ? "AI decides the strongest opening" : heroAssetMode === "none" ? "Text-led opening" : `${heroAssetMode} opening`}</div>
                  </div>
                </div>
                <div className="mt-3 text-xs leading-5 text-zinc-600">
                  Best first prompt after creation: refine the promise, proof, and CTA path for this page. If the missing detail would materially change the shell, ask AI for 3 decisive questions instead of a full questionnaire.
                </div>
              </div>

              {dialogError ? <div className="text-sm font-semibold text-red-700">{dialogError}</div> : null}
            </div>
          );
        })()}
      </AppModal>

      <AppModal
        open={dialog?.type === "create-form"}
        title="Create form"
        description="Create a hosted form you can link/embed in this funnel."
        onClose={closeDialog}
        widthClassName="w-[min(640px,calc(100vw-32px))]"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              onClick={closeDialog}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className={classNames(
                "rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700",
                busy ? "opacity-60" : "",
              )}
              disabled={busy}
              onClick={() => {
                if (dialog?.type !== "create-form") return;
                void performCreateForm({
                  slug: dialog.slug,
                  name: dialog.name,
                  templateKey: dialog.templateKey,
                  themeKey: dialog.themeKey,
                });
              }}
            >
              Create
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Template</div>
              <PortalListboxDropdown<CreditFormTemplateKey>
                value={dialog?.type === "create-form" ? dialog.templateKey : "credit-intake-premium"}
                onChange={(v) => {
                  setDialogError(null);
                  const t = getCreditFormTemplate(v);
                  setDialog((prev) =>
                    prev?.type === "create-form"
                      ? {
                          ...prev,
                          templateKey: v,
                          themeKey: t?.defaultThemeKey ? t.defaultThemeKey : prev.themeKey,
                        }
                      : prev,
                  );
                }}
                options={CREDIT_FORM_TEMPLATES.filter((t) => portalVariant === "credit" || !t.key.startsWith("credit-intake")).map((t) => ({ value: t.key, label: t.label, hint: t.description }))}
                renderOptionRight={(opt) => {
                  const tmpl = CREDIT_FORM_TEMPLATES.find((t) => t.key === opt.value);
                  const theme = tmpl ? getCreditFormTheme(tmpl.defaultThemeKey) : null;
                  const c = theme?.style?.buttonBg || "#2563eb";
                  return <div aria-hidden="true" className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: c }} />;
                }}
              />
            </label>

            <label className="block">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Theme</div>
              <PortalListboxDropdown<CreditFormThemeKey>
                value={dialog?.type === "create-form" ? dialog.themeKey : "royal-indigo"}
                onChange={(v) => {
                  setDialogError(null);
                  setDialog((prev) => (prev?.type === "create-form" ? { ...prev, themeKey: v } : prev));
                }}
                options={CREDIT_FORM_THEMES.map((t) => ({ value: t.key, label: t.label, hint: t.description }))}
                renderOptionRight={(opt) => {
                  const theme = CREDIT_FORM_THEMES.find((t) => t.key === opt.value);
                  const c = theme?.style?.buttonBg || "#2563eb";
                  return <div aria-hidden="true" className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: c }} />;
                }}
              />
            </label>
          </div>

          {dialog?.type === "create-form" ? (
            <CreditFormTemplatePreview
              template={getCreditFormTemplate(dialog.templateKey) || CREDIT_FORM_TEMPLATES[0]!}
              theme={getCreditFormTheme(dialog.themeKey) || CREDIT_FORM_THEMES[0]!}
            />
          ) : null}

          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Slug</div>
            <input
              autoFocus
              value={dialog?.type === "create-form" ? dialog.slug : ""}
              onChange={(e) => {
                const v = e.target.value;
                setDialogError(null);
                setDialog((prev) => (prev?.type === "create-form" ? { ...prev, slug: v } : prev));
              }}
              placeholder="new-client-intake"
              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
            />
            <div className="mt-1 text-xs text-zinc-500">Allowed: letters, numbers, and dashes.</div>
          </label>

          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Name (optional)</div>
            <input
              value={dialog?.type === "create-form" ? dialog.name : ""}
              onChange={(e) => {
                const v = e.target.value;
                setDialogError(null);
                setDialog((prev) => (prev?.type === "create-form" ? { ...prev, name: v } : prev));
              }}
              placeholder="New client intake"
              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
            />
          </label>

          {dialogError ? <div className="text-sm font-semibold text-red-700">{dialogError}</div> : null}
        </div>
      </AppModal>

      <AppConfirmModal
        open={dialog?.type === "delete-page"}
        title="Delete page"
        message={selectedPage ? `Delete page “${selectedPage.title}”? This cannot be undone.` : "Delete this page?"}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onClose={closeDialog}
        onConfirm={() => {
          closeDialog();
          void performDeletePage();
        }}
      />

      <AppConfirmModal
        open={dialog?.type === "delete-block"}
        title={dialog?.type === "delete-block" ? `Delete ${dialog.label}` : "Delete block"}
        message={dialog?.type === "delete-block" ? `Delete this ${dialog.label} from the page? This removes it from the live draft.` : "Delete this item?"}
        confirmLabel={dialog?.type === "delete-block" ? `Delete ${dialog.label}` : "Delete block"}
        cancelLabel="Cancel"
        destructive
        onClose={closeDialog}
        onConfirm={() => {
          if (dialog?.type !== "delete-block") return;
          const blockId = dialog.blockId;
          closeDialog();
          removeBlock(blockId);
        }}
      />

      <AppModal
        open={dialog?.type === "leave-page"}
        title="Leave page with unsaved changes?"
        description="Choose whether to save this page before switching away from it."
        onClose={closeDialog}
        widthClassName="w-[min(560px,calc(100vw-32px))]"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              onClick={closeDialog}
              disabled={busy || savingPage}
            >
              Stay here
            </button>
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              onClick={() => {
                void continuePageSelection("discard");
              }}
              disabled={busy || savingPage}
            >
              Discard changes
            </button>
            <button
              type="button"
              className={classNames(
                "rounded-2xl px-4 py-2 text-sm font-semibold text-white",
                busy || savingPage ? "bg-zinc-400" : "bg-(--color-brand-blue) hover:bg-blue-700",
              )}
              disabled={busy || savingPage}
              onClick={() => {
                void continuePageSelection("save");
              }}
            >
              {savingPage ? "Saving…" : workflowView.leavePageConfirmLabel}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            {workflowView.leavePageSummary}
          </div>
          <div className="text-xs text-zinc-500">
            Discard reloads the last saved server version before switching pages.
          </div>
        </div>
      </AppModal>

      <AppModal
        open={aiContextOpen}
        title="Attach references to AI"
        description="These references are passed with future AI edits in this editor session. Use them when the next change needs real content or visuals. They are not auto-generated from chat history."
        onClose={() => setAiContextOpen(false)}
        widthClassName="w-[min(560px,calc(100vw-32px))]"
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              className={classNames(
                "rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700",
                busy ? "opacity-60" : "",
              )}
              onClick={() => setAiContextOpen(false)}
              disabled={busy}
            >
              Done
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <input
            ref={aiContextUploadInputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const files = e.target.files;
              e.currentTarget.value = "";
              if (!files || files.length === 0) return;
              void uploadAiContextFiles(files);
            }}
          />

          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || aiContextUploadBusy}
              onClick={() => aiContextUploadInputRef.current?.click()}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
            >
              {aiContextUploadBusy ? "Uploading…" : "Upload"}
            </button>
            <button
              type="button"
              disabled={busy || aiContextUploadBusy}
              onClick={() => {
                setMediaPickerTarget({ type: "ai-context" });
                setMediaPickerOpen(true);
              }}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
            >
              From library
            </button>
            {aiContextMedia.length ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setAiContextMedia([])}
                className="ml-auto rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-500 hover:bg-zinc-50 disabled:opacity-60"
              >
                Clear all
              </button>
            ) : null}
          </div>

          {aiContextMedia.length ? (
            <div className="flex flex-wrap gap-2">
              {aiContextMedia.map((m) => {
                const label = (m.fileName || "").trim() || "Image";
                return (
                  <button
                    key={m.url}
                    type="button"
                    disabled={busy}
                    onClick={() => setAiContextMedia((prev) => (prev || []).filter((x) => x.url !== m.url))}
                    className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
                    title="Click to remove"
                  >
                    <span className="font-semibold">{label}</span>
                    <span className="text-zinc-400">×</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">
              No references attached yet. Upload files or pick existing assets from your media library.
            </div>
          )}
        </div>
      </AppModal>

      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/85 backdrop-blur">
        <div className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`${basePath}/app/services/funnel-builder`}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              ← Back
            </Link>

            {selectedPageGraph.sourceMode === "custom-html" && selectedPage ? (
              <button
                type="button"
                disabled={busy || selectedPage.editorMode === "MARKDOWN"}
                onClick={() => void convertCurrentPageToBlocks()}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                title={selectedPageLensUi.structureTabTitle}
              >
                Convert to Structure
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <PortalListboxDropdown
              value={selectedPageId || ""}
              onChange={(v) => {
                const nextId = v || null;
                requestPageSelection(nextId);
              }}
              options={[
                { value: "", label: "Select a page…", disabled: true },
                ...(pages || []).map((p) => ({ value: p.id, label: p.title })),
              ]}
              className="min-w-55"
              buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
              disabled={busy || !pages || pages.length === 0}
            />

            <button
              type="button"
              disabled={busy}
              onClick={() => void createPage()}
              className={classNames(
                "rounded-xl px-3 py-2 text-sm font-semibold text-white",
                busy ? "bg-zinc-400" : "bg-(--color-brand-blue) hover:bg-blue-700",
              )}
            >
              + Page
            </button>

            <div className="inline-flex items-center rounded-xl border border-zinc-200 bg-white p-1">
              <button
                type="button"
                disabled={busy || !selectedPage || !canUndo}
                onClick={() => undo()}
                className="rounded-lg p-2 text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                title={
                  typeof navigator !== "undefined" && /mac/i.test(navigator.platform)
                    ? "Undo (⌘Z)"
                    : "Undo (Ctrl+Z)"
                }
              >
                <IconUndo size={16} />
              </button>

              <button
                type="button"
                disabled={busy || !selectedPage || !canRedo}
                onClick={() => redo()}
                className="rounded-lg p-2 text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                title={
                  typeof navigator !== "undefined" && /mac/i.test(navigator.platform)
                    ? "Redo (⇧⌘Z)"
                    : "Redo (Ctrl+Shift+Z)"
                }
              >
                <IconRedo size={16} />
              </button>
            </div>

            <button
              type="button"
              disabled={busy || !selectedPage || !selectedPageDirty}
              onClick={() => void saveCurrentPage()}
              title={workflowView.saveButtonTitle}
              className={classNames(
                "rounded-xl px-4 py-2 text-sm font-semibold",
                savingPage
                  ? "bg-zinc-400 text-white"
                  : selectedPageDirty
                    ? "bg-brand-ink text-white hover:opacity-95"
                    : "cursor-not-allowed border border-zinc-200 bg-white text-zinc-500",
              )}
            >
              {savingPage ? (
                <span className="inline-flex items-center gap-2">
                  <SpinnerIcon className="h-4 w-4" />
                  Saving
                </span>
              ) : workflowView.saveButtonLabel}
            </button>

            {saveStatusLabel ? (
              <span className={classNames(
                "text-xs",
                selectedPageDirty ? "text-amber-600" : "text-zinc-400",
              )}>
                {saveStatusLabel}
              </span>
            ) : null}

            <button
              type="button"
              disabled={busy || !selectedPage}
              onClick={() => void deletePage()}
              className={classNames(
                "rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50",
                busy ? "opacity-60" : "",
              )}
            >
              Delete
            </button>

          </div>
        </div>

        {selectedPage ? (
          <div className="border-t border-zinc-200/80 px-4 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <div className="truncate text-base font-semibold text-zinc-900">{selectedPage.title || "Untitled page"}</div>
                  <span className="text-sm text-zinc-500">/{selectedPage.slug}</span>
                </div>

                <div className="mt-1 text-sm text-zinc-600">{workflowView.workflowSummary}</div>
                <div className="mt-1 text-xs text-zinc-500">{pageManagementUi.summary}</div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {customCodeModeActive ? (
                  <button
                    type="button"
                    disabled={busy || publishingPage || !selectedPage || !workflowView.hasDeployableDraft}
                    onClick={() => void publishPage()}
                    className={classNames(
                      "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white",
                      busy || publishingPage || !selectedPage || !workflowView.hasDeployableDraft
                        ? "bg-zinc-400"
                        : "bg-emerald-600 hover:bg-emerald-700",
                    )}
                    title="Save any pending draft changes, then replace the live hosted page with this draft"
                  >
                    {publishingPage ? (
                      <>
                        <SpinnerIcon className="h-4 w-4" />
                        Publishing
                      </>
                    ) : (
                      <>
                        <IconUpload size={16} className="shrink-0" />
                        {workflowView.publishButtonLabel}
                      </>
                    )}
                  </button>
                ) : null}
                {funnelLiveHref ? (
                  <>
                    <Link
                      href={funnelLiveHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-semibold text-zinc-900 transition-colors duration-150 hover:bg-zinc-50"
                    >
                      <IconExport size={16} className="text-zinc-500" />
                      {workflowView.liveLinkLabel}
                    </Link>
                    <button
                      type="button"
                      onClick={() => void copyLiveFunnelHref()}
                      className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-semibold text-zinc-900 transition-colors duration-150 hover:bg-zinc-50"
                    >
                      <IconCopy size={16} className="text-zinc-500" />
                      Copy live URL
                    </button>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-500">
                    Live URL will appear after this funnel has a valid public route.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </header>

      {error ? (
        <div className="mx-4 mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div
        className={classNames(
          "relative flex flex-1 flex-col overflow-auto lg:min-h-0 lg:overflow-hidden",
          "lg:grid lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[296px_minmax(0,1fr)]",
        )}
      >
        <aside
          className="w-full shrink-0 overflow-y-auto border-b border-zinc-200 bg-zinc-50/80 px-3 py-3.5 lg:order-1 lg:h-full lg:min-h-0 lg:border-b-0 lg:border-r lg:px-3.5"
        >
          {!selectedPage ? (
            pages === null ? (
              <div className="space-y-3">
                <div className="h-11 rounded-2xl bg-zinc-100 animate-pulse" />
                <div className="h-26 rounded-3xl bg-zinc-100 animate-pulse" />
                <div className="h-18 rounded-3xl bg-zinc-100 animate-pulse" />
              </div>
            ) : (
              <div className="text-sm text-zinc-600">Select a page to edit.</div>
            )
          ) : wholePageModeActive && !wholePageUsesBuilderSidebar ? (
            <div className="space-y-4">
              <div className="rounded-3xl border border-zinc-200 bg-white p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Source workspace</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{wholePageSourceEditable ? "Draft HTML" : "Generated HTML"}</div>
                <div className="mt-2 text-sm leading-6 text-zinc-700">
                  {wholePageNeedsSaveForDeployableSource
                    ? "Structure is still the authoring surface for this page. Save when you want deployable source regenerated."
                    : wholePageStatusMessage || "Source stays on the same draft you are editing here."}
                </div>
                {wholePageSyncMeta ? <div className="mt-3 text-xs text-zinc-500">{wholePageSyncMeta}</div> : null}
              </div>
            </div>
          ) : selectedPage.editorMode === "MARKDOWN" ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Legacy mode</div>
              <div className="mt-2 font-semibold">This page is in Markdown mode.</div>
              <div className="mt-2 text-amber-800">
                Markdown editing is disabled in this editor. Pick a supported mode to continue.
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void setEditorMode("BLOCKS")}
                  className={classNames(
                    "rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100",
                    busy ? "opacity-60" : "",
                  )}
                >
                  Switch to Structure
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void setEditorMode("CUSTOM_HTML")}
                  className={classNames(
                    "rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100",
                    busy ? "opacity-60" : "",
                  )}
                >
                  Switch to Page
                </button>
              </div>
            </div>
          ) : blocksSurfaceActive || wholePageUsesBuilderSidebar ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-1.5">
                <div className={classNames("grid gap-1.5", selectedBlock ? "grid-cols-4" : "grid-cols-3")}>
                  <BuilderRailNavButton
                    label="Structure"
                    icon={
                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="14" height="4" rx="1.5" />
                        <rect x="3" y="10" width="14" height="6" rx="1.5" />
                      </svg>
                    }
                    active={builderTopLevelPanel === "structure"}
                    onClick={() => setSidebarPanel("structure")}
                  />
                  <BuilderRailNavButton
                    label="Activity"
                    badge={pageActivityCount ? String(pageActivityCount) : undefined}
                    icon={
                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 10h3l1.2-3 2.6 7 1.6-4H16" />
                        <path d="M4 4.5h12" />
                        <path d="M4 15.5h12" />
                      </svg>
                    }
                    active={builderTopLevelPanel === "activity"}
                    onClick={() => setSidebarPanel("activity")}
                  />
                  {selectedBlock ? (
                    <BuilderRailNavButton
                      label="Selection"
                      icon={
                        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 3.5H4.75A1.25 1.25 0 0 0 3.5 4.75V6" />
                          <path d="M14 3.5h1.25a1.25 1.25 0 0 1 1.25 1.25V6" />
                          <path d="M6 16.5H4.75a1.25 1.25 0 0 1-1.25-1.25V14" />
                          <path d="M14 16.5h1.25a1.25 1.25 0 0 0 1.25-1.25V14" />
                          <rect x="7" y="7" width="6" height="6" rx="1.25" />
                        </svg>
                      }
                      active={builderTopLevelPanel === "selected"}
                      onClick={() => setSidebarPanel("selected")}
                    />
                  ) : null}
                  <BuilderRailNavButton
                    label="Settings"
                    icon={
                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3.5" y="4" width="13" height="12" rx="2" />
                        <path d="M7 8h6" />
                        <path d="M7 12h4" />
                      </svg>
                    }
                    active={builderTopLevelPanel === "settings"}
                    onClick={() => setSidebarPanel("settings")}
                  />
                </div>
              </div>

              {wholePageUsesBuilderSidebar ? (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50/75 p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Stage</div>
                    {wholePageSyncMeta ? <div className="text-right text-[11px] font-medium leading-4 text-zinc-500">{wholePageSyncMeta}</div> : null}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
                      {wholePageStageMeta.label}
                    </span>
                    <span className="text-[11px] font-medium text-zinc-500">{selectedPageDirty ? "Draft in progress" : "Draft stable"}</span>
                  </div>
                  <div className="mt-3 space-y-1.5 text-[11px] text-zinc-500">
                    <div className="flex items-start gap-2">
                      <span className={classNames("mt-1 inline-flex h-1.5 w-1.5 shrink-0 rounded-full", selectedPageDirty ? "bg-zinc-400" : "bg-emerald-400/80")} />
                      <span>
                        {wholePageNeedsSaveForDeployableSource
                          ? "Unsaved draft changes"
                          : selectedPageDirty
                            ? "Preview and source are on this draft"
                            : "Preview and source are in sync"}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="mt-1 inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-300" />
                      <span>{wholePageStageMeta.summary}</span>
                    </div>
                    {wholePageStatusMessage ? (
                      <div className="flex items-start gap-2">
                        <span className="mt-1 inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-300" />
                        <span>{wholePageStatusMessage}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {builderTopLevelPanel === "structure" ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Map</div>
                      <div className="mt-1 truncate text-sm font-semibold text-zinc-900">{selectedPage.title || "Untitled page"}</div>
                    </div>
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
                      {blockOutlineItems.length} {blockOutlineItems.length === 1 ? "item" : "items"}
                    </span>
                  </div>

                  {blockOutlineItems.length ? (
                    <div className="mt-3 max-h-120 space-y-1.5 overflow-y-auto isolate">
                      {blockOutlineItems.map((item) => {
                        const isActive = selectedBlockId === item.id;
                        const isAnchor = selectedPageFlowAnchorId === item.id;
                        const isNested = item.depth > 0;
                        const indent = item.depth ? Math.min(item.depth * 14, 34) : 0;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setSelectedBlockId(item.id);
                              if (wholePageUsesBuilderSidebar && !pageAnatomy.onlyCodeIsland) {
                                setBuilderMode("blocks");
                                setPreviewMode("edit");
                              }
                            }}
                            className={classNames(
                              "relative z-0 w-full rounded-xl border px-2.5 py-2 text-left transition-[border-color,background-color,box-shadow] hover:z-10 focus-visible:z-10",
                              isActive
                                ? "border-zinc-300 bg-white text-zinc-950 shadow-[0_8px_20px_rgba(15,23,42,0.06)]"
                                : isAnchor
                                  ? "border-blue-200 bg-blue-50 text-zinc-900"
                                  : "border-zinc-200 bg-white text-zinc-900 hover:border-zinc-300 hover:bg-zinc-50",
                            )}
                          >
                            {item.depth ? (
                              <span
                                aria-hidden="true"
                                className="absolute bottom-2.5 top-2.5 w-px rounded-full bg-zinc-200"
                                style={{ left: `${14 + Math.max(indent - 8, 0)}px` }}
                              />
                            ) : null}

                            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5">
                              <div className="pt-0.5" style={{ marginLeft: indent ? `${indent}px` : undefined }}>
                                <div
                                  className={classNames(
                                    "inline-flex h-7 w-7 items-center justify-center rounded-lg border",
                                    isActive ? "border-zinc-200 bg-zinc-950 text-white" : "border-zinc-200 bg-zinc-50 text-zinc-600",
                                  )}
                                >
                                  <BuilderOutlineGlyph kind={item.kind} active={isActive} />
                                </div>
                              </div>

                              <div className="min-w-0">
                                <div className={classNames("text-[10px] font-semibold uppercase tracking-[0.12em]", isActive ? "text-zinc-500" : isAnchor ? "text-blue-700" : "text-zinc-500")}>
                                  {item.kind}
                                  {isNested ? ` · L${item.depth}` : ""}
                                  {isAnchor ? " · after" : ""}
                                </div>
                                <div className="mt-0.5 truncate text-[13px] font-semibold leading-5">{item.detail}</div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-4 text-sm text-zinc-600">
                      Add the first section or block to start the page map.
                    </div>
                  )}

                  {selectedBlock ? (
                    <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3">
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium text-zinc-500">Selected item</div>
                        <div className="mt-1 truncate text-sm font-semibold text-zinc-900">{selectedOutlineItem?.detail || selectedBlock.type}</div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {builderTopLevelPanel === "activity" ? (
                <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-zinc-900">Activity</div>
                      <div className="mt-1 text-xs leading-5 text-zinc-500">Recent AI turns, saved changes, and runtime truth for this page stay here without stealing canvas focus.</div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      <div className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-600">
                        {selectedPageDirty ? "Draft has unsaved edits" : "Draft synced"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 space-y-3">
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Recent saves</div>
                        </div>
                      </div>

                      <div className="mt-3">
                        <SavedChangeFeed
                          entries={selectedPageRecentActivity}
                          emptyState="Saved diffs will show up here after the first completed save."
                        />
                      </div>
                    </div>

                    <PageContinuityPanel
                      thread={selectedPageChatThread}
                      latestCheckpoint={selectedPageLatestAiCheckpoint}
                      onRestoreLatest={() => void restoreLastAiRun()}
                      restoreDisabled={Boolean(busy || savingPage || !selectedPageLatestAiCheckpoint)}
                    />

                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Execution</div>
                          <div className="mt-1 text-xs leading-5 text-zinc-500">Hosted runtime truth for tracking and first-party page events.</div>
                        </div>
                      </div>

                      <div className="mt-3 space-y-2 rounded-xl border border-zinc-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                          <div className="text-xs font-medium text-zinc-500">Tracking</div>
                          <div className={classNames(
                            "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                            selectedPageExecutionSummary?.trackingReady
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : "border-amber-200 bg-amber-50 text-amber-800",
                          )}>
                            {selectedPageExecutionSummary?.trackingReady ? "Ready" : "Pending"}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                          <div>
                            <div className="text-xs font-medium text-zinc-500">Meta pixel</div>
                            <div className="mt-0.5 text-xs font-semibold text-zinc-900">{selectedPageExecutionSummary?.metaPixelId || "No Meta pixel configured"}</div>
                          </div>
                          <div className={classNames(
                            "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                            selectedPageExecutionSummary?.metaPixelReady
                              ? "border-blue-200 bg-blue-50 text-blue-800"
                              : "border-zinc-200 bg-white text-zinc-600",
                          )}>
                            {selectedPageExecutionSummary?.metaPixelReady ? "Live" : "None"}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1">
                          {[
                            { label: "Views", value: selectedPageExecutionMetrics.page_view },
                            { label: "CTA", value: selectedPageExecutionMetrics.cta_click },
                            { label: "Forms", value: selectedPageExecutionMetrics.form_submitted },
                            { label: "Bookings", value: selectedPageExecutionMetrics.booking_created },
                            { label: "Checkout", value: selectedPageExecutionMetrics.checkout_started },
                            { label: "Cart", value: selectedPageExecutionMetrics.add_to_cart },
                          ].map((item) => (
                            <div key={item.label} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{item.label}</div>
                              <div className="mt-1 text-base font-semibold text-zinc-900">{item.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {builderTopLevelPanel === "settings" ? (
                <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-zinc-900">Settings</div>
                      <div className="mt-1 text-xs leading-5 text-zinc-500">Brief, routing, canvas defaults, and search settings for this page live here.</div>
                    </div>
                    <div className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-600">
                      {seoDirty || funnelBookingDirty ? "Unsaved settings" : "Settings synced"}
                    </div>
                  </div>

                  <div className="mt-3 space-y-3">
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Direction</div>
                          <div className="mt-1 text-sm font-semibold text-zinc-900">AI is steering {selectedPageRouteLabel}</div>
                          <div className="mt-1 text-xs leading-5 text-zinc-500">
                            Keep the brief and prompt scaffolding tight here while the stage stays focused on preview, source, and direction.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setBriefPanelOpen(true)}
                          className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                        >
                          Open brief
                        </button>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setChatInput(composePromptFromIntent("draft"))}
                          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-semibold text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                        >
                          Draft from shell
                        </button>
                        <button
                          type="button"
                          onClick={() => setChatInput(composePromptFromIntent("clarify"))}
                          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-semibold text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                        >
                          Clarify first
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Booking routing</div>
                        <div className="mt-1 text-xs leading-5 text-zinc-500">Choose the funnel-level calendar route once. Booking blocks and first drafts inherit it unless overridden.</div>
                      </div>

                      <div className="mt-3 space-y-3 rounded-xl border border-zinc-200 bg-white p-3">
                        <label className="block">
                          <div className="mb-1 text-xs font-medium text-zinc-500">Default funnel calendar</div>
                          <PortalSelectDropdown
                            value={String(funnel?.bookingCalendarId || "")}
                            options={[
                              {
                                value: "",
                                label: "No funnel default",
                                hint: "Leave routing open until this account has a calendar worth pinning.",
                              },
                              ...enabledBookingCalendars.map((calendar) => ({
                                value: calendar.id,
                                label: calendar.title || calendar.id,
                                hint: calendar.id,
                              })),
                            ]}
                            onChange={(value) => {
                              setFunnelBookingDirty(true);
                              setFunnelBookingError(null);
                              setFunnel((prev) => (prev ? ({ ...prev, bookingCalendarId: value || null } as Funnel) : prev));
                            }}
                            buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                            placeholder="Select a calendar"
                          />
                        </label>

                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-500">
                          {enabledBookingCalendars.length === 0
                            ? "No calendars are created for this account yet. Leaving this on no funnel default is the correct state until a calendar exists."
                            : funnel?.bookingCalendarId
                              ? `This funnel routes booking traffic to ${enabledBookingCalendars.find((calendar) => calendar.id === funnel.bookingCalendarId)?.title || funnel.bookingCalendarId}.`
                              : "No funnel route is locked yet. This page can still use a block-specific calendar or the first enabled runtime fallback."}
                        </div>

                        <button
                          type="button"
                          disabled={funnelBookingBusy || !funnelBookingDirty}
                          onClick={() => void saveFunnelBookingRouting()}
                          className={classNames(
                            "w-full rounded-xl px-3 py-2 text-sm font-semibold text-white",
                            funnelBookingBusy || !funnelBookingDirty ? "bg-zinc-400" : "bg-brand-ink hover:opacity-95",
                          )}
                        >
                          {funnelBookingBusy ? "Saving…" : funnelBookingDirty ? "Save booking route" : "Booking route saved"}
                        </button>

                        {funnelBookingError ? <div className="text-xs text-red-600">{funnelBookingError}</div> : null}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Canvas defaults</div>
                      {showCanvasDefaults ? (
                        <div className="mt-3 space-y-3">
                          <label className="block">
                            <div className="mb-1 text-xs font-medium text-zinc-500">Canvas font</div>
                            <PortalFontDropdown
                              value={pageCanvasFontPresetKey}
                              onChange={(k) => {
                                const next = applyFontPresetToStyle(String(k || "default"));
                                updatePageStyle({
                                  fontFamily: next.fontFamily,
                                  fontGoogleFamily: next.fontGoogleFamily,
                                } as any);
                              }}
                              includeCustom
                              customFontFamily={String((pageStyle as any)?.fontFamily || "").trim()}
                              extraOptions={[{ value: "default", label: "Default (app font)" }]}
                              className="mt-1 w-full"
                              buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                            />
                          </label>

                          {pageCanvasFontPresetKey === "custom" ? (
                            <label className="block">
                              <div className="mb-1 text-xs font-medium text-zinc-500">Custom font family</div>
                              <input
                                value={(pageStyle as any)?.fontFamily || ""}
                                onChange={(e) =>
                                  updatePageStyle({
                                    fontFamily: e.target.value.replace(/[\r\n\t]/g, " ").slice(0, 200) || undefined,
                                    fontGoogleFamily: undefined,
                                  } as any)
                                }
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                placeholder='e.g. ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
                              />
                            </label>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-3 text-sm leading-6 text-zinc-700">
                          Imported-source pages still own their own font, background, and spacing, so canvas defaults stay out of the way here.
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                      <div className="min-w-0">
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Search</div>
                          <div className="mt-1 text-xs leading-5 text-zinc-500">Title, description, share image, and tab icon for this page.</div>
                        </div>
                      </div>

                      <div className="mt-3 space-y-3 rounded-xl border border-zinc-200 bg-white p-3">
                        <label className="block">
                          <div className="mb-1 text-xs font-medium text-zinc-500">Title</div>
                          <input
                            value={String(funnel?.seo?.title || "")}
                            onChange={(e) => {
                              const v = e.target.value.slice(0, 120);
                              setSeoDirty(true);
                              setSeoError(null);
                              setFunnel((prev) => {
                                if (!prev) return prev;
                                const nextSeo: FunnelSeo = { ...(prev.seo || {}), title: v || undefined };
                                return { ...prev, seo: nextSeo };
                              });
                            }}
                            placeholder="Shown in search and link previews"
                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          />
                        </label>

                        <label className="block">
                          <div className="mb-1 text-xs font-medium text-zinc-500">Description</div>
                          <textarea
                            value={String(funnel?.seo?.description || "")}
                            onChange={(e) => {
                              const v = e.target.value.slice(0, 300);
                              setSeoDirty(true);
                              setSeoError(null);
                              setFunnel((prev) => {
                                if (!prev) return prev;
                                const nextSeo: FunnelSeo = { ...(prev.seo || {}), description: v || undefined };
                                return { ...prev, seo: nextSeo };
                              });
                            }}
                            placeholder="Short summary for search and sharing"
                            className="min-h-16 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          />
                        </label>

                        <label className="block">
                          <div className="mb-1 text-xs font-medium text-zinc-500">Share image</div>
                          <input
                            value={String(funnel?.seo?.imageUrl || "")}
                            onChange={(e) => {
                              const v = e.target.value.slice(0, 500);
                              setSeoDirty(true);
                              setSeoError(null);
                              setFunnel((prev) => {
                                if (!prev) return prev;
                                const nextSeo: FunnelSeo = { ...(prev.seo || {}), imageUrl: v || undefined };
                                return { ...prev, seo: nextSeo };
                              });
                            }}
                            placeholder="https://…"
                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          />
                        </label>

                        <div className="rounded-xl border border-zinc-200 bg-white p-3">
                          <div className="mb-2 text-xs font-medium text-zinc-500">Tab icon</div>
                          <div className="flex flex-col gap-2">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="h-9 w-9 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
                                {selectedPage?.seo?.faviconUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={selectedPage.seo.faviconUrl} alt="Favicon" className="h-full w-full object-cover" />
                                ) : null}
                              </div>
                              <input
                                value={String(selectedPage?.seo?.faviconUrl || "")}
                                onChange={(e) => {
                                  const v = e.target.value.slice(0, 500);
                                  setSelectedPageLocal({
                                    seo: v.trim() ? { ...(selectedPage?.seo || {}), faviconUrl: v } : null,
                                  });
                                }}
                                onBlur={(e) => {
                                  void setPageFaviconUrl(e.target.value);
                                }}
                                placeholder="https://…"
                                className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setPageFaviconPickerOpen(true)}
                                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                              >
                                Choose
                              </button>
                              <button
                                type="button"
                                disabled={!selectedPage?.seo?.faviconUrl}
                                onClick={() => void setPageFaviconUrl("")}
                                className={classNames(
                                  "rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50",
                                  !selectedPage?.seo?.faviconUrl ? "opacity-50" : "",
                                )}
                              >
                                Clear
                              </button>
                            </div>
                          </div>
                        </div>

                        <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-3 py-2">
                          <span className="text-sm font-semibold text-zinc-900">Hide from search</span>
                          <ToggleSwitch
                            checked={!!funnel?.seo?.noIndex}
                            onChange={(checked) => {
                              setSeoDirty(true);
                              setSeoError(null);
                              setFunnel((prev) => {
                                if (!prev) return prev;
                                const nextSeo: FunnelSeo = { ...(prev.seo || {}), noIndex: checked || undefined };
                                return { ...prev, seo: nextSeo };
                              });
                            }}
                          />
                        </label>

                        {seoError ? <div className="text-xs font-semibold text-red-700">{seoError}</div> : null}

                        <button
                          type="button"
                          disabled={seoBusy || !seoDirty}
                          onClick={() => void saveFunnelSeo()}
                          className={classNames(
                            "w-full rounded-xl px-3 py-2 text-sm font-semibold text-white",
                            seoBusy || !seoDirty ? "bg-zinc-400" : "bg-brand-ink hover:opacity-95",
                          )}
                        >
                          {seoBusy ? "Saving…" : seoDirty ? "Save search settings" : "Search settings saved"}
                        </button>

                        <div className="text-xs leading-5 text-zinc-500">Source HTML can still override these values if the page sets them directly.</div>
                      </div>
                    </div>

                    <PortalMediaPickerModal
                      open={pageFaviconPickerOpen}
                      title="Choose a tab icon"
                      confirmLabel="Use"
                      onClose={() => setPageFaviconPickerOpen(false)}
                      onPick={(item) => {
                        setPageFaviconPickerOpen(false);
                        void setPageFaviconUrl(item.shareUrl);
                      }}
                    />
                  </div>
                </div>
              ) : null}

              {builderTopLevelPanel === "selected" ? (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900">Selection</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {selectedOutlineItem
                        ? `${selectedOutlineItem.kind} · ${selectedOutlineItem.detail}${selectedPageFlowAnchorId ? " · anchor" : ""}${selectedBlockContainer && selectedBlockContainer.key !== "root" ? " · nested" : ""}`
                        : "Choose a block from the page map or preview."}
                    </div>
                  </div>
                  {!selectedBlock ? (
                    <div className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-4 text-sm text-zinc-600">Click a block in the preview.</div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <div className="text-xs font-medium text-zinc-500">{selectedBlock.type}</div>

                      {selectedBlock.type === "heading" ? (
                        <div className="space-y-2">
                          <RichTextField
                            valueHtml={selectedBlock.props.html}
                            placeholder="Heading text"
                            singleLine
                            onCommit={(nextHtml, nextText) =>
                              upsertBlock({
                                ...selectedBlock,
                                props: { ...selectedBlock.props, html: nextHtml, text: nextText },
                              })
                            }
                          />
                          <PortalSelectDropdown
                            value={selectedBlock.props.level ?? 2}
                            onChange={(level) =>
                              upsertBlock({
                                ...selectedBlock,
                                props: { ...selectedBlock.props, level },
                              })
                            }
                            options={[
                              { value: 1, label: "H1" },
                              { value: 2, label: "H2" },
                              { value: 3, label: "H3" },
                            ]}
                            className="w-full"
                            buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                          />
                        </div>
                      ) : null}

                      {selectedBlock.type === "paragraph" ? (
                        <RichTextField
                          valueHtml={selectedBlock.props.html}
                          placeholder="Paragraph text"
                          onCommit={(nextHtml, nextText) =>
                            upsertBlock({
                              ...selectedBlock,
                              props: { ...selectedBlock.props, html: nextHtml, text: nextText },
                            })
                          }
                        />
                      ) : null}

                      {selectedBlock.type === "customCode" ? (
                        (() => {
                          const blockSnapshot = selectedCustomCodeSnapshot;
                          if (!blockSnapshot) return null;

                          const customCodeSavedChanges: SavedChangeFeedItem[] = selectedCustomCodeSavedAuditTrail.map((entry) => ({
                            id: entry.id,
                            at: entry.at,
                            headline: getCustomCodeAuditHeadline(entry),
                            countLabel: getCustomCodeAuditCountLabel(entry),
                            tone: getCustomCodeAuditTone(entry),
                          }));

                          return (
                            <div className="-mx-4 bg-zinc-50 px-4 py-3 space-y-4">
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => setAiContextOpen(true)}
                                    className={classNames(
                                      "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold disabled:opacity-60",
                                      aiContextMedia.length ? "border-blue-200 bg-white text-blue-600 hover:bg-blue-50" : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100",
                                    )}
                                  >
                                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                                    </svg>
                                    {aiContextMedia.length ? `${aiContextMedia.length} ref${aiContextMedia.length === 1 ? "" : "s"}` : "References"}
                                  </button>
                                  <div className="text-[11px] leading-5 text-zinc-400">
                                    AI keeps the latest relevant turns for this block automatically.
                                  </div>
                              </div>

                              <div className="space-y-2 border-t border-zinc-200 pt-3">
                                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">Recent saves</div>
                                <SavedChangeFeed
                                  entries={customCodeSavedChanges}
                                  emptyState="Saved diffs for this block will show up here after the first completed save."
                                />
                              </div>
                            </div>
                          );
                        })()
                      ) : null}

                      {selectedBlock.type === "chatbot" ? (
                        <div className="space-y-2">
                          {(() => {
                            const placementX = String((selectedBlock.props as any).placementX || "right").trim();
                            const placementY = String((selectedBlock.props as any).placementY || "bottom").trim();

                            const btnCls = (active: boolean) =>
                              classNames(
                                "px-3 py-2 text-xs font-semibold",
                                active
                                  ? "bg-[color:var(--color-brand-blue)] text-white"
                                  : "bg-white text-zinc-800 hover:bg-zinc-50",
                              );

                            return (
                              <>
                                <div className="block">
                                  <div className="mb-1 text-xs font-medium text-zinc-500">Horizontal placement</div>
                                  <div className="inline-flex overflow-hidden rounded-xl border border-zinc-200 bg-white">
                                    {([
                                      { v: "left", label: "Left" },
                                      { v: "center", label: "Center" },
                                      { v: "right", label: "Right" },
                                    ] as const).map((opt) => (
                                      <button
                                        key={opt.v}
                                        type="button"
                                        disabled={busy}
                                        onClick={() =>
                                          upsertBlock({
                                            ...selectedBlock,
                                            props: { ...(selectedBlock.props as any), placementX: opt.v },
                                          } as any)
                                        }
                                        className={btnCls(placementX === opt.v)}
                                      >
                                        {opt.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="block">
                                  <div className="mb-1 text-xs font-medium text-zinc-500">Vertical placement</div>
                                  <div className="inline-flex overflow-hidden rounded-xl border border-zinc-200 bg-white">
                                    {([
                                      { v: "top", label: "Top" },
                                      { v: "middle", label: "Middle" },
                                      { v: "bottom", label: "Bottom" },
                                    ] as const).map((opt) => (
                                      <button
                                        key={opt.v}
                                        type="button"
                                        disabled={busy}
                                        onClick={() =>
                                          upsertBlock({
                                            ...selectedBlock,
                                            props: { ...(selectedBlock.props as any), placementY: opt.v },
                                          } as any)
                                        }
                                        className={btnCls(placementY === opt.v)}
                                      >
                                        {opt.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </>
                            );
                          })()}

                          <div className="block">
                            <div className="mb-1 text-xs font-medium text-zinc-500">Agent ID</div>
                            {availableAgentOptions.length ? (
                              <PortalListboxDropdown
                                value={String((selectedBlock.props as any).agentId || "")}
                                onChange={(v) =>
                                  upsertBlock({
                                    ...selectedBlock,
                                    props: { ...(selectedBlock.props as any), agentId: String(v || "") },
                                  } as any)
                                }
                                options={(() => {
                                  const current = String((selectedBlock.props as any).agentId || "").trim();
                                  const opts = availableAgentOptions.map((a) => ({
                                    value: a.id,
                                    label: a.name ? `${a.name} - ${a.id}` : a.id,
                                  }));
                                  const hasCurrent = current && opts.some((o) => o.value === current);
                                  return [
                                    ...(current && !hasCurrent ? [{ value: current, label: `Current (${current})` }] : []),
                                    { value: "", label: "Select an agent…" },
                                    ...opts,
                                  ];
                                })() as any}
                                className="w-full"
                                buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                              />
                            ) : (
                              <input
                                value={String((selectedBlock.props as any).agentId || "")}
                                onChange={(e) =>
                                  upsertBlock({
                                    ...selectedBlock,
                                    props: { ...(selectedBlock.props as any), agentId: e.target.value },
                                  } as any)
                                }
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                placeholder="agent_..."
                              />
                            )}
                            <div className="mt-1 text-[11px] text-zinc-500">Pick the agent to power this widget.</div>
                          </div>

                          <ColorPickerField
                            label="Primary color"
                            value={String((selectedBlock.props as any).primaryColor || "")}
                            onChange={(next) =>
                              upsertBlock({
                                ...selectedBlock,
                                props: { ...(selectedBlock.props as any), primaryColor: next || "" },
                              } as any)
                            }
                            swatches={colorSwatches}
                          />

                          <label className="block">
                            <div className="mb-1 text-xs font-medium text-zinc-500">Launcher style</div>
                            <PortalListboxDropdown
                              value={String((selectedBlock.props as any).launcherStyle || "bubble")}
                              onChange={(launcherStyle) =>
                                upsertBlock({
                                  ...selectedBlock,
                                  props: { ...(selectedBlock.props as any), launcherStyle: String(launcherStyle || "bubble") },
                                } as any)
                              }
                              options={[
                                { value: "bubble", label: "Bubble" },
                                { value: "dots", label: "Dots" },
                                { value: "spark", label: "Spark" },
                              ]}
                              className="w-full"
                              buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                            />
                            <div className="mt-1 text-[11px] text-zinc-500">Affects the launcher icon when no image is set.</div>
                          </label>

                          <div className="block">
                            <div className="mb-1 text-xs font-medium text-zinc-500">Launcher image</div>

                            {String((selectedBlock.props as any).launcherImageUrl || "").trim() ? (
                              <div className="mb-2 flex items-center gap-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  alt="Launcher image preview"
                                  src={String((selectedBlock.props as any).launcherImageUrl || "").trim()}
                                  className="h-10 w-10 rounded-lg border border-zinc-200 object-cover"
                                />
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: { ...(selectedBlock.props as any), launcherImageUrl: "" },
                                    } as any)
                                  }
                                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                                >
                                  Remove image
                                </button>
                              </div>
                            ) : null}

                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setMediaPickerTarget({ type: "chatbot-launcher", blockId: selectedBlock.id });
                                  setMediaPickerOpen(true);
                                }}
                                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                              >
                                Choose from media
                              </button>
                              <label
                                className={classNames(
                                  "cursor-pointer rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50",
                                  uploadingImageBlockId === selectedBlock.id ? "opacity-60" : "",
                                )}
                              >
                                {uploadingImageBlockId === selectedBlock.id ? "Uploading…" : "Upload image"}
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  disabled={busy || uploadingImageBlockId === selectedBlock.id}
                                  onChange={(e) => {
                                    const files = Array.from(e.target.files || []);
                                    e.currentTarget.value = "";
                                    if (files.length === 0) return;
                                    if (!selectedBlock || selectedBlock.type !== "chatbot") return;
                                    setUploadingImageBlockId(selectedBlock.id);
                                    setError(null);
                                    void (async () => {
                                      try {
                                        const created = await uploadToMediaLibrary(files, { maxFiles: 1 });
                                        const it = created[0];
                                        if (!it) return;
                                        const nextUrl = String((it as any).shareUrl || (it as any).previewUrl || (it as any).openUrl || (it as any).downloadUrl || "").trim();
                                        if (!nextUrl) return;
                                        upsertBlock({
                                          ...selectedBlock,
                                          props: {
                                            ...(selectedBlock.props as any),
                                            launcherImageUrl: nextUrl,
                                          },
                                        } as any);
                                        toast.success("Launcher image uploaded and selected");
                                      } catch (err) {
                                        const msg = (err as any)?.message ? String((err as any).message) : "Upload failed";
                                        toast.error(msg);
                                      } finally {
                                        setUploadingImageBlockId(null);
                                      }
                                    })();
                                  }}
                                />
                              </label>
                            </div>
                          </div>
                        </div>
                      ) : null}

                    {selectedBlock.type === "button" ? (
                      <div className="space-y-2">
                        <input
                          value={selectedBlock.props.text}
                          onChange={(e) =>
                            upsertBlock({
                              ...selectedBlock,
                              props: { ...selectedBlock.props, text: e.target.value },
                            })
                          }
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          placeholder="Button text"
                        />
                        <input
                          value={selectedBlock.props.href}
                          onChange={(e) =>
                            upsertBlock({
                              ...selectedBlock,
                              props: { ...selectedBlock.props, href: e.target.value },
                            })
                          }
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          placeholder={`${basePath}/forms/your-form-slug`}
                        />
                        <PortalListboxDropdown
                          value={selectedBlock.props.variant ?? "primary"}
                          onChange={(variant) =>
                            upsertBlock({
                              ...selectedBlock,
                              props: { ...selectedBlock.props, variant },
                            })
                          }
                          options={[
                            { value: "primary", label: "Primary" },
                            { value: "secondary", label: "Secondary" },
                          ]}
                          className="w-full"
                          buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                        />
                      </div>
                    ) : null}

                    {selectedBlock.type === "salesCheckoutButton" ? (
                      <div className="space-y-2">
                        <input
                          value={selectedBlock.props.text ?? ""}
                          onChange={(e) =>
                            upsertBlock({
                              ...selectedBlock,
                              props: { ...selectedBlock.props, text: e.target.value },
                            })
                          }
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          placeholder="Button text (e.g. Buy now)"
                        />

                        <label className="block">
                          <div className="mb-1 text-xs font-medium text-zinc-500">Product</div>
                          <PortalListboxDropdown
                            value={selectedBlock.props.priceId ?? ""}
                            onChange={(nextPriceId) => {
                              const priceId = String(nextPriceId || "").trim();
                              const picked = stripeProducts.find((p) => String(p?.defaultPrice?.id || "").trim() === priceId) || null;
                              const nextProductName = (picked?.name ? String(picked.name) : "").trim();
                              const nextProductDescription = (picked?.description ? String(picked.description) : "").trim();

                              const prevName = String((selectedBlock.props as any)?.productName || "").trim();
                              const prevDesc = String((selectedBlock.props as any)?.productDescription || "").trim();

                              upsertBlock({
                                ...selectedBlock,
                                props: {
                                  ...selectedBlock.props,
                                  priceId,
                                  productName: priceId
                                    ? (prevName ? prevName : nextProductName || undefined)
                                    : undefined,
                                  productDescription: priceId
                                    ? (prevDesc ? prevDesc : nextProductDescription || undefined)
                                    : undefined,
                                  text:
                                    String((selectedBlock.props as any)?.text || "").trim() || "Buy now",
                                },
                              } as any);
                            }}
                            placeholder={stripeProductsBusy ? "Loading Stripe products…" : "Select a Stripe product"}
                            options={[
                              { value: "", label: "(No product selected)" },
                              ...stripeProducts
                                .filter((p) => p && p.defaultPrice && p.defaultPrice.id)
                                .map((p) => ({
                                  value: p.defaultPrice!.id,
                                  label: p.name || "Product",
                                  hint: formatMoney(p.defaultPrice!.unitAmount, p.defaultPrice!.currency) || "",
                                })),
                            ]}
                            className="w-full"
                            buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                            disabled={stripeProductsBusy}
                          />
                          <div className="mt-1 text-[11px] text-zinc-500">Pulled from your connected Stripe account.</div>
                        </label>

                        <label className="block">
                          <div className="mb-1 text-xs font-medium text-zinc-500">Product name</div>
                          <input
                            value={(selectedBlock.props as any)?.productName ?? ""}
                            onChange={(e) =>
                              upsertBlock({
                                ...selectedBlock,
                                props: { ...selectedBlock.props, productName: e.target.value },
                              } as any)
                            }
                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            placeholder="(Auto from Stripe)"
                          />
                        </label>

                        <label className="block">
                          <div className="mb-1 text-xs font-medium text-zinc-500">Short description</div>
                          <textarea
                            rows={3}
                            value={(selectedBlock.props as any)?.productDescription ?? ""}
                            onChange={(e) =>
                              upsertBlock({
                                ...selectedBlock,
                                props: { ...selectedBlock.props, productDescription: e.target.value },
                              } as any)
                            }
                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            placeholder="(Auto from Stripe)"
                          />
                        </label>

                        {stripeProductsError ? (
                          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                            {stripeProductsError}
                          </div>
                        ) : null}

                        {stripeProductsError ? (
                          <button
                            type="button"
                            disabled={stripeProductsBusy}
                            onClick={() => void loadStripeProducts()}
                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                          >
                            Retry loading Stripe products
                          </button>
                        ) : null}

                        <label className="block">
                          <div className="mb-1 text-xs font-medium text-zinc-500">Quantity</div>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={String(selectedBlock.props.quantity ?? 1)}
                            onChange={(e) =>
                              upsertBlock({
                                ...selectedBlock,
                                props: {
                                  ...selectedBlock.props,
                                  quantity: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                                },
                              })
                            }
                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            placeholder="1"
                          />
                        </label>
                      </div>
                    ) : null}

                    {selectedBlock.type === "addToCartButton" ? (
                      <div className="space-y-2">
                        <input
                          value={(selectedBlock.props as any).text ?? ""}
                          onChange={(e) =>
                            upsertBlock({
                              ...selectedBlock,
                              props: { ...selectedBlock.props, text: e.target.value },
                            } as any)
                          }
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          placeholder="Button text (e.g. Add to cart)"
                        />

                        <label className="block">
                          <div className="mb-1 text-xs font-medium text-zinc-500">Product</div>
                          <PortalListboxDropdown
                            value={(selectedBlock.props as any).priceId ?? ""}
                            onChange={(nextPriceId) => {
                              const priceId = String(nextPriceId || "").trim();
                              const picked = stripeProducts.find((p) => String(p?.defaultPrice?.id || "").trim() === priceId) || null;
                              const nextProductName = (picked?.name ? String(picked.name) : "").trim();
                              const nextProductDescription = (picked?.description ? String(picked.description) : "").trim();

                              const prevName = String((selectedBlock.props as any)?.productName || "").trim();
                              const prevDesc = String((selectedBlock.props as any)?.productDescription || "").trim();

                              upsertBlock({
                                ...selectedBlock,
                                props: {
                                  ...selectedBlock.props,
                                  priceId,
                                  productName: priceId
                                    ? (prevName ? prevName : nextProductName || undefined)
                                    : undefined,
                                  productDescription: priceId
                                    ? (prevDesc ? prevDesc : nextProductDescription || undefined)
                                    : undefined,
                                  text: String((selectedBlock.props as any)?.text || "").trim() || "Add to cart",
                                },
                              } as any);
                            }}
                            placeholder={stripeProductsBusy ? "Loading Stripe products…" : "Select a Stripe product"}
                            options={[
                              { value: "", label: "(No product selected)" },
                              ...stripeProducts
                                .filter((p) => p && p.defaultPrice && p.defaultPrice.id)
                                .map((p) => ({
                                  value: p.defaultPrice!.id,
                                  label: p.name || "Product",
                                  hint: formatMoney(p.defaultPrice!.unitAmount, p.defaultPrice!.currency) || "",
                                })),
                            ]}
                            className="w-full"
                            buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                            disabled={stripeProductsBusy}
                          />
                          <div className="mt-1 text-[11px] text-zinc-500">Pulled from your connected Stripe account.</div>
                        </label>

                        <label className="block">
                          <div className="mb-1 text-xs font-medium text-zinc-500">Product name</div>
                          <input
                            value={(selectedBlock.props as any)?.productName ?? ""}
                            onChange={(e) =>
                              upsertBlock({
                                ...selectedBlock,
                                props: { ...selectedBlock.props, productName: e.target.value },
                              } as any)
                            }
                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            placeholder="(Auto from Stripe)"
                          />
                        </label>

                        <label className="block">
                          <div className="mb-1 text-xs font-medium text-zinc-500">Short description</div>
                          <textarea
                            rows={3}
                            value={(selectedBlock.props as any)?.productDescription ?? ""}
                            onChange={(e) =>
                              upsertBlock({
                                ...selectedBlock,
                                props: { ...selectedBlock.props, productDescription: e.target.value },
                              } as any)
                            }
                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            placeholder="(Auto from Stripe)"
                          />
                        </label>

                        {stripeProductsError ? (
                          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                            {stripeProductsError}
                          </div>
                        ) : null}

                        {stripeProductsError ? (
                          <button
                            type="button"
                            disabled={stripeProductsBusy}
                            onClick={() => void loadStripeProducts()}
                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                          >
                            Retry loading Stripe products
                          </button>
                        ) : null}

                        <label className="block">
                          <div className="mb-1 text-xs font-medium text-zinc-500">Quantity</div>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={String((selectedBlock.props as any).quantity ?? 1)}
                            onChange={(e) =>
                              upsertBlock({
                                ...selectedBlock,
                                props: {
                                  ...selectedBlock.props,
                                  quantity: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                                },
                              } as any)
                            }
                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            placeholder="1"
                          />
                        </label>
                      </div>
                    ) : null}

                    {selectedBlock.type === "cartButton" ? (
                      <div className="space-y-2">
                        <label className="block">
                          <div className="mb-1 text-xs font-medium text-zinc-500">Button text</div>
                          <input
                            value={(selectedBlock.props as any).text ?? ""}
                            onChange={(e) =>
                              upsertBlock({
                                ...selectedBlock,
                                props: { ...selectedBlock.props, text: e.target.value },
                              } as any)
                            }
                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            placeholder="Cart"
                          />
                        </label>
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                          Cart is stored in the visitor’s browser and is scoped to this page.
                        </div>
                      </div>
                    ) : null}

                    {selectedBlock.type === "headerNav" ? (
                      <div className="space-y-3">
                        <label className="flex items-start justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-3 py-2">
                          <span className="min-w-0 flex-1 text-sm font-semibold text-zinc-900">Make this the global header</span>
                          <ToggleSwitch
                            checked={Boolean((selectedBlock.props as any)?.isGlobal)}
                            disabled={busy}
                            onChange={(checked) => {
                              const next = {
                                ...selectedBlock,
                                props: { ...selectedBlock.props, isGlobal: checked },
                              } as any;
                              upsertBlock(next);

                              if (!selectedPage) return;
                              setBusy(true);
                              setError(null);
                              void (async () => {
                                try {
                                  const res = await fetch(
                                    `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/global-header`,
                                    {
                                      method: "POST",
                                      headers: { "content-type": "application/json" },
                                      body: JSON.stringify(
                                        checked
                                          ? { mode: "apply", headerBlock: next }
                                          : { mode: "unset", keepOnPageId: selectedPage.id, localHeaderBlock: next },
                                      ),
                                    },
                                  );
                                  const json = (await res.json().catch(() => null)) as any;
                                  if (!res.ok || !json || json.ok !== true) {
                                    throw new Error(json?.error || "Failed to update global header");
                                  }
                                  await load();
                                  toast.success(checked ? "Global header enabled" : "Global header disabled");
                                } catch (err) {
                                  const msg = (err as any)?.message ? String((err as any).message) : "Failed to update global header";
                                  setError(msg);
                                  toast.error(msg);
                                } finally {
                                  setBusy(false);
                                }
                              })();
                            }}
                          />
                        </label>

                        {Boolean((selectedBlock.props as any)?.isGlobal) ? (
                          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                            Changes to a global header apply when you click <span className="font-semibold">Save</span>.
                          </div>
                        ) : null}

                          <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                            <span className="min-w-0 flex-1 font-semibold text-zinc-900">Transparent</span>
                            <ToggleSwitch
                              checked={Boolean((selectedBlock.props as any)?.transparent)}
                              disabled={busy}
                              onChange={(checked) =>
                                upsertBlock({
                                  ...selectedBlock,
                                  props: { ...selectedBlock.props, transparent: checked },
                                } as any)
                              }
                            />
                          </label>

                        <label className="block">
                          <div className="mb-1 text-xs font-medium text-zinc-500">Mobile menu</div>
                          <PortalListboxDropdown
                            value={String((selectedBlock.props as any)?.mobileMode || "dropdown")}
                            onChange={(v) =>
                              upsertBlock({
                                ...selectedBlock,
                                props: { ...selectedBlock.props, mobileMode: String(v || "dropdown") },
                              } as any)
                            }
                            options={[
                              { value: "dropdown", label: "Dropdown" },
                              { value: "slideover", label: "Slide-over" },
                            ]}
                            className="w-full"
                            buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                          />
                        </label>

                        <label className="block">
                          <div className="mb-1 text-xs font-medium text-zinc-500">Desktop menu</div>
                          <PortalListboxDropdown
                            value={String((selectedBlock.props as any)?.desktopMode || "inline")}
                            onChange={(v) =>
                              upsertBlock({
                                ...selectedBlock,
                                props: { ...selectedBlock.props, desktopMode: String(v || "inline") },
                              } as any)
                            }
                            options={[
                              { value: "inline", label: "Inline links" },
                              { value: "dropdown", label: "Dropdown" },
                              { value: "slideover", label: "Slide-over" },
                            ]}
                            className="w-full"
                            buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                          />
                        </label>

                        <label className="block">
                          <div className="mb-1 text-xs font-medium text-zinc-500">Header size</div>
                          {(() => {
                            const rawScale = (selectedBlock.props as any)?.sizeScale;
                            const parsedScale = typeof rawScale === "number" && Number.isFinite(rawScale) ? rawScale : undefined;
                            const legacySize = String((selectedBlock.props as any)?.size || "md");
                            const legacyScale = legacySize === "lg" ? 1.15 : legacySize === "sm" ? 0.9 : 1;
                            const scale = Math.max(0.75, Math.min(1.5, parsedScale ?? legacyScale));
                            const pct = Math.round(scale * 100);

                            return (
                              <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm font-semibold text-zinc-900">{pct}%</div>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      upsertBlock({
                                        ...selectedBlock,
                                        props: { ...selectedBlock.props, sizeScale: 1, size: undefined },
                                      } as any)
                                    }
                                    className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                                  >
                                    Reset
                                  </button>
                                </div>
                                <input
                                  type="range"
                                  min={75}
                                  max={150}
                                  step={1}
                                  value={pct}
                                  disabled={busy}
                                  onChange={(e) => {
                                    const nextPct = Math.max(75, Math.min(150, Number(e.target.value) || 100));
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: { ...selectedBlock.props, sizeScale: nextPct / 100, size: undefined },
                                    } as any);
                                  }}
                                  className="mt-2 w-full"
                                />
                                <div className="mt-1 text-[11px] text-zinc-500">Adjusts padding/logo/button sizing.</div>
                              </div>
                            );
                          })()}
                        </label>

                        <label className="block">
                          <div className="mb-1 text-xs font-medium text-zinc-500">Menu trigger</div>
                          <PortalListboxDropdown
                            value={String((selectedBlock.props as any)?.mobileTrigger || "hamburger")}
                            onChange={(v) =>
                              upsertBlock({
                                ...selectedBlock,
                                props: { ...selectedBlock.props, mobileTrigger: String(v || "hamburger") },
                              } as any)
                            }
                            options={[
                              { value: "hamburger", label: "Hamburger" },
                              { value: "directory", label: "Directory button" },
                            ]}
                            className="w-full"
                            buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                          />
                        </label>

                        {String((selectedBlock.props as any)?.mobileTrigger || "hamburger") === "directory" ? (
                          <label className="block">
                            <div className="mb-1 text-xs font-medium text-zinc-500">Directory label</div>
                            <input
                              value={String((selectedBlock.props as any)?.mobileTriggerLabel || "")}
                              onChange={(e) =>
                                upsertBlock({
                                  ...selectedBlock,
                                  props: { ...selectedBlock.props, mobileTriggerLabel: e.target.value.slice(0, 40) },
                                } as any)
                              }
                              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              placeholder="Directory"
                            />
                          </label>
                        ) : null}

                        <div className="block">
                          <div className="mb-1 text-xs font-medium text-zinc-500">Logo image</div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setMediaPickerTarget({ type: "header-logo", blockId: selectedBlock.id });
                                setMediaPickerOpen(true);
                              }}
                              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                            >
                              Choose from media
                            </button>

                            <label
                              className={classNames(
                                "cursor-pointer rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50",
                                uploadingHeaderLogoBlockId === selectedBlock.id ? "opacity-60" : "",
                              )}
                            >
                              {uploadingHeaderLogoBlockId === selectedBlock.id ? "Uploading…" : "Upload image"}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={busy || uploadingHeaderLogoBlockId === selectedBlock.id}
                                onChange={(e) => {
                                  const files = Array.from(e.target.files || []);
                                  e.currentTarget.value = "";
                                  if (files.length === 0) return;
                                  if (!selectedBlock || selectedBlock.type !== "headerNav") return;
                                  setUploadingHeaderLogoBlockId(selectedBlock.id);
                                  setError(null);
                                  void (async () => {
                                    try {
                                      const created = await uploadToMediaLibrary(files, { maxFiles: 1 });
                                      const it = created[0];
                                      if (!it) return;
                                      const nextUrl = String(
                                        (it as any).shareUrl || (it as any).previewUrl || (it as any).openUrl || (it as any).downloadUrl || "",
                                      ).trim();
                                      if (!nextUrl) return;
                                      const prevAlt = String((selectedBlock.props as any)?.logoAlt || "").trim();
                                      upsertBlock({
                                        ...selectedBlock,
                                        props: {
                                          ...(selectedBlock.props as any),
                                          logoUrl: nextUrl,
                                          ...(prevAlt ? null : { logoAlt: it.fileName }),
                                        },
                                      } as any);
                                      toast.success("Logo uploaded and selected");
                                    } catch (err) {
                                      const msg = (err as any)?.message ? String((err as any).message) : "Upload failed";
                                      toast.error(msg);
                                    } finally {
                                      setUploadingHeaderLogoBlockId(null);
                                    }
                                  })();
                                }}
                              />
                            </label>

                            <button
                              type="button"
                              disabled={busy || !String((selectedBlock.props as any)?.logoUrl || "").trim()}
                              onClick={() =>
                                upsertBlock({
                                  ...selectedBlock,
                                  props: { ...selectedBlock.props, logoUrl: "" },
                                } as any)
                              }
                              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                            >
                              Clear
                            </button>
                          </div>

                          {String((selectedBlock.props as any)?.logoUrl || "").trim() ? (
                            <div className="mt-2 rounded-xl border border-zinc-200 bg-white px-3 py-2">
                              <div className="text-xs font-medium text-zinc-500">Selected logo</div>
                              <div className="mt-1 break-all font-mono text-xs text-zinc-700">
                                {String((selectedBlock.props as any)?.logoUrl || "").trim()}
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">No logo selected.</div>
                          )}
                        </div>

                        <label className="block">
                          <div className="mb-1 text-xs font-medium text-zinc-500">Logo link</div>
                          <input
                            value={String((selectedBlock.props as any)?.logoHref || "")}
                            onChange={(e) =>
                              upsertBlock({
                                ...selectedBlock,
                                props: { ...selectedBlock.props, logoHref: e.target.value },
                              } as any)
                            }
                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            placeholder="Leave blank to link to funnel home"
                          />
                        </label>

                        <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-medium text-zinc-500">Menu items</div>
                              <div className="mt-1 text-xs text-zinc-500">Select one item, then edit its target below.</div>
                            </div>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                const items = Array.isArray((selectedBlock.props as any)?.items)
                                  ? (((selectedBlock.props as any).items as any[]) || [])
                                  : [];
                                const nextItem = { id: newId(), label: "Link", kind: "url", url: "" };
                                const next = [...items, nextItem];
                                upsertBlock({
                                  ...selectedBlock,
                                  props: { ...selectedBlock.props, items: next },
                                } as any);
                                setSelectedHeaderNavItemId(nextItem.id);
                              }}
                              className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                            >
                              + Add item
                            </button>
                          </div>
                          <div className="mt-3 space-y-3">
                            {(() => {
                              const items = Array.isArray((selectedBlock.props as any)?.items)
                                ? (((selectedBlock.props as any).items as any[]) || [])
                                : [];

                              const collectAnchors = (): Array<{ value: string; label: string }> => {
                                const out: Array<{ value: string; label: string }> = [];
                                const walk = (arr: CreditFunnelBlock[]) => {
                                  for (const b of arr) {
                                    if (!b) continue;
                                    if (b.type === "section") {
                                      const props: any = b.props;
                                      const rawId = String(props?.anchorId || "").trim();
                                      const id = rawId || `section-${b.id}`;
                                      const label = String(props?.anchorLabel || "").trim();
                                      if (id) out.push({ value: id, label: label ? `${label} (#${id})` : `Section (#${id})` });
                                      ["children", "leftChildren", "rightChildren"].forEach((k) => {
                                        const nested = Array.isArray(props?.[k]) ? (props[k] as CreditFunnelBlock[]) : [];
                                        walk(nested);
                                      });
                                    }
                                    if (b.type === "columns") {
                                      const props: any = b.props;
                                      const cols = Array.isArray(props?.columns) ? (props.columns as any[]) : [];
                                      cols.forEach((c) => {
                                        const nested = Array.isArray(c?.children) ? (c.children as CreditFunnelBlock[]) : [];
                                        walk(nested);
                                      });
                                    }
                                  }
                                };
                                walk(editableBlocks);
                                const unique = new Map<string, string>();
                                for (const a of out) {
                                  if (!unique.has(a.value)) unique.set(a.value, a.label);
                                }
                                return Array.from(unique.entries()).map(([value, label]) => ({ value, label }));
                              };

                              const anchorOptions = collectAnchors();

                              const updateItems = (nextItems: any[]) =>
                                upsertBlock({
                                  ...selectedBlock,
                                  props: { ...selectedBlock.props, items: nextItems },
                                } as any);

                              const describeMenuItemTarget = (item: any) => {
                                const kind = item?.kind === "page" || item?.kind === "anchor" ? String(item.kind) : "url";
                                if (kind === "page") {
                                  const pageSlug = String(item?.pageSlug || "").trim();
                                  if (!pageSlug) return "Opens the first funnel page";
                                  const pageTitle = (pages || []).find((page) => page.slug === pageSlug)?.title || pageSlug;
                                  return `Opens ${pageTitle}`;
                                }
                                if (kind === "anchor") {
                                  const anchorId = String(item?.anchorId || "").trim();
                                  return anchorId ? `Scrolls to #${anchorId}` : "Scroll target not set";
                                }
                                const url = String(item?.url || "").trim();
                                return url || "External URL not set";
                              };

                              const selectedMenuItem = items.find((item: any) => String(item?.id || "") === selectedHeaderNavItemId) || null;

                              return (
                                <>
                                  {items.length ? (
                                    <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                                      {items.map((it: any, index: number) => {
                                        const itemId = String(it?.id || "");
                                        const label = String(it?.label || "").trim() || `Item ${index + 1}`;
                                        const kind = it?.kind === "page" || it?.kind === "anchor" ? String(it.kind) : "url";
                                        const isSelected = itemId === selectedHeaderNavItemId;

                                        return (
                                          <button
                                            key={itemId}
                                            type="button"
                                            onClick={() => setSelectedHeaderNavItemId(itemId)}
                                            className={classNames(
                                              "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left",
                                              isSelected
                                                ? "border-zinc-900 bg-zinc-900 text-white"
                                                : "border-zinc-200 bg-zinc-50 text-zinc-900 hover:bg-white",
                                            )}
                                          >
                                            <div className="min-w-0 flex-1">
                                              <div className={classNames(
                                                "text-[11px] font-medium",
                                                isSelected ? "text-white/70" : "text-zinc-500",
                                              )}>
                                                {kind === "page" ? "Funnel page" : kind === "anchor" ? "Section link" : "External URL"}
                                              </div>
                                              <div className="mt-1 truncate text-sm font-semibold">{label}</div>
                                              <div className={classNames(
                                                "mt-1 truncate text-xs",
                                                isSelected ? "text-white/75" : "text-zinc-500",
                                              )}>
                                                {describeMenuItemTarget(it)}
                                              </div>
                                            </div>
                                            <div className={classNames(
                                              "mt-1 text-[11px] font-medium",
                                              isSelected ? "text-white/70" : "text-zinc-400",
                                            )}>
                                              {isSelected ? "Editing" : "Select"}
                                            </div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-4 text-sm text-zinc-600">
                                      Add a menu item to start structuring this header.
                                    </div>
                                  )}

                                  {selectedMenuItem ? (
                                    <div className="border-t border-zinc-200 pt-3">
                                      <div className="text-xs font-medium text-zinc-500">Selected item</div>
                                      <div className="mt-3 space-y-2">
                                        <input
                                          value={String(selectedMenuItem?.label || "")}
                                          onChange={(e) => {
                                            const next = items.map((x: any) =>
                                              String(x?.id || "") === String(selectedMenuItem?.id || "") ? { ...x, label: e.target.value } : x,
                                            );
                                            updateItems(next);
                                          }}
                                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                          placeholder="Label"
                                        />

                                        <PortalListboxDropdown
                                          value={selectedMenuItem?.kind === "page" || selectedMenuItem?.kind === "anchor" ? String(selectedMenuItem.kind) : "url"}
                                          onChange={(v) => {
                                            const nextKind = String(v || "url");
                                            const next = items.map((x: any) => {
                                              if (String(x?.id || "") !== String(selectedMenuItem?.id || "")) return x;
                                              const base = { ...x, kind: nextKind };
                                              if (nextKind === "url") return { ...base, url: String(base.url || "").trim(), pageSlug: undefined, anchorId: undefined };
                                              if (nextKind === "page") return { ...base, pageSlug: String(base.pageSlug || ""), url: undefined, anchorId: undefined };
                                              return { ...base, anchorId: String(base.anchorId || ""), url: undefined, pageSlug: undefined };
                                            });
                                            updateItems(next);
                                          }}
                                          options={[
                                            { value: "url", label: "External URL" },
                                            { value: "page", label: "Funnel page" },
                                            { value: "anchor", label: "Section (scroll)" },
                                          ]}
                                          className="w-full"
                                          buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                                        />

                                        {(selectedMenuItem?.kind === "page" || selectedMenuItem?.kind === "anchor") ? null : (
                                          <>
                                            <input
                                              value={String(selectedMenuItem?.url || "")}
                                              onChange={(e) => {
                                                const next = items.map((x: any) =>
                                                  String(x?.id || "") === String(selectedMenuItem?.id || "") ? { ...x, url: e.target.value } : x,
                                                );
                                                updateItems(next);
                                              }}
                                              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                              placeholder="https://…"
                                            />
                                            <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-3 py-2">
                                              <span className="text-sm font-semibold text-zinc-900">Open in new tab</span>
                                              <ToggleSwitch
                                                checked={Boolean(selectedMenuItem?.newTab)}
                                                disabled={busy}
                                                onChange={(checked) => {
                                                  const next = items.map((x: any) =>
                                                    String(x?.id || "") === String(selectedMenuItem?.id || "") ? { ...x, newTab: checked } : x,
                                                  );
                                                  updateItems(next);
                                                }}
                                              />
                                            </label>
                                          </>
                                        )}

                                        {selectedMenuItem?.kind === "page" ? (
                                          <PortalListboxDropdown
                                            value={String(selectedMenuItem?.pageSlug || "")}
                                            onChange={(v) => {
                                              const next = items.map((x: any) =>
                                                String(x?.id || "") === String(selectedMenuItem?.id || "") ? { ...x, pageSlug: String(v || "") } : x,
                                              );
                                              updateItems(next);
                                            }}
                                            options={[
                                              { value: "", label: "(Home / first page)" },
                                              ...(pages || []).map((p) => ({ value: p.slug, label: p.title })),
                                            ]}
                                            className="w-full"
                                            buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                                          />
                                        ) : null}

                                        {selectedMenuItem?.kind === "anchor" ? (
                                          <>
                                            <PortalListboxDropdown
                                              value={String(selectedMenuItem?.anchorId || "")}
                                              onChange={(v) => {
                                                const next = items.map((x: any) =>
                                                  String(x?.id || "") === String(selectedMenuItem?.id || "") ? { ...x, anchorId: String(v || "") } : x,
                                                );
                                                updateItems(next);
                                              }}
                                              options={[
                                                { value: "", label: "Select an anchor…" },
                                                ...anchorOptions,
                                              ]}
                                              className="w-full"
                                              buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                                            />
                                            <input
                                              value={String(selectedMenuItem?.anchorId || "")}
                                              onChange={(e) => {
                                                const next = items.map((x: any) =>
                                                  String(x?.id || "") === String(selectedMenuItem?.id || "") ? { ...x, anchorId: e.target.value } : x,
                                                );
                                                updateItems(next);
                                              }}
                                              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                              placeholder="anchor-id"
                                            />
                                          </>
                                        ) : null}

                                        <div className="flex items-center justify-between gap-2 pt-1">
                                          <div className="text-xs text-zinc-500">{describeMenuItemTarget(selectedMenuItem)}</div>
                                          <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => {
                                              const next = items.filter((x: any) => String(x?.id || "") !== String(selectedMenuItem?.id || ""));
                                              updateItems(next);
                                              setSelectedHeaderNavItemId(next.length ? String(next[0]?.id || "") : null);
                                            }}
                                            className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                                          >
                                            Remove item
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ) : null}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {selectedBlock.type === "formLink" ? (
                      <div className="space-y-2">
                        <label className="block">
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Form</div>
                          <PortalListboxDropdown
                            value={selectedBlock.props.formSlug || ""}
                            onChange={(formSlug) =>
                              upsertBlock({
                                ...selectedBlock,
                                props: { ...selectedBlock.props, formSlug: formSlug || "" },
                              })
                            }
                            options={[
                              { value: "", label: "Select a form…", disabled: true },
                              ...(forms || []).map((f) => ({ value: f.slug, label: `${f.name} (${f.slug})` })),
                            ]}
                            className="w-full"
                            buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                          />
                          <div className="mt-1 text-[11px] text-zinc-500">Links to the hosted credit form.</div>
                        </label>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={openCreateForm}
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                          >
                            + New form
                          </button>
                          <button
                            type="button"
                            disabled={busy || !selectedBlock.props.formSlug || !formsBySlug.get(selectedBlock.props.formSlug)}
                            onClick={() => {
                              const f = formsBySlug.get(selectedBlock.props.formSlug);
                              if (!f) return;
                              window.open(
                                `${basePath}/app/services/funnel-builder/forms/${encodeURIComponent(f.id)}/edit`,
                                "_blank",
                                "noopener,noreferrer",
                              );
                            }}
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                          >
                            Edit form
                          </button>
                        </div>

                        <input
                          value={selectedBlock.props.text ?? ""}
                          onChange={(e) =>
                            upsertBlock({
                              ...selectedBlock,
                              props: { ...selectedBlock.props, text: e.target.value },
                            })
                          }
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          placeholder="CTA text"
                        />
                      </div>
                    ) : null}

                    {selectedBlock.type === "image" ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setMediaPickerTarget({ type: "image-block", blockId: selectedBlock.id });
                              setMediaPickerOpen(true);
                            }}
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                          >
                            Choose from media
                          </button>
                          <label className={classNames(
                            "cursor-pointer rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50",
                            uploadingImageBlockId === selectedBlock.id ? "opacity-60" : "",
                          )}>
                            {uploadingImageBlockId === selectedBlock.id ? "Uploading…" : "Upload image"}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={busy || uploadingImageBlockId === selectedBlock.id}
                              onChange={(e) => {
                                const files = Array.from(e.target.files || []);
                                e.currentTarget.value = "";
                                if (files.length === 0) return;
                                if (!selectedBlock || selectedBlock.type !== "image") return;
                                setUploadingImageBlockId(selectedBlock.id);
                                setError(null);
                                void (async () => {
                                  try {
                                    const created = await uploadToMediaLibrary(files, { maxFiles: 1 });
                                    const it = created[0];
                                    if (!it) return;
                                    const nextSrc = String((it as any).shareUrl || (it as any).previewUrl || (it as any).openUrl || (it as any).downloadUrl || "").trim();
                                    if (!nextSrc) return;
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: {
                                        ...selectedBlock.props,
                                        src: nextSrc,
                                        alt: (selectedBlock.props.alt || "").trim() ? selectedBlock.props.alt : it.fileName,
                                      },
                                    });
                                    toast.success("Image uploaded and selected");
                                  } catch (err) {
                                    const msg = (err as any)?.message ? String((err as any).message) : "Upload failed";
                                    toast.error(msg);
                                  } finally {
                                    setUploadingImageBlockId(null);
                                  }
                                })();
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            disabled={busy || !selectedBlock.props.src}
                            onClick={() =>
                              upsertBlock({
                                ...selectedBlock,
                                props: { ...selectedBlock.props, src: "" },
                              })
                            }
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                          >
                            Clear
                          </button>

                          <button
                            type="button"
                            disabled={busy || !selectedBlock.props.src}
                            onClick={() => setImageCropTarget({ blockId: selectedBlock.id, src: selectedBlock.props.src })}
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                          >
                            Edit image
                          </button>
                        </div>

                        {selectedBlock.props.src ? (
                          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">Image selected.</div>
                        ) : (
                          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">No image selected.</div>
                        )}

                        <label className="block">
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Image name</div>
                          <input
                            value={selectedBlock.props.alt ?? ""}
                            onChange={(e) =>
                              upsertBlock({
                                ...selectedBlock,
                                props: { ...selectedBlock.props, alt: e.target.value },
                              })
                            }
                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            placeholder="e.g. hero-image.png"
                          />
                          <div className="mt-1 text-xs text-zinc-500">Saved as the image alt text.</div>
                        </label>

                        <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                          <span className="font-semibold text-zinc-900">Show frame</span>
                          <ToggleSwitch
                            checked={(selectedBlock.props as any)?.showFrame !== false}
                            disabled={busy}
                            onChange={(checked) =>
                              upsertBlock({
                                ...selectedBlock,
                                props: { ...(selectedBlock.props as any), showFrame: checked },
                              } as any)
                            }
                          />
                        </label>
                      </div>
                    ) : null}

                    {selectedBlock.type === "video" ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setMediaPickerTarget({ type: "video-block", blockId: selectedBlock.id });
                              setMediaPickerOpen(true);
                            }}
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                          >
                            Choose from media
                          </button>
                          <label
                            className={classNames(
                              "cursor-pointer rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50",
                              uploadingImageBlockId === selectedBlock.id ? "opacity-60" : "",
                            )}
                          >
                            {uploadingImageBlockId === selectedBlock.id ? "Uploading…" : "Upload video"}
                            <input
                              type="file"
                              accept="video/*"
                              className="hidden"
                              disabled={busy || uploadingImageBlockId === selectedBlock.id}
                              onChange={(e) => {
                                const files = Array.from(e.target.files || []);
                                e.currentTarget.value = "";
                                if (files.length === 0) return;
                                if (!selectedBlock || selectedBlock.type !== "video") return;
                                const file = files[0];
                                if (!file) return;
                                setUploadingImageBlockId(selectedBlock.id);
                                setError(null);
                                void (async () => {
                                  try {
                                    const uploaded = await uploadToUploads(file);
                                    const nextSrc = String(uploaded.mediaItem?.shareUrl || uploaded.url || "").trim();
                                    if (!nextSrc) return;
                                    const prevName = String((selectedBlock.props as any)?.name || "").trim();
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: {
                                        ...(selectedBlock.props as any),
                                        src: nextSrc,
                                        ...(prevName ? null : { name: uploaded.mediaItem?.fileName || file.name }),
                                      },
                                    } as any);
                                    toast.success("Video uploaded and selected");
                                  } catch (err) {
                                    const msg = (err as any)?.message ? String((err as any).message) : "Upload failed";
                                    toast.error(msg);
                                  } finally {
                                    setUploadingImageBlockId(null);
                                  }
                                })();
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            disabled={busy || !String((selectedBlock.props as any).src || "").trim()}
                            onClick={() =>
                              upsertBlock({
                                ...selectedBlock,
                                props: { ...(selectedBlock.props as any), src: "" },
                              } as any)
                            }
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                          >
                            Clear
                          </button>

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setVideoSettingsBlockId((prev) => (prev === selectedBlock.id ? null : selectedBlock.id))}
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                          >
                            {videoSettingsBlockId === selectedBlock.id ? "Hide settings" : "Edit video"}
                          </button>
                        </div>

                        {String((selectedBlock.props as any).src || "").trim() ? (
                          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">Video selected.</div>
                        ) : (
                          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">No video selected.</div>
                        )}

                        <label className="block">
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Video name</div>
                          <input
                            value={String((selectedBlock.props as any)?.name || "")}
                            onChange={(e) =>
                              upsertBlock({
                                ...selectedBlock,
                                props: { ...(selectedBlock.props as any), name: e.target.value.slice(0, 200) },
                              } as any)
                            }
                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            placeholder="e.g. intro-video.mp4"
                          />
                        </label>

                        {videoSettingsBlockId === selectedBlock.id ? (
                          <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Video settings</div>

                            <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                              <span className="font-semibold text-zinc-900">Show controls</span>
                              <ToggleSwitch
                                checked={(selectedBlock.props as any)?.controls !== false}
                                disabled={busy}
                                onChange={(checked) =>
                                  upsertBlock({
                                    ...selectedBlock,
                                    props: { ...(selectedBlock.props as any), controls: checked },
                                  } as any)
                                }
                              />
                            </label>

                            <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                              <span className="font-semibold text-zinc-900">Autoplay</span>
                              <ToggleSwitch
                                checked={Boolean((selectedBlock.props as any)?.autoplay)}
                                disabled={busy}
                                onChange={(checked) =>
                                  upsertBlock({
                                    ...selectedBlock,
                                    props: {
                                      ...(selectedBlock.props as any),
                                      autoplay: checked,
                                      muted: checked ? true : (selectedBlock.props as any)?.muted,
                                    },
                                  } as any)
                                }
                              />
                            </label>

                            <div className="grid grid-cols-2 gap-2">
                              <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                                <span className="font-semibold text-zinc-900">Loop</span>
                                <ToggleSwitch
                                  checked={Boolean((selectedBlock.props as any)?.loop)}
                                  disabled={busy}
                                  onChange={(checked) =>
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: { ...(selectedBlock.props as any), loop: checked },
                                    } as any)
                                  }
                                />
                              </label>

                              <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                                <span className="font-semibold text-zinc-900">Muted</span>
                                <ToggleSwitch
                                  checked={Boolean((selectedBlock.props as any)?.muted)}
                                  disabled={busy}
                                  onChange={(checked) =>
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: { ...(selectedBlock.props as any), muted: checked },
                                    } as any)
                                  }
                                />
                              </label>
                            </div>

                            <label className="block">
                              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Fit</div>
                              <PortalListboxDropdown
                                value={String((selectedBlock.props as any)?.fit || "contain")}
                                onChange={(fit) =>
                                  upsertBlock({
                                    ...selectedBlock,
                                    props: { ...(selectedBlock.props as any), fit: String(fit || "contain") },
                                  } as any)
                                }
                                options={[
                                  { value: "contain", label: "Contain (no crop)" },
                                  { value: "cover", label: "Cover (crop to fill)" },
                                ]}
                                className="w-full"
                                buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                              />
                            </label>

                            <label className="block">
                              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Aspect ratio</div>
                              <PortalListboxDropdown
                                value={String((selectedBlock.props as any)?.aspectRatio || "auto")}
                                onChange={(aspectRatio) =>
                                  upsertBlock({
                                    ...selectedBlock,
                                    props: { ...(selectedBlock.props as any), aspectRatio: String(aspectRatio || "auto") },
                                  } as any)
                                }
                                options={[
                                  { value: "auto", label: "Auto" },
                                  { value: "16:9", label: "16:9" },
                                  { value: "9:16", label: "9:16" },
                                  { value: "4:3", label: "4:3" },
                                  { value: "1:1", label: "1:1" },
                                ]}
                                className="w-full"
                                buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                              />
                            </label>

                            <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                              <span className="font-semibold text-zinc-900">Show frame</span>
                              <ToggleSwitch
                                checked={(selectedBlock.props as any)?.showFrame !== false}
                                disabled={busy}
                                onChange={(checked) =>
                                  upsertBlock({
                                    ...selectedBlock,
                                    props: { ...(selectedBlock.props as any), showFrame: checked },
                                  } as any)
                                }
                              />
                            </label>

                            <div className="space-y-2">
                              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Poster image</div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    setMediaPickerTarget({ type: "video-poster", blockId: selectedBlock.id });
                                    setMediaPickerOpen(true);
                                  }}
                                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                                >
                                  Choose from media
                                </button>

                                <label
                                  className={classNames(
                                    "cursor-pointer rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50",
                                    uploadingImageBlockId === selectedBlock.id ? "opacity-60" : "",
                                  )}
                                >
                                  {uploadingImageBlockId === selectedBlock.id ? "Uploading…" : "Upload poster"}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    disabled={busy || uploadingImageBlockId === selectedBlock.id}
                                    onChange={(e) => {
                                      const files = Array.from(e.target.files || []);
                                      e.currentTarget.value = "";
                                      if (files.length === 0) return;
                                      if (!selectedBlock || selectedBlock.type !== "video") return;
                                      const file = files[0];
                                      if (!file) return;
                                      setUploadingImageBlockId(selectedBlock.id);
                                      setError(null);
                                      void (async () => {
                                        try {
                                          const created = await uploadToMediaLibrary([file], { maxFiles: 1 });
                                          const it = created[0];
                                          const nextPoster = String(it?.shareUrl || it?.previewUrl || "").trim();
                                          if (!nextPoster) return;
                                          upsertBlock({
                                            ...selectedBlock,
                                            props: { ...(selectedBlock.props as any), posterUrl: nextPoster },
                                          } as any);
                                          toast.success("Poster uploaded and selected");
                                        } catch (err) {
                                          const msg = (err as any)?.message ? String((err as any).message) : "Upload failed";
                                          toast.error(msg);
                                        } finally {
                                          setUploadingImageBlockId(null);
                                        }
                                      })();
                                    }}
                                  />
                                </label>

                                <button
                                  type="button"
                                  disabled={busy || !String((selectedBlock.props as any)?.posterUrl || "").trim()}
                                  onClick={() =>
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: { ...(selectedBlock.props as any), posterUrl: "" },
                                    } as any)
                                  }
                                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                                >
                                  Clear
                                </button>
                              </div>

                              {String((selectedBlock.props as any)?.posterUrl || "").trim() ? (
                                <div className="rounded-xl border border-zinc-200 bg-white p-3">
                                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Selected poster</div>
                                  <div className="mt-1 break-all font-mono text-xs text-zinc-700">{String((selectedBlock.props as any)?.posterUrl || "").trim()}</div>
                                </div>
                              ) : (
                                <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">No poster selected.</div>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {selectedBlock.type === "spacer" ? (
                      <input
                        type="number"
                        value={String(selectedBlock.props.height ?? 24)}
                        onChange={(e) =>
                          upsertBlock({
                            ...selectedBlock,
                            props: { ...selectedBlock.props, height: Number(e.target.value) },
                          })
                        }
                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                      />
                    ) : null}

                    {selectedBlock.type === "formEmbed" ? (
                      <div className="space-y-2">
                        <label className="block">
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Form</div>
                          <PortalListboxDropdown
                            value={selectedBlock.props.formSlug || ""}
                            onChange={(formSlug) =>
                              upsertBlock({
                                ...selectedBlock,
                                props: { ...selectedBlock.props, formSlug: formSlug || "" },
                              })
                            }
                            options={[
                              { value: "", label: "Select a form…", disabled: true },
                              ...(forms || []).map((f) => ({ value: f.slug, label: `${f.name} (${f.slug})` })),
                            ]}
                            className="w-full"
                            buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                          />
                        </label>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={openCreateForm}
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                          >
                            + New form
                          </button>
                          <button
                            type="button"
                            disabled={busy || !selectedBlock.props.formSlug || !formsBySlug.get(selectedBlock.props.formSlug)}
                            onClick={() => {
                              const f = formsBySlug.get(selectedBlock.props.formSlug);
                              if (!f) return;
                              window.open(
                                `${basePath}/app/services/funnel-builder/forms/${encodeURIComponent(f.id)}/edit`,
                                "_blank",
                                "noopener,noreferrer",
                              );
                            }}
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                          >
                            Edit form
                          </button>
                        </div>

                        <label className="block">
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Embed height (px)</div>
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="number"
                              value={selectedBlock.props.height ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                upsertBlock({
                                  ...selectedBlock,
                                  props: {
                                    ...selectedBlock.props,
                                    height: raw === "" ? undefined : Number(raw) || 0,
                                  },
                                });
                              }}
                              className="min-w-45 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              placeholder="Default: 760"
                            />
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                upsertBlock({
                                  ...selectedBlock,
                                  props: { ...selectedBlock.props, height: undefined },
                                })
                              }
                              className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                            >
                              Default (760)
                            </button>
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">Controls the iframe height when this form is embedded on the hosted page.</div>
                        </label>
                      </div>
                    ) : null}

                    {selectedBlock.type === "calendarEmbed" ? (
                      <div className="space-y-2">
                        <label className="block">
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Calendar</div>
                          <PortalListboxDropdown
                            value={selectedBlock.props.calendarId || ""}
                            onChange={(calendarId) =>
                              upsertBlock({
                                ...selectedBlock,
                                props: { ...selectedBlock.props, calendarId: calendarId || "" },
                              } as any)
                            }
                            options={[
                              { value: "", label: "Select a calendar…", disabled: true },
                              ...(bookingCalendars || []).map((c) => ({
                                value: c.id,
                                label: `${(c.title || "Untitled calendar").trim()} (${c.id})`,
                              })),
                            ]}
                            className="w-full"
                            buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                          />
                          <div className="mt-1 text-xs text-zinc-500">Embeds your booking calendar as an iframe.</div>
                        </label>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              window.open(`${basePath}/app/services/booking/settings`, "_blank", "noopener,noreferrer");
                            }}
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                          >
                            Manage calendars
                          </button>
                          <button
                            type="button"
                            disabled={busy || !bookingSiteSlug || !selectedBlock.props.calendarId}
                            onClick={() => {
                              if (!bookingSiteSlug || !selectedBlock.props.calendarId) return;
                              window.open(
                                toPurelyHostedUrl(
                                  `/book/${encodeURIComponent(bookingSiteSlug)}/c/${encodeURIComponent(selectedBlock.props.calendarId)}`,
                                ),
                                "_blank",
                                "noopener,noreferrer",
                              );
                            }}
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                          >
                            Open calendar
                          </button>
                        </div>

                        <label className="block">
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Embed height (px)</div>
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="number"
                              value={selectedBlock.props.height ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                upsertBlock({
                                  ...selectedBlock,
                                  props: {
                                    ...selectedBlock.props,
                                    height: raw === "" ? undefined : Number(raw) || 0,
                                  },
                                } as any);
                              }}
                              className="min-w-45 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              placeholder="Default: 760"
                            />
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                upsertBlock({
                                  ...selectedBlock,
                                  props: { ...selectedBlock.props, height: undefined },
                                } as any)
                              }
                              className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                            >
                              Default (760)
                            </button>
                          </div>
                        </label>
                      </div>
                    ) : null}

                    {selectedBlock.type === "columns" ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Columns</div>
                            <input
                              type="number"
                              min={1}
                              max={6}
                              value={String((selectedBlock.props.columns || []).length || 2)}
                              onChange={(e) => {
                                const nextCount = Math.max(1, Math.min(6, Number(e.target.value) || 1));
                                const prevCols = Array.isArray(selectedBlock.props.columns) ? selectedBlock.props.columns : [];
                                const nextCols = [...prevCols];
                                while (nextCols.length < nextCount) nextCols.push({ markdown: "", children: [] });
                                while (nextCols.length > nextCount) nextCols.pop();
                                upsertBlock({
                                  ...selectedBlock,
                                  props: { ...selectedBlock.props, columns: nextCols },
                                } as any);
                                setSelectedBlockId(selectedBlock.id);
                              }}
                              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="block">
                            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Gap (px)</div>
                            <input
                              type="number"
                              value={String(selectedBlock.props.gapPx ?? 24)}
                              onChange={(e) =>
                                upsertBlock({
                                  ...selectedBlock,
                                  props: { ...selectedBlock.props, gapPx: Number(e.target.value) || 0 },
                                })
                              }
                              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="col-span-2 flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                            <span className="font-semibold text-zinc-900">Stack on mobile</span>
                            <ToggleSwitch
                              checked={selectedBlock.props.stackOnMobile !== false}
                              disabled={busy}
                              onChange={(checked) =>
                                upsertBlock({
                                  ...selectedBlock,
                                  props: { ...selectedBlock.props, stackOnMobile: checked },
                                })
                              }
                            />
                          </label>
                        </div>

                        {(selectedBlock.props.columns || []).map((col, colIdx) => {
                          const children = Array.isArray(col.children) ? (col.children as CreditFunnelBlock[]) : [];
                          return (
                            <div key={colIdx} className="rounded-xl border border-zinc-200 bg-white p-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Column {colIdx + 1}</div>
                                {(selectedBlock.props.columns || []).length > 1 ? (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      const cols = [...(selectedBlock.props.columns || [])];
                                      cols.splice(colIdx, 1);
                                      upsertBlock({ ...selectedBlock, props: { ...selectedBlock.props, columns: cols } } as any);
                                      setSelectedBlockId(selectedBlock.id);
                                    }}
                                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                  >
                                    Remove column
                                  </button>
                                ) : null}
                              </div>

                              <div className="mt-2 flex flex-wrap gap-2">
                                {(
                                  [
                                    { t: "heading", label: "+ Heading" },
                                    { t: "paragraph", label: "+ Text" },
                                    { t: "button", label: "+ Button" },
                                    { t: "image", label: "+ Image" },
                                    { t: "video", label: "+ Video" },
                                    { t: "spacer", label: "+ Spacer" },
                                  ] as const
                                ).map((b) => (
                                  <button
                                    key={b.t}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      const id = newId();
                                      const base: CreditFunnelBlock =
                                        b.t === "heading"
                                          ? { id, type: "heading", props: { text: `Heading`, level: 2 } }
                                          : b.t === "paragraph"
                                            ? { id, type: "paragraph", props: { text: `Text` } }
                                            : b.t === "button"
                                              ? {
                                                  id,
                                                  type: "button",
                                                  props: { text: "Button", href: `${basePath}/forms/your-form-slug`, variant: "primary" },
                                                }
                                              : b.t === "image"
                                                ? { id, type: "image", props: { src: "", alt: "" } }
                                                : b.t === "video"
                                                  ? { id, type: "video", props: { src: "", controls: true, aspectRatio: "16:9", fit: "contain", showFrame: false } as any }
                                                : { id, type: "spacer", props: { height: 24 } };
                                      const cols = [...(selectedBlock.props.columns || [])];
                                      const nextCol = { ...(cols[colIdx] || { markdown: "" }) } as any;
                                      const nextChildren = [...(Array.isArray(nextCol.children) ? nextCol.children : []), base];
                                      nextCol.children = nextChildren;
                                      cols[colIdx] = nextCol;
                                      upsertBlock({ ...selectedBlock, props: { ...selectedBlock.props, columns: cols } } as any);
                                      setSelectedBlockId(id);
                                    }}
                                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                  >
                                    {b.label}
                                  </button>
                                ))}
                              </div>

                              <div className="mt-3 space-y-2">
                                {children.length === 0 ? (
                                  <div className="text-sm text-zinc-600">No blocks yet.</div>
                                ) : (
                                  children.map((c) => (
                                    <div
                                      key={c.id}
                                      className={classNames(
                                        "flex items-center justify-between gap-2 rounded-xl border px-3 py-2",
                                        selectedBlockId === c.id
                                          ? "border-(--color-brand-blue) bg-blue-50"
                                          : "border-zinc-200 bg-white",
                                      )}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => setSelectedBlockId(c.id)}
                                        className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-zinc-900"
                                      >
                                        {c.type}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => requestDeleteBlock(c.id)}
                                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  ))
                                )}
                              </div>

                              <CollapsibleGroup title="Markdown (optional)" defaultOpen={false}>
                                <textarea
                                  value={col.markdown || ""}
                                  onChange={(e) => {
                                    const cols = [...(selectedBlock.props.columns || [])];
                                    cols[colIdx] = { ...(cols[colIdx] || { markdown: "" }), markdown: e.target.value } as any;
                                    upsertBlock({ ...selectedBlock, props: { ...selectedBlock.props, columns: cols } } as any);
                                  }}
                                  className="min-h-25 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                  placeholder={`Column ${colIdx + 1} (markdown)`}
                                />
                                <div className="mt-1 text-[11px] text-zinc-500">Used only when the column has no blocks.</div>
                              </CollapsibleGroup>

                              <CollapsibleGroup title="Style" defaultOpen={false}>
                                <div className="space-y-3">
                                  <ColorPickerField
                                    label="Text"
                                    value={(col.style as any)?.textColor}
                                    onChange={(v) => updateSelectedColumnsColumnStyle(colIdx, { textColor: v })}
                                    swatches={colorSwatches}
                                    allowAlpha
                                  />
                                  <ColorPickerField
                                    label="Background"
                                    value={(col.style as any)?.backgroundColor}
                                    onChange={(v) => updateSelectedColumnsColumnStyle(colIdx, { backgroundColor: v })}
                                    swatches={colorSwatches}
                                    allowAlpha
                                  />

                                  <div className="grid grid-cols-2 gap-2">
                                    <label className="block">
                                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Padding</div>
                                      <input
                                        type="number"
                                        value={(col.style as any)?.paddingPx ?? ""}
                                        onChange={(e) =>
                                          updateSelectedColumnsColumnStyle(colIdx, {
                                            paddingPx: e.target.value === "" ? undefined : Number(e.target.value) || 0,
                                          })
                                        }
                                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                      />
                                    </label>
                                    <RadiusPicker
                                      label="Radius"
                                      value={(col.style as any)?.borderRadiusPx}
                                      onChange={(v) => updateSelectedColumnsColumnStyle(colIdx, { borderRadiusPx: v })}
                                      max={64}
                                    />
                                  </div>
                                </div>
                              </CollapsibleGroup>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    {selectedBlock.type === "section" ? (
                      <div className="space-y-2">
                        <PortalListboxDropdown
                          value={selectedBlock.props.layout === "two" ? "two" : "one"}
                          onChange={(layout) =>
                            upsertBlock({
                              ...selectedBlock,
                              props: {
                                ...selectedBlock.props,
                                layout: layout === "two" ? "two" : "one",
                              },
                            })
                          }
                          options={[
                            { value: "one", label: "One column" },
                            { value: "two", label: "Two columns" },
                          ]}
                          className="w-full"
                          buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                        />

                        <div className="rounded-xl border border-zinc-200 bg-white p-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Section anchor</div>
                          <div className="mt-2 space-y-2">
                            <label className="block">
                              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Anchor ID (optional)</div>
                              <input
                                value={String((selectedBlock.props as any)?.anchorId || "")}
                                onChange={(e) => {
                                  const cleaned = String(e.target.value || "")
                                    .replace(/\s+/g, "-")
                                    .replace(/[^a-zA-Z0-9_-]/g, "")
                                    .slice(0, 64);
                                  upsertBlock({
                                    ...selectedBlock,
                                    props: { ...selectedBlock.props, anchorId: cleaned },
                                  } as any);
                                }}
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                placeholder={`section-${selectedBlock.id}`}
                              />
                              <div className="mt-1 text-[11px] text-zinc-500">Menu links will use this like “#pricing”.</div>
                            </label>

                            <label className="block">
                              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Menu label (optional)</div>
                              <input
                                value={String((selectedBlock.props as any)?.anchorLabel || "")}
                                onChange={(e) =>
                                  upsertBlock({
                                    ...selectedBlock,
                                    props: { ...selectedBlock.props, anchorLabel: e.target.value.slice(0, 80) },
                                  } as any)
                                }
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                placeholder="Pricing"
                              />
                            </label>
                          </div>
                        </div>

                        {selectedBlock.props.layout === "two" ? (
                          <>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="block">
                                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Gap (px)</div>
                                <input
                                  type="number"
                                  value={String(selectedBlock.props.gapPx ?? 24)}
                                  onChange={(e) =>
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: { ...selectedBlock.props, gapPx: Number(e.target.value) || 0 },
                                    })
                                  }
                                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                />
                              </label>
                              <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                                <span className="min-w-0 flex-1 font-semibold text-zinc-900">Stack on mobile</span>
                                <ToggleSwitch
                                  checked={selectedBlock.props.stackOnMobile !== false}
                                  disabled={busy}
                                  onChange={(checked) =>
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: { ...selectedBlock.props, stackOnMobile: checked },
                                    })
                                  }
                                />
                              </label>
                            </div>

                            <div className="rounded-xl border border-zinc-200 bg-white p-3">
                              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Left column blocks</div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    const id = newId();
                                    const base: CreditFunnelBlock = { id, type: "heading", props: { text: "Left heading", level: 2 } };
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: {
                                        ...selectedBlock.props,
                                        leftChildren: [
                                          ...((selectedBlock.props as any).leftChildren || []),
                                          base,
                                        ],
                                      },
                                    } as any);
                                    setSelectedBlockId(id);
                                  }}
                                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                >
                                  + Heading
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    const id = newId();
                                    const base: CreditFunnelBlock = { id, type: "paragraph", props: { text: "Left text" } };
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: {
                                        ...selectedBlock.props,
                                        leftChildren: [
                                          ...((selectedBlock.props as any).leftChildren || []),
                                          base,
                                        ],
                                      },
                                    } as any);
                                    setSelectedBlockId(id);
                                  }}
                                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                >
                                  + Text
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    const id = newId();
                                    const base: CreditFunnelBlock = {
                                      id,
                                      type: "button",
                                      props: { text: "Button", href: `${basePath}/forms/your-form-slug`, variant: "primary" },
                                    };
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: {
                                        ...selectedBlock.props,
                                        leftChildren: [
                                          ...((selectedBlock.props as any).leftChildren || []),
                                          base,
                                        ],
                                      },
                                    } as any);
                                    setSelectedBlockId(id);
                                  }}
                                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                >
                                  + Button
                                </button>
                              </div>

                              <div className="mt-3 space-y-2">
                                {(((selectedBlock.props as any).leftChildren as CreditFunnelBlock[]) || []).length === 0 ? (
                                  <div className="text-sm text-zinc-600">No blocks yet.</div>
                                ) : (
                                  (((selectedBlock.props as any).leftChildren as CreditFunnelBlock[]) || []).map((c) => (
                                    <div
                                      key={c.id}
                                      className={classNames(
                                        "flex items-center justify-between gap-2 rounded-xl border px-3 py-2",
                                        selectedBlockId === c.id
                                          ? "border-(--color-brand-blue) bg-blue-50"
                                          : "border-zinc-200 bg-white",
                                      )}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => setSelectedBlockId(c.id)}
                                        className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-zinc-900"
                                      >
                                        {c.type}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => requestDeleteBlock(c.id)}
                                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>

                            <div className="rounded-xl border border-zinc-200 bg-white p-3">
                              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Right column blocks</div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    const id = newId();
                                    const base: CreditFunnelBlock = { id, type: "heading", props: { text: "Right heading", level: 2 } };
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: {
                                        ...selectedBlock.props,
                                        rightChildren: [
                                          ...((selectedBlock.props as any).rightChildren || []),
                                          base,
                                        ],
                                      },
                                    } as any);
                                    setSelectedBlockId(id);
                                  }}
                                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                >
                                  + Heading
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    const id = newId();
                                    const base: CreditFunnelBlock = { id, type: "paragraph", props: { text: "Right text" } };
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: {
                                        ...selectedBlock.props,
                                        rightChildren: [
                                          ...((selectedBlock.props as any).rightChildren || []),
                                          base,
                                        ],
                                      },
                                    } as any);
                                    setSelectedBlockId(id);
                                  }}
                                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                >
                                  + Text
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    const id = newId();
                                    const base: CreditFunnelBlock = {
                                      id,
                                      type: "button",
                                      props: { text: "Button", href: `${basePath}/forms/your-form-slug`, variant: "primary" },
                                    };
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: {
                                        ...selectedBlock.props,
                                        rightChildren: [
                                          ...((selectedBlock.props as any).rightChildren || []),
                                          base,
                                        ],
                                      },
                                    } as any);
                                    setSelectedBlockId(id);
                                  }}
                                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                >
                                  + Button
                                </button>
                              </div>

                              <div className="mt-3 space-y-2">
                                {(((selectedBlock.props as any).rightChildren as CreditFunnelBlock[]) || []).length === 0 ? (
                                  <div className="text-sm text-zinc-600">No blocks yet.</div>
                                ) : (
                                  (((selectedBlock.props as any).rightChildren as CreditFunnelBlock[]) || []).map((c) => (
                                    <div
                                      key={c.id}
                                      className={classNames(
                                        "flex items-center justify-between gap-2 rounded-xl border px-3 py-2",
                                        selectedBlockId === c.id
                                          ? "border-(--color-brand-blue) bg-blue-50"
                                          : "border-zinc-200 bg-white",
                                      )}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => setSelectedBlockId(c.id)}
                                        className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-zinc-900"
                                      >
                                        {c.type}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => requestDeleteBlock(c.id)}
                                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>

                            <CollapsibleGroup title="Column styles" defaultOpen={false}>
                              <div className="space-y-2">
                                <div className="rounded-xl border border-zinc-200 bg-white p-3">
                                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Left style</div>
                                  <div className="mt-2 space-y-2">
                                    <ColorPickerField
                                      label="Text"
                                      value={selectedBlock.props.leftStyle?.textColor}
                                      onChange={(v) => updateSelectedSectionSideStyle("leftStyle", { textColor: v })}
                                      swatches={colorSwatches}
                                      allowAlpha
                                    />
                                    <ColorPickerField
                                      label="Background"
                                      value={selectedBlock.props.leftStyle?.backgroundColor}
                                      onChange={(v) => updateSelectedSectionSideStyle("leftStyle", { backgroundColor: v })}
                                      swatches={colorSwatches}
                                      allowAlpha
                                    />
                                    <PaddingPicker
                                      label="Padding"
                                      value={selectedBlock.props.leftStyle?.paddingPx}
                                      onChange={(v) => updateSelectedSectionSideStyle("leftStyle", { paddingPx: v })}
                                    />
                                  </div>
                                </div>

                                <div className="rounded-xl border border-zinc-200 bg-white p-3">
                                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Right style</div>
                                  <div className="mt-2 space-y-2">
                                    <ColorPickerField
                                      label="Text"
                                      value={selectedBlock.props.rightStyle?.textColor}
                                      onChange={(v) => updateSelectedSectionSideStyle("rightStyle", { textColor: v })}
                                      swatches={colorSwatches}
                                      allowAlpha
                                    />
                                    <ColorPickerField
                                      label="Background"
                                      value={selectedBlock.props.rightStyle?.backgroundColor}
                                      onChange={(v) => updateSelectedSectionSideStyle("rightStyle", { backgroundColor: v })}
                                      swatches={colorSwatches}
                                      allowAlpha
                                    />
                                    <PaddingPicker
                                      label="Padding"
                                      value={selectedBlock.props.rightStyle?.paddingPx}
                                      onChange={(v) => updateSelectedSectionSideStyle("rightStyle", { paddingPx: v })}
                                    />
                                  </div>
                                </div>
                              </div>
                            </CollapsibleGroup>
                          </>
                        ) : (
                          <>
                            <div className="rounded-xl border border-zinc-200 bg-white p-3">
                              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Section blocks</div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => addBlock("heading")}
                                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                >
                                  + Heading
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => addBlock("paragraph")}
                                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                >
                                  + Text
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => addBlock("button")}
                                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                >
                                  + Button
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => addBlock("formEmbed")}
                                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                >
                                  + Form embed
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => addBlock("image")}
                                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                >
                                  + Image
                                </button>
                              </div>

                              <div className="mt-3 space-y-2">
                                {(((selectedBlock.props as any).children as CreditFunnelBlock[]) || []).length === 0 ? (
                                  <div className="text-sm text-zinc-600">No blocks yet.</div>
                                ) : (
                                  (((selectedBlock.props as any).children as CreditFunnelBlock[]) || []).map((c) => (
                                    <div
                                      key={c.id}
                                      className={classNames(
                                        "flex items-center justify-between gap-2 rounded-xl border px-3 py-2",
                                        selectedBlockId === c.id
                                          ? "border-(--color-brand-blue) bg-blue-50"
                                          : "border-zinc-200 bg-white",
                                      )}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => setSelectedBlockId(c.id)}
                                        className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-zinc-900"
                                      >
                                        {c.type}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => requestDeleteBlock(c.id)}
                                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>

                            {(selectedBlock.props.markdown || "").trim() ? (
                              <CollapsibleGroup title="Legacy markdown (optional)" defaultOpen={false}>
                                <textarea
                                  value={selectedBlock.props.markdown || ""}
                                  onChange={(e) =>
                                    upsertBlock({
                                      ...selectedBlock,
                                      props: { ...selectedBlock.props, markdown: e.target.value },
                                    })
                                  }
                                  className="min-h-30 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                  placeholder="Legacy markdown content"
                                />
                              </CollapsibleGroup>
                            ) : null}
                          </>
                        )}
                      </div>
                    ) : null}

                  </div>
                )}
                <div className="mt-4 text-xs text-zinc-500">Tip: drag blocks in the preview to reorder.</div>
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>

        <main
          className={classNames(
            "flex min-h-0 flex-col overflow-auto bg-zinc-100 p-3 sm:p-4 lg:overflow-hidden",
            "lg:order-2",
          )}
        >
          {aiResultBanner ? (() => {
            const activeCheckpoint = selectedPageLatestAiCheckpoint?.at === aiResultBanner.at ? selectedPageLatestAiCheckpoint : null;
            const checkpointChanges = activeCheckpoint?.changelog?.changes.slice(0, 3) || [];
            const checkpointNotes = activeCheckpoint?.changelog?.conversionNotes.slice(0, 2) || [];
            const checkpointWarnings = activeCheckpoint?.warnings.slice(0, 3) || [];

            return (
              <div
                className={classNames(
                  "mb-3 rounded-2xl border px-4 py-3 text-sm shadow-sm",
                  aiResultBanner.tone === "warning"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900",
                )}
              >
                <div className="flex items-start gap-3">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    className={classNames("mt-0.5 h-4 w-4 shrink-0", aiResultBanner.tone === "warning" ? "text-amber-500" : "text-emerald-500")}
                    fill="currentColor"
                  >
                    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{aiResultBanner.summary}</div>
                    {activeCheckpoint ? (
                      <>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
                          {activeCheckpoint.surface === "source" ? (
                            <span className="rounded-full border border-current/15 bg-white/70 px-2.5 py-1">Preview opened from the updated draft</span>
                          ) : null}
                          <span className="rounded-full border border-current/15 bg-white/70 px-2.5 py-1">System used the current draft and saved direction</span>
                          {activeCheckpoint.backgroundReviewStatus === "pending" ? (
                            <span className="rounded-full border border-current/15 bg-white/70 px-2.5 py-1">Visual review running</span>
                          ) : activeCheckpoint.backgroundReviewSummary ? (
                            <span className="rounded-full border border-current/15 bg-white/70 px-2.5 py-1">
                              {activeCheckpoint.backgroundReviewMode === "visual" ? "Visual review complete" : "Fallback review complete"}
                            </span>
                          ) : null}
                        </div>
                        {checkpointChanges.length ? (
                          <div className="mt-3 grid gap-2 lg:grid-cols-3">
                            {checkpointChanges.map((change, index) => (
                              <div key={`${activeCheckpoint.at}-change-${index}`} className="rounded-xl border border-current/10 bg-white/70 px-3 py-2.5 text-[12px] leading-5">
                                <div className="font-semibold uppercase tracking-[0.14em] opacity-70">{change.section}</div>
                                <div className="mt-1 font-medium text-current">{change.what}</div>
                                {change.why ? <div className="mt-1 opacity-80">{change.why}</div> : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {activeCheckpoint.backgroundReviewSummary || checkpointNotes.length || checkpointWarnings.length ? (
                          <div className="mt-3 space-y-2 text-[12px] leading-5">
                            {activeCheckpoint.backgroundReviewSummary ? (
                              <div className="rounded-xl border border-current/10 bg-white/70 px-3 py-2.5">
                                <div className="font-semibold uppercase tracking-[0.14em] opacity-70">
                                  {activeCheckpoint.backgroundReviewMode === "visual" ? "Visual review" : "Fallback review"}
                                </div>
                                <div className="mt-1">{activeCheckpoint.backgroundReviewSummary}</div>
                              </div>
                            ) : null}
                            {checkpointNotes.length ? (
                              <div className="rounded-xl border border-current/10 bg-white/70 px-3 py-2.5">
                                {checkpointNotes.map((note, index) => (
                                  <div key={`${activeCheckpoint.at}-note-${index}`}>{note}</div>
                                ))}
                              </div>
                            ) : null}
                            {checkpointWarnings.length ? (
                              <div className="rounded-xl border border-current/10 bg-white/70 px-3 py-2.5">
                                {checkpointWarnings.map((warning, index) => (
                                  <div key={`${activeCheckpoint.at}-warning-${index}`}>{warning}</div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void restoreLastAiRun()}
                      disabled={!selectedPageLatestAiCheckpoint}
                      className={classNames(
                        "rounded-full border bg-white px-3 py-1 text-xs font-semibold",
                        aiResultBanner.tone === "warning"
                          ? selectedPageLatestAiCheckpoint
                            ? "border-amber-300 text-amber-800 hover:bg-amber-100"
                            : "border-amber-200 text-amber-400"
                          : selectedPageLatestAiCheckpoint
                            ? "border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                            : "border-emerald-200 text-emerald-400",
                      )}
                    >
                      Undo
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiResultBanner(null)}
                      className={classNames(
                        "shrink-0",
                        aiResultBanner.tone === "warning"
                          ? "text-amber-400 hover:text-amber-700"
                          : "text-emerald-400 hover:text-emerald-700",
                      )}
                      aria-label="Dismiss"
                    >
                      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                        <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })() : null}
          {aiWorkFocus ? (
            <div
              className={classNames(
                "mb-3 flex items-center gap-3 rounded-2xl border px-4 py-2.5 text-sm shadow-sm",
                aiWorkFocus.phase === "pending"
                  ? "border-zinc-200 bg-white text-zinc-900"
                  : "border-zinc-200 bg-zinc-50 text-zinc-700",
              )}
            >
              <span
                className={classNames(
                  "inline-flex h-2.5 w-2.5 shrink-0 rounded-full",
                  aiWorkFocus.phase === "pending" ? "animate-pulse bg-zinc-900" : "bg-zinc-500",
                )}
              />
              <span className="min-w-0 flex-1 font-medium">{aiWorkFocus.label}</span>
              {aiWorkFocus.mode === "page" && aiWorkFocus.regionKey ? (
                <span className="shrink-0 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Scoped
                </span>
              ) : null}
            </div>
          ) : null}
          <div
            className={classNames(
              "flex min-h-0 flex-1 flex-col overflow-hidden border border-zinc-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.06)]",
              previewDevice === "mobile" ? "rounded-2xl" : "rounded-none",
            )}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-2">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="truncate text-sm font-semibold text-zinc-900">{selectedPage?.title || "Preview"}</div>
                </div>
                {selectedPage ? <div className="truncate text-xs text-zinc-500">{selectedPageRouteLabel} • {pageManagementUi.summary}</div> : null}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="inline-flex items-center rounded-xl border border-zinc-200 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setPreviewDevice((prev) => (prev === "desktop" ? "mobile" : "desktop"))}
                    className="relative mr-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
                    aria-label={previewDevice === "desktop" ? "Switch to mobile preview" : "Switch to desktop preview"}
                    title={previewDevice === "desktop" ? "Switch to mobile" : "Switch to desktop"}
                  >
                    <span className="relative h-4 w-4">
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className={classNames(
                          "absolute inset-0 h-4 w-4 transition-all duration-200 ease-out",
                          previewDevice === "desktop" ? "scale-100 opacity-100" : "scale-75 opacity-0",
                        )}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="3.5" y="4.5" width="17" height="11" rx="1.75" />
                        <path d="M8 19.5h8" />
                        <path d="M12 15.5v4" />
                      </svg>
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className={classNames(
                          "absolute inset-0 h-4 w-4 transition-all duration-200 ease-out",
                          previewDevice === "mobile" ? "scale-100 opacity-100" : "scale-75 opacity-0",
                        )}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="7.25" y="2.75" width="9.5" height="18.5" rx="2.25" />
                        <path d="M10.5 5.75h3" />
                        <path d="M11.25 18.25h1.5" />
                      </svg>
                    </span>
                  </button>

                  {selectedPageSupportsBlocksSurface ? (
                    <>
                      <div className="mx-0.5 h-4 w-px shrink-0 bg-zinc-200" />
                      <BuilderStageToggleButton
                        label="Preview"
                        active={blocksSurfaceActive && previewMode === "preview"}
                        title={blocksSurfaceActive && previewMode === "preview" ? "Return to authoring" : "Preview the page"}
                        onClick={() => {
                          if (blocksSurfaceActive && previewMode === "preview") {
                            setPreviewMode("edit");
                            return;
                          }
                          setBuilderMode("blocks");
                          setPreviewMode("preview");
                        }}
                      />
                      <BuilderStageToggleButton
                        label={wholePageSourcePanelLabel}
                        active={wholePageSurfaceActive && wholePageViewMode === "source"}
                        onClick={() => {
                          setBuilderMode("whole-page");
                          setWholePageViewMode("source");
                        }}
                      />
                      <BuilderStageToggleButton
                        label="Direction"
                        active={wholePageSurfaceActive && wholePageViewMode === "direction"}
                        onClick={() => {
                          setBuilderMode("whole-page");
                          setWholePageViewMode("direction");
                        }}
                      />
                    </>
                  ) : (
                    <>
                      <div className="mx-0.5 h-4 w-px shrink-0 bg-zinc-200" />
                      <BuilderStageToggleButton label="Preview" active={wholePageViewMode === "preview"} onClick={() => setWholePageViewMode("preview")} />
                      <BuilderStageToggleButton label={wholePageSourcePanelLabel} active={wholePageViewMode === "source"} onClick={() => setWholePageViewMode("source")} />
                      <BuilderStageToggleButton label="Direction" active={wholePageViewMode === "direction"} onClick={() => setWholePageViewMode("direction")} />
                    </>
                  )}
                </div>
              </div>
            </div>

            <div
              className={classNames(
                "flex min-h-0 flex-1 flex-col overflow-auto",
                previewDevice === "mobile" ? "px-3 py-4 sm:px-5" : "p-4",
              )}
              onDragOver={(e) => {
                if (!blocksSurfaceActive || previewMode !== "edit") return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(e) => {
                if (!blocksSurfaceActive || previewMode !== "edit") return;
                e.preventDefault();
                const preset = e.dataTransfer.getData("text/x-funnel-preset");
                if (preset === "hero" || preset === "body" || preset === "form" || preset === "shop") {
                  addPresetSection(preset as any);
                  return;
                }
                const t = e.dataTransfer.getData("text/x-block-type");
                if (t) addBlock(t as any);
              }}
            >
              {!selectedPage ? (
                pages === null ? (
                  <div className="mx-auto w-full max-w-5xl space-y-4">
                    <div className="h-12 rounded-2xl bg-white animate-pulse" />
                    <div className="h-[60vh] rounded-4xl bg-white animate-pulse" />
                  </div>
                ) : (
                  <div className="text-sm text-zinc-600">Select a page to preview.</div>
                )
              ) : wholePageModeActive ? (
                <div className="mx-auto flex min-h-0 flex-1 w-full max-w-6xl flex-col">
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

                      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3">
                        {showWholePagePreviewPane ? (
                          <div className="flex min-h-0 flex-1 flex-col gap-3">
                            <div className="flex min-h-0 flex-1 flex-col">
                              {currentPageSourceHtml ? (
                                <CustomHtmlPreviewFrame
                                  html={editorPreviewHtml}
                                  title={selectedPage.title}
                                  previewDevice={previewDevice}
                                  heightClassName="h-full"
                                  selectedRegionKey={selectedHtmlRegion?.key || null}
                                  selectionState={htmlPreviewSelectionState}
                                />
                              ) : selectedPage.editorMode === "BLOCKS" ? (
                                <div className={classNames("mx-auto w-full", previewDevice === "mobile" ? "max-w-98" : "max-w-5xl")}>
                                  <div
                                    className={classNames(
                                      previewDevice === "mobile"
                                        ? "overflow-hidden rounded-[30px] border border-zinc-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-3 shadow-[0_20px_60px_rgba(15,23,42,0.08)]"
                                        : "border border-zinc-200 bg-white",
                                    )}
                                  >
                                    {previewDevice === "mobile" ? <div className="mx-auto mb-3 h-1.5 w-24 rounded-full bg-zinc-300" /> : null}
                                    <div className={classNames(previewDevice === "mobile" ? "h-[min(72vh,780px)] overflow-auto rounded-[28px] bg-white" : "min-h-[82vh]")}>
                                      {renderCreditFunnelBlocks({
                                        blocks: pageSettingsBlock ? [pageSettingsBlock, ...editableBlocks] : editableBlocks,
                                        basePath: hostedBasePath,
                                        context: {
                                          bookingSiteSlug: bookingSiteSlug || undefined,
                                          defaultBookingCalendarId: funnel?.bookingCalendarId || undefined,
                                          funnelId: funnel?.id || undefined,
                                          funnelPageId: selectedPage.id,
                                          funnelSlug: funnel?.slug || undefined,
                                          funnelPageSlug: selectedPage.slug,
                                          previewDevice,
                                          previewEmbedMode: "live",
                                        },
                                      })}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex h-full min-h-[50vh] items-center justify-center rounded-[28px] border border-dashed border-zinc-300 bg-white px-6 text-center text-sm text-zinc-600">
                                  {wholePageSyncNotice || "No page source available yet. Save the page to generate the source view."}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : null}

                        {showWholePageSourcePane ? (
                          <div className="flex min-h-0 flex-1 flex-col">
                            <div className="flex min-h-[50vh] flex-1 flex-col overflow-hidden rounded-[20px] bg-white">
                              <div className="px-4 pt-3 pb-2">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Source</div>
                                    <div className="mt-1 text-sm font-semibold text-zinc-700">{sourceScopeLabel}</div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">{wholePageSyncMeta}</span>
                                    {currentPageSourceHtml ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          try {
                                            void navigator.clipboard?.writeText?.(currentPageSourceHtml || currentPagePublishedHtml || getFunnelPageDraftHtml(selectedPage));
                                            toast.success("HTML copied");
                                          } catch {
                                            toast.error("Could not copy HTML");
                                          }
                                        }}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-800"
                                        title="Copy HTML"
                                      >
                                        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                                          <rect x="9" y="9" width="11" height="11" rx="2" />
                                          <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
                                        </svg>
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              </div>

                              <div className="min-h-0 flex-1">
                                {currentPageSourceHtml ? (
                                  <CodeSurface
                                    value={currentPageSourceHtml}
                                    onChange={wholePageSourceEditable ? (next) => setSelectedPageLocal({ draftHtml: next }) : undefined}
                                    placeholder="<!doctype html>"
                                    readOnly={!wholePageSourceEditable}
                                    lineHighlightRange={latestSourceHighlightRange}
                                    seamless
                                    tone="light"
                                  />
                                ) : (
                                  <div className="flex h-full min-h-[36vh] items-center justify-center px-6 text-center text-sm text-zinc-400">
                                    {wholePageStatusMessage || "No page source available yet. Save the page to generate the source view."}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {showWholePageDirectionPane ? (
                          <DirectionWorkbenchPanel
                            routeLabel={selectedPageRouteLabel}
                            pageTypeLabel={PAGE_INTENT_TYPE_LABELS[pageIntentProfile.pageType]}
                            scopeLabel={sourceScopeLabel}
                            foundationStatusLabel={directionFoundationStatusLabel}
                            foundationStatusClassName={directionFoundationStatusClassName}
                            foundationSummary={foundationArtifact?.strategicSummary || foundationOverview.summary}
                            foundationNarrative={foundationArtifact?.narrative || foundationOverview.businessNarrative}
                            assumption={foundationArtifact?.assumption || null}
                            pageConversionFocus={pageConversionFocus}
                            shellFrame={selectedShellFrame
                              ? {
                                  label: selectedShellFrame.label,
                                  summary: selectedShellFrame.summary,
                                  sectionPlan: selectedShellFrame.sectionPlan,
                                  visualTone: selectedShellFrame.visualTone,
                                  proofModel: selectedShellFrame.proofModel,
                                  ctaRhythm: selectedShellFrame.ctaRhythm,
                                  designDirectives: selectedShellFrame.designDirectives,
                                }
                              : null}
                            sectionPlanItems={sectionPlanItems}
                            pageGoalUsesDefault={pageGoalUsesDefault}
                            pageAnatomy={directionPageAnatomy}
                            thread={selectedPageChatThread}
                            latestCheckpoint={selectedPageLatestAiCheckpoint}
                            onRestoreLatest={() => void restoreLastAiRun()}
                            restoreDisabled={Boolean(busy || savingPage || !selectedPageLatestAiCheckpoint)}
                            onOpenBrief={() => setBriefPanelOpen(true)}
                            onPrepareClarify={(promptHint) => {
                              setChatInput(`${composePromptFromIntent("clarify")}\n\nDirection for this pass:\n${promptHint}`);
                              setWholePageViewMode("source");
                            }}
                            onPrepareDraft={(promptHint) => {
                              setChatInput(`${composePromptFromIntent("draft")}\n\nStructural redesign instruction:\nTreat this as a structural redesign pass on the current page HTML, not a small patch. Rework section structure, spacing, hierarchy, proof placement, and CTA anchoring wherever needed to satisfy the direction below while preserving only what is clearly working.\n\nDirection for this pass:\n${promptHint}`);
                              setWholePageViewMode("source");
                            }}
                          />
                        ) : null}
                      </div>
                    </div>

                    {!showWholePageDirectionPane ? (
                    <div className="border-t border-zinc-200 bg-white px-3 py-2">
                      <div className="relative">
                        {wholePageSourceEditable && htmlScopePickerOpen ? (
                            <div className="absolute bottom-[calc(100%+8px)] left-0 z-10 w-[min(320px,100%)] rounded-2xl border border-zinc-200 bg-white p-2 shadow-lg">
                              <div className="space-y-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedHtmlRegionKey(null);
                                  setHtmlScopePickerOpen(false);
                                }}
                                className={classNames(
                                  "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                                  selectedHtmlRegion
                                    ? "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                                    : "border-zinc-200 bg-zinc-100 text-zinc-900",
                                )}
                              >
                                <div className="text-sm font-semibold">Whole page</div>
                                <div className="mt-1 text-xs leading-5 text-zinc-500">Apply the next AI change across the full draft HTML.</div>
                              </button>
                              {htmlRegionScopes.map((region) => (
                                <button
                                  key={`popover-${region.key}`}
                                  type="button"
                                  onClick={() => {
                                    setSelectedHtmlRegionKey(region.key);
                                    setHtmlScopePickerOpen(false);
                                  }}
                                  className={classNames(
                                    "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                                    selectedHtmlRegion?.key === region.key
                                      ? "border-zinc-200 bg-zinc-100 text-zinc-900"
                                      : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
                                  )}
                                  title={region.summary}
                                >
                                  <div className="text-sm font-semibold">{region.label}</div>
                                  <div className={classNames("mt-1 text-xs leading-5", selectedHtmlRegion?.key === region.key ? "text-zinc-600" : "text-zinc-500")}>{region.summary}</div>
                                </button>
                              ))}
                              </div>
                            </div>
                          ) : null}

                        <div className="mx-auto w-full max-w-5xl text-zinc-900">
                          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                            {wholePageSourceEditable ? (
                              <button
                                type="button"
                                onClick={() => setHtmlScopePickerOpen((prev) => !prev)}
                                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
                                title={selectedHtmlRegion ? selectedHtmlRegion.summary : "Apply changes across the whole page"}
                              >
                                <span>{sourceScopeLabel}</span>
                                <svg aria-hidden="true" viewBox="0 0 20 20" className={classNames("h-3.5 w-3.5 transition-transform", htmlScopePickerOpen ? "rotate-180" : "") } fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="m5 7.5 5 5 5-5" />
                                </svg>
                              </button>
                            ) : (
                              <span className="inline-flex shrink-0 items-center rounded-full border border-zinc-200/70 bg-white/72 px-3 py-2 text-xs font-semibold text-zinc-700 shadow-[0_6px_16px_rgba(15,23,42,0.05)] backdrop-blur">
                                AI edits structure
                              </span>
                            )}

                            <div className="min-w-0 flex-1">
                              <AiPromptComposer
                                value={chatInput}
                                onChange={setChatInput}
                                onAttach={() => setAiContextOpen(true)}
                                onSubmit={() => void runAi()}
                                placeholder={wholePageSourceEditable ? (selectedHtmlRegion ? `Change ${selectedHtmlRegion.label}` : "Change the page") : "Change the page structure"}
                                busy={busy}
                                busyLabel={BUSY_PHASES[busyPhaseIdx]}
                                attachCount={aiContextMedia.length}
                                className="min-w-0 flex-1"
                                tone="light"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className={classNames("mx-auto w-full", previewDevice === "mobile" ? "max-w-98" : "max-w-5xl")}>
                  <div
                    className={classNames(
                      previewDevice === "mobile"
                        ? "overflow-hidden rounded-[30px] border border-zinc-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-3 shadow-[0_20px_60px_rgba(15,23,42,0.08)]"
                        : "border border-zinc-200 bg-white",
                    )}
                  >
                    {previewDevice === "mobile" ? <div className="mx-auto mb-3 h-1.5 w-24 rounded-full bg-zinc-300" /> : null}
                    <div
                      className={classNames(previewDevice === "mobile" ? "h-[min(72vh,780px)] overflow-auto rounded-[28px] bg-white" : "min-h-[82vh]") }
                      onDragOver={(e) => {
                        if (!blocksSurfaceActive || previewMode !== "edit") return;
                        const t = e.dataTransfer.types;
                        if (t.includes("text/x-block-type") || t.includes("text/x-funnel-preset")) {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "copy";
                        }
                      }}
                      onDrop={(e) => {
                        if (!blocksSurfaceActive || previewMode !== "edit") return;
                        e.preventDefault();
                        const blockType = e.dataTransfer.getData("text/x-block-type");
                        if (blockType) {
                          addBlock(blockType as any);
                          return;
                        }
                        const presetKey = e.dataTransfer.getData("text/x-funnel-preset");
                        if (presetKey) addPresetSection(presetKey as any);
                      }}
                    >
                      {previewDevice === "mobile" ? (
                        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-[11px] font-medium text-zinc-600">
                          Mobile viewport preview. Live embeds are simplified here so the canvas stays responsive.
                        </div>
                      ) : null}

                      {editableBlocks.length === 0 ? (
                        <div className={classNames(previewDevice === "mobile" ? "p-4" : "p-8")}>
                          <div className="flex min-h-[60vh] items-center justify-center rounded-[28px] border border-zinc-200 bg-[radial-gradient(circle_at_top,#f8fafc_0%,#ffffff_52%,#f5f7fb_100%)] px-5 py-8">
                            <div className="w-full max-w-3xl rounded-[28px] border border-zinc-200 bg-white/96 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8">
                              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 flex-1">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">First draft setup</div>
                                  <div className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">Set up the first version of this page before you start designing it.</div>
                                  <div className="mt-3 max-w-2xl text-sm leading-7 text-zinc-600">
                                    This page is still empty at <span className="font-mono text-[13px] text-zinc-700">{selectedPageRouteLabel}</span>. Choose the direction, shape the first pass, and then let AI generate something you can immediately start refining on the canvas.
                                  </div>
                                </div>
                                <div className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[11px] font-semibold text-zinc-600">
                                  First draft setup
                                </div>
                              </div>

                              <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
                                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Step 1</div>
                                  <div className="mt-2 text-sm font-semibold text-zinc-900">Clarify what this page needs to do</div>
                                  <div className="mt-1 text-xs leading-6 text-zinc-600">Set the offer, the audience, the next step, and anything the page has to respect.</div>
                                </div>
                                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Step 2</div>
                                  <div className="mt-2 text-sm font-semibold text-zinc-900">Choose the kind of opening you want</div>
                                  <div className="mt-1 text-xs leading-6 text-zinc-600">Decide whether the first version should open with an image, a VSL, or no hero media at all.</div>
                                </div>
                                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Step 3</div>
                                  <div className="mt-2 text-sm font-semibold text-zinc-900">Generate a first draft you can work from</div>
                                  <div className="mt-1 text-xs leading-6 text-zinc-600">Once the draft exists, you can keep iterating on the canvas, swap visuals, and test different angles.</div>
                                </div>
                              </div>

                              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="text-xs leading-6 text-zinc-500">The normal empty canvas and block drop flow are intentionally paused until the first generation is created.</div>
                                <button
                                  type="button"
                                  onClick={() => setBriefPanelOpen(true)}
                                  className="inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                                >
                                  Continue shell setup
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        renderCreditFunnelBlocks({
                          blocks: pageSettingsBlock ? [pageSettingsBlock, ...editableBlocks] : editableBlocks,
                          basePath: hostedBasePath,
                          context: {
                            bookingSiteSlug: bookingSiteSlug || undefined,
                            defaultBookingCalendarId: funnel?.bookingCalendarId || undefined,
                            funnelId: funnel?.id || undefined,
                            funnelPageId: selectedPage.id,
                            funnelSlug: funnel?.slug || undefined,
                            funnelPageSlug: selectedPage.slug,
                            previewDevice,
                            previewEmbedMode: previewMode === "preview" ? "live" : "placeholder",
                          },
                          editor: previewMode === "edit"
                            ? {
                                enabled: true,
                                selectedBlockId,
                                hoveredBlockId,
                                aiFocusedBlockId: aiWorkFocus?.mode === "builder" ? aiWorkFocus.blockId : null,
                                aiFocusedPhase: aiWorkFocus?.mode === "builder" ? aiWorkFocus.phase : null,
                                onSelectBlockId: (id) => {
                                  setSelectedBlockId(id);
                                  setSidebarPanel((prev) => (prev === "structure" ? "structure" : "selected"));
                                },
                                onHoverBlockId: (id) => setHoveredBlockId(id),
                                onUpsertBlock: (next) => upsertBlock(next),
                                onReorder: (dragId, dropId) => reorderBlocks(dragId, dropId),
                                onMove: (id, dir) => moveBlock(id, dir),
                                canMove: (id, dir) => canMoveBlock(id, dir),
                              }
                            : undefined,
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {blocksSurfaceActive && selectedPage && !blankPageOnboardingActive ? (
              <div className="border-t border-zinc-200/70 bg-white/68 px-3 py-2.5 backdrop-blur">
                <div className="mx-auto w-full max-w-4xl">
                  <div className="flex w-full items-center gap-3">
                    <AiPromptComposer
                      value={chatInput}
                      onChange={setChatInput}
                      onAttach={() => setAiContextOpen(true)}
                      onSubmit={() => void runAi()}
                      placeholder={primaryBuilderAiPlaceholder}
                      busy={busy}
                      busyLabel={BUSY_PHASES[busyPhaseIdx]}
                      attachCount={aiContextMedia.length}
                      className="min-w-0 flex-1"
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
