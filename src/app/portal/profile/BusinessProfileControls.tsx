"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { PortalMultiSelectDropdown, type PortalMultiSelectOption } from "@/components/PortalMultiSelectDropdown";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHex(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(raw);
  if (!match) return null;
  const digits = match[1].length === 3 ? match[1].split("").map((ch) => ch + ch).join("") : match[1];
  return `#${digits.toLowerCase()}`;
}

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };
type Hsv = { h: number; s: number; v: number };

function hexToRgb(hex: string): Rgb | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const n = Number.parseInt(normalized.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(rgb: Rgb) {
  const toPart = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
  return `#${toPart(rgb.r)}${toPart(rgb.g)}${toPart(rgb.b)}`;
}

function rgbToHsl(rgb: Rgb): Hsl {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l: lightness * 100 };

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;

  return {
    h: ((hue * 60) + 360) % 360,
    s: saturation * 100,
    l: lightness * 100,
  };
}

function hslToRgb(hsl: Hsl): Rgb {
  const h = ((hsl.h % 360) + 360) % 360;
  const s = clamp(hsl.s, 0, 100) / 100;
  const l = clamp(hsl.l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (h < 60) {
    r1 = c;
    g1 = x;
  } else if (h < 120) {
    r1 = x;
    g1 = c;
  } else if (h < 180) {
    g1 = c;
    b1 = x;
  } else if (h < 240) {
    g1 = x;
    b1 = c;
  } else if (h < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function rgbToHsv(rgb: Rgb): Hsv {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;

  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
  }

  return {
    h: ((hue * 60) + 360) % 360,
    s: max === 0 ? 0 : (delta / max) * 100,
    v: max * 100,
  };
}

function hsvToRgb(hsv: Hsv): Rgb {
  const h = ((hsv.h % 360) + 360) % 360;
  const s = clamp(hsv.s, 0, 100) / 100;
  const v = clamp(hsv.v, 0, 100) / 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (h < 60) {
    r1 = c;
    g1 = x;
  } else if (h < 120) {
    r1 = x;
    g1 = c;
  } else if (h < 180) {
    g1 = c;
    b1 = x;
  } else if (h < 240) {
    g1 = x;
    b1 = c;
  } else if (h < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function CreatableMultiSelectField(props: {
  label: string;
  value: string[];
  options: PortalMultiSelectOption[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  hint?: string;
  maxItems?: number;
}) {
  const { label, value, options, onChange, disabled, placeholder, hint, maxItems } = props;
  const limitedValue = useMemo(() => {
    const unique = Array.from(new Set((value || []).map((entry) => String(entry || "").trim()).filter(Boolean)));
    return typeof maxItems === "number" ? unique.slice(0, maxItems) : unique;
  }, [maxItems, value]);

  return (
    <div>
      <label className="text-xs font-semibold text-zinc-600">{label}</label>
      <div className="mt-1">
        <PortalMultiSelectDropdown
          label={label}
          value={limitedValue}
          options={options}
          onChange={(next) => {
            const unique = Array.from(new Set((next || []).map((entry) => String(entry || "").trim()).filter(Boolean)));
            onChange(typeof maxItems === "number" ? unique.slice(0, maxItems) : unique);
          }}
          allowCustom
          placeholder={placeholder}
          disabled={disabled}
        />
      </div>
      {hint ? <div className="mt-1 text-xs text-zinc-500">{hint}</div> : null}
    </div>
  );
}

export function AdvancedColorField(props: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  fallbackHex: string;
  placeholder?: string;
}) {
  const { label, value, onChange, disabled, fallbackHex, placeholder } = props;
  const paletteRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const resolvedHex = normalizeHex(value) ?? normalizeHex(fallbackHex) ?? "#1d4ed8";
  const rgb = useMemo(() => hexToRgb(resolvedHex) ?? { r: 29, g: 78, b: 216 }, [resolvedHex]);
  const hsv = useMemo(() => rgbToHsv(rgb), [rgb]);
  const hsl = useMemo(() => rgbToHsl(rgb), [rgb]);
  const [hexDraft, setHexDraft] = useState(resolvedHex);

  useEffect(() => {
    setHexDraft(resolvedHex);
  }, [resolvedHex]);

  const updateFromRgb = (nextRgb: Rgb) => {
    const nextHex = rgbToHex(nextRgb);
    onChange(nextHex);
    setHexDraft(nextHex);
  };

  const updatePalette = (clientX: number, clientY: number) => {
    if (!paletteRef.current || disabled) return;
    const rect = paletteRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const saturation = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
    const valuePct = 100 - clamp(((clientY - rect.top) / rect.height) * 100, 0, 100);
    updateFromRgb(hsvToRgb({ h: hsv.h, s: saturation, v: valuePct }));
  };

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      if (!draggingRef.current) return;
      updatePalette(event.clientX, event.clientY);
    };
    const handleUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  });

  const paletteHandleLeft = `${hsv.s}%`;
  const paletteHandleTop = `${100 - hsv.v}%`;

  return (
    <div>
      <label className="text-xs font-semibold text-zinc-600">{label}</label>
      <div className="mt-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="w-full max-w-56">
            <div
              ref={paletteRef}
              className={classNames(
                "relative aspect-square w-full overflow-hidden rounded-2xl",
                disabled ? "cursor-not-allowed opacity-60" : "cursor-crosshair",
              )}
              style={{ backgroundColor: `hsl(${Math.round(hsv.h)} 100% 50%)` }}
              onMouseDown={(event) => {
                if (disabled) return;
                draggingRef.current = true;
                updatePalette(event.clientX, event.clientY);
              }}
            >
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#ffffff,rgba(255,255,255,0))]" />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0),#000000)]" />
              <div
                className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 border border-white shadow-[0_0_0_1px_rgba(15,23,42,0.28)]"
                style={{ left: paletteHandleLeft, top: paletteHandleTop }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={Math.round(hsv.h)}
              disabled={disabled}
              onChange={(event) => updateFromRgb(hsvToRgb({ h: Number(event.target.value), s: hsv.s, v: hsv.v }))}
              className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-[linear-gradient(90deg,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)]"
              aria-label={`${label} hue`}
            />
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Hex</label>
              <input
                value={hexDraft}
                onChange={(event) => {
                  const next = event.target.value;
                  setHexDraft(next);
                  const normalized = normalizeHex(next);
                  if (normalized) onChange(normalized);
                }}
                onBlur={() => setHexDraft(resolvedHex)}
                disabled={disabled}
                className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-300"
                placeholder={placeholder || fallbackHex}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {([
                ["R", rgb.r],
                ["G", rgb.g],
                ["B", rgb.b],
              ] as const).map(([channel, channelValue], index) => (
                <div key={channel}>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{channel}</label>
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={channelValue}
                    disabled={disabled}
                    onChange={(event) => {
                      const next = clamp(Number(event.target.value || 0), 0, 255);
                      const nextRgb = { ...rgb };
                      if (index === 0) nextRgb.r = next;
                      if (index === 1) nextRgb.g = next;
                      if (index === 2) nextRgb.b = next;
                      updateFromRgb(nextRgb);
                    }}
                    className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-300"
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {([
                ["H", Math.round(hsl.h), 360],
                ["S", Math.round(hsl.s), 100],
                ["L", Math.round(hsl.l), 100],
              ] as const).map(([channel, channelValue, max], index) => (
                <div key={channel}>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{channel}</label>
                  <input
                    type="number"
                    min={0}
                    max={max}
                    value={channelValue}
                    disabled={disabled}
                    onChange={(event) => {
                      const next = clamp(Number(event.target.value || 0), 0, max);
                      const nextHsl = { ...hsl };
                      if (index === 0) nextHsl.h = next;
                      if (index === 1) nextHsl.s = next;
                      if (index === 2) nextHsl.l = next;
                      updateFromRgb(hslToRgb(nextHsl));
                    }}
                    className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-300"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}