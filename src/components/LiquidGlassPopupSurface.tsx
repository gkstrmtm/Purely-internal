"use client";

import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

import GlassSurface from "@/components/GlassSurface";

type LiquidGlassPopupSurfaceProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  contentClassName?: string;
  borderRadius?: number;
  overlayClassName?: string;
  showGlass?: boolean;
  showTopGlow?: boolean;
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
  style: { background: "var(--pa-portal-liquid-glass-bg, rgba(255,255,255,0.46))", boxShadow: "none" },
};

const LiquidGlassPopupSurface = forwardRef<HTMLDivElement, LiquidGlassPopupSurfaceProps>(function LiquidGlassPopupSurface(
  { children, className, contentClassName, style, borderRadius = 28, overlayClassName, showGlass = true, showTopGlow = true, ...rest },
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
        className={classNames(
          "pa-portal-liquid-popup__overlay pointer-events-none absolute inset-0 border border-transparent bg-[rgba(255,255,255,0.5)] shadow-[0_20px_48px_rgba(15,23,42,0.18)] backdrop-blur-[18px]",
          overlayClassName,
        )}
        style={{ borderRadius }}
        aria-hidden="true"
      />
      {showGlass ? (
        <GlassSurface
          {...liquidGlassSurfaceProps}
          width="100%"
          height="100%"
          borderRadius={borderRadius}
          className="pa-portal-liquid-popup__glass pointer-events-none absolute inset-0 h-full w-full"
        />
      ) : null}
      {showTopGlow ? (
        <div
          className="pa-portal-liquid-popup__glow pointer-events-none absolute inset-x-4 top-1 h-10 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,255,255,0.18))] opacity-90 blur-sm"
          aria-hidden="true"
        />
      ) : null}
      <div className={classNames("relative", contentClassName)}>{children}</div>
    </div>
  );
});

export default LiquidGlassPopupSurface;
