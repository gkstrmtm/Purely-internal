"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { PutBlobResult } from "@vercel/blob";
import { upload as uploadToVercelBlob } from "@vercel/blob/client";

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
import { blocksToCustomHtmlDocument } from "@/lib/funnelBlocksToCustomHtmlDocument";
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

type BuilderLibraryCardTone = "slate" | "blue" | "emerald" | "amber" | "rose";

function BuilderLibraryCard({
  label,
  description,
  preview,
  tone = "slate",
  disabled,
  onAdd,
}: {
  label: string;
  description?: string;
  preview: ReactNode;
  tone?: BuilderLibraryCardTone;
  disabled?: boolean;
  onAdd: () => void;
}) {
  const toneClassName =
    tone === "blue"
      ? "bg-blue-50"
      : tone === "emerald"
        ? "bg-emerald-50"
        : tone === "amber"
          ? "bg-amber-50"
          : tone === "rose"
            ? "bg-rose-50"
            : "bg-zinc-50";

  return (
    <div className="overflow-hidden rounded-[26px] border border-zinc-200/90 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_16px_36px_rgba(15,23,42,0.08)]">
      <div className={classNames("relative border-b border-zinc-200/80 px-3 py-3", toneClassName)}>
        <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-zinc-500">
          <span className="inline-flex items-center rounded-full border border-black/5 bg-white/75 px-2 py-1 backdrop-blur">
            Preview
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-black/5 bg-white/75 px-2 py-1 backdrop-blur">
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 10h8" />
              <path d="M11 5l5 5-5 5" />
            </svg>
            Drag or add
          </span>
        </div>
        <div className="mt-3 min-h-24 rounded-[22px] border border-black/5 bg-white/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
          {preview}
        </div>
      </div>
      <div className="px-3 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-zinc-900">{label}</div>
            {description ? <div className="mt-1 text-xs leading-5 text-zinc-500">{description}</div> : null}
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={onAdd}
            className="shrink-0 rounded-xl border border-zinc-200 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            Insert
          </button>
        </div>
      </div>
    </div>
  );
}

