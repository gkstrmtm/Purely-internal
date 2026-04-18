"use client";

import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

import GlassSurface from "@/components/GlassSurface";

type LiquidGlassPopupSurfaceProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  contentClassName?: string;
  borderRadius?: number;
};

const classNames = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" ");

function hasExplicitPositionClass(className: string | undefined) {
  return /(?:^|\s)(fixed|absolute|sticky|relative)(?:\s|$)/.test(className || "");
}

const liquidGlassSurfaceProps = {
  borderWidth: 0.04,
  blur: 7,
  displace: 0.22,
  distortionScale: -72,
  redOffset: 0,
  greenOffset: 2,
  blueOffset: 6,
  backgroundOpacity: 0.16,
  saturation: 1.05,
  brightness: 46,
  opacity: 0.985,
  mixBlendMode: "soft-light" as const,
  style: { background: "rgba(255,255,255,0.46)", boxShadow: "none" },
};

const LiquidGlassPopupSurface = forwardRef<HTMLDivElement, LiquidGlassPopupSurfaceProps>(function LiquidGlassPopupSurface(
  { children, className, contentClassName, style, borderRadius = 28, ...rest },
  ref,
) {
  const rootPositionClass = hasExplicitPositionClass(className) ? null : "relative";

  return (
    <div
      ref={ref}
      {...rest}
      className={classNames(rootPositionClass, "isolate overflow-hidden", className)}
      style={{ ...(style as CSSProperties | undefined), borderRadius }}
    >
      <div
        className="pointer-events-none absolute inset-0 border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.54))] shadow-[0_20px_48px_rgba(15,23,42,0.18)] backdrop-blur-[18px]"
        style={{ borderRadius }}
        aria-hidden="true"
      />
      <GlassSurface
        {...liquidGlassSurfaceProps}
        width="100%"
        height="100%"
        borderRadius={borderRadius}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
      <div
        className="pointer-events-none absolute inset-x-4 top-1 h-10 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,255,255,0.18))] opacity-90 blur-sm"
        aria-hidden="true"
      />
      <div className={classNames("relative", contentClassName)}>{children}</div>
    </div>
  );
});

export default LiquidGlassPopupSurface;
