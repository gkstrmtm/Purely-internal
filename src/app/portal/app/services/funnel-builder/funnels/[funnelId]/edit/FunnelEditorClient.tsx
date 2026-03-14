"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { AiSparkIcon } from "@/components/AiSparkIcon";
import { LinkUrlModal } from "@/components/LinkUrlModal";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import PortalImageCropModal from "@/components/PortalImageCropModal";
import {
  PortalMediaPickerModal,
  type PortalMediaPickItem,
} from "@/components/PortalMediaPickerModal";
import { PortalFontDropdown } from "@/components/PortalFontDropdown";
import { PortalSelectDropdown } from "@/components/PortalSelectDropdown";
import { useToast } from "@/components/ToastProvider";
import { PORTAL_VARIANT_HEADER, type PortalVariant } from "@/lib/portalVariant";
import { FONT_PRESETS, applyFontPresetToStyle, fontPresetKeyFromStyle, googleFontImportCss } from "@/lib/fontPresets";
import { hostedFunnelPath } from "@/lib/publicHostedKeys";

function formatMoney(cents: number | null | undefined, currency: string) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "";
  const curr = (currency || "usd").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: curr }).format(cents / 100);
  } catch {
    return `${curr} ${(cents / 100).toFixed(2)}`;
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

type CreditForm = {
  id: string;
  slug: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
};

type BookingCalendarLite = {
  id: string;
  title?: string;
  enabled?: boolean;
};

type Page = {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
  seo?: { faviconUrl?: string } | null;
  contentMarkdown: string;
  editorMode: "MARKDOWN" | "BLOCKS" | "CUSTOM_HTML";
  blocksJson: unknown;
  customHtml: string;
  customChatJson: unknown;
  createdAt: string;
  updatedAt: string;
};

type ChatMessage = { role: "user" | "assistant"; content: string; at?: string };

type BlockChatMessage = { role: "user" | "assistant"; content: string; at?: string };

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function pickRandom<T>(items: T[]): T {
  if (!Array.isArray(items) || items.length === 0) throw new Error("pickRandom called with empty array");
  return items[Math.floor(Math.random() * items.length)]!;
}

const AI_BLOCK_UPDATED_VARIANTS = [
  "OK — I updated this block. Check the preview and tell me what you want changed.",
  "Done — block updated. Preview it and tell me what to tweak.",
  "Updated this block. Check it in preview and tell me what you want adjusted.",
  "All set — changes applied to this block. Preview and tell me what to refine.",
  "Block updated. If anything feels off, tell me what to change next.",
  "Update complete for this block. Preview it and call out what to refine.",
  "Applied the changes to this block. Tell me what you want changed next.",
  "Done — block updated. Tell me what you want improved after you preview.",
  "Updated. Preview this block and tell me what to adjust (spacing, copy, colors, etc.).",
  "Change applied to this block. Check preview and tell me what you want changed.",
];

const AI_BLOCK_ACTIONS_VARIANTS = [
  "I added blocks to the page.",
  "Added some blocks to the page.",
  "Inserted blocks into the page.",
  "Dropped in a few blocks.",
  "Blocks added.",
  "I updated the layout with new blocks.",
  "I added the requested blocks.",
  "Built those pieces as blocks on the page.",
  "Added blocks where they fit best.",
  "I placed new blocks into the page.",
];

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
  if (looksLikeHtml) return "(HTML output hidden — see the HTML editor pane.)";

  const looksLikeCodeFence = t.startsWith("```") && (t.includes("```html") || t.includes("```css") || t.includes("```json"));
  if (looksLikeCodeFence) return "(Code output hidden — use the editor fields.)";

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
          className="min-w-[180px] flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
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
                ? "border-[color:var(--color-brand-blue)] bg-blue-50 text-zinc-900"
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
          className="min-w-[160px] flex-1"
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
          "min-h-[44px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm",
          "focus-within:border-[color:var(--color-brand-blue)]",
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
          className="min-w-[160px] flex-1"
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
                ? "border-[color:var(--color-brand-blue)] bg-blue-50 text-zinc-900"
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
            className="h-2 rounded-full bg-[color:var(--color-brand-blue)]"
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
  | { type: "create-form"; slug: string; name: string }
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
        "title" | "slug" | "sortOrder" | "contentMarkdown" | "editorMode" | "blocksJson" | "customHtml" | "customChatJson"
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
              await savePage({ editorMode: "CUSTOM_HTML", customHtml: selectedPage.customHtml || "", customChatJson: selectedChat });
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
                      href="/portal/app/services/funnel-builder"
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
                      Blocks
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
                      Custom code
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
                        busy ? "bg-zinc-400" : "bg-[color:var(--color-brand-blue)] hover:bg-blue-700",
                      )}
                    >
                      + Page
                    </button>

                    <button
                      type="button"
                      disabled={busy || !selectedPage}
                      onClick={() => void saveCurrentPage()}
                      className={classNames(
                        "rounded-xl px-4 py-2 text-sm font-semibold text-white",
                        busy ? "bg-zinc-400" : "bg-brand-ink hover:opacity-95",
                      )}
                    >
                      {busy ? "Saving…" : "Save"}
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
                          Switch to Blocks
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
                          Switch to Custom code
                        </button>
                      </div>
                    </div>
                  ) : selectedPage.editorMode === "BLOCKS" ? (
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">Blocks</div>
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
                          <span>{busy ? "Working…" : "Ask AI"}</span>
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
                          value={selectedPage.customHtml || ""}
                          onChange={(e) => setSelectedPageLocal({ customHtml: e.target.value })}
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
                            sandbox="allow-forms allow-popups allow-scripts"
                            srcDoc={selectedPage.customHtml || ""}
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
                          {busy ? "Working…" : "Ask AI"}
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
                          value={selectedPage.customHtml || ""}
                          onChange={(e) => setSelectedPageLocal({ customHtml: e.target.value })}
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
                            sandbox="allow-forms allow-popups allow-scripts"
                            srcDoc={selectedPage.customHtml || ""}
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

export function FunnelEditorClient({ basePath, funnelId }: { basePath: string; funnelId: string }) {
  const router = useRouter();
  const toast = useToast();

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
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [customCodeBlockPrompt, setCustomCodeBlockPrompt] = useState("");
  const [customCodeBlockBusy, setCustomCodeBlockBusy] = useState(false);
  const [aiSidebarCustomCodePrompt, setAiSidebarCustomCodePrompt] = useState("");
  const [aiSidebarCustomCodeBusy, setAiSidebarCustomCodeBusy] = useState(false);
  const [aiSidebarCustomCodeBlockId, setAiSidebarCustomCodeBlockId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [seoDirty, setSeoDirty] = useState(false);
  const [seoBusy, setSeoBusy] = useState(false);
  const [seoError, setSeoError] = useState<string | null>(null);

  const [uploadingImageBlockId, setUploadingImageBlockId] = useState<string | null>(null);
  const [uploadingHeaderLogoBlockId, setUploadingHeaderLogoBlockId] = useState<string | null>(null);

  const [aiContextOpen, setAiContextOpen] = useState(false);
  const [aiContextKeys, setAiContextKeys] = useState<string[]>([]);
  const [aiContextMedia, setAiContextMedia] = useState<Array<{ url: string; fileName?: string; mimeType?: string }>>([]);
  const [aiContextUploadBusy, setAiContextUploadBusy] = useState(false);
  const aiContextUploadInputRef = useRef<HTMLInputElement | null>(null);

  const aiContextOptions = useMemo(
    () =>
      [
        { key: "preset:hero", label: "Preset: Hero", description: "Hero section preset" },
        { key: "preset:body", label: "Preset: Body", description: "Body/content section preset" },
        { key: "preset:form", label: "Preset: Form", description: "Form capture preset" },
        { key: "preset:shop", label: "Preset: Shop", description: "Shop preset (Stripe-connected)" },

        { key: "block:headerNav", label: "Block: Header/Menu", description: "Navigation, logo, CTA" },
        { key: "block:section", label: "Block: Section", description: "Section wrapper + background" },
        { key: "block:columns", label: "Block: Columns", description: "Two-column layouts" },
        { key: "block:heading", label: "Block: Heading", description: "Headlines + section titles" },
        { key: "block:paragraph", label: "Block: Text", description: "Paragraph/rich text" },
        { key: "block:button", label: "Block: Button", description: "CTA buttons" },
        { key: "block:spacer", label: "Block: Spacer", description: "Spacing between sections" },

        { key: "block:formLink", label: "Block: Form link", description: "Link to hosted form" },
        { key: "block:formEmbed", label: "Block: Form embed", description: "Embedded hosted form" },
        { key: "block:calendarEmbed", label: "Block: Calendar embed", description: "Embedded booking calendar" },

        { key: "block:image", label: "Block: Image", description: "Image blocks" },
        { key: "block:video", label: "Block: Video", description: "Video blocks" },

        { key: "block:addToCartButton", label: "Shop: Add to cart", description: "Add-to-cart button" },
        { key: "block:cartButton", label: "Shop: Cart", description: "Cart button" },
        { key: "block:salesCheckoutButton", label: "Shop: Checkout", description: "Checkout button" },

        { key: "block:chatbot", label: "Block: AI chatbot", description: "Chatbot widget" },
      ] as const,
    [],
  );

  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [sidebarPanel, setSidebarPanel] = useState<
    "presets" | "text" | "layout" | "forms" | "media" | "header" | "shop" | "ai" | "page" | "selected"
  >("presets");

  const [dialog, setDialog] = useState<FunnelEditorDialog>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const portalVariant: PortalVariant = basePath === "/credit" ? "credit" : "portal";

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

    return hostedFunnelPath(slug, funnelId);
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

  type PageHistorySnapshot = Pick<Page, "editorMode" | "blocksJson" | "customHtml" | "customChatJson"> & {
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
      if (!selectedPage) return;
      if (selectedPage.editorMode !== "BLOCKS") return;
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
  }, [selectedPage, selectedBlockId, busy, dialog, mediaPickerOpen]);

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
    setDialog({ type: "create-form", slug: "", name: "" });
    setDialogError(null);
  };

  const performCreateForm = async (args: { slug: string; name: string }) => {
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
        body: JSON.stringify({ slug, name: name || undefined }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to create form");

      const created = json.form as CreditForm | undefined;
      await load();
      closeDialog();

      toast.success("Form created");
      if (created?.id) {
        router.push(`${basePath}/app/services/funnel-builder/forms/${encodeURIComponent(created.id)}/edit`);
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

  const selectedBlock = useMemo(() => {
    if (!selectedBlockId) return null;
    return findBlockInTree(editableBlocks, selectedBlockId)?.block || null;
  }, [editableBlocks, selectedBlockId, findBlockInTree]);

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

    const actionKey =
      patch.blocksJson !== undefined
        ? "blocks"
        : patch.customHtml !== undefined
          ? "customHtml"
          : patch.customChatJson !== undefined
            ? "customChatJson"
            : patch.editorMode !== undefined
              ? "editorMode"
              : "meta";
    const coalesceWindowMs = actionKey === "customHtml" ? 1200 : 250;
    pushUndoSnapshot(actionKey, coalesceWindowMs);

    setDirtyPageIds((prev) => ({ ...prev, [selectedPage.id]: true }));
    setPages((prev) =>
      (prev || []).map((p) => (p.id === selectedPage.id ? ({ ...p, ...patch } as Page) : p)),
    );
  }, [pushUndoSnapshot, selectedPage]);

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
    setSelectedPageId((prev) => prev || nextPages[0]?.id || null);

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
          | "customChatJson"
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
            body: JSON.stringify({ blocksJson: saveableBlocks, setEditorMode: "CUSTOM_HTML" }),
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
      const findGlobalHeader = (blocks: CreditFunnelBlock[]): CreditFunnelBlock | null => {
        const walk = (arr: CreditFunnelBlock[]): CreditFunnelBlock | null => {
          for (const b of arr) {
            if (!b) continue;
            if (b.type === "headerNav" && (b.props as any)?.isGlobal === true) return b;
            if (b.type === "section") {
              const props: any = b.props;
              const keys = ["children", "leftChildren", "rightChildren"] as const;
              for (const key of keys) {
                const nested = Array.isArray(props?.[key]) ? (props[key] as CreditFunnelBlock[]) : [];
                const found = walk(nested);
                if (found) return found;
              }
            }
            if (b.type === "columns") {
              const props: any = b.props;
              const cols = Array.isArray(props?.columns) ? (props.columns as any[]) : [];
              for (const c of cols) {
                const nested = Array.isArray(c?.children) ? (c.children as CreditFunnelBlock[]) : [];
                const found = walk(nested);
                if (found) return found;
              }
            }
          }
          return null;
        };

        return walk(blocks.filter((b) => b.type !== "page"));
      };

      const globalHeader = findGlobalHeader(saveableBlocks);
      if (globalHeader) {
        setBusy(true);
        setError(null);
        try {
          const res = await fetch(
            `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/global-header`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ mode: "apply", headerBlock: globalHeader }),
            },
          );
          const json = (await res.json().catch(() => null)) as any;
          if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to apply global header");
          await load();
          toast.success("Global header updated");
          return;
        } catch (e) {
          const msg = (e as any)?.message ? String((e as any).message) : "Failed to apply global header";
          setError(msg);
          toast.error(msg);
          return;
        } finally {
          setBusy(false);
        }
      }

      await savePage({ editorMode: "BLOCKS", blocksJson: saveableBlocks });
      return;
    }
    if (selectedPage.editorMode === "CUSTOM_HTML") {
      await savePage({
        editorMode: "CUSTOM_HTML",
        customHtml: selectedPage.customHtml || "",
        customChatJson: selectedChat,
      });
      return;
    }
    await setEditorMode("BLOCKS");
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

  const selectedPageDirty = Boolean(selectedPageId && dirtyPageIds[selectedPageId]);

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
    const blocks = buildPresetBlocks(preset);
    if (!blocks.length) return;
    const nextEditable = [...editableBlocks, ...blocks].filter((b) => b.type !== "page");
    setSelectedPageLocal({
      editorMode: "BLOCKS",
      blocksJson: pageSettingsBlock ? [pageSettingsBlock, ...nextEditable] : nextEditable,
    });
    setSelectedBlockId(blocks[0].id);
    setSidebarPanel("selected");
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
    setBusy(true);
    setError(null);
    try {
      let currentHtml = selectedPage.customHtml || "";

      // If we're in Blocks mode, first export the current blocks into a Custom HTML
      // document so AI edits apply to the same page (not an unrelated empty doc).
      if (selectedPage.editorMode === "BLOCKS") {
        const resExport = await fetch(
          `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/${encodeURIComponent(selectedPage.id)}/export-custom-html`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ blocksJson: saveableBlocks, setEditorMode: "CUSTOM_HTML" }),
          },
        );
        const jsonExport = (await resExport.json().catch(() => null)) as any;
        if (!resExport.ok || !jsonExport || jsonExport.ok !== true) {
          throw new Error(jsonExport?.error || "Failed to export HTML");
        }
        const exportedPage = jsonExport.page as Partial<Page> | undefined;
        if (exportedPage?.id) {
          setPages((prev) => (prev || []).map((p) => (p.id === exportedPage.id ? ({ ...p, ...exportedPage } as Page) : p)));
          setSelectedPageId(String(exportedPage.id));
          currentHtml = String(exportedPage.customHtml || "");
        } else {
          currentHtml = String(jsonExport.html || "");
        }
      }

      const res = await fetch(
        `/api/portal/funnel-builder/funnels/${encodeURIComponent(funnelId)}/pages/${encodeURIComponent(selectedPage.id)}/generate-html`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            prompt: promptText,
            currentHtml,
            contextKeys: aiContextKeys,
            contextMedia: aiContextMedia,
          }),
        },
      );
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to generate HTML");

      setChatInput("");
      const page = json.page as Partial<Page> | undefined;
      if (page?.id) {
        setPages((prev) => (prev || []).map((p) => (p.id === page.id ? ({ ...p, ...page } as Page) : p)));
        setSelectedPageId(String(page.id));
      } else {
        await load();
      }
    } catch (e) {
      setError((e as any)?.message ? String((e as any).message) : "Failed to generate HTML");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col lg:h-[100dvh] lg:overflow-hidden">
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
                "rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700",
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
                "rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700",
                busy ? "opacity-60" : "",
              )}
              disabled={busy}
              onClick={() => {
                if (dialog?.type !== "create-form") return;
                void performCreateForm({ slug: dialog.slug, name: dialog.name });
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
        open={aiContextOpen}
        title="Add context"
        description="Select all that apply. These options help the AI match your editor blocks and presets."
        onClose={() => setAiContextOpen(false)}
        widthClassName="w-[min(720px,calc(100vw-32px))]"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              onClick={() => {
                setAiContextKeys([]);
                setAiContextMedia([]);
              }}
              disabled={busy}
            >
              Clear selection
            </button>
            <button
              type="button"
              className={classNames(
                "rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700",
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
          <div className="text-sm text-zinc-600">
            Select all that apply. If you’re not sure, leave this blank.
          </div>
          <div className="space-y-2">
            {aiContextOptions.map((opt) => {
              const checked = aiContextKeys.includes(opt.key);
              return (
                <div
                  key={opt.key}
                  className={classNames(
                    "flex cursor-pointer items-start gap-3 rounded-2xl border bg-white p-3",
                    checked ? "border-blue-200 ring-1 ring-blue-100" : "border-zinc-200",
                  )}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    disabled={busy}
                    onClick={() => {
                      setAiContextKeys((prev) => {
                        const has = (prev || []).includes(opt.key);
                        if (has) return (prev || []).filter((k) => k !== opt.key);
                        return Array.from(new Set([...(prev || []), opt.key]));
                      });
                    }}
                  >
                    <div className="text-sm font-semibold text-zinc-900">{opt.label}</div>
                    <div className="mt-1 text-xs text-zinc-600">{opt.description}</div>
                    <div className="mt-1 text-[11px] text-zinc-500">Key: {opt.key}</div>
                  </button>

                  <ToggleSwitch
                    checked={checked}
                    disabled={busy}
                    onChange={(next) => {
                      setAiContextKeys((prev) => {
                        if (next) return Array.from(new Set([...(prev || []), opt.key]));
                        return (prev || []).filter((k) => k !== opt.key);
                      });
                    }}
                  />
                </div>
              );
            })}
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900">Media library</div>
                <div className="mt-1 text-xs text-zinc-600">Optional: add images/videos the AI can reference.</div>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <input
                  ref={aiContextUploadInputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files;
                    // Allow re-selecting the same file(s)
                    e.currentTarget.value = "";
                    if (!files || files.length === 0) return;
                    void uploadAiContextFiles(files);
                  }}
                />

                <button
                  type="button"
                  disabled={busy || aiContextUploadBusy}
                  onClick={() => aiContextUploadInputRef.current?.click()}
                  className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                >
                  {aiContextUploadBusy ? "Uploading…" : "Upload files"}
                </button>

                <button
                  type="button"
                  disabled={busy || aiContextUploadBusy}
                  onClick={() => {
                    setMediaPickerTarget({ type: "ai-context" });
                    setMediaPickerOpen(true);
                  }}
                  className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                >
                  Add media
                </button>
              </div>
            </div>

            {aiContextMedia.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {aiContextMedia.map((m) => {
                  const label = (m.fileName || "").trim() || "Media";
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
              <div className="mt-3 text-sm text-zinc-600">No media selected.</div>
            )}
          </div>
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

            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-brand-ink">{funnel?.name || "…"}</div>
            </div>

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
              Blocks
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
              Custom code
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
              disabled={busy}
              onClick={() => void createPage()}
              className={classNames(
                "rounded-xl px-3 py-2 text-sm font-semibold text-white",
                busy ? "bg-zinc-400" : "bg-[color:var(--color-brand-blue)] hover:bg-blue-700",
              )}
            >
              + Page
            </button>

            <button
              type="button"
              disabled={busy || !selectedPage || !canUndo}
              onClick={() => undo()}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
              title={
                typeof navigator !== "undefined" && /mac/i.test(navigator.platform)
                  ? "Undo (⌘Z)"
                  : "Undo (Ctrl+Z)"
              }
            >
              Undo
            </button>

            <button
              type="button"
              disabled={busy || !selectedPage || !canRedo}
              onClick={() => redo()}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
              title={
                typeof navigator !== "undefined" && /mac/i.test(navigator.platform)
                  ? "Redo (⇧⌘Z)"
                  : "Redo (Ctrl+Shift+Z)"
              }
            >
              Redo
            </button>

            <button
              type="button"
              disabled={busy || !selectedPage || !selectedPageDirty}
              onClick={() => void saveCurrentPage()}
              className={classNames(
                "rounded-xl px-4 py-2 text-sm font-semibold",
                busy
                  ? "bg-zinc-400 text-white"
                  : selectedPageDirty
                    ? "bg-brand-ink text-white hover:opacity-95"
                    : "cursor-not-allowed border border-zinc-200 bg-white text-zinc-500",
              )}
            >
              {busy ? "Saving…" : selectedPageDirty ? "Save" : "Saved"}
            </button>

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
      </header>

      {error ? (
        <div className="mx-4 mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
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
                  Switch to Blocks
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
                  Switch to Custom code
                </button>
              </div>
            </div>
          ) : selectedPage.editorMode === "BLOCKS" ? (
            <div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { key: "presets", label: "Presets" },
                    { key: "text", label: "Text" },
                    { key: "layout", label: "Layout" },
                    { key: "forms", label: "Forms" },
                    { key: "media", label: "Media" },
                    { key: "header", label: "Header" },
                    { key: "shop", label: "Shop" },
                    { key: "ai", label: "AI" },
                    { key: "page", label: "Theme" },
                    { key: "selected", label: "Selected" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    disabled={t.key === "selected" ? !selectedBlock : false}
                    onClick={() => setSidebarPanel(t.key)}
                    className={classNames(
                      "rounded-xl border px-3 py-2 text-left text-xs font-semibold",
                      t.key === "ai"
                        ? "inline-flex items-center gap-2 border-transparent bg-linear-to-r from-[color:var(--color-brand-blue)] via-violet-500 to-[color:var(--color-brand-pink)] text-white shadow-sm hover:opacity-90"
                        : t.key === sidebarPanel
                          ? "border-[color:var(--color-brand-blue)] bg-blue-50 text-zinc-900"
                          : "border-zinc-200 bg-zinc-50 text-zinc-800 hover:bg-white",
                      t.key === "selected" && !selectedBlock ? "opacity-50" : "",
                    )}
                    aria-pressed={t.key === sidebarPanel}
                  >
                    {t.key === "ai" ? (
                      <>
                        <AiSparkIcon className="h-4 w-4" />
                        {t.label}
                      </>
                    ) : (
                      t.label
                    )}
                  </button>
                ))}
              </div>

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
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Font</div>
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
                              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Custom font-family</div>
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
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Brand colors</div>
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
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Title</div>
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
                          <div className="mt-1 text-xs text-zinc-500">Recommended: ~50–60 characters.</div>
                        </label>

                        <label className="block">
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Description</div>
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
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Social image URL (optional)</div>
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
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Tab icon (favicon) — this page</div>
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
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="text-sm font-semibold text-zinc-900">Presets</div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/x-funnel-preset", "hero");
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => addPresetSection("hero")}
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                      title="Drag into preview or click to add"
                    >
                      Hero
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/x-funnel-preset", "body");
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => addPresetSection("body")}
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                      title="Drag into preview or click to add"
                    >
                      Body
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/x-funnel-preset", "form");
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => addPresetSection("form")}
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                      title="Drag into preview or click to add"
                    >
                      Form
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/x-funnel-preset", "shop");
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => addPresetSection("shop")}
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                      title="Drag into preview or click to add"
                    >
                      Shop
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">Quick-start templates using real blocks (no markdown typing).</div>
                </div>
              ) : null}

              {sidebarPanel === "text" ? (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="text-sm font-semibold text-zinc-900">Text</div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {(
                      [
                        { type: "heading", label: "Heading" },
                        { type: "paragraph", label: "Text" },
                        { type: "button", label: "Button" },
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
                        title="Drag into preview or click to add"
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {sidebarPanel === "layout" ? (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="text-sm font-semibold text-zinc-900">Layout</div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {(
                      [
                        { type: "section", label: "Section" },
                        { type: "columns", label: "Columns" },
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
                        title="Drag into preview or click to add"
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {sidebarPanel === "forms" ? (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="text-sm font-semibold text-zinc-900">Forms</div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {(
                      [
                        { type: "formLink", label: "Form link" },
                        { type: "formEmbed", label: "Form embed" },
                        { type: "calendarEmbed", label: "Calendar embed" },
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
                        title="Drag into preview or click to add"
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {sidebarPanel === "media" ? (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="text-sm font-semibold text-zinc-900">Media</div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {(
                      [
                        { type: "image", label: "Image" },
                        { type: "video", label: "Video" },
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
                        title="Drag into preview or click to add"
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {sidebarPanel === "header" ? (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="text-sm font-semibold text-zinc-900">Header</div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {(
                      [
                        { type: "headerNav", label: "Header / Menu" },
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
                        onClick={() => addBlock(b.type as any)}
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                        title="Drag into preview or click to add"
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">
                    Tip: sections automatically have anchors you can link to (for example, “Section (#section-…)”).
                  </div>
                </div>
              ) : null}

              {sidebarPanel === "shop" ? (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="text-sm font-semibold text-zinc-900">Shop</div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {(
                      [
                        { type: "addToCartButton", label: "Add to cart" },
                        { type: "cartButton", label: "Cart button" },
                        { type: "salesCheckoutButton", label: "Checkout (single)" },
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
                        onClick={() => addBlock(b.type as any)}
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                        title="Drag into preview or click to add"
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">
                    Use <span className="font-semibold">Add to cart</span> + <span className="font-semibold">Cart</span> for multi-item Stripe checkout.
                  </div>
                </div>
              ) : null}

              {sidebarPanel === "ai" ? (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="text-sm font-semibold text-zinc-900">AI</div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {(
                      [
                        { type: "chatbot", label: "Chatbot" },
                        { type: "customCode", label: "Custom code" },
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
                        title="Drag into preview or click to add"
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">AI blocks add chat and advanced embeds to your funnel.</div>

                  <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Custom code (AI)</div>
                        <div className="mt-1 text-xs text-zinc-600">
                          Generate or edit a <span className="font-semibold">Custom code</span> block using the same context + media workflow.
                        </div>
                      </div>
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
                            className="shrink-0 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                          >
                            Open block
                          </button>
                        );
                      })()}
                    </div>

                    <div className="mt-3 max-h-[28vh] space-y-2 overflow-auto rounded-2xl border border-zinc-200 bg-white p-3">
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
                              Ask for an embed or a custom section. Then follow up with edits.
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
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{m.role}</div>
                            <div className="mt-1 whitespace-pre-wrap break-words">{chatDisplayContent(m)}</div>
                          </div>
                        ));
                      })()}
                    </div>

                    <textarea
                      value={aiSidebarCustomCodePrompt}
                      onChange={(e) => setAiSidebarCustomCodePrompt(e.target.value)}
                      className="mt-3 min-h-[90px] w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                      placeholder="Describe what to build or change…"
                    />

                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Context</div>
                          <div className="mt-1 text-xs text-zinc-500">Optional: add blocks/presets and media to guide the AI output.</div>
                        </div>
                        <button
                          type="button"
                          disabled={busy || aiSidebarCustomCodeBusy}
                          onClick={() => setAiContextOpen(true)}
                          className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                        >
                          Add context
                        </button>
                      </div>

                      {aiContextKeys.length || aiContextMedia.length ? (
                        <div className="flex flex-wrap gap-2">
                          {aiContextKeys.map((k) => {
                            const opt = aiContextOptions.find((o) => o.key === k);
                            const label = opt?.label || k;
                            return (
                              <button
                                key={k}
                                type="button"
                                disabled={busy || aiSidebarCustomCodeBusy}
                                onClick={() => setAiContextKeys((prev) => (prev || []).filter((x) => x !== k))}
                                className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
                                title="Click to remove"
                              >
                                <span className="font-semibold">{label}</span>
                                <span className="text-zinc-400">×</span>
                              </button>
                            );
                          })}

                          {aiContextMedia.map((m) => {
                            const label = (m.fileName || "").trim() || "Media";
                            return (
                              <button
                                key={m.url}
                                type="button"
                                disabled={busy || aiSidebarCustomCodeBusy}
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
                        <div className="text-sm text-zinc-600">No context selected.</div>
                      )}
                    </div>

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={busy || aiSidebarCustomCodeBusy || !aiSidebarCustomCodePrompt.trim()}
                        onClick={() => {
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
                                return;
                              }

                              const actions = Array.isArray(json?.actions) ? (json.actions as any[]) : [];
                              if (actions.length) {
                                const prevChat =
                                  existingBlock && existingBlock.type === "customCode" && Array.isArray((existingBlock.props as any).chatJson)
                                    ? ((existingBlock.props as any).chatJson as BlockChatMessage[])
                                    : [];

                                const actionSummaries = actions.slice(0, 6).map((a) => {
                                  if (!a || typeof a !== "object") return null;
                                  const t = typeof (a as any).type === "string" ? String((a as any).type) : "";
                                  if (t === "insertPresetAfter") {
                                    const preset = typeof (a as any).preset === "string" ? String((a as any).preset) : "";
                                    return preset ? `- Insert preset: ${preset}` : "- Insert preset";
                                  }
                                  if (t === "insertAfter") {
                                    const blockType = typeof (a as any)?.block?.type === "string" ? String((a as any).block.type) : "";
                                    return blockType ? `- Insert block: ${blockType}` : "- Insert block";
                                  }
                                  return t ? `- ${t}` : null;
                                });

                                const userMsg: BlockChatMessage = { role: "user", content: prompt, at: new Date().toISOString() };
                                const assistantMsg: BlockChatMessage = {
                                  role: "assistant",
                                  content: [pickRandom(AI_BLOCK_ACTIONS_VARIANTS), actionSummaries.filter(Boolean).join("\n")]
                                    .filter(Boolean)
                                    .join("\n"),
                                  at: new Date().toISOString(),
                                };

                                const nextChat = [...prevChat, userMsg, assistantMsg].slice(-40);

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
                              const assistantMsg: BlockChatMessage = {
                                role: "assistant",
                                content: nextHtml || nextCss ? pickRandom(AI_BLOCK_UPDATED_VARIANTS) : "No changes returned.",
                                at: new Date().toISOString(),
                              };
                              const nextChat = [...prevChat, userMsg, assistantMsg].slice(-40);

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

                              setAiSidebarCustomCodePrompt("");
                            } catch (e) {
                              const msg = (e as any)?.message ? String((e as any).message) : "Failed to generate code";
                              setError(msg);
                              toast.error(msg);
                            } finally {
                              setAiSidebarCustomCodeBusy(false);
                            }
                          })();
                        }}
                        className={classNames(
                          "flex-1 inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-white",
                          busy || aiSidebarCustomCodeBusy || !aiSidebarCustomCodePrompt.trim()
                            ? "bg-zinc-400"
                            : "bg-linear-to-r from-[color:var(--color-brand-blue)] via-violet-500 to-[color:var(--color-brand-pink)] hover:opacity-90 shadow-sm",
                        )}
                      >
                        <AiSparkIcon className="h-4 w-4" />
                        <span>{aiSidebarCustomCodeBusy ? "Working…" : "Ask AI"}</span>
                      </button>
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
                        className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                      >
                        Clear
                      </button>
                    </div>

                    {(() => {
                      const block = aiSidebarCustomCodeBlockId
                        ? findBlockInTree(editableBlocks, aiSidebarCustomCodeBlockId)?.block
                        : null;
                      if (!block || block.type !== "customCode") return null;
                      return (
                        <div className="mt-3 space-y-2">
                          <label className="block">
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Height (px)</div>
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
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">HTML</div>
                            <textarea
                              value={String((block.props as any).html || "")}
                              onChange={(e) =>
                                upsertBlock({
                                  ...block,
                                  props: { ...(block.props as any), html: e.target.value },
                                } as any)
                              }
                              className="min-h-[120px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs"
                              placeholder="<div>Hello world</div>"
                            />
                          </label>

                          <label className="block">
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">CSS (optional)</div>
                            <textarea
                              value={String((block.props as any).css || "")}
                              onChange={(e) =>
                                upsertBlock({
                                  ...block,
                                  props: { ...(block.props as any), css: e.target.value },
                                } as any)
                              }
                              className="min-h-[100px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs"
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
                  <div className="text-sm font-semibold text-zinc-900">Selected</div>
                  {!selectedBlock ? (
                    <div className="mt-2 text-sm text-zinc-600">Click a block in the preview.</div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        {selectedBlock.type}
                      </div>

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
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Custom code (AI)</div>
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
                                    <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{m.role}</div>
                                    <div className="mt-1 whitespace-pre-wrap break-words">{chatDisplayContent(m)}</div>
                                  </div>
                                ))
                              ) : (
                                <div className="text-sm text-zinc-600">Ask for an embed or a custom section. Then follow up with edits.</div>
                              )}
                            </div>

                            <textarea
                              value={customCodeBlockPrompt}
                              onChange={(e) => setCustomCodeBlockPrompt(e.target.value)}
                              className="mt-3 min-h-[90px] w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              placeholder="Describe what to build or change…"
                            />

                            <div className="mt-3 space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Context</div>
                                  <div className="mt-1 text-xs text-zinc-500">Optional: add blocks/presets and media to guide the AI output.</div>
                                </div>
                                <button
                                  type="button"
                                  disabled={busy || customCodeBlockBusy}
                                  onClick={() => setAiContextOpen(true)}
                                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                                >
                                  Add context
                                </button>
                              </div>

                              {aiContextKeys.length || aiContextMedia.length ? (
                                <div className="flex flex-wrap gap-2">
                                  {aiContextKeys.map((k) => {
                                    const opt = aiContextOptions.find((o) => o.key === k);
                                    const label = opt?.label || k;
                                    return (
                                      <button
                                        key={k}
                                        type="button"
                                        disabled={busy || customCodeBlockBusy}
                                        onClick={() => setAiContextKeys((prev) => (prev || []).filter((x) => x !== k))}
                                        className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
                                        title="Click to remove"
                                      >
                                        <span className="font-semibold">{label}</span>
                                        <span className="text-zinc-400">×</span>
                                      </button>
                                    );
                                  })}

                                  {aiContextMedia.map((m) => {
                                    const label = (m.fileName || "").trim() || "Media";
                                    return (
                                      <button
                                        key={m.url}
                                        type="button"
                                        disabled={busy || customCodeBlockBusy}
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
                                <div className="text-sm text-zinc-600">No context selected.</div>
                              )}
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

                                        const actionSummaries = actions.slice(0, 6).map((a) => {
                                          if (!a || typeof a !== "object") return null;
                                          const t = typeof (a as any).type === "string" ? String((a as any).type) : "";
                                          if (t === "insertPresetAfter") {
                                            const preset = typeof (a as any).preset === "string" ? String((a as any).preset) : "";
                                            return preset ? `- Insert preset: ${preset}` : "- Insert preset";
                                          }
                                          if (t === "insertAfter") {
                                            const blockType = typeof (a as any)?.block?.type === "string" ? String((a as any).block.type) : "";
                                            return blockType ? `- Insert block: ${blockType}` : "- Insert block";
                                          }
                                          return t ? `- ${t}` : null;
                                        });

                                        const userMsg: BlockChatMessage = { role: "user", content: prompt, at: new Date().toISOString() };
                                        const assistantMsg: BlockChatMessage = {
                                          role: "assistant",
                                          content: [
                                            pickRandom(AI_BLOCK_ACTIONS_VARIANTS),
                                            actionSummaries.filter(Boolean).join("\n"),
                                          ]
                                            .filter(Boolean)
                                            .join("\n"),
                                          at: new Date().toISOString(),
                                        };

                                        const nextChat = [...prevChat, userMsg, assistantMsg].slice(-40);

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
                                      const assistantMsg: BlockChatMessage = {
                                        role: "assistant",
                                        content: nextHtml || nextCss ? pickRandom(AI_BLOCK_UPDATED_VARIANTS) : "No changes returned.",
                                        at: new Date().toISOString(),
                                      };

                                      const nextChat = [...prevChat, userMsg, assistantMsg].slice(-40);

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
                                    : "bg-linear-to-r from-[color:var(--color-brand-blue)] via-violet-500 to-[color:var(--color-brand-pink)] hover:opacity-90 shadow-sm",
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
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Height (px)</div>
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
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">HTML</div>
                            <textarea
                              value={String((selectedBlock.props as any).html || "")}
                              onChange={(e) =>
                                upsertBlock({
                                  ...selectedBlock,
                                  props: { ...(selectedBlock.props as any), html: e.target.value },
                                } as any)
                              }
                              className="min-h-[140px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs"
                              placeholder="<div>Hello world</div>"
                            />
                          </label>
                          <label className="block">
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">CSS (optional)</div>
                            <textarea
                              value={String((selectedBlock.props as any).css || "")}
                              onChange={(e) =>
                                upsertBlock({
                                  ...selectedBlock,
                                  props: { ...(selectedBlock.props as any), css: e.target.value },
                                } as any)
                              }
                              className="min-h-[120px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs"
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
                                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Placement (horizontal)</div>
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
                                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Placement (vertical)</div>
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
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Agent ID</div>
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
                                    label: a.name ? `${a.name} — ${a.id}` : a.id,
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
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Launcher style</div>
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
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Launcher image (optional)</div>

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
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Product</div>
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
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Product name</div>
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
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Short description</div>
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
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Quantity</div>
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
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Product</div>
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
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Product name</div>
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
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Short description</div>
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
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Quantity</div>
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
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Button text</div>
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
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Mobile menu</div>
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
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Desktop menu</div>
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
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Header size</div>
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
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Menu trigger</div>
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
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Directory label</div>
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
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Logo image</div>
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
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Selected logo</div>
                              <div className="mt-1 break-all font-mono text-xs text-zinc-700">
                                {String((selectedBlock.props as any)?.logoUrl || "").trim()}
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">No logo selected.</div>
                          )}
                        </div>

                        <label className="block">
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Logo link (optional)</div>
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
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Menu items</div>
                          <div className="mt-2 space-y-2">
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

                              return (
                                <>
                                  {items.map((it: any) => {
                                    const itemId = String(it?.id || "");
                                    const label = String(it?.label || "");
                                    const kind = it?.kind === "page" || it?.kind === "anchor" ? String(it.kind) : "url";

                                    return (
                                      <div key={itemId} className="rounded-xl border border-zinc-200 bg-white p-3">
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="min-w-0 flex-1 space-y-2">
                                            <input
                                              value={label}
                                              onChange={(e) => {
                                                const next = items.map((x: any) => (x?.id === itemId ? { ...x, label: e.target.value } : x));
                                                updateItems(next);
                                              }}
                                              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                              placeholder="Label"
                                            />

                                            <PortalListboxDropdown
                                              value={kind}
                                              onChange={(v) => {
                                                const nextKind = String(v || "url");
                                                const next = items.map((x: any) => {
                                                  if (x?.id !== itemId) return x;
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

                                            {kind === "url" ? (
                                              <>
                                                <input
                                                  value={String(it?.url || "")}
                                                  onChange={(e) => {
                                                    const next = items.map((x: any) => (x?.id === itemId ? { ...x, url: e.target.value } : x));
                                                    updateItems(next);
                                                  }}
                                                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                                  placeholder="https://…"
                                                />
                                                <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-3 py-2">
                                                  <span className="text-sm font-semibold text-zinc-900">Open in new tab</span>
                                                  <ToggleSwitch
                                                    checked={Boolean(it?.newTab)}
                                                    disabled={busy}
                                                    onChange={(checked) => {
                                                      const next = items.map((x: any) => (x?.id === itemId ? { ...x, newTab: checked } : x));
                                                      updateItems(next);
                                                    }}
                                                  />
                                                </label>
                                              </>
                                            ) : null}

                                            {kind === "page" ? (
                                              <PortalListboxDropdown
                                                value={String(it?.pageSlug || "")}
                                                onChange={(v) => {
                                                  const next = items.map((x: any) => (x?.id === itemId ? { ...x, pageSlug: String(v || "") } : x));
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

                                            {kind === "anchor" ? (
                                              <>
                                                <PortalListboxDropdown
                                                  value={String(it?.anchorId || "")}
                                                  onChange={(v) => {
                                                    const next = items.map((x: any) => (x?.id === itemId ? { ...x, anchorId: String(v || "") } : x));
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
                                                  value={String(it?.anchorId || "")}
                                                  onChange={(e) => {
                                                    const next = items.map((x: any) => (x?.id === itemId ? { ...x, anchorId: e.target.value } : x));
                                                    updateItems(next);
                                                  }}
                                                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                                  placeholder="anchor-id"
                                                />
                                              </>
                                            ) : null}
                                          </div>

                                          <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => {
                                              const next = items.filter((x: any) => x?.id !== itemId);
                                              updateItems(next);
                                            }}
                                            className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                                          >
                                            Remove
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}

                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      const next = [
                                        ...items,
                                        { id: newId(), label: "Link", kind: "url", url: "" },
                                      ];
                                      updateItems(next);
                                    }}
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                                  >
                                    + Add menu item
                                  </button>
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
                                `/book/${encodeURIComponent(bookingSiteSlug)}/c/${encodeURIComponent(selectedBlock.props.calendarId)}`,
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
          ) : (
            <div>
              <div className="text-sm font-semibold text-zinc-900">Custom code (AI)</div>
              <div className="mt-3 max-h-[40vh] space-y-2 overflow-auto rounded-2xl border border-zinc-200 bg-white p-3">
                {selectedChat.length === 0 ? (
                  <div className="text-sm text-zinc-600">
                    Ask for a layout and CTAs. Then follow up with edits like “change the font”.
                  </div>
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
                        <div className="mt-1 whitespace-pre-wrap wrap-break-word">{chatDisplayContent(m)}</div>
                    </div>
                  ))
                )}
              </div>

              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="mt-3 min-h-27.5 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                placeholder="Describe what to build or change…"
              />

              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Context</div>
                    <div className="mt-1 text-xs text-zinc-500">Optional: add blocks/presets and media to guide the AI output.</div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setAiContextOpen(true)}
                    className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                  >
                    Add context
                  </button>
                </div>

                {aiContextKeys.length || aiContextMedia.length ? (
                  <div className="flex flex-wrap gap-2">
                    {aiContextKeys.map((k) => {
                      const opt = aiContextOptions.find((o) => o.key === k);
                      const label = opt?.label || k;
                      return (
                        <button
                          key={k}
                          type="button"
                          disabled={busy}
                          onClick={() => setAiContextKeys((prev) => (prev || []).filter((x) => x !== k))}
                          className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
                          title="Click to remove"
                        >
                          <span className="font-semibold">{label}</span>
                          <span className="text-zinc-400">×</span>
                        </button>
                      );
                    })}

                    {aiContextMedia.map((m) => {
                      const label = (m.fileName || "").trim() || "Media";
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
                  <div className="text-sm text-zinc-600">No context selected.</div>
                )}
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy || !chatInput.trim()}
                  onClick={() => void runAi()}
                  className={classNames(
                    "flex-1 inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-white",
                    busy || !chatInput.trim() ? "bg-zinc-400" : "bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink) hover:opacity-90 shadow-sm",
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
                  <span>{busy ? "Working…" : "Ask AI"}</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setSelectedPageLocal({ customChatJson: [] });
                    void savePage({ customChatJson: [] });
                  }}
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  Clear
                </button>
              </div>

              <div className="mt-4 border-t border-zinc-200 pt-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">HTML</div>
                <textarea
                  value={selectedPage.customHtml || ""}
                  onChange={(e) => setSelectedPageLocal({ customHtml: e.target.value })}
                  className="mt-2 min-h-60 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs"
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
                if (!selectedPage || selectedPage.editorMode !== "BLOCKS") return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(e) => {
                if (!selectedPage || selectedPage.editorMode !== "BLOCKS") return;
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
                <div className="text-sm text-zinc-600">Select a page to preview.</div>
              ) : selectedPage.editorMode === "CUSTOM_HTML" ? (
                <div
                  className={classNames(
                    "mx-auto w-full overflow-hidden border border-zinc-200 bg-white",
                    previewDevice === "mobile" ? "max-w-105 rounded-3xl" : "max-w-5xl rounded-none",
                  )}
                >
                  <iframe
                    title={selectedPage.title}
                    sandbox="allow-forms allow-popups allow-scripts"
                    srcDoc={selectedPage.customHtml || ""}
                    className="h-[78vh] w-full bg-white"
                  />
                </div>
              ) : (
                <div
                  className={classNames(
                    "mx-auto w-full border border-zinc-200",
                    previewDevice === "mobile" ? "max-w-105 rounded-3xl" : "max-w-5xl rounded-none",
                  )}
                >
                  <div className="min-h-[70vh]">
                    {editableBlocks.length === 0 ? (
                      <div className="p-8">
                        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-600">
                          Drag a block from the left, or click a block to add.
                        </div>
                      </div>
                    ) : (
                      renderCreditFunnelBlocks({
                        blocks: pageSettingsBlock ? [pageSettingsBlock, ...editableBlocks] : editableBlocks,
                        basePath,
                        context: {
                          bookingSiteSlug: bookingSiteSlug || undefined,
                          funnelPageId: selectedPage.id,
                          previewDevice,
                        },
                        editor: {
                          enabled: true,
                          selectedBlockId,
                          hoveredBlockId,
                          onSelectBlockId: (id) => {
                            setSelectedBlockId(id);
                            setSidebarPanel("selected");
                          },
                          onHoverBlockId: (id) => setHoveredBlockId(id),
                          onUpsertBlock: (next) => upsertBlock(next),
                          onReorder: (dragId, dropId) => reorderBlocks(dragId, dropId),
                          onMove: (id, dir) => moveBlock(id, dir),
                          canMove: (id, dir) => canMoveBlock(id, dir),
                        },
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