function BuilderLibraryChooserButton({
  label,
  detail,
  active,
  preview,
  countLabel,
  onClick,
}: {
  label: string;
  detail?: string;
  active: boolean;
  preview: ReactNode;
  countLabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={classNames(
        "w-full rounded-3xl border p-3 text-left transition-[border-color,background-color,box-shadow,transform] duration-150",
        active
          ? "border-zinc-900 bg-zinc-900 text-white shadow-[0_14px_30px_rgba(15,23,42,0.10)]"
          : "border-zinc-200 bg-white text-zinc-900 shadow-[0_8px_20px_rgba(15,23,42,0.03)] hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={classNames("text-[13px] font-semibold", active ? "text-white" : "text-zinc-900")}>{label}</div>
          {detail ? <div className={classNames("mt-1 text-[11px] leading-5", active ? "text-white/72" : "text-zinc-500")}>{detail}</div> : null}
        </div>
        {countLabel ? (
          <span className={classNames(
            "inline-flex shrink-0 rounded-full border px-2 py-1 text-[10px] font-medium",
            active ? "border-white/15 bg-white/10 text-white/82" : "border-zinc-200 bg-zinc-50 text-zinc-500",
          )}>
            {countLabel}
          </span>
        ) : null}
      </div>
      <div className={classNames(
        "mt-3 overflow-hidden rounded-[20px] border p-3",
        active ? "border-white/12 bg-white/8" : "border-zinc-200 bg-zinc-50",
      )}>
        <div className={classNames("min-h-14", active ? "text-white" : "text-zinc-700")}>{preview}</div>
      </div>
    </button>
  );
}

function BuilderRailNavButton({
  label,
  detail,
  active,
  icon,
  badge,
  disabled,
  spanTwo,
  onClick,
}: {
  label: string;
  detail?: string;
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
      className={classNames(
        "rounded-[20px] border px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow,transform] duration-150",
        spanTwo ? "col-span-2" : "",
        active
          ? "border-zinc-900 bg-zinc-900 text-white shadow-[0_14px_30px_rgba(15,23,42,0.12)]"
          : "border-zinc-200 bg-white text-zinc-900 shadow-[0_8px_20px_rgba(15,23,42,0.03)] hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50",
        disabled ? "opacity-55" : "",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={classNames(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-2xl border",
              active ? "border-white/15 bg-white/10 text-white" : "border-zinc-200 bg-zinc-50 text-zinc-600",
            )}
          >
            <span className="inline-flex h-4 w-4 items-center justify-center">{icon}</span>
          </span>
          <span className="min-w-0">
            <span className={classNames("block text-[13px] font-semibold", active ? "text-white" : "text-zinc-900")}>{label}</span>
            {detail ? <span className={classNames("mt-0.5 block text-[11px] leading-5", active ? "text-white/72" : "text-zinc-500")}>{detail}</span> : null}
          </span>
        </div>
        {badge ? (
          <span className={classNames(
            "inline-flex shrink-0 rounded-full border px-2 py-1 text-[10px] font-medium",
            active ? "border-white/15 bg-white/10 text-white/82" : "border-zinc-200 bg-zinc-50 text-zinc-500",
          )}>
            {badge}
          </span>
        ) : null}
      </div>
    </button>
  );
}

function BuilderStatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "selected" | "anchor" | "nested" | "muted";
}) {
  const toneClassName =
    tone === "selected"
      ? "border-zinc-900 bg-zinc-900 text-white"
      : tone === "anchor"
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : tone === "nested"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-zinc-200 bg-zinc-100 text-zinc-500";

  return <span className={classNames("inline-flex rounded-full border px-2 py-1 text-[10px] font-medium", toneClassName)}>{label}</span>;
}

function BuilderOutlineMiniPreview({ kind, active }: { kind: string; active: boolean }) {
  const panelClassName = active ? "border-white/12 bg-white/8" : "border-zinc-200 bg-zinc-50";
  const strongClassName = active ? "bg-white/78" : "bg-zinc-500";
  const mediumClassName = active ? "bg-white/42" : "bg-zinc-300";
  const softClassName = active ? "border-white/16 bg-white/10" : "border-zinc-200 bg-white";

  return (
    <div className={classNames("flex h-10 w-14 items-center justify-center rounded-[18px] border p-2", panelClassName)}>
      {kind === "Section" ? (
        <div className="flex w-full flex-col gap-1.5">
          <div className={classNames("h-1.5 w-3/4 rounded-full", strongClassName)} />
          <div className={classNames("h-4 w-full rounded-lg border", softClassName)} />
        </div>
      ) : kind === "Columns" ? (
        <div className="grid w-full grid-cols-2 gap-1">
          <div className={classNames("h-6 rounded-md border", softClassName)} />
          <div className={classNames("h-6 rounded-md border", softClassName)} />
        </div>
      ) : kind === "Header" ? (
        <div className="flex w-full flex-col gap-1.5">
          <div className="flex items-center justify-between gap-1">
            <div className={classNames("h-2 w-2.5 rounded", strongClassName)} />
            <div className="flex gap-1">
              <div className={classNames("h-1.5 w-2 rounded-full", mediumClassName)} />
              <div className={classNames("h-1.5 w-2 rounded-full", mediumClassName)} />
              <div className={classNames("h-1.5 w-2 rounded-full", mediumClassName)} />
            </div>
          </div>
          <div className={classNames("h-1 w-2/3 rounded-full", mediumClassName)} />
        </div>
      ) : kind === "Button" || kind === "Commerce" ? (
        <div className={classNames("h-5 w-full rounded-full", strongClassName)} />
      ) : kind === "Form" || kind === "Form link" ? (
        <div className="flex w-full flex-col gap-1">
          <div className={classNames("h-1.5 w-3/4 rounded-full", mediumClassName)} />
          <div className={classNames("h-3.5 rounded-md border", softClassName)} />
          <div className={classNames("h-3.5 rounded-md border", softClassName)} />
        </div>
      ) : kind === "Image" || kind === "Video" ? (
        <div className={classNames("flex h-full w-full items-center justify-center rounded-lg border", softClassName)}>
          <div className={classNames("h-2.5 w-2.5 rounded-full", kind === "Video" ? strongClassName : mediumClassName)} />
        </div>
      ) : kind === "Code" ? (
        <div className="flex items-center gap-1">
          <div className={classNames("h-4 w-1 rounded-full", mediumClassName)} />
          <div className={classNames("h-5 w-4 rounded-md border", softClassName)} />
          <div className={classNames("h-4 w-1 rounded-full", mediumClassName)} />
        </div>
      ) : kind === "Chatbot" ? (
        <div className="flex w-full flex-col gap-1">
          <div className={classNames("h-3 w-7 rounded-lg rounded-tl-none", mediumClassName)} />
          <div className={classNames("h-3 w-6 self-end rounded-lg rounded-tr-none", strongClassName)} />
        </div>
      ) : kind === "Spacer" ? (
        <div className={classNames("h-1 w-full rounded-full", mediumClassName)} />
      ) : (
        <div className="flex w-full flex-col gap-1.5">
          <div className={classNames("h-1.5 w-4/5 rounded-full", strongClassName)} />
          <div className={classNames("h-1.5 w-3/5 rounded-full", mediumClassName)} />
          <div className={classNames("h-1.5 w-full rounded-full", mediumClassName)} />
        </div>
      )}
    </div>
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

function diffPreviewLines(lines: string[], limit = 3) {
  return lines
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .slice(0, limit);
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

function ChangeCountPill({
  value,
  prefix,
  tone,
}: {
  value: number;
  prefix: "+" | "-";
  tone: "added" | "removed";
}) {
  const toneClassName =
    tone === "added"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-rose-200 bg-rose-50 text-rose-700";

  return (
    <span className={classNames("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold", toneClassName)}>
      {prefix}
      {value}
    </span>
  );
}

function HtmlChangeTimeline({ items }: { items: HtmlChangeActivityItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-[28px] border border-zinc-200/80 bg-white/88 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur">
        <div className="text-sm font-semibold text-zinc-900">Recent AI changes</div>
        <p className="mt-2 text-sm text-zinc-500">The next whole-page AI update will show exactly what moved in the hosted source.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-zinc-200/80 bg-white/88 shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur">
      <div className="border-b border-zinc-200/80 px-4 py-3">
        <div className="text-sm font-semibold text-zinc-900">Recent AI changes</div>
        <div className="mt-1 text-xs text-zinc-500">Hosted source mutations with timestamps and line deltas.</div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-4 py-4">
        <div className="space-y-4">
          {items.map((item, index) => {
            const showSnippet = index === 0 && (item.diff.addedPreview.length > 0 || item.diff.removedPreview.length > 0);
            const previewStatus = item.previewChanged ? "Preview updated" : "Preview unchanged";

            return (
              <div key={item.id} className="relative pl-6">
                <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-zinc-900" />
                {index < items.length - 1 ? <span className="absolute -bottom-4.5 left-1 top-4 w-px bg-zinc-200" /> : null}

                <div className="rounded-2xl border border-zinc-200/80 bg-white/86 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                        <span>{item.scopeLabel}</span>
                        <span className="h-1 w-1 rounded-full bg-zinc-300" />
                        <span>{item.kind === "restore" ? "Restore" : item.kind === "no-change" ? "No source change" : "Applied"}</span>
                      </div>
                      <div className="mt-1 text-sm font-semibold text-zinc-900">{item.summary}</div>
                    </div>
                    <div className="shrink-0 text-[11px] font-medium text-zinc-500">{formatActivityTimestamp(item.at)}</div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <ChangeCountPill value={item.diff.addedLines} prefix="+" tone="added" />
                    <ChangeCountPill value={item.diff.removedLines} prefix="-" tone="removed" />
                    <span
                      className={classNames(
                        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                        item.previewChanged
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700",
                      )}
                    >
                      {previewStatus}
                    </span>
                    {item.diff.currentStartLine && item.diff.currentEndLine ? (
                      <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-600">
                        Source lines {item.diff.currentStartLine}
                        {item.diff.currentEndLine > item.diff.currentStartLine ? `-${item.diff.currentEndLine}` : ""}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                    <span className="font-semibold text-zinc-700">Prompt:</span> {item.prompt}
                  </div>

                  {showSnippet ? (
                    <div className="mt-3 space-y-2">
                      {item.diff.addedPreview.length ? (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Added</div>
                          <div className="mt-2 space-y-1 font-mono text-[11px] leading-5 text-emerald-900">
                            {item.diff.addedPreview.map((line, snippetIndex) => (
                              <div key={`add-${item.id}-${snippetIndex}`} className="truncate">+ {line}</div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {item.diff.removedPreview.length ? (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-700">Removed</div>
                          <div className="mt-2 space-y-1 font-mono text-[11px] leading-5 text-rose-900">
                            {item.diff.removedPreview.map((line, snippetIndex) => (
                              <div key={`remove-${item.id}-${snippetIndex}`} className="truncate">- {line}</div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CodeSurface({
  value,
  onChange,
  onCopy,
  placeholder,
  readOnly = false,
  lineHighlightRange,
}: {
  value: string;
  onChange?: (next: string) => void;
  onCopy?: () => void;
  placeholder?: string;
  readOnly?: boolean;
  lineHighlightRange?: { startLine: number; endLine: number } | null;
}) {
  const code = String(value || "");
  const lines = splitCodeLines(code || placeholder || "");
  const contentHeightPx = Math.max(lines.length + 2, 30) * 24;
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!lineHighlightRange?.startLine || !scrollRef.current) return;
    const targetTop = Math.max((lineHighlightRange.startLine - 4) * 24, 0);
    scrollRef.current.scrollTo({ top: targetTop, behavior: "smooth" });
  }, [lineHighlightRange?.endLine, lineHighlightRange?.startLine]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-[0_18px_40px_rgba(15,23,42,0.22)]">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">HTML</div>
          <div className="mt-1 text-xs text-zinc-500">Hosted page source</div>
        </div>
        <div className="flex items-center gap-2">
          {onCopy ? (
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-600 hover:text-white"
              title="Copy HTML"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          ) : null}

          <div className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-300">
            {lines.length} lines
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto">
        <div className="grid min-w-full grid-cols-[auto_minmax(0,1fr)] font-mono text-[12px] leading-6" style={{ minHeight: contentHeightPx }}>
          <div className="select-none border-r border-zinc-800 bg-zinc-900/80 px-3 py-3 text-right text-zinc-500">
            {lines.map((_, index) => (
              <div
                key={index}
                className={classNames(
                  "rounded-md px-2 transition-colors",
                  lineHighlightRange && index + 1 >= lineHighlightRange.startLine && index + 1 <= lineHighlightRange.endLine
                    ? "bg-emerald-500/18 text-emerald-200"
                    : "",
                )}
              >
                {index + 1}
              </div>
            ))}
          </div>

          {readOnly ? (
            <pre className="min-w-0 overflow-x-auto px-4 py-3 text-zinc-100">{code || placeholder || ""}</pre>
          ) : (
            <textarea
              value={code}
              onChange={(e) => onChange?.(e.target.value)}
              wrap="off"
              spellCheck={false}
              style={{ height: contentHeightPx }}
              className="min-w-0 resize-none overflow-hidden bg-transparent px-4 py-3 text-zinc-100 outline-none placeholder:text-zinc-500"
              placeholder={placeholder}
            />
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
      <div
        className={classNames(
          previewDevice === "mobile"
            ? "h-full overflow-hidden rounded-4xl border border-zinc-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.92)_0%,rgba(248,250,252,0.88)_100%)] p-3 shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur"
            : "rounded-[30px] bg-white/88 shadow-[0_18px_40px_rgba(15,23,42,0.06)] ring-1 ring-zinc-200/70 backdrop-blur",
        )}
      >
        {previewDevice === "mobile" ? <div className="mx-auto mb-3 h-1.5 w-24 rounded-full bg-zinc-300" /> : null}
        <div className={classNames(previewDevice === "mobile" ? "h-full overflow-hidden rounded-[28px] bg-white" : "h-[82vh] overflow-hidden rounded-[30px] bg-white") }>
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
}) {
  const canSubmit = !busy && value.trim().length > 0;

  return (
    <div className={classNames("flex items-center gap-2 border-b border-zinc-300/75 px-1 py-1 text-zinc-900 transition-colors focus-within:border-zinc-500", className)}>
      <AiSparkIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canSubmit) {
            e.preventDefault();
            onSubmit();
          }
        }}
        className="h-10 min-w-0 flex-1 bg-transparent px-1 py-2 text-[14px] tracking-[-0.01em] text-zinc-900 outline-none placeholder:text-zinc-400"
        placeholder={placeholder}
      />

      {busy ? <span className="hidden shrink-0 text-[11px] font-medium tracking-[0.01em] text-zinc-500 sm:inline">{busyLabel}</span> : null}

      <button
        type="button"
        disabled={busy}
        onClick={onAttach}
        className={classNames(
          "relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-zinc-700 disabled:opacity-60",
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
          "group inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-all duration-100 hover:scale-105 hover:text-zinc-900 disabled:opacity-50",
          canSubmit ? "" : "pointer-events-none text-zinc-300",
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

type Funnel = {
  id: string;
  slug: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
  assignedDomain?: string | null;
  seo?: FunnelSeo | null;
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

function chatDisplayContent(m: { role: "user" | "assistant"; content: string }) {
  const raw = typeof m.content === "string" ? m.content : String(m.content ?? "");
  if (m.role !== "assistant") return raw;

  const t = raw.trim();
  const looksLikeHtml =
    t.startsWith("<") &&
    (t.toLowerCase().includes("<!doctype") ||
      t.toLowerCase().includes("<html") ||
      t.toLowerCase().includes("<div") ||
      t.toLowerCase().includes("</"));
  if (looksLikeHtml) return "(HTML output hidden. See the HTML editor pane.)";

  const looksLikeCodeFence =
    t.startsWith("```") && (t.includes("```html") || t.includes("```css") || t.includes("```json"));
  if (looksLikeCodeFence) return "(Code output hidden. Use the editor fields.)";

  return raw;
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

function buildLayoutBlocksFromCustomHtml(rawHtml: string) {
  const { html, css } = splitCustomHtmlForLayoutImport(rawHtml);
  const importedBlockId = createImportedLayoutBlockId("imported-html");

  const blocks: CreditFunnelBlock[] = [
    {
      id: importedBlockId,
      type: "customCode",
      props: {
        html,
        ...(css ? { css } : {}),
        heightPx: estimateImportedLayoutHeightPx(html),
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

function AlignPicker({
  value,
  onChange,
}: {
  value: "left" | "center" | "right" | undefined;
  onChange: (next: "left" | "center" | "right" | undefined) => void;
}) {
  const options: Array<{ v: "left" | "center" | "right"; label: string }> = [
    { v: "left", label: "Left" },
    { v: "center", label: "Center" },
    { v: "right", label: "Right" },
  ];

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Align</div>
      <div className="flex gap-2">
        {options.map(({ v, label }) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(value === v ? undefined : v)}
            className={classNames(
              "flex-1 rounded-xl border px-3 py-2 text-sm font-semibold",
              value === v
                ? "border-(--color-brand-blue) bg-blue-50 text-zinc-900"
                : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
            )}
            aria-pressed={value === v}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
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

function MaxWidthPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (next: number | undefined) => void;
}) {
  const options: Array<{ label: string; px?: number }> = [
    { label: "Auto", px: undefined },
    { label: "1100", px: 1100 },
    { label: "960", px: 960 },
    { label: "800", px: 800 },
    { label: "640", px: 640 },
    { label: "480", px: 480 },
    { label: "360", px: 360 },
  ];
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="grid grid-cols-4 gap-2">
        {options.map((o) => (
          <button
            key={o.label}
            type="button"
            onClick={() => onChange(o.px)}
            className={classNames(
              "rounded-xl border px-3 py-2 text-xs font-semibold",
              (value ?? undefined) === (o.px ?? undefined)
                ? "border-(--color-brand-blue) bg-blue-50 text-zinc-900"
                : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-2 flex-1 rounded-full bg-zinc-100">
          <div
            className="h-2 rounded-full bg-(--color-brand-blue)"
            style={{
              width:
                typeof value === "number" && value > 0
                  ? `${Math.max(10, Math.min(100, Math.round((value / 1400) * 100)))}%`
                  : "100%",
              opacity: typeof value === "number" && value > 0 ? 1 : 0.3,
            }}
          />
        </div>
        <input
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value) || 0)}
          className="w-28 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
          placeholder="Auto"
        />
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
  | { type: "create-page"; slug: string; title: string }
  | { type: "create-form"; slug: string; name: string; templateKey: CreditFormTemplateKey; themeKey: CreditFormThemeKey }
  | { type: "leave-page"; nextPageId: string | null }
  | { type: "delete-page" }
  | null;

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
            <div className="flex min-h-screen flex-col lg:h-[100dvh] lg:overflow-hidden">
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
                          ? "border-[color:var(--color-brand-blue)] bg-blue-50 text-blue-800"
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
                        "bg-linear-to-r from-[color:var(--color-brand-blue)] via-violet-500 to-[color:var(--color-brand-pink)] hover:opacity-90 shadow-sm",
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
                      className="min-w-[220px]"
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
                <aside className="w-full shrink-0 border-b border-zinc-200 bg-white p-4 lg:min-h-0 lg:w-[380px] lg:overflow-y-auto lg:border-b-0 lg:border-r">
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
                                className="min-h-[120px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
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
                                        stripeProductsBusy ? "bg-zinc-400" : "bg-[color:var(--color-brand-blue)] hover:bg-blue-700",
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

                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => removeBlock(selectedBlock.id)}
                              className="w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                            >
                              Remove block
                            </button>
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
                          <div className="text-sm text-zinc-600">Ask for a layout and CTAs. Then follow up with edits like “change the font”.</div>
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
                                context: { funnelPageId: selectedPage?.id || "", previewDevice },
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
                                          context: { funnelPageId: selectedPage?.id || "", previewDevice },
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
  createdAt: string;
  updatedAt: string;
};

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

export function FunnelEditorClient({ basePath, funnelId }: { basePath: string; funnelId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const initialPageIdFromUrlRef = useRef<string | null>(null);
  const initialPageSelectionConsumedRef = useRef(false);
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
  const [customCodeBlockPrompt, setCustomCodeBlockPrompt] = useState("");
  const [customCodeBlockBusy, setCustomCodeBlockBusy] = useState(false);
  const [aiSidebarCustomCodePrompt, setAiSidebarCustomCodePrompt] = useState("");
  const [aiSidebarCustomCodeBusy, setAiSidebarCustomCodeBusy] = useState(false);
  const [aiSidebarCustomCodeBlockId, setAiSidebarCustomCodeBlockId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savingPage, setSavingPage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [seoDirty, setSeoDirty] = useState(false);
  const [seoBusy, setSeoBusy] = useState(false);
  const [seoError, setSeoError] = useState<string | null>(null);

  const [uploadingImageBlockId, setUploadingImageBlockId] = useState<string | null>(null);
  const [uploadingHeaderLogoBlockId, setUploadingHeaderLogoBlockId] = useState<string | null>(null);

  const [aiContextOpen, setAiContextOpen] = useState(false);
  const [aiContextKeys, setAiContextKeys] = useState<string[]>([]);
  void setAiContextKeys; // kept for API compatibility
  const [aiContextMedia, setAiContextMedia] = useState<Array<{ url: string; fileName?: string; mimeType?: string }>>([]);
  const [aiContextUploadBusy, setAiContextUploadBusy] = useState(false);
  const [lastAiRun, setLastAiRun] = useState<null | {
    pageId: string;
    prompt: string;
    summary: string;
    warnings: string[];
    at: string;
    previousPage: Pick<Page, "editorMode" | "blocksJson" | "customHtml" | "draftHtml" | "customChatJson">;
  }>(null);
  const aiContextUploadInputRef = useRef<HTMLInputElement | null>(null);

  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [previewMode, setPreviewMode] = useState<"edit" | "preview">("edit");
  const [builderSurfaceMode, setBuilderSurfaceMode] = useState<BuilderSurfaceMode>("blocks");
  const [customCodeStageMode, setCustomCodeStageMode] = useState<"preview" | "source">("preview");
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
  const [sidebarPanel, setSidebarPanel] = useState<
    "structure" | "presets" | "text" | "layout" | "forms" | "media" | "header" | "shop" | "ai" | "page" | "selected"
  >("structure");

  const [dialog, setDialog] = useState<FunnelEditorDialog>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const portalVariant: PortalVariant = basePath === "/credit" ? "credit" : "portal";
  // hostedBasePath is the public-facing URL prefix used in generated block embed URLs
  // (formEmbed, calendarEmbed). Different from basePath which is the portal nav path.
  const hostedBasePath = portalVariant === "credit" ? "/credit" : "";
  const builderLibraryPanels = ["presets", "text", "layout", "forms", "media", "header", "shop"] as const;
  const builderLibrarySet = new Set<string>(builderLibraryPanels);
  const builderLibraryPanel = builderLibrarySet.has(sidebarPanel) ? sidebarPanel : "presets";
  const builderTopLevelPanel =
    sidebarPanel === "structure" || sidebarPanel === "ai" || sidebarPanel === "page" || sidebarPanel === "selected"
      ? sidebarPanel
      : "add";

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
  const selectedPageEditorMode = selectedPage?.editorMode ?? null;
  const selectedPageSupportsBlocksSurface = useMemo(() => {
    if (!selectedPage) return false;
    return selectedPage.editorMode === "BLOCKS";
  }, [selectedPage]);

  useEffect(() => {
    if (!selectedPageId || !selectedPageEditorMode) {
      setBuilderSurfaceMode("blocks");
      setCustomCodeStageMode("preview");
      setSelectedHtmlRegionKey(null);
      setWholePageSyncNotice(null);
      return;
    }

    setBuilderSurfaceMode(selectedPageEditorMode === "CUSTOM_HTML" ? "whole-page" : "blocks");
    setCustomCodeStageMode("preview");
    setSelectedHtmlRegionKey(null);
    setWholePageSyncNotice(null);
  }, [selectedPageEditorMode, selectedPageId]);

  const selectedPageHtmlChangeActivity = useMemo(() => {
    if (!selectedPage?.id) return [] as HtmlChangeActivityItem[];
    return htmlChangeActivity.filter((item) => item.pageId === selectedPage.id).slice(0, 8);
  }, [htmlChangeActivity, selectedPage?.id]);
  const selectedPageIndex = useMemo(() => {
    if (!pages || !selectedPageId) return -1;
    return pages.findIndex((page) => page.id === selectedPageId);
  }, [pages, selectedPageId]);
  const selectedPageIsEntryPage = selectedPageIndex === 0;

  const latestSelectedPageHtmlChange = selectedPageHtmlChangeActivity[0] || null;

  const latestSourceHighlightRange = useMemo(() => {
    if (!latestSelectedPageHtmlChange?.diff.changed) return null;
    const startLine = latestSelectedPageHtmlChange.diff.currentStartLine;
    const endLine = latestSelectedPageHtmlChange.diff.currentEndLine;
    if (!startLine || !endLine) return null;
    return { startLine, endLine };
  }, [latestSelectedPageHtmlChange]);

  const showInlineHtmlChangeReceipt = customCodeStageMode === "source" && Boolean(latestSelectedPageHtmlChange);

  const appendHtmlChangeActivity = useCallback((item: HtmlChangeActivityItem) => {
    setHtmlChangeActivity((prev) => [item, ...prev].slice(0, 24));
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

  useEffect(() => {
    setCustomCodeBlockPrompt("");
  }, [selectedBlockId]);

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
        const next = {
          primary: isHexColor(primary) ? primary : undefined,
          accent: isHexColor(accent) ? accent : undefined,
          text: isHexColor(text) ? text : undefined,
        };
        if (!cancelled) setBrandPalette(next.primary || next.accent || next.text ? next : null);
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

  const BUSY_PHASES = ["Reviewing page", "Writing update", "Finishing"];
  const busyPhasesLen = BUSY_PHASES.length;
  useEffect(() => {
    if (!busy) { setBusyPhaseIdx(0); return; }
    const id = setInterval(() => setBusyPhaseIdx((prev) => Math.min(prev + 1, busyPhasesLen - 1)), 4000);
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
      ? (selectedPage.customChatJson as ChatMessage[])
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

  const selectedPageFlowOutlineItem = useMemo(
    () => blockOutlineItems.find((item) => item.id === selectedPageFlowAnchorId) || null,
    [blockOutlineItems, selectedPageFlowAnchorId],
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
  const wholePageModeActive = Boolean(
    selectedPage && !blocksSurfaceActive && (selectedPage.editorMode === "CUSTOM_HTML" || builderSurfaceMode === "whole-page"),
  );
  const wholePageSourceEditable = Boolean(selectedPage?.editorMode === "CUSTOM_HTML" && !blocksSurfaceActive);
  const saveStatusLabel = (() => {
    if (!selectedPage) return null;
    if (selectedPageDirty) return wholePageSourceEditable ? "Unsaved draft" : "Unsaved";
    return formatSavedAtLabel((selectedPage as any).updatedAt) || (wholePageSourceEditable ? "Draft saved" : "Saved");
  })();
  const wholePageDrawerLabel = wholePageSourceEditable ? "Code editor" : "Code view";
  const wholePageDrawerSummary = wholePageSourceEditable
    ? "Edit the page source directly."
    : "Inspect the current page source without leaving the editor.";
  const workspaceSummary = wholePageSourceEditable
    ? "Preview shows the page. Source lets you edit it directly."
    : "Preview shows the current page. Source shows the latest saved output.";
  const currentPageSourceHtml = useMemo(() => {
    if (!selectedPage) return "";
    if (selectedPage.editorMode === "CUSTOM_HTML") return storedPageSourceHtml;
    if (generatedBlockWholePageHtml) return generatedBlockWholePageHtml;
    if (!selectedPageDirty) return storedPageSourceHtml;
    return "";
  }, [generatedBlockWholePageHtml, selectedPage, selectedPageDirty, storedPageSourceHtml]);
  const editorPreviewHtml = useMemo(() => buildEditorPreviewHtml(currentPageSourceHtml), [currentPageSourceHtml]);
  const wholePageStatusMessage = useMemo(() => {
    if (!wholePageModeActive) return wholePageSyncNotice;
    if (!selectedPage || !selectedPageSupportsBlocksSurface) return wholePageSyncNotice;
    if (!currentPageSourceHtml) {
      return "You are seeing the current page preview. Save the page when you want the code view refreshed too.";
    }
    if (!generatedBlockWholePageHtml) {
      return "Preview is up to date. Code is showing the latest saved page version until you save again.";
    }
    return wholePageSyncNotice;
  }, [currentPageSourceHtml, generatedBlockWholePageHtml, selectedPage, selectedPageSupportsBlocksSurface, wholePageModeActive, wholePageSyncNotice]);
  const wholePageSyncMeta = useMemo(() => {
    if (!selectedPage || !wholePageModeActive) return null;

    if (wholePageSourceEditable) {
      return selectedPageDirty ? "Draft has unsaved edits" : formatSavedAtLabel((selectedPage as any).updatedAt) || "Draft saved";
    }

    if (selectedPageDirty) return "Save to refresh this full-page snapshot";
    return formatSavedAtLabel((selectedPage as any).updatedAt) || "Snapshot is current";
  }, [selectedPage, wholePageModeActive, wholePageSourceEditable, selectedPageDirty]);

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
    if (selectedPage?.editorMode !== "CUSTOM_HTML" || customCodeStageMode === "source") {
      setHtmlScopePickerOpen(false);
    }
  }, [customCodeStageMode, selectedPage?.editorMode]);

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

    setFunnel(fJson.funnel as Funnel);
    const nextPages = Array.isArray(pJson.pages) ? (pJson.pages as Page[]) : [];
    setPages(nextPages);
    setDirtyPageIds({});
    const preferredFromUrl = (() => {
      if (initialPageSelectionConsumedRef.current) return null;
      const pid = initialPageIdFromUrlRef.current;
      if (!pid) return null;
      return nextPages.some((p) => String((p as any)?.id || "").trim() === pid) ? pid : null;
    })();
    setSelectedPageId((prev) => {
      const current = prev && nextPages.some((p) => p.id === prev) ? prev : null;
      const nextSelected = current || preferredFromUrl || nextPages[0]?.id || null;
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
        >
      >,
    ) => {
      if (!selectedPage) return false;
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
    setDialogError(null);
    setDialog({ type: "create-page", slug: "", title: "" });
  };

  const performCreatePage = async ({ slug, title }: { slug: string; title: string }) => {
    const normalizedSlug = normalizeSlug(slug);
    if (!normalizedSlug) {
      setDialogError("Slug is required.");
      return;
    }

    const trimmedTitle = title.trim();
    setBusy(true);
    setError(null);
    setDialogError(null);
    try {
      const res = await fetch(`/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: normalizedSlug, title: trimmedTitle || undefined, contentMarkdown: "" }),
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
    const { blocks: importedBlocks, importedBlockId } = buildLayoutBlocksFromCustomHtml(currentHtml);

    setBusy(true);
    setError(null);
    setCustomCodeStageMode("preview");
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
        throw new Error(json?.error || "Failed to convert this page into Layout");
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

      setBuilderSurfaceMode("blocks");
      setSelectedBlockId(importedBlockId);
      setSidebarPanel("selected");
      toast.success("Converted to Layout");
    } catch (e) {
      const message = (e as any)?.message ? String((e as any).message) : "Failed to convert this page into Layout";
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
      setCustomCodeStageMode("preview");
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
    if (mode === "blocks" && selectedPage.editorMode === "CUSTOM_HTML") {
      void convertCurrentPageToBlocks();
      return;
    }
    if (mode === "blocks" && !selectedPageSupportsBlocksSurface) return;

    setBuilderSurfaceMode(mode);
    setCustomCodeStageMode("preview");
    setCustomCodeContextOpen(false);
    setSelectedHtmlRegionKey(null);
    setWholePageSyncNotice(null);

    if (mode === "whole-page") {
      setSelectedBlockId(null);
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
      sidebarPanel?: "presets" | "text" | "layout" | "forms" | "media" | "header" | "shop" | "ai" | "page" | "selected";
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
      sidebarPanel?: "presets" | "text" | "layout" | "forms" | "media" | "header" | "shop" | "ai" | "page" | "selected";
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

  const updateSelectedBlockStyle = (patch: Partial<BlockStyle>) => {
    if (!selectedBlock) return;
    upsertBlock({
      ...selectedBlock,
      props: {
        ...(selectedBlock as any).props,
        style: applyStylePatch(((selectedBlock as any).props as any)?.style, patch),
      } as any,
    } as any);
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

  const runAi = async () => {
    if (!selectedPage) return;
    const promptText = chatInput.trim();
    if (!promptText) return;
    const previousPage = {
      editorMode: selectedPage.editorMode,
      blocksJson: selectedPage.blocksJson,
      customHtml: selectedPage.customHtml,
      draftHtml: selectedPage.draftHtml,
      customChatJson: selectedPage.customChatJson,
    };
    setBusy(true);
    setError(null);
    try {
      if (blocksSurfaceActive) {
        const existingBlock =
          selectedBlock && selectedBlock.type === "customCode"
            ? selectedBlock
            : aiSidebarCustomCodeBlockId
              ? findBlockInTree(editableBlocks, aiSidebarCustomCodeBlockId)?.block ?? null
              : null;
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
            contextMedia: aiContextMedia,
          }),
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to generate builder content");

        const prevChat =
          existingBlock && existingBlock.type === "customCode" && Array.isArray((existingBlock.props as any).chatJson)
            ? ((existingBlock.props as any).chatJson as BlockChatMessage[])
            : [];

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

        const question = typeof json?.question === "string" ? String(json.question).trim() : "";
        if (question) {
          const assistantMsg: BlockChatMessage = { role: "assistant", content: question, at: new Date().toISOString() };
          const nextChat = [...prevChat, userMsg, assistantMsg].slice(-40);
          const customCodeId = existingBlock && existingBlock.type === "customCode" ? existingBlock.id : newId();
          const nextEditable =
            existingBlock && existingBlock.type === "customCode"
              ? replaceBlockInTree(
                  editableBlocks,
                  {
                    ...existingBlock,
                    props: {
                      ...(existingBlock.props as any),
                      chatJson: nextChat,
                    },
                  } as any,
                )
              : insertCustomCodeBlock({
                  id: customCodeId,
                  type: "customCode",
                  props: { html: "", css: "", heightPx: 360, chatJson: nextChat } as any,
                } as any);
          const nextBlocksJson = pageSettingsBlock ? [pageSettingsBlock, ...nextEditable] : nextEditable;

          setSelectedPageLocal({ editorMode: "BLOCKS", blocksJson: nextBlocksJson });
          setAiSidebarCustomCodeBlockId(customCodeId);
          setSelectedBlockId(customCodeId);
          setSidebarPanel("selected");
          setChatInput("");
          setLastAiRun(null);
          setAiWorkFocus(null);
          await savePage({ editorMode: "BLOCKS", blocksJson: nextBlocksJson });
          return;
        }

        const actions = Array.isArray(json?.actions) ? (json.actions as any[]) : [];
        if (actions.length) {
          const assistantText = typeof json?.assistantText === "string" ? String(json.assistantText).trim() : "";
          const assistantMsg: BlockChatMessage | null = assistantText
            ? { role: "assistant", content: assistantText, at: new Date().toISOString() }
            : null;
          const nextChat = [...prevChat, userMsg, ...(assistantMsg ? [assistantMsg] : [])].slice(-40);

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

          const customCodeId = existingBlock && existingBlock.type === "customCode" ? existingBlock.id : newId();
          const updatedCustomCodeBlock: CreditFunnelBlock =
            existingBlock && existingBlock.type === "customCode"
              ? ({
                  ...existingBlock,
                  props: {
                    ...(existingBlock.props as any),
                    chatJson: nextChat,
                  },
                } as any)
              : ({
                  id: customCodeId,
                  type: "customCode",
                  props: { html: "", css: "", heightPx: 360, chatJson: nextChat } as any,
                } as any);

          let nextEditable =
            existingBlock && existingBlock.type === "customCode"
              ? replaceBlockInTree(editableBlocks, updatedCustomCodeBlock)
              : insertCustomCodeBlock(updatedCustomCodeBlock);

          let anchorId = customCodeId;
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

          const nextBlocksJson = pageSettingsBlock ? [pageSettingsBlock, ...nextEditable] : nextEditable;
          const summaryText =
            assistantText ||
            (insertedIds.length
              ? `Added ${insertedIds.length} builder block${insertedIds.length === 1 ? "" : "s"}.`
              : "Updated the builder with AI.");

          setSelectedPageLocal({ editorMode: "BLOCKS", blocksJson: nextBlocksJson });
          setAiSidebarCustomCodeBlockId(customCodeId);
          setChatInput("");
          setLastAiRun({
            pageId: selectedPage.id,
            prompt: promptText,
            summary: summaryText,
            warnings: [],
            at: new Date().toISOString(),
            previousPage,
          });
          setAiResultBanner({ summary: summaryText, at: new Date().toISOString(), tone: "success" });
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
          } else {
            setSelectedBlockId(customCodeId);
            setSidebarPanel("selected");
          }

          await savePage({ editorMode: "BLOCKS", blocksJson: nextBlocksJson });
          return;
        }

        const nextHtml = typeof json.html === "string" ? json.html : "";
        const nextCss = typeof json.css === "string" ? json.css : "";
        const assistantText = typeof json?.assistantText === "string" ? String(json.assistantText).trim() : "";
        const assistantMsg: BlockChatMessage | null = assistantText
          ? { role: "assistant", content: assistantText, at: new Date().toISOString() }
          : null;
        const nextChat = [...prevChat, userMsg, ...(assistantMsg ? [assistantMsg] : [])].slice(-40);

        const customCodeId = existingBlock && existingBlock.type === "customCode" ? existingBlock.id : newId();
        const nextEditable =
          existingBlock && existingBlock.type === "customCode"
            ? replaceBlockInTree(
                editableBlocks,
                {
                  ...existingBlock,
                  props: {
                    ...(existingBlock.props as any),
                    html: nextHtml,
                    css: nextCss,
                    chatJson: nextChat,
                  },
                } as any,
              )
            : insertCustomCodeBlock({
                id: customCodeId,
                type: "customCode",
                props: { html: nextHtml, css: nextCss, heightPx: 360, chatJson: nextChat } as any,
              } as any);
        const nextBlocksJson = pageSettingsBlock ? [pageSettingsBlock, ...nextEditable] : nextEditable;
        const summaryText = assistantText || "Updated a custom code block in the builder.";

        setSelectedPageLocal({ editorMode: "BLOCKS", blocksJson: nextBlocksJson });
        setAiSidebarCustomCodeBlockId(customCodeId);
        setSelectedBlockId(customCodeId);
        setSidebarPanel("selected");
        setChatInput("");
        setLastAiRun({
          pageId: selectedPage.id,
          prompt: promptText,
          summary: summaryText,
          warnings: [],
          at: new Date().toISOString(),
          previousPage,
        });
        setAiResultBanner({ summary: summaryText, at: new Date().toISOString(), tone: "success" });
        setAiWorkFocus({
          mode: "builder",
          label: `Updated ${describeBuilderAiTarget(builderFocusBlock ?? null)}`,
          phase: "settled",
          regionKey: null,
          blockId: customCodeId,
        });
        await savePage({ editorMode: "BLOCKS", blocksJson: nextBlocksJson });
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
            contextMedia: aiContextMedia,
          }),
        },
      );
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to generate HTML");

      setChatInput("");
      const aiResult = json.aiResult && typeof json.aiResult === "object" ? json.aiResult : null;
      const page = json.page as Partial<Page> | undefined;
      if (!json.question) {
        const nextHtml = getFunnelPageCurrentHtml(page);
        const diff = summarizeHtmlDiff(getFunnelPageCurrentHtml(previousPage), nextHtml);
        const runAt = typeof aiResult?.at === "string" && aiResult.at.trim() ? aiResult.at : new Date().toISOString();
        const htmlChanged = diff.changed;
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
          prompt: promptText,
          summary: summaryText,
          warnings: [...warnings, ...(htmlChanged ? [] : ["No hosted source lines changed in this run."])].slice(0, 4),
          at: runAt,
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
        pushUndoSnapshot("ai-result", 0);
        setPages((prev) => (prev || []).map((p) => (p.id === page.id ? ({ ...p, ...page } as Page) : p)));
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

  const [publishingPage, setPublishingPage] = useState(false);
  const publishPage = async () => {
    if (!selectedPage || selectedPage.editorMode !== "CUSTOM_HTML") return;
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
        open={dialog?.type === "create-page"}
        title="Create page"
        description="Add a new page to this funnel."
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
                void performCreatePage({ slug: dialog.slug, title: dialog.title });
              }}
            >
              Create
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Slug</div>
            <input
              autoFocus
              value={dialog?.type === "create-page" ? dialog.slug : ""}
              onChange={(e) => {
                const v = e.target.value;
                setDialogError(null);
                setDialog((prev) => (prev?.type === "create-page" ? { ...prev, slug: v } : prev));
              }}
              placeholder="landing"
              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
            />
            <div className="mt-1 text-xs text-zinc-500">Allowed: letters, numbers, and dashes.</div>
          </label>

          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Title (optional)</div>
            <input
              value={dialog?.type === "create-page" ? dialog.title : ""}
              onChange={(e) => {
                const v = e.target.value;
                setDialogError(null);
                setDialog((prev) => (prev?.type === "create-page" ? { ...prev, title: v } : prev));
              }}
              placeholder="Landing page"
              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
            />
          </label>

          {dialogError ? <div className="text-sm font-semibold text-red-700">{dialogError}</div> : null}
        </div>
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
        title="Attach images to AI"
        description="Images you attach here will be passed to the AI so it can reference or embed them in the generated page."
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
              No images attached. Upload or pick from your media library.
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

            {selectedPage ? (
              <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-1">
                <button
                  type="button"
                  disabled={busy || !selectedPage || selectedPage.editorMode === "MARKDOWN"}
                  onClick={() => {
                    if (selectedPage.editorMode === "CUSTOM_HTML") {
                      void convertCurrentPageToBlocks();
                      return;
                    }
                    setBuilderMode("blocks");
                  }}
                  className={classNames(
                    "rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60",
                    blocksSurfaceActive
                      ? "bg-brand-ink text-white"
                      : "text-zinc-700 hover:bg-zinc-50",
                  )}
                  title={
                    selectedPage.editorMode === "CUSTOM_HTML"
                      ? "Convert this page into Layout. The current source will be imported into a draggable HTML block so you can add sections around it."
                      : selectedPageSupportsBlocksSurface
                        ? "Work visually with sections, text, buttons, forms, and page structure"
                        : "Layout tools are unavailable for this page"
                  }
                >
                  Layout
                </button>
                <button
                  type="button"
                  disabled={busy || !selectedPage}
                  onClick={() => setBuilderMode("whole-page")}
                  className={classNames(
                    "rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60",
                    wholePageModeActive
                      ? "bg-brand-ink text-white"
                      : "text-zinc-700 hover:bg-zinc-50",
                  )}
                  title={selectedPage.editorMode === "BLOCKS" ? "See the current full-page code output for this layout" : "Edit the current page code directly"}
                >
                  Code
                </button>
              </div>
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
          "lg:grid lg:grid-cols-[320px_minmax(0,1fr)]",
        )}
      >
        <aside
          className="w-full shrink-0 overflow-y-auto border-b border-zinc-200 bg-zinc-50/80 p-4 lg:order-1 lg:h-full lg:min-h-0 lg:border-b-0 lg:border-r"
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
          ) : wholePageModeActive ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{wholePageDrawerLabel}</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{wholePageDrawerSummary}</div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Workspace</div>
                <div className="mt-1 text-sm text-zinc-600">{workspaceSummary}</div>
                <div className="mt-3 inline-flex w-full rounded-xl border border-zinc-200 bg-zinc-50 p-1">
                  <button
                    type="button"
                    onClick={() => setCustomCodeStageMode("preview")}
                    className={classNames(
                      "flex-1 rounded-lg px-3 py-2 text-sm font-semibold",
                      customCodeStageMode === "preview" ? "bg-brand-ink text-white" : "text-zinc-700 hover:bg-white",
                    )}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomCodeStageMode("source")}
                    className={classNames(
                      "flex-1 rounded-lg px-3 py-2 text-sm font-semibold",
                      customCodeStageMode === "source" ? "bg-brand-ink text-white" : "text-zinc-700 hover:bg-white",
                    )}
                  >
                    Source
                  </button>
                </div>

                {wholePageSourceEditable ? (
                  <>
                    <div className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Change area</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedHtmlRegionKey(null)}
                        className={classNames(
                          "rounded-full border px-3 py-1.5 text-xs font-semibold",
                          selectedHtmlRegion ? "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50" : "border-zinc-900 bg-zinc-900 text-white",
                        )}
                      >
                        Full page
                      </button>
                      {htmlRegionScopes.map((region) => (
                        <button
                          key={region.key}
                          type="button"
                          onClick={() => setSelectedHtmlRegionKey(region.key)}
                          className={classNames(
                            "rounded-full border px-3 py-1.5 text-xs font-semibold",
                            selectedHtmlRegion?.key === region.key
                              ? "border-zinc-900 bg-zinc-900 text-white"
                              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                          )}
                          title={region.summary}
                        >
                          {region.label}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}

                <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                  {wholePageSourceEditable
                    ? selectedPageDirty
                      ? "You have unsaved page changes here. Save draft when you are ready to keep them."
                      : "Use Layout when you want to change sections, buttons, forms, or page structure. Use Code when you want direct page edits."
                    : selectedPageDirty
                      ? "This page still uses the Layout editor. Save when you want this code view refreshed."
                      : "This page still uses the Layout editor. This view lets you inspect the current page code."}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500">
                  <span
                    className={classNames(
                      "inline-flex h-1.5 w-1.5 rounded-full",
                      selectedPageDirty ? "bg-zinc-400" : "bg-emerald-400/80",
                    )}
                  />
                  <span>{wholePageSyncMeta}</span>
                  {wholePageStatusMessage ? (
                    <>
                      <span className="hidden h-1 w-1 rounded-full bg-zinc-300 sm:inline-block" />
                      <span>{wholePageStatusMessage}</span>
                    </>
                  ) : null}
                </div>
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
                  Switch to Layout
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
                  Switch to Code
                </button>
              </div>
            </div>
          ) : blocksSurfaceActive ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
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
                  label="Add"
                  icon={
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 4v12" />
                      <path d="M4 10h12" />
                    </svg>
                  }
                  active={builderTopLevelPanel === "add"}
                  onClick={() => setSidebarPanel(builderLibraryPanel as typeof sidebarPanel)}
                />
                <BuilderRailNavButton
                  label="Edit"
                  icon={
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m4 13.5 8.5-8.5 3 3L7 16.5H4z" />
                      <path d="M11.5 6 14 8.5" />
                    </svg>
                  }
                  active={builderTopLevelPanel === "selected"}
                  disabled={!selectedBlock}
                  onClick={() => setSidebarPanel("selected")}
                />
                <BuilderRailNavButton
                  label="Page"
                  icon={
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3.5" y="4" width="13" height="12" rx="2" />
                      <path d="M7 8h6" />
                      <path d="M7 12h4" />
                    </svg>
                  }
                  active={builderTopLevelPanel === "page"}
                  onClick={() => setSidebarPanel("page")}
                />
                <BuilderRailNavButton
                  label="AI"
                  icon={<AiSparkIcon className="h-4 w-4" />}
                  detail={aiContextMedia.length ? `${aiContextMedia.length} refs attached` : undefined}
                  active={builderTopLevelPanel === "ai"}
                  spanTwo
                  onClick={() => setSidebarPanel("ai")}
                />
              </div>

              {builderTopLevelPanel === "structure" ? (
                <div className="rounded-[28px] border border-zinc-200 bg-white p-3.5 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[13px] font-medium text-zinc-500">Page map</div>
                      <div className="mt-1 text-sm font-semibold text-zinc-900">{selectedPage.title || "Untitled page"}</div>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-right">
                      <div className="text-[11px] font-medium text-zinc-500">Map</div>
                      <div className="mt-1 text-sm font-semibold text-zinc-900">{blockOutlineItems.length}</div>
                    </div>
                  </div>

                  {blockOutlineItems.length ? (
                    <div className="mt-3 max-h-120 space-y-2 overflow-y-auto pr-1">
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
                              setSidebarPanel("selected");
                              setPreviewMode("edit");
                            }}
                            className={classNames(
                              "relative w-full rounded-3xl border px-3 py-3 text-left transition-[border-color,background-color,box-shadow,transform] duration-150",
                              isActive
                                ? "border-zinc-900 bg-zinc-900 text-white shadow-[0_16px_34px_rgba(15,23,42,0.14)]"
                                : isAnchor
                                  ? "border-blue-200 bg-blue-50/60 text-zinc-900 shadow-[0_10px_24px_rgba(37,99,235,0.06)]"
                                  : "border-zinc-200 bg-white text-zinc-900 shadow-[0_8px_20px_rgba(15,23,42,0.03)] hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50",
                            )}
                          >
                            {item.depth ? (
                              <span
                                aria-hidden="true"
                                className={classNames("absolute bottom-3 top-3 w-px rounded-full", isActive ? "bg-white/18" : "bg-zinc-200")}
                                style={{ left: `${14 + Math.max(indent - 8, 0)}px` }}
                              />
                            ) : null}

                            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
                              <div className="pt-0.5" style={{ marginLeft: indent ? `${indent}px` : undefined }}>
                                <div
                                  className={classNames(
                                    "inline-flex h-10 w-10 items-center justify-center rounded-2xl border",
                                    isActive ? "border-white/15 bg-white/10 text-white" : "border-zinc-200 bg-zinc-50 text-zinc-600",
                                  )}
                                >
                                  <BuilderOutlineGlyph kind={item.kind} active={isActive} />
                                </div>
                              </div>

                              <div className="min-w-0">
                                <div className={classNames("text-[11px] font-medium", isActive ? "text-white/70" : isAnchor ? "text-blue-700" : "text-zinc-500")}>
                                  {item.kind}
                                  {isNested ? ` · L${item.depth}` : ""}
                                  {isAnchor ? " · after" : ""}
                                </div>
                                <div className="mt-1 truncate text-sm font-semibold">{item.detail}</div>
                              </div>

                              <div className="pt-0.5">
                                <BuilderOutlineMiniPreview kind={item.kind} active={isActive} />
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-[22px] border border-dashed border-zinc-300 bg-zinc-50 px-3 py-4 text-sm text-zinc-600">
                      Add the first section or block to start the page map.
                    </div>
                  )}
                </div>
              ) : null}

              {builderTopLevelPanel === "add" ? (
                <div className="rounded-[28px] border border-zinc-200 bg-white p-3.5 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[13px] font-medium text-zinc-500">Add library</div>
                      <div className="mt-1 text-sm font-semibold text-zinc-900">Choose a shelf, then add.</div>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-right">
                      <div className="text-[11px] font-medium text-zinc-500">Canvas</div>
                      <div className="mt-1 text-sm font-semibold text-zinc-900">{previewMode === "edit" ? "Editable" : "Preview only"}</div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-[22px] border border-zinc-200 bg-zinc-50 px-3 py-2.5">
                      <div className="text-[11px] font-medium text-zinc-500">Section</div>
                      <div className="mt-1 truncate text-sm font-semibold text-zinc-900">{selectedPageFlowOutlineItem ? selectedPageFlowOutlineItem.detail : "Page end"}</div>
                    </div>
                    <div className="rounded-[22px] border border-zinc-200 bg-zinc-50 px-3 py-2.5">
                      <div className="text-[11px] font-medium text-zinc-500">Block</div>
                      <div className="mt-1 truncate text-sm font-semibold text-zinc-900">{selectedOutlineItem ? selectedOutlineItem.detail : "Page end"}</div>
                    </div>
                  </div>

                  <div className="mt-3 border-t border-zinc-200 pt-3">
                    <div className="text-xs font-medium text-zinc-500">Library shelves</div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {(
                        [
                          {
                            key: "presets",
                            label: "Sections",
                            preview: (
                              <div className="flex h-full flex-col gap-1.5">
                                <div className="h-3 rounded-lg bg-zinc-800" />
                                <div className="h-4 rounded-lg bg-zinc-200" />
                                <div className="h-6 rounded-xl border border-zinc-200 bg-white" />
                              </div>
                            ),
                          },
                          {
                            key: "text",
                            label: "Text",
                            preview: (
                              <div className="flex h-full flex-col gap-1.5">
                                <div className="h-2.5 w-4/5 rounded-full bg-zinc-500" />
                                <div className="h-1.5 w-full rounded-full bg-zinc-300" />
                                <div className="h-1.5 w-3/4 rounded-full bg-zinc-300" />
                                <div className="mt-1 h-5 w-16 rounded-full bg-zinc-900" />
                              </div>
                            ),
                          },
                          {
                            key: "layout",
                            label: "Layout",
                            preview: (
                              <div className="flex h-full flex-col gap-1.5">
                                <div className="h-8 rounded-xl border border-zinc-200 bg-white" />
                                <div className="grid grid-cols-2 gap-1.5">
                                  <div className="h-5 rounded-lg border border-zinc-200 bg-zinc-100" />
                                  <div className="h-5 rounded-lg border border-zinc-200 bg-zinc-100" />
                                </div>
                              </div>
                            ),
                          },
                          {
                            key: "forms",
                            label: "Forms",
                            preview: (
                              <div className="flex h-full flex-col gap-1">
                                <div className="h-2 w-3/5 rounded-full bg-zinc-400" />
                                <div className="h-4 rounded-md border border-zinc-200 bg-white" />
                                <div className="h-4 rounded-md border border-zinc-200 bg-white" />
                                <div className="grid grid-cols-4 gap-1">
                                  {Array.from({ length: 4 }).map((_, index) => (
                                    <div key={index} className="h-2 rounded bg-zinc-200" />
                                  ))}
                                </div>
                              </div>
                            ),
                          },
                          {
                            key: "media",
                            label: "Media",
                            preview: (
                              <div className="grid h-full grid-cols-2 gap-1.5">
                                <div className="rounded-xl border border-zinc-200 bg-white" />
                                <div className="flex items-center justify-center rounded-xl bg-zinc-900">
                                  <div className="ml-0.5 h-0 w-0 border-y-[6px] border-y-transparent border-l-10 border-l-white/70" />
                                </div>
                              </div>
                            ),
                          },
                          {
                            key: "header",
                            label: "Header",
                            preview: (
                              <div className="flex h-full flex-col gap-2">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="h-2.5 w-7 rounded bg-zinc-800" />
                                  <div className="flex gap-1">
                                    <div className="h-1.5 w-3 rounded-full bg-zinc-300" />
                                    <div className="h-1.5 w-3 rounded-full bg-zinc-300" />
                                    <div className="h-1.5 w-3 rounded-full bg-zinc-300" />
                                  </div>
                                </div>
                                <div className="h-5 rounded-lg border border-zinc-200 bg-white" />
                              </div>
                            ),
                          },
                          {
                            key: "shop",
                            label: "Shop",
                            preview: (
                              <div className="flex h-full flex-col gap-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="h-2.5 w-8 rounded-full bg-zinc-500" />
                                  <div className="h-5 w-8 rounded-lg border border-zinc-200 bg-white" />
                                </div>
                                <div className="grid grid-cols-3 gap-1">
                                  {Array.from({ length: 3 }).map((_, index) => (
                                    <div key={index} className="h-7 rounded-lg border border-zinc-200 bg-white" />
                                  ))}
                                </div>
                              </div>
                            ),
                          },
                        ] as const
                      ).map((t) => (
                        <BuilderLibraryChooserButton
                          key={t.key}
                          label={t.label}
                          preview={t.preview}
                          active={builderLibraryPanel === t.key}
                          onClick={() => setSidebarPanel(t.key)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {sidebarPanel === "page" ? (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="text-sm font-semibold text-zinc-900">Theme</div>
                  <div className="mt-3 space-y-3">
                    {(() => {
                      const pageStyle = (pageSettingsBlock as any)?.props?.style as BlockStyle | undefined;
                      const presetKey = fontPresetKeyFromStyle({
                        fontFamily: (pageStyle as any)?.fontFamily,
                        fontGoogleFamily: (pageStyle as any)?.fontGoogleFamily,
                      });

                      return (
                        <div>
                          <div className="mb-1 text-xs font-medium text-zinc-500">Font</div>
                          <PortalFontDropdown
                            value={presetKey}
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

                          {presetKey === "custom" ? (
                            <label className="mt-2 block">
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
                      );
                    })()}

                    <div>
                      <div className="mb-1 text-xs font-medium text-zinc-500">Brand colors</div>
                      {brandPalette ? (
                        <div className="grid grid-cols-3 gap-2">
                          {(
                            [
                              { key: "primary", label: "Primary", value: brandPalette.primary },
                              { key: "accent", label: "Accent", value: brandPalette.accent },
                              { key: "text", label: "Text", value: brandPalette.text },
                            ] as const
                          ).map((it) => (
                            <button
                              key={it.key}
                              type="button"
                              disabled={!it.value}
                              onClick={() => {
                                if (!it.value) return;
                                try {
                                  void navigator.clipboard?.writeText?.(it.value);
                                  toast.success(`${it.label} copied`);
                                } catch {
                                  // ignore
                                }
                              }}
                              className={classNames(
                                "flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-semibold text-zinc-800 hover:bg-zinc-50",
                                !it.value ? "opacity-50" : "",
                              )}
                              title={it.value ? `Click to copy ${it.value}` : "Not set"}
                            >
                              <span
                                className="h-4 w-4 shrink-0 rounded-md border border-zinc-200"
                                style={{ backgroundColor: it.value || "transparent" }}
                              />
                              <span className="min-w-0 flex-1 truncate">{it.value || it.label}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                          Set these in Business Profile to use them as swatches here.
                        </div>
                      )}
                    </div>

                    <ColorPickerField
                      label="Page background"
                      value={(pageSettingsBlock as any)?.props?.style?.backgroundColor}
                      onChange={(v) => updatePageStyle({ backgroundColor: v })}
                      swatches={colorSwatches}
                      allowAlpha
                    />
                    <ColorPickerField
                      label="Page text color"
                      value={(pageSettingsBlock as any)?.props?.style?.textColor}
                      onChange={(v) => updatePageStyle({ textColor: v })}
                      swatches={colorSwatches}
                      allowAlpha
                    />

                    <PaddingPicker
                      label="Page padding"
                      value={(pageSettingsBlock as any)?.props?.style?.paddingPx}
                      onChange={(v) => updatePageStyle({ paddingPx: v })}
                    />

                    <MaxWidthPicker
                      label="Max width"
                      value={(pageSettingsBlock as any)?.props?.style?.maxWidthPx}
                      onChange={(v) => updatePageStyle({ maxWidthPx: v })}
                    />

                    <AlignPicker value={(pageSettingsBlock as any)?.props?.style?.align} onChange={(v) => updatePageStyle({ align: v })} />

                    <div className="mt-5 border-t border-zinc-200 pt-4">
                      <div className="text-sm font-semibold text-zinc-900">SEO</div>
                      <div className="mt-3 space-y-3">
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
                            placeholder="Page title (shown in Google)"
                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          />
                          <div className="mt-1 text-xs text-zinc-500">Recommended: ~50-60 characters.</div>
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
                            placeholder="Short summary for search results"
                            className="min-h-20 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          />
                        </label>

                        <label className="block">
                          <div className="mb-1 text-xs font-medium text-zinc-500">Social image URL</div>
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

                        <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                          <div className="mb-2 text-xs font-medium text-zinc-500">Tab icon for this page</div>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <div className="flex min-w-0 flex-1 items-center gap-3">
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
                                placeholder="https://… (32×32 or 64×64 recommended)"
                                className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              />
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
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
                          <span className="text-sm font-semibold text-zinc-900">Discourage indexing (noindex)</span>
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

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={seoBusy || !seoDirty}
                            onClick={() => void saveFunnelSeo()}
                            className={classNames(
                              "rounded-xl px-3 py-2 text-sm font-semibold text-white",
                              seoBusy || !seoDirty ? "bg-zinc-400" : "bg-brand-ink hover:opacity-95",
                            )}
                          >
                            {seoBusy ? "Saving…" : seoDirty ? "Save SEO" : "Saved"}
                          </button>
                          {seoError ? <div className="text-xs font-semibold text-red-700">{seoError}</div> : null}
                        </div>

                        <div className="text-xs text-zinc-500">
                          If this page uses <span className="font-semibold">Custom code</span>, any <span className="font-mono">&lt;title&gt;</span> or
                          <span className="font-mono">&lt;meta&gt;</span> tags you include will override these values.
                        </div>
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

              {sidebarPanel === "presets" ? (
                <div className="mt-4 space-y-2.5">
                  <div className="px-1 text-xs font-medium text-zinc-500">Starter sections</div>
                  <div className="px-1 pb-1 text-xs text-zinc-500">Drag into the canvas or add one directly.</div>

                  {(
                    [
                      {
                        key: "hero" as const,
                        label: "Hero",
                        description: "Full-width headline, subtext, and CTA on a dark background.",
                        diagram: (
                          <div className="flex h-18 flex-col items-center justify-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-3">
                            <div className="h-2.5 w-3/5 rounded-full bg-white/70" />
                            <div className="h-1.5 w-2/5 rounded-full bg-white/35" />
                            <div className="mt-1 h-5 w-16 rounded-full border border-white/25 bg-white/20" />
                          </div>
                        ),
                      },
                      {
                        key: "body" as const,
                        label: "Body",
                        description: "Heading, supporting copy, and a two-column benefit layout.",
                        diagram: (
                          <div className="flex h-18 flex-col gap-1.5 rounded-xl bg-zinc-50 px-3 py-3">
                            <div className="h-2 w-2/5 rounded-full bg-zinc-400" />
                            <div className="h-1.5 w-3/5 rounded-full bg-zinc-300" />
                            <div className="mt-0.5 grid grid-cols-2 gap-1.5">
                              <div className="rounded-lg border border-zinc-200 bg-white p-1.5">
                                <div className="mb-1 h-1.5 w-3/4 rounded-full bg-zinc-400" />
                                <div className="h-1 w-full rounded-full bg-zinc-200" />
                              </div>
                              <div className="rounded-lg border border-zinc-200 bg-white p-1.5">
                                <div className="mb-1 h-1.5 w-3/4 rounded-full bg-zinc-400" />
                                <div className="h-1 w-full rounded-full bg-zinc-200" />
                              </div>
                            </div>
                          </div>
                        ),
                      },
                      {
                        key: "form" as const,
                        label: "Form",
                        description: "Section heading with an embedded form capture.",
                        diagram: (
                          <div className="flex h-18 flex-col gap-1.5 rounded-xl bg-zinc-50 px-3 py-3">
                            <div className="h-2 w-1/3 rounded-full bg-zinc-400" />
                            <div className="h-1.5 w-2/3 rounded-full bg-zinc-300" />
                            <div className="mt-0.5 flex-1 rounded-lg border border-zinc-200 bg-white" />
                          </div>
                        ),
                      },
                      {
                        key: "shop" as const,
                        label: "Shop",
                        description: "Product columns with cart button and add-to-cart per item.",
                        diagram: (
                          <div className="flex h-18 flex-col gap-1.5 rounded-xl bg-zinc-50 px-3 py-3">
                            <div className="flex items-center gap-1.5">
                              <div className="h-2 w-1/4 rounded-full bg-zinc-400" />
                              <div className="ml-auto h-4 w-10 rounded-full border border-zinc-300 bg-white" />
                            </div>
                            <div className="grid grid-cols-3 gap-1">
                              {[0, 1, 2].map((i) => (
                                <div key={i} className="rounded-lg border border-zinc-200 bg-white p-1">
                                  <div className="mb-1 h-1.5 w-full rounded-full bg-zinc-300" />
                                  <div className="mb-1 h-1 w-3/4 rounded-full bg-zinc-200" />
                                  <div className="h-3 w-full rounded-full border border-zinc-200 bg-zinc-50" />
                                </div>
                              ))}
                            </div>
                          </div>
                        ),
                      },
                    ] as const
                  ).map(({ key, label, description, diagram }) => (
                    <div
                      key={key}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/x-funnel-preset", key);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <BuilderLibraryCard label={label} description={description} preview={diagram} tone="slate" disabled={busy} onAdd={() => addPresetSection(key)} />
                    </div>
                  ))}
                </div>
              ) : null}

              {sidebarPanel === "text" ? (
                <div className="mt-3 space-y-2.5">
                  {([
                    {
                      type: "heading" as const, label: "Heading", desc: "Headline block for section starts and hierarchy.", tone: "slate" as const,
                      diagram: <div className="flex flex-col gap-1 px-2 py-2"><div className="h-3 w-4/5 rounded-full bg-zinc-800" /><div className="h-1.5 w-3/5 rounded-full bg-zinc-300" /></div>,
                    },
                    {
                      type: "paragraph" as const, label: "Text", desc: "Body copy for explanations, offers, and supporting detail.", tone: "slate" as const,
                      diagram: <div className="flex flex-col gap-1 px-2 py-2"><div className="h-1.5 w-full rounded-full bg-zinc-300" /><div className="h-1.5 w-5/6 rounded-full bg-zinc-300" /><div className="h-1.5 w-4/6 rounded-full bg-zinc-300" /></div>,
                    },
                    {
                      type: "button" as const, label: "Button", desc: "Primary call to action for clicks, forms, and next steps.", tone: "blue" as const,
                      diagram: <div className="flex items-center px-2 py-2"><div className="h-7 w-20 rounded-full border-2 border-zinc-800 bg-zinc-900" /></div>,
                    },
                  ] as const).map(({ type, label, desc, diagram, tone }) => (
                    <div key={type} draggable onDragStart={(e) => { e.dataTransfer.setData("text/x-block-type", type); e.dataTransfer.effectAllowed = "copy"; }} className="cursor-grab active:cursor-grabbing">
                      <BuilderLibraryCard label={label} description={desc} preview={diagram} tone={tone} disabled={busy} onAdd={() => addBlock(type)} />
                    </div>
                  ))}
                </div>
              ) : null}

              {sidebarPanel === "layout" ? (
                <div className="mt-3 space-y-2.5">
                  {([
                    {
                      type: "section" as const, label: "Section", desc: "Full-width container for a new page band or message break.", tone: "emerald" as const,
                      diagram: <div className="px-2 py-2"><div className="h-8 rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50" /></div>,
                    },
                    {
                      type: "columns" as const, label: "Columns", desc: "Split content into two side-by-side areas.", tone: "emerald" as const,
                      diagram: <div className="flex gap-1 px-2 py-2"><div className="h-7 flex-1 rounded-lg border border-zinc-200 bg-zinc-100" /><div className="h-7 flex-1 rounded-lg border border-zinc-200 bg-zinc-100" /></div>,
                    },
                    {
                      type: "spacer" as const, label: "Spacer", desc: "Create breathing room between adjacent blocks.", tone: "slate" as const,
                      diagram: <div className="flex items-center justify-center px-2 py-2"><div className="h-1 w-full rounded-full bg-zinc-200" /></div>,
                    },
                  ] as const).map(({ type, label, desc, diagram, tone }) => (
                    <div key={type} draggable onDragStart={(e) => { e.dataTransfer.setData("text/x-block-type", type); e.dataTransfer.effectAllowed = "copy"; }} className="cursor-grab active:cursor-grabbing">
                      <BuilderLibraryCard label={label} description={desc} preview={diagram} tone={tone} disabled={busy} onAdd={() => addBlock(type)} />
                    </div>
                  ))}
                </div>
              ) : null}

              {sidebarPanel === "forms" ? (
                <div className="mt-3 space-y-2.5">
                  {([
                    {
                      type: "formLink" as const, label: "Form link", desc: "Send visitors to a hosted form page.", tone: "blue" as const,
                      diagram: <div className="flex items-center px-2 py-2"><div className="h-6 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2"><div className="mt-1.5 h-1.5 w-2/3 rounded-full bg-zinc-300" /></div></div>,
                    },
                    {
                      type: "formEmbed" as const, label: "Form embed", desc: "Capture leads directly inside the page flow.", tone: "blue" as const,
                      diagram: <div className="flex flex-col gap-1 px-2 py-1.5"><div className="h-1.5 w-3/4 rounded-full bg-zinc-300" /><div className="h-4 rounded-md border border-zinc-200 bg-zinc-50" /><div className="h-1.5 w-2/3 rounded-full bg-zinc-300" /><div className="h-4 rounded-md border border-zinc-200 bg-zinc-50" /></div>,
                    },
                    {
                      type: "calendarEmbed" as const, label: "Calendar", desc: "Book meetings without leaving the page.", tone: "blue" as const,
                      diagram: <div className="px-2 py-1.5"><div className="grid grid-cols-7 gap-0.5">{Array.from({length: 7}).map((_,i) => <div key={i} className="h-2.5 rounded bg-zinc-200" />)}<div className="h-4 col-span-7 rounded-md border border-zinc-200 bg-zinc-50" /></div></div>,
                    },
                  ] as const).map(({ type, label, desc, diagram, tone }) => (
                    <div key={type} draggable onDragStart={(e) => { e.dataTransfer.setData("text/x-block-type", type); e.dataTransfer.effectAllowed = "copy"; }} className="cursor-grab active:cursor-grabbing">
                      <BuilderLibraryCard label={label} description={desc} preview={diagram} tone={tone} disabled={busy} onAdd={() => addBlock(type)} />
                    </div>
                  ))}
                </div>
              ) : null}

              {sidebarPanel === "media" ? (
                <div className="mt-3 space-y-2.5">
                  {([
                    {
                      type: "image" as const, label: "Image", desc: "Add a still image, product shot, or supporting visual.", tone: "amber" as const,
                      diagram: <div className="px-2 py-1.5"><div className="h-10 rounded-lg border border-zinc-200 bg-zinc-100 flex items-center justify-center"><svg viewBox="0 0 24 24" className="h-5 w-5 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg></div></div>,
                    },
                    {
                      type: "video" as const, label: "Video", desc: "Embed a video player inside the page.", tone: "amber" as const,
                      diagram: <div className="px-2 py-1.5"><div className="h-10 rounded-lg border border-zinc-200 bg-zinc-900 flex items-center justify-center"><svg viewBox="0 0 24 24" className="h-5 w-5 text-white/60" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></div></div>,
                    },
                  ] as const).map(({ type, label, desc, diagram, tone }) => (
                    <div key={type} draggable onDragStart={(e) => { e.dataTransfer.setData("text/x-block-type", type); e.dataTransfer.effectAllowed = "copy"; }} className="cursor-grab active:cursor-grabbing">
                      <BuilderLibraryCard label={label} description={desc} preview={diagram} tone={tone} disabled={busy} onAdd={() => addBlock(type)} />
                    </div>
                  ))}
                </div>
              ) : null}

              {sidebarPanel === "header" ? (
                <div className="mt-3 space-y-2.5">
                  <div draggable onDragStart={(e) => { e.dataTransfer.setData("text/x-block-type", "headerNav"); e.dataTransfer.effectAllowed = "copy"; }} className="cursor-grab active:cursor-grabbing">
                    <BuilderLibraryCard
                      label="Header / Nav"
                      description="Logo, links, and navigation behavior for the top of the page."
                      tone="slate"
                      disabled={busy}
                      onAdd={() => addBlock("headerNav" as any)}
                      preview={(
                        <div className="px-2 py-2.5">
                          <div className="flex items-center justify-between">
                            <div className="h-2.5 w-7 rounded bg-zinc-800" />
                            <div className="flex gap-1">
                              <div className="h-1.5 w-3 rounded-full bg-zinc-300" />
                              <div className="h-1.5 w-3 rounded-full bg-zinc-300" />
                              <div className="h-1.5 w-3 rounded-full bg-zinc-300" />
                            </div>
                          </div>
                        </div>
                      )}
                    />
                  </div>
                  <div className="pt-0.5 text-[11px] text-zinc-500">Sections auto-generate anchor IDs — e.g. <span className="font-mono">#section-hero</span></div>
                </div>
              ) : null}

              {sidebarPanel === "shop" ? (
                <div className="mt-3 space-y-2.5">
                  {([
                    {
                      type: "addToCartButton" as const, label: "Add to cart", desc: "Attach a per-product cart action to a product offer.", tone: "rose" as const,
                      diagram: <div className="flex items-center px-2 py-2"><div className="h-6 w-full rounded-lg border border-zinc-200 bg-zinc-50 flex items-center justify-center"><div className="h-1.5 w-16 rounded-full bg-zinc-400" /></div></div>,
                    },
                    {
                      type: "cartButton" as const, label: "Cart", desc: "Show the current cart and let visitors review items.", tone: "rose" as const,
                      diagram: <div className="flex items-center px-2 py-2"><div className="h-6 w-8 rounded-lg border border-zinc-200 bg-zinc-50 flex items-center justify-center"><svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg></div></div>,
                    },
                    {
                      type: "salesCheckoutButton" as const, label: "Checkout (single)", desc: "Send one offer straight into direct checkout.", tone: "rose" as const,
                      diagram: <div className="flex items-center px-2 py-2"><div className="h-6 w-full rounded-full bg-zinc-800 flex items-center justify-center"><div className="h-1.5 w-12 rounded-full bg-white/60" /></div></div>,
                    },
                  ] as const).map(({ type, label, desc, diagram, tone }) => (
                    <div key={type} draggable onDragStart={(e) => { e.dataTransfer.setData("text/x-block-type", type); e.dataTransfer.effectAllowed = "copy"; }} className="cursor-grab active:cursor-grabbing">
                      <BuilderLibraryCard label={label} description={desc} preview={diagram} tone={tone} disabled={busy} onAdd={() => addBlock(type as any)} />
                    </div>
                  ))}
                  <div className="pt-1 text-[11px] text-zinc-500">Use <span className="font-semibold">Add to cart</span> + <span className="font-semibold">Cart</span> for multi-item Stripe checkout.</div>
                </div>
              ) : null}

              {sidebarPanel === "ai" ? (
                <div className="mt-3 space-y-3">
                  <div className="space-y-2.5">
                    {([
                      {
                        type: "chatbot" as const, label: "Chatbot", desc: "Embed a conversational assistant inside the page.", tone: "blue" as const,
                        diagram: <div className="px-2 py-1.5"><div className="flex flex-col gap-1"><div className="self-start rounded-xl rounded-tl-none bg-zinc-200 px-2 py-1"><div className="h-1.5 w-10 rounded-full bg-zinc-400" /></div><div className="self-end rounded-xl rounded-tr-none bg-zinc-800 px-2 py-1"><div className="h-1.5 w-8 rounded-full bg-white/60" /></div></div></div>,
                      },
                      {
                        type: "customCode" as const, label: "Custom code", desc: "Generate a bespoke HTML/CSS section with AI.", tone: "amber" as const,
                        diagram: <div className="flex items-center justify-center px-2 py-2"><div className="font-mono text-sm font-bold text-zinc-500">{"</> "}</div></div>,
                      },
                    ] as const).map(({ type, label, desc, diagram, tone }) => (
                      <div key={type} draggable onDragStart={(e) => { e.dataTransfer.setData("text/x-block-type", type); e.dataTransfer.effectAllowed = "copy"; }} className="cursor-grab active:cursor-grabbing">
                        <BuilderLibraryCard label={label} description={desc} preview={diagram} tone={tone} disabled={busy} onAdd={() => addBlock(type)} />
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-zinc-500">AI build</div>
                        <div className="mt-1 text-xs text-zinc-600">
                          Describe the outcome you want. AI can build a custom section, offer, form, embed, or refine the selected code block without leaving the builder.
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {(() => {
                          const block = aiSidebarCustomCodeBlockId
                            ? findBlockInTree(editableBlocks, aiSidebarCustomCodeBlockId)?.block
                            : null;
                          if (!block || block.type !== "customCode") return null;
                          return (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setSelectedBlockId(block.id);
                                setSidebarPanel("selected");
                              }}
                              className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                            >
                              Open block
                            </button>
                          );
                        })()}
                        <button
                          type="button"
                          disabled={busy || aiSidebarCustomCodeBusy}
                          onClick={() => {
                            setAiSidebarCustomCodePrompt("");

                            const existingBlock = aiSidebarCustomCodeBlockId
                              ? findBlockInTree(editableBlocks, aiSidebarCustomCodeBlockId)?.block
                              : null;
                            if (existingBlock && existingBlock.type === "customCode") {
                              upsertBlock({
                                ...existingBlock,
                                props: { ...(existingBlock.props as any), chatJson: [] },
                              } as any);
                            }
                          }}
                          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-60"
                        >
                          Reset
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 max-h-40 space-y-2 overflow-auto rounded-2xl border border-zinc-200 bg-white p-3">
                      {(() => {
                        const block = aiSidebarCustomCodeBlockId
                          ? findBlockInTree(editableBlocks, aiSidebarCustomCodeBlockId)?.block
                          : null;
                        const msgs =
                          block && block.type === "customCode" && Array.isArray((block.props as any).chatJson)
                            ? ((block.props as any).chatJson as BlockChatMessage[])
                            : [];

                        if (!msgs.length) {
                          return (
                            <div className="text-sm text-zinc-600">
                              Start with the result you want. AI can lay out the first pass, then you can tighten specific sections with follow-up prompts.
                            </div>
                          );
                        }

                        return msgs.map((m, idx) => (
                          <div
                            key={idx}
                            className={classNames(
                              "rounded-xl px-3 py-2 text-sm",
                              m.role === "user" ? "bg-blue-50 text-zinc-900" : "bg-zinc-50 text-zinc-800",
                            )}
                          >
                            <div className="text-[11px] font-medium text-zinc-500">{m.role === "user" ? "You" : "AI"}</div>
                            <div className="mt-1 whitespace-pre-wrap wrap-break-word">{chatDisplayContent(m)}</div>
                          </div>
                        ));
                      })()}
                    </div>

                    <div className="mt-3">
                      <AiPromptComposer
                        value={aiSidebarCustomCodePrompt}
                        onChange={setAiSidebarCustomCodePrompt}
                        onAttach={() => setAiContextOpen(true)}
                        onSubmit={() => {
                          void (async () => {
                            if (!selectedPage) return;
                            const prompt = aiSidebarCustomCodePrompt.trim();
                            if (!prompt) return;

                            setAiSidebarCustomCodeBusy(true);
                            setError(null);
                            try {
                              const existingBlock = aiSidebarCustomCodeBlockId
                                ? findBlockInTree(editableBlocks, aiSidebarCustomCodeBlockId)?.block
                                : null;
                              const builderFocusBlock =
                                existingBlock && existingBlock.type === "customCode" ? existingBlock : selectedBlock;

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

                              const res = await fetch("/api/portal/funnel-builder/custom-code-block/generate", {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({
                                  funnelId,
                                  pageId: selectedPage.id,
                                  prompt,
                                  currentHtml,
                                  currentCss,
                                  contextKeys: aiContextKeys,
                                  contextMedia: aiContextMedia,
                                }),
                              });
                              const json = (await res.json().catch(() => null)) as any;
                              if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to generate code");

                              const prevChat =
                                existingBlock && existingBlock.type === "customCode" && Array.isArray((existingBlock.props as any).chatJson)
                                  ? ((existingBlock.props as any).chatJson as BlockChatMessage[])
                                  : [];

                              const userMsg: BlockChatMessage = { role: "user", content: prompt, at: new Date().toISOString() };

                              const question = typeof json?.question === "string" ? String(json.question).trim() : "";
                              if (question) {
                                const assistantMsg: BlockChatMessage = {
                                  role: "assistant",
                                  content: question,
                                  at: new Date().toISOString(),
                                };
                                const nextChat = [...prevChat, userMsg, assistantMsg].slice(-40);

                                if (existingBlock && existingBlock.type === "customCode") {
                                  upsertBlock({
                                    ...existingBlock,
                                    props: {
                                      ...(existingBlock.props as any),
                                      chatJson: nextChat,
                                    },
                                  } as any);
                                } else {
                                  const id = newId();
                                  insertBlock(
                                    { id, type: "customCode", props: { html: "", css: "", heightPx: 360, chatJson: nextChat } as any } as any,
                                    { select: false, sidebarPanel: "ai" },
                                  );
                                  setAiSidebarCustomCodeBlockId(id);
                                }

                                setAiSidebarCustomCodePrompt("");
                                setAiWorkFocus(null);
                                return;
                              }

                              const actions = Array.isArray(json?.actions) ? (json.actions as any[]) : [];
                              if (actions.length) {
                                const prevChat =
                                  existingBlock && existingBlock.type === "customCode" && Array.isArray((existingBlock.props as any).chatJson)
                                    ? ((existingBlock.props as any).chatJson as BlockChatMessage[])
                                    : [];

                                const userMsg: BlockChatMessage = { role: "user", content: prompt, at: new Date().toISOString() };
                                const assistantText = typeof json?.assistantText === "string" ? String(json.assistantText).trim() : "";
                                const assistantMsg: BlockChatMessage | null = assistantText
                                  ? { role: "assistant", content: assistantText, at: new Date().toISOString() }
                                  : null;

                                const nextChat = [...prevChat, userMsg, ...(assistantMsg ? [assistantMsg] : [])].slice(-40);

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

                                const insertAfterAnchor = (
                                  blocks: CreditFunnelBlock[],
                                  anchorId: string,
                                  block: CreditFunnelBlock,
                                ): CreditFunnelBlock[] => {
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
                                        const nextCols = cols.map((c, i) => (i === container.columnIndex ? { ...(c || {}), children: nextArr } : c));
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

                                const insertCustomCodeBlock = (base: CreditFunnelBlock): CreditFunnelBlock[] => {
                                  const selectedContainer = selectedBlockId
                                    ? findContainerForBlock(editableBlocks, selectedBlockId)
                                    : null;

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

                                const customCodeId =
                                  existingBlock && existingBlock.type === "customCode" ? existingBlock.id : newId();

                                const updatedCustomCodeBlock: CreditFunnelBlock =
                                  existingBlock && existingBlock.type === "customCode"
                                    ? ({
                                        ...existingBlock,
                                        props: {
                                          ...(existingBlock.props as any),
                                          chatJson: nextChat,
                                        },
                                      } as any)
                                    : ({
                                        id: customCodeId,
                                        type: "customCode",
                                        props: { html: "", css: "", heightPx: 360, chatJson: nextChat } as any,
                                      } as any);

                                let nextEditable =
                                  existingBlock && existingBlock.type === "customCode"
                                    ? replaceBlockInTree(editableBlocks, updatedCustomCodeBlock)
                                    : insertCustomCodeBlock(updatedCustomCodeBlock);

                                let anchorId = customCodeId;
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

                                setSelectedPageLocal({
                                  editorMode: "BLOCKS",
                                  blocksJson: pageSettingsBlock ? [pageSettingsBlock, ...nextEditable] : nextEditable,
                                });

                                setAiSidebarCustomCodeBlockId(customCodeId);
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
                                  toast.success(`Added ${insertedIds.length} block${insertedIds.length === 1 ? "" : "s"}`);
                                }

                                setAiSidebarCustomCodePrompt("");
                                return;
                              }

                              const nextHtml = typeof json.html === "string" ? json.html : "";
                              const nextCss = typeof json.css === "string" ? json.css : "";

                              const assistantText = typeof json?.assistantText === "string" ? String(json.assistantText).trim() : "";
                              const assistantMsg: BlockChatMessage | null = assistantText
                                ? { role: "assistant", content: assistantText, at: new Date().toISOString() }
                                : null;
                              const nextChat = [...prevChat, userMsg, ...(assistantMsg ? [assistantMsg] : [])].slice(-40);

                              if (existingBlock && existingBlock.type === "customCode") {
                                upsertBlock({
                                  ...existingBlock,
                                  props: {
                                    ...(existingBlock.props as any),
                                    html: nextHtml,
                                    css: nextCss,
                                    chatJson: nextChat,
                                  },
                                } as any);
                              } else {
                                const id = newId();
                                insertBlock(
                                  {
                                    id,
                                    type: "customCode",
                                    props: { html: nextHtml, css: nextCss, heightPx: 360, chatJson: nextChat } as any,
                                  } as any,
                                  { select: false, sidebarPanel: "ai" },
                                );
                                setAiSidebarCustomCodeBlockId(id);
                              }

                              setAiWorkFocus({
                                mode: "builder",
                                label: `Updated ${describeBuilderAiTarget(builderFocusBlock ?? null)}`,
                                phase: "settled",
                                regionKey: null,
                                blockId: existingBlock && existingBlock.type === "customCode" ? existingBlock.id : null,
                              });
                              setAiSidebarCustomCodePrompt("");
                            } catch (e) {
                              const msg = (e as any)?.message ? String((e as any).message) : "Failed to generate code";
                              setAiWorkFocus(null);
                              setError(msg);
                              toast.error(msg);
                            } finally {
                              setAiSidebarCustomCodeBusy(false);
                            }
                          })();
                        }}
                        placeholder={selectedBlock?.type === "customCode"
                          ? "Change this code block"
                          : selectedBlock
                            ? "Add what comes next"
                            : "Describe the page you want"}
                        busy={busy || aiSidebarCustomCodeBusy}
                        busyLabel="AI is building"
                        attachCount={aiContextMedia.length}
                      />
                    </div>

                    {(() => {
                      const block = aiSidebarCustomCodeBlockId
                        ? findBlockInTree(editableBlocks, aiSidebarCustomCodeBlockId)?.block
                        : null;
                      if (!block || block.type !== "customCode") return null;
                      return (
                        <div className="mt-3 space-y-2">
                          <label className="block">
                            <div className="mb-1 text-xs font-medium text-zinc-500">Height</div>
                            <input
                              type="number"
                              value={String((block.props as any).heightPx ?? 360)}
                              onChange={(e) =>
                                upsertBlock({
                                  ...block,
                                  props: { ...(block.props as any), heightPx: Number(e.target.value) || 0 },
                                } as any)
                              }
                              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              placeholder="360"
                            />
                          </label>

                          <label className="block">
                            <div className="mb-1 text-xs font-medium text-zinc-500">HTML</div>
                            <textarea
                              value={String((block.props as any).html || "")}
                              onChange={(e) =>
                                upsertBlock({
                                  ...block,
                                  props: { ...(block.props as any), html: e.target.value },
                                } as any)
                              }
                              className="min-h-30 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs"
                              placeholder="<div>Hello world</div>"
                            />
                          </label>

                          <label className="block">
                            <div className="mb-1 text-xs font-medium text-zinc-500">CSS</div>
                            <textarea
                              value={String((block.props as any).css || "")}
                              onChange={(e) =>
                                upsertBlock({
                                  ...block,
                                  props: { ...(block.props as any), css: e.target.value },
                                } as any)
                              }
                              className="min-h-25 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs"
                              placeholder=".container { max-width: 900px; }"
                            />
                          </label>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ) : null}

              {sidebarPanel === "selected" ? (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-zinc-900">Selection</div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {selectedOutlineItem
                          ? `${selectedOutlineItem.kind} · ${selectedOutlineItem.detail}`
                          : "Choose a block from the page map or preview."}
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {selectedBlock ? <BuilderStatusPill label="Selected" tone="selected" /> : null}
                      {selectedPageFlowAnchorId ? <BuilderStatusPill label="Anchor" tone="anchor" /> : null}
                      {selectedBlockContainer && selectedBlockContainer.key !== "root" ? <BuilderStatusPill label="Nested" tone="nested" /> : null}
                    </div>
                  </div>
                  {!selectedBlock ? (
                    <div className="mt-2 text-sm text-zinc-600">Click a block in the preview.</div>
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
                        <div className="space-y-2">
                          <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                            <div className="text-xs font-medium text-zinc-500">Custom code with AI</div>
                            <div className="mt-2 max-h-[28vh] space-y-2 overflow-auto">
                              {Array.isArray((selectedBlock.props as any).chatJson) && (selectedBlock.props as any).chatJson.length ? (
                                ((selectedBlock.props as any).chatJson as BlockChatMessage[]).map((m, idx) => (
                                  <div
                                    key={idx}
                                    className={classNames(
                                      "rounded-xl px-3 py-2 text-sm",
                                      m.role === "user" ? "bg-blue-50 text-zinc-900" : "bg-zinc-50 text-zinc-800",
                                    )}
                                  >
                                    <div className="text-[11px] font-medium text-zinc-500">{m.role === "user" ? "You" : "AI"}</div>
                                    <div className="mt-1 whitespace-pre-wrap wrap-break-word">{chatDisplayContent(m)}</div>
                                  </div>
                                ))
                              ) : (
                                <div className="text-sm text-zinc-600">Ask for an embed or a custom section. Then follow up with edits.</div>
                              )}
                            </div>

                            <textarea
                              value={customCodeBlockPrompt}
                              onChange={(e) => setCustomCodeBlockPrompt(e.target.value)}
                              className="mt-3 min-h-22.5 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              placeholder="Describe what to build or change…"
                            />

                            <div className="mt-3 space-y-2">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={busy || customCodeBlockBusy}
                                  onClick={() => setAiContextOpen(true)}
                                  className={classNames(
                                    "inline-flex items-center gap-1.5 rounded-2xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-60",
                                    aiContextMedia.length ? "border-blue-200 text-blue-600" : "text-zinc-700",
                                  )}
                                >
                                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                                  </svg>
                                  {aiContextMedia.length ? `${aiContextMedia.length} image${aiContextMedia.length === 1 ? "" : "s"}` : "Attach images"}
                                </button>
                                {aiContextMedia.length ? (
                                  <button
                                    type="button"
                                    disabled={busy || customCodeBlockBusy}
                                    onClick={() => setAiContextMedia([])}
                                    className="text-xs text-zinc-400 hover:text-zinc-700 disabled:opacity-60"
                                  >
                                    Clear
                                  </button>
                                ) : null}
                              </div>
                            </div>

                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                disabled={busy || customCodeBlockBusy || !customCodeBlockPrompt.trim()}
                                onClick={() => {
                                  void (async () => {
                                    if (!selectedPage) return;
                                    if (!selectedBlock || selectedBlock.type !== "customCode") return;
                                    const prompt = customCodeBlockPrompt.trim();
                                    if (!prompt) return;

                                    setCustomCodeBlockBusy(true);
                                    setError(null);
                                    try {
                                      const res = await fetch("/api/portal/funnel-builder/custom-code-block/generate", {
                                        method: "POST",
                                        headers: { "content-type": "application/json" },
                                        body: JSON.stringify({
                                          funnelId,
                                          pageId: selectedPage.id,
                                          prompt,
                                          currentHtml: String((selectedBlock.props as any).html || ""),
                                          currentCss: String((selectedBlock.props as any).css || ""),
                                          contextKeys: aiContextKeys,
                                          contextMedia: aiContextMedia,
                                        }),
                                      });
                                      const json = (await res.json().catch(() => null)) as any;
                                      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to generate code");

                                      const question = typeof json?.question === "string" ? String(json.question).trim() : "";
                                      if (question) {
                                        const prevChat = Array.isArray((selectedBlock.props as any).chatJson)
                                          ? ((selectedBlock.props as any).chatJson as BlockChatMessage[])
                                          : [];

                                        const userMsg: BlockChatMessage = { role: "user", content: prompt, at: new Date().toISOString() };
                                        const assistantMsg: BlockChatMessage = {
                                          role: "assistant",
                                          content: question,
                                          at: new Date().toISOString(),
                                        };

                                        const nextChat = [...prevChat, userMsg, assistantMsg].slice(-40);
                                        upsertBlock({
                                          ...selectedBlock,
                                          props: {
                                            ...(selectedBlock.props as any),
                                            chatJson: nextChat,
                                          },
                                        } as any);
                                        setCustomCodeBlockPrompt("");
                                        return;
                                      }

                                      const actions = Array.isArray(json?.actions) ? (json.actions as any[]) : [];
                                      if (actions.length) {
                                        const prevChat = Array.isArray((selectedBlock.props as any).chatJson)
                                          ? ((selectedBlock.props as any).chatJson as BlockChatMessage[])
                                          : [];

                                        const userMsg: BlockChatMessage = { role: "user", content: prompt, at: new Date().toISOString() };
                                        const assistantText = typeof json?.assistantText === "string" ? String(json.assistantText).trim() : "";
                                        const assistantMsg: BlockChatMessage | null = assistantText
                                          ? { role: "assistant", content: assistantText, at: new Date().toISOString() }
                                          : null;

                                        const nextChat = [...prevChat, userMsg, ...(assistantMsg ? [assistantMsg] : [])].slice(-40);

                                        const s = (v: unknown, max = 240) =>
                                          (typeof v === "string" ? v : "").trim().slice(0, max);

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
                                          const props = rawBlock?.props && typeof rawBlock.props === "object" && !Array.isArray(rawBlock.props) ? rawBlock.props : {};
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

                                        const insertAfterAnchor = (
                                          blocks: CreditFunnelBlock[],
                                          anchorId: string,
                                          block: CreditFunnelBlock,
                                        ): CreditFunnelBlock[] => {
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

                                              const arr = Array.isArray(props[container.key])
                                                ? (props[container.key] as CreditFunnelBlock[])
                                                : [];
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

                                        const updatedCustomCodeBlock: CreditFunnelBlock = {
                                          ...selectedBlock,
                                          props: {
                                            ...(selectedBlock.props as any),
                                            chatJson: nextChat,
                                          },
                                        } as any;

                                        let nextEditable = replaceBlockInTree(editableBlocks, updatedCustomCodeBlock);
                                        let anchorId = selectedBlock.id;
                                        const insertedIds: string[] = [];
                                        for (const a of actions.slice(0, 6)) {
                                          if (!a || typeof a.type !== "string") continue;
                                          if (a.type === "insertAfter") {
                                            const nextBlock = coerceAiBlock(a.block);
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

                                        setSelectedPageLocal({
                                          editorMode: "BLOCKS",
                                          blocksJson: pageSettingsBlock ? [pageSettingsBlock, ...nextEditable] : nextEditable,
                                        });

                                        if (insertedIds[0]) {
                                          setSelectedBlockId(insertedIds[0]);
                                          setSidebarPanel("selected");
                                          toast.success(`Added ${insertedIds.length} block${insertedIds.length === 1 ? "" : "s"}`);
                                        }

                                        setCustomCodeBlockPrompt("");
                                        return;
                                      }

                                      const nextHtml = typeof json.html === "string" ? json.html : "";
                                      const nextCss = typeof json.css === "string" ? json.css : "";

                                      const prevChat = Array.isArray((selectedBlock.props as any).chatJson)
                                        ? ((selectedBlock.props as any).chatJson as BlockChatMessage[])
                                        : [];

                                      const userMsg: BlockChatMessage = { role: "user", content: prompt, at: new Date().toISOString() };

                                      const assistantText = typeof json?.assistantText === "string" ? String(json.assistantText).trim() : "";
                                      const assistantMsg: BlockChatMessage | null = assistantText
                                        ? { role: "assistant", content: assistantText, at: new Date().toISOString() }
                                        : null;

                                      const nextChat = [...prevChat, userMsg, ...(assistantMsg ? [assistantMsg] : [])].slice(-40);

                                      upsertBlock({
                                        ...selectedBlock,
                                        props: {
                                          ...(selectedBlock.props as any),
                                          html: nextHtml,
                                          css: nextCss,
                                          chatJson: nextChat,
                                        },
                                      } as any);

                                      setCustomCodeBlockPrompt("");
                                    } catch (e) {
                                      const msg = (e as any)?.message ? String((e as any).message) : "Failed to generate code";
                                      setError(msg);
                                      toast.error(msg);
                                    } finally {
                                      setCustomCodeBlockBusy(false);
                                    }
                                  })();
                                }}
                                className={classNames(
                                  "flex-1 inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-white",
                                  busy || customCodeBlockBusy || !customCodeBlockPrompt.trim()
                                    ? "bg-zinc-400"
                                    : "bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink) hover:opacity-90 shadow-sm",
                                )}
                              >
                                <AiSparkIcon className="h-4 w-4" />
                                <span>{customCodeBlockBusy ? "Working…" : "Ask AI"}</span>
                              </button>
                              <button
                                type="button"
                                disabled={busy || customCodeBlockBusy}
                                onClick={() =>
                                  upsertBlock({
                                    ...selectedBlock,
                                    props: { ...(selectedBlock.props as any), chatJson: [] },
                                  } as any)
                                }
                                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                              >
                                Clear
                              </button>
                            </div>
                          </div>

                          <label className="block">
                            <div className="mb-1 text-xs font-medium text-zinc-500">Height</div>
                            <input
                              type="number"
                              value={String((selectedBlock.props as any).heightPx ?? 360)}
                              onChange={(e) =>
                                upsertBlock({
                                  ...selectedBlock,
                                  props: { ...(selectedBlock.props as any), heightPx: Number(e.target.value) || 0 },
                                } as any)
                              }
                              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              placeholder="360"
                            />
                          </label>
                          <label className="block">
                            <div className="mb-1 text-xs font-medium text-zinc-500">HTML</div>
                            <textarea
                              value={String((selectedBlock.props as any).html || "")}
                              onChange={(e) =>
                                upsertBlock({
                                  ...selectedBlock,
                                  props: { ...(selectedBlock.props as any), html: e.target.value },
                                } as any)
                              }
                              className="min-h-35 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs"
                              placeholder="<div>Hello world</div>"
                            />
                          </label>
                          <label className="block">
                            <div className="mb-1 text-xs font-medium text-zinc-500">CSS</div>
                            <textarea
                              value={String((selectedBlock.props as any).css || "")}
                              onChange={(e) =>
                                upsertBlock({
                                  ...selectedBlock,
                                  props: { ...(selectedBlock.props as any), css: e.target.value },
                                } as any)
                              }
                              className="min-h-30 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs"
                              placeholder=".container { max-width: 900px; }"
                            />
                          </label>
                        </div>
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

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                            <span className="min-w-0 flex-1 font-semibold text-zinc-900">Sticky</span>
                            <ToggleSwitch
                              checked={Boolean((selectedBlock.props as any)?.sticky)}
                              disabled={busy}
                              onChange={(checked) =>
                                upsertBlock({
                                  ...selectedBlock,
                                  props: { ...selectedBlock.props, sticky: checked },
                                } as any)
                              }
                            />
                          </label>

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
                        </div>

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
                                        onClick={() => removeBlock(c.id)}
                                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                      >
                                        Remove
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
                                        onClick={() => removeBlock(c.id)}
                                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                      >
                                        Remove
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
                                        onClick={() => removeBlock(c.id)}
                                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                      >
                                        Remove
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
                                        onClick={() => removeBlock(c.id)}
                                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                      >
                                        Remove
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

                    <CollapsibleGroup title="Style" defaultOpen>
                      <div className="space-y-2">
                        {selectedBlock.type === "chatbot" ? (
                          <div className="rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-700">
                            Styling for the floating chat widget is controlled above (placement, primary color, launcher style/image).
                          </div>
                        ) : (
                          <>
                            {(selectedBlock.type === "heading" || selectedBlock.type === "paragraph") ? (
                              <label className="block">
                                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Font size (px)</div>
                                <input
                                  type="number"
                                  value={selectedBlock.props.style?.fontSizePx ?? ""}
                                  onChange={(e) =>
                                    updateSelectedBlockStyle({
                                      fontSizePx: e.target.value === "" ? undefined : Number(e.target.value) || undefined,
                                    })
                                  }
                                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                  placeholder="16"
                                />
                              </label>
                            ) : null}

                            {(
                              selectedBlock.type === "heading" ||
                              selectedBlock.type === "paragraph" ||
                              selectedBlock.type === "button" ||
                              selectedBlock.type === "formLink" ||
                              selectedBlock.type === "salesCheckoutButton" ||
                              selectedBlock.type === "addToCartButton" ||
                              selectedBlock.type === "cartButton" ||
                              selectedBlock.type === "headerNav" ||
                              selectedBlock.type === "columns" ||
                              selectedBlock.type === "section"
                            )
                              ? (() => {
                                  const blockStyle = selectedBlock.props.style as any;
                                  const presetKey = fontPresetKeyFromStyle({
                                    fontFamily: blockStyle?.fontFamily,
                                    fontGoogleFamily: blockStyle?.fontGoogleFamily,
                                  });

                                  const customFontFamily = String(blockStyle?.fontFamily || "").trim();

                                  return (
                                    <div>
                                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Font</div>
                                      <PortalFontDropdown
                                        value={presetKey}
                                        onChange={(k) => {
                                          const next = applyFontPresetToStyle(String(k || "default"));
                                          updateSelectedBlockStyle({
                                            fontFamily: next.fontFamily,
                                            fontGoogleFamily: next.fontGoogleFamily,
                                          } as any);
                                        }}
                                        includeCustom
                                        customFontFamily={customFontFamily}
                                        extraOptions={[{ value: "default", label: "Default (theme)" }]}
                                        className="w-full"
                                        buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                                      />
                                      {presetKey === "custom" ? (
                                        <label className="mt-2 block">
                                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Custom font-family</div>
                                          <input
                                            value={customFontFamily}
                                            onChange={(e) =>
                                              updateSelectedBlockStyle({
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
                                  );
                                })()
                              : null}

                            {(
                              selectedBlock.type === "heading" ||
                              selectedBlock.type === "paragraph" ||
                              selectedBlock.type === "button" ||
                              selectedBlock.type === "formLink" ||
                              selectedBlock.type === "salesCheckoutButton" ||
                              selectedBlock.type === "addToCartButton" ||
                              selectedBlock.type === "cartButton" ||
                              selectedBlock.type === "headerNav" ||
                              selectedBlock.type === "columns" ||
                              selectedBlock.type === "section"
                            ) ? (
                              <ColorPickerField
                                label="Text color"
                                value={selectedBlock.props.style?.textColor}
                                onChange={(v) => updateSelectedBlockStyle({ textColor: v })}
                                swatches={colorSwatches}
                                allowAlpha
                              />
                            ) : null}

                            {selectedBlock.type !== "customCode" ? (
                              <ColorPickerField
                                label="Background"
                                value={selectedBlock.props.style?.backgroundColor}
                                onChange={(v) => updateSelectedBlockStyle({ backgroundColor: v })}
                                swatches={colorSwatches}
                                allowAlpha
                              />
                            ) : null}

                            {selectedBlock.type === "section" ? (
                              <label className="block">
                                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Background image</div>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      setMediaPickerTarget({ type: "section-background", blockId: selectedBlock.id });
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
                                        if (!selectedBlock || selectedBlock.type !== "section") return;
                                        setUploadingImageBlockId(selectedBlock.id);
                                        setError(null);
                                        void (async () => {
                                          try {
                                            const created = await uploadToMediaLibrary(files, { maxFiles: 1 });
                                            const it = created[0];
                                            if (!it) return;
                                            const nextUrl = String((it as any).shareUrl || (it as any).previewUrl || (it as any).openUrl || (it as any).downloadUrl || "").trim();
                                            if (!nextUrl) return;
                                            updateSelectedBlockStyle({ backgroundImageUrl: nextUrl });
                                            toast.success("Background image uploaded and selected");
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
                                    disabled={busy || !selectedBlock.props.style?.backgroundImageUrl}
                                    onClick={() => updateSelectedBlockStyle({ backgroundImageUrl: undefined })}
                                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                                  >
                                    Clear
                                  </button>
                                </div>

                                {selectedBlock.props.style?.backgroundImageUrl ? (
                                  <div className="mt-2 rounded-xl border border-zinc-200 bg-white p-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Selected background</div>
                                    <div className="mt-2 flex items-center gap-3">
                                      <div
                                        className="h-10 w-16 rounded-lg border border-zinc-200 bg-zinc-50"
                                        style={{
                                          backgroundImage: `url(${selectedBlock.props.style.backgroundImageUrl})`,
                                          backgroundSize: "cover",
                                          backgroundPosition: "center",
                                        }}
                                      />
                                      <div className="min-w-0 flex-1 break-all font-mono text-xs text-zinc-700">
                                        {selectedBlock.props.style.backgroundImageUrl}
                                      </div>
                                    </div>
                                    <div className="mt-1 text-xs text-zinc-500">Renders as a cover background on hosted pages.</div>
                                  </div>
                                ) : (
                                  <div className="mt-1 text-xs text-zinc-500">No background image selected.</div>
                                )}
                              </label>
                            ) : null}

                            {selectedBlock.type === "section" ? (
                              <label className="block">
                                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Background video</div>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      setMediaPickerTarget({ type: "section-background-video", blockId: selectedBlock.id });
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
                                        if (!selectedBlock || selectedBlock.type !== "section") return;
                                        const file = files[0];
                                        if (!file) return;
                                        setUploadingImageBlockId(selectedBlock.id);
                                        setError(null);
                                        void (async () => {
                                          try {
                                            const uploaded = await uploadToUploads(file);
                                            const nextUrl = String(uploaded.mediaItem?.shareUrl || uploaded.url || "").trim();
                                            if (!nextUrl) return;
                                            updateSelectedBlockStyle({ backgroundVideoUrl: nextUrl });
                                            toast.success("Background video uploaded and selected");
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
                                    disabled={busy || !selectedBlock.props.style?.backgroundVideoUrl}
                                    onClick={() => updateSelectedBlockStyle({ backgroundVideoUrl: undefined })}
                                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                                  >
                                    Clear
                                  </button>
                                </div>

                                {selectedBlock.props.style?.backgroundVideoUrl ? (
                                  <div className="mt-2 rounded-xl border border-zinc-200 bg-white p-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Selected background video</div>
                                    <div className="mt-1 break-all font-mono text-xs text-zinc-700">
                                      {selectedBlock.props.style.backgroundVideoUrl}
                                    </div>
                                    <div className="mt-1 text-xs text-zinc-500">Renders as an autoplaying, muted, looping cover video on hosted pages.</div>
                                  </div>
                                ) : (
                                  <div className="mt-1 text-xs text-zinc-500">No background video selected.</div>
                                )}
                              </label>
                            ) : null}

                            {selectedBlock.type !== "customCode" ? (
                              <AlignPicker
                                value={selectedBlock.props.style?.align}
                                onChange={(v) => updateSelectedBlockStyle({ align: v })}
                              />
                            ) : null}

                            <PaddingPicker
                              label="Margin top"
                              value={selectedBlock.props.style?.marginTopPx}
                              onChange={(v) => updateSelectedBlockStyle({ marginTopPx: v })}
                              max={240}
                            />

                            <PaddingPicker
                              label="Margin bottom"
                              value={selectedBlock.props.style?.marginBottomPx}
                              onChange={(v) => updateSelectedBlockStyle({ marginBottomPx: v })}
                              max={240}
                            />

                            <PaddingPicker
                              label="Padding"
                              value={selectedBlock.props.style?.paddingPx}
                              onChange={(v) => updateSelectedBlockStyle({ paddingPx: v })}
                            />

                            {(
                              selectedBlock.type === "button" ||
                              selectedBlock.type === "formLink" ||
                              selectedBlock.type === "salesCheckoutButton" ||
                              selectedBlock.type === "addToCartButton" ||
                              selectedBlock.type === "cartButton"
                            ) ? (
                              <div className="space-y-2">
                                <ColorPickerField
                                  label="Outline color"
                                  value={selectedBlock.props.style?.borderColor}
                                  onChange={(v) => updateSelectedBlockStyle({ borderColor: v })}
                                  swatches={colorSwatches}
                                  allowAlpha
                                />
                                <label className="block">
                                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Outline width (px)</div>
                                  <div className="flex flex-wrap items-center gap-3">
                                    <input
                                      type="range"
                                      min={0}
                                      max={12}
                                      value={Math.round(selectedBlock.props.style?.borderWidthPx ?? 0)}
                                      onChange={(e) => updateSelectedBlockStyle({ borderWidthPx: Number(e.target.value) || 0 })}
                                      className="min-w-40 flex-1"
                                    />
                                    <input
                                      type="number"
                                      value={selectedBlock.props.style?.borderWidthPx ?? ""}
                                      onChange={(e) =>
                                        updateSelectedBlockStyle({
                                          borderWidthPx: e.target.value === "" ? undefined : Number(e.target.value) || 0,
                                        })
                                      }
                                      className="w-24 shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                      placeholder="Auto"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => updateSelectedBlockStyle({ borderWidthPx: undefined })}
                                      className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                    >
                                      Clear
                                    </button>
                                  </div>
                                </label>
                              </div>
                            ) : null}

                            <RadiusPicker
                              label="Radius"
                              value={selectedBlock.props.style?.borderRadiusPx}
                              onChange={(v) => updateSelectedBlockStyle({ borderRadiusPx: v })}
                              max={64}
                            />

                            {(selectedBlock.type === "image" || selectedBlock.type === "video" || selectedBlock.type === "button" || selectedBlock.type === "formLink" || selectedBlock.type === "salesCheckoutButton" || selectedBlock.type === "addToCartButton" || selectedBlock.type === "cartButton") ? (
                              <MaxWidthPicker
                                label="Max width"
                                value={selectedBlock.props.style?.maxWidthPx}
                                onChange={(v) => updateSelectedBlockStyle({ maxWidthPx: v })}
                              />
                            ) : null}
                          </>
                        )}
                      </div>
                    </CollapsibleGroup>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => removeBlock(selectedBlock.id)}
                      className="w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                    >
                      Remove block
                    </button>
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
          {aiResultBanner ? (
            <div
              className={classNames(
                "mb-3 flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm shadow-sm",
                aiResultBanner.tone === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900",
              )}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className={classNames("h-4 w-4 shrink-0", aiResultBanner.tone === "warning" ? "text-amber-500" : "text-emerald-500")}
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
              </svg>
              <span className="min-w-0 flex-1 font-medium">{aiResultBanner.summary}</span>
              <button
                type="button"
                onClick={() => void restoreLastAiRun()}
                className={classNames(
                  "shrink-0 rounded-full border bg-white px-3 py-1 text-xs font-semibold",
                  aiResultBanner.tone === "warning"
                    ? "border-amber-300 text-amber-800 hover:bg-amber-100"
                    : "border-emerald-300 text-emerald-800 hover:bg-emerald-100",
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
          ) : null}
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
                  {selectedPage ? (
                    <span className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      {wholePageSurfaceActive
                        ? customCodeStageMode === "source" ? "Source" : "Preview"
                        : previewMode === "edit" ? "Edit" : "Preview"}
                    </span>
                  ) : null}
                </div>
                {selectedPage ? <div className="truncate text-xs text-zinc-500">/{selectedPage.slug}</div> : null}
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
                  <div className="mx-0.5 h-4 w-px shrink-0 bg-zinc-200" />
                  {wholePageSurfaceActive ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setCustomCodeStageMode("preview")}
                        className={classNames(
                          "rounded-lg px-3 py-1.5 text-sm font-semibold",
                          customCodeStageMode === "preview" ? "bg-brand-ink text-white" : "text-zinc-700 hover:bg-zinc-50",
                        )}
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomCodeStageMode("source")}
                        className={classNames(
                          "rounded-lg px-3 py-1.5 text-sm font-semibold",
                          customCodeStageMode === "source" ? "bg-brand-ink text-white" : "text-zinc-700 hover:bg-zinc-50",
                        )}
                      >
                        Source
                      </button>
                    </>
                  ) : (
                    <>
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
                          "rounded-lg px-3 py-1.5 text-sm font-semibold",
                          previewMode === "preview" ? "bg-brand-ink text-white" : "text-zinc-700 hover:bg-zinc-50",
                        )}
                      >
                        Preview
                      </button>
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
                if (!selectedPage || selectedPage.editorMode !== "BLOCKS" || previewMode !== "edit") return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(e) => {
                if (!selectedPage || selectedPage.editorMode !== "BLOCKS" || previewMode !== "edit") return;
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
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[34px] bg-white/74 shadow-[0_18px_44px_rgba(15,23,42,0.06)] ring-1 ring-zinc-200/70 backdrop-blur">
                    <div
                      className={classNames(
                        "flex min-h-0 flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(250,250,252,0.68)_0%,rgba(244,246,248,0.48)_100%)] p-2.5 sm:p-3",
                      )}
                    >
                      <div className={classNames("flex min-h-0 flex-1 flex-col gap-3", wholePageSourceEditable && customCodeStageMode === "source" && selectedPageHtmlChangeActivity.length > 0 ? "xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start" : "") }>
                        <div className="flex min-h-0 flex-1 flex-col gap-3">
                          {wholePageSourceEditable && showInlineHtmlChangeReceipt ? (
                            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white/82 px-4 py-3 shadow-[0_12px_30px_rgba(15,23,42,0.05)] backdrop-blur">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                                  <span>Recent change</span>
                                  <span className="h-1 w-1 rounded-full bg-zinc-300" />
                                  <span>{formatActivityTimestamp(latestSelectedPageHtmlChange.at)}</span>
                                </div>
                                <div className="mt-1 truncate text-sm font-semibold text-zinc-900">{latestSelectedPageHtmlChange.summary}</div>
                                <div className="mt-1 truncate text-xs text-zinc-500">{latestSelectedPageHtmlChange.prompt}</div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-600">
                                  {latestSelectedPageHtmlChange.scopeLabel}
                                </span>
                                <ChangeCountPill value={latestSelectedPageHtmlChange.diff.addedLines} prefix="+" tone="added" />
                                <ChangeCountPill value={latestSelectedPageHtmlChange.diff.removedLines} prefix="-" tone="removed" />
                                <span
                                  className={classNames(
                                    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                                    latestSelectedPageHtmlChange.previewChanged
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                      : "border-amber-200 bg-amber-50 text-amber-700",
                                  )}
                                >
                                  {latestSelectedPageHtmlChange.previewChanged ? "Preview updated" : "Preview unchanged"}
                                </span>
                              </div>
                            </div>
                          ) : null}

                          <div className="flex min-h-0 flex-1 flex-col">
                            {customCodeStageMode === "source" ? (
                              currentPageSourceHtml ? (
                                <CodeSurface
                                  value={currentPageSourceHtml}
                                  onChange={wholePageSourceEditable ? (next) => setSelectedPageLocal({ draftHtml: next }) : undefined}
                                  onCopy={() => {
                                    try {
                                      void navigator.clipboard?.writeText?.(currentPageSourceHtml || currentPagePublishedHtml || getFunnelPageDraftHtml(selectedPage));
                                      toast.success("HTML copied");
                                    } catch {
                                      toast.error("Could not copy HTML");
                                    }
                                  }}
                                  placeholder="<!doctype html>"
                                  readOnly={!wholePageSourceEditable}
                                  lineHighlightRange={wholePageSourceEditable ? latestSourceHighlightRange : null}
                                />
                              ) : (
                                <div className="flex h-full min-h-[50vh] items-center justify-center rounded-[28px] border border-dashed border-zinc-300 bg-white px-6 text-center text-sm text-zinc-600">
                                  {wholePageStatusMessage || "No page source available yet. Save the page to generate the source view."}
                                </div>
                              )
                            ) : (
                              currentPageSourceHtml ? (
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
                                          funnelPageId: selectedPage.id,
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
                              )
                            )}
                          </div>
                        </div>

                        {wholePageSourceEditable && customCodeStageMode === "source" && selectedPageHtmlChangeActivity.length > 0 ? (
                          <div className="hidden h-full min-h-0 xl:block">
                            <HtmlChangeTimeline items={selectedPageHtmlChangeActivity} />
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="border-t border-zinc-200/70 bg-white/68 px-3 py-2.5 backdrop-blur">
                      {wholePageSourceEditable ? (
                        <div className="relative">
                          {htmlScopePickerOpen ? (
                            <div className="absolute bottom-[calc(100%+10px)] left-0 z-10 flex max-w-full flex-wrap gap-2 rounded-2xl border border-zinc-200/80 bg-white/90 p-2 shadow-[0_18px_34px_rgba(15,23,42,0.1)] backdrop-blur">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedHtmlRegionKey(null);
                                  setHtmlScopePickerOpen(false);
                                }}
                                className={classNames(
                                  "rounded-full border px-3 py-1.5 text-xs font-semibold",
                                  selectedHtmlRegion
                                    ? "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                                    : "border-zinc-900 bg-zinc-900 text-white",
                                )}
                              >
                                Whole page
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
                                    "rounded-full border px-3 py-1.5 text-xs font-semibold",
                                    selectedHtmlRegion?.key === region.key
                                      ? "border-zinc-900 bg-zinc-900 text-white"
                                      : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
                                  )}
                                  title={region.summary}
                                >
                                  {region.label}
                                </button>
                              ))}
                            </div>
                          ) : null}

                          <div className="mx-auto flex w-full max-w-4xl items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setHtmlScopePickerOpen((prev) => !prev)}
                              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-zinc-200/70 bg-white/72 px-3 py-2 text-xs font-semibold text-zinc-700 shadow-[0_6px_16px_rgba(15,23,42,0.05)] backdrop-blur hover:bg-white"
                              title={selectedHtmlRegion ? selectedHtmlRegion.summary : "Apply changes across the whole page"}
                            >
                              <span>{selectedHtmlRegion ? selectedHtmlRegion.label : "Whole page"}</span>
                              <svg aria-hidden="true" viewBox="0 0 20 20" className={classNames("h-3.5 w-3.5 transition-transform", htmlScopePickerOpen ? "rotate-180" : "") } fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m5 7.5 5 5 5-5" />
                              </svg>
                            </button>

                            <AiPromptComposer
                              value={chatInput}
                              onChange={setChatInput}
                              onAttach={() => setAiContextOpen(true)}
                              onSubmit={() => void runAi()}
                              placeholder={selectedHtmlRegion ? `Change ${selectedHtmlRegion.label}` : "Change the page"}
                              busy={busy}
                              busyLabel={BUSY_PHASES[busyPhaseIdx]}
                              attachCount={aiContextMedia.length}
                              className="min-w-0 flex-1 bg-transparent"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="mx-auto flex w-full max-w-4xl items-center rounded-2xl border border-zinc-200/70 bg-white/72 px-4 py-3 text-sm text-zinc-600 shadow-[0_6px_16px_rgba(15,23,42,0.05)] backdrop-blur">
                          This page source is generated from your layout. Switch to Layout to edit sections, then save to refresh this code view.
                        </div>
                      )}
                    </div>
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
                        if (blockType) { addBlock(blockType as any); return; }
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
                          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-600">
                            Let AI draft the page, or drop in the first block when you want manual control.
                          </div>
                        </div>
                      ) : (
                        renderCreditFunnelBlocks({
                          blocks: pageSettingsBlock ? [pageSettingsBlock, ...editableBlocks] : editableBlocks,
                          basePath: hostedBasePath,
                          context: {
                            bookingSiteSlug: bookingSiteSlug || undefined,
                            funnelPageId: selectedPage.id,
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
                                  setSidebarPanel("selected");
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

            {blocksSurfaceActive && selectedPage ? (
              <div className="border-t border-zinc-200/70 bg-white/68 px-3 py-2.5 backdrop-blur">
                <div className="mx-auto flex w-full max-w-4xl items-center gap-3">
                  <AiPromptComposer
                    value={chatInput}
                    onChange={setChatInput}
                    onAttach={() => setAiContextOpen(true)}
                    onSubmit={() => void runAi()}
                    placeholder="Describe what you want AI to build or change"
                    busy={busy}
                    busyLabel={BUSY_PHASES[busyPhaseIdx]}
                    attachCount={aiContextMedia.length}
                    className="min-w-0 flex-1 bg-transparent"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
