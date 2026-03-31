"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { PortalThemeMode } from "@/lib/portalTheme.server";

type PortalThemePreviewDetail = {
  mode?: PortalThemeMode | null;
};

function normalizePreviewMode(input: unknown): PortalThemeMode | null {
  if (input === "light" || input === "dark" || input === "device") return input;
  return null;
}

function resolveTheme(mode: PortalThemeMode): "light" | "dark" {
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";

  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  return "light";
}

export function PortalThemeClient({
  preferredMode,
  children,
}: {
  preferredMode: PortalThemeMode;
  children: ReactNode;
}) {
  const [previewMode, setPreviewMode] = useState<PortalThemeMode | null>(null);
  const effectiveMode = previewMode ?? preferredMode;
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => resolveTheme(effectiveMode));

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onPreview = (event: Event) => {
      const detail = (event as CustomEvent<PortalThemePreviewDetail>).detail;
      setPreviewMode(normalizePreviewMode(detail?.mode));
    };

    window.addEventListener("pa.portal.theme-preview", onPreview as EventListener);
    return () => window.removeEventListener("pa.portal.theme-preview", onPreview as EventListener);
  }, []);

  useEffect(() => {
    const apply = () => setResolvedTheme(resolveTheme(effectiveMode));
    apply();

    if (effectiveMode !== "device" || typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [effectiveMode]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const previousTheme = root.getAttribute("data-portal-theme");
    const previousMode = root.getAttribute("data-portal-theme-mode");
    const previousColorScheme = root.style.colorScheme;

    root.setAttribute("data-portal-theme", resolvedTheme);
    root.setAttribute("data-portal-theme-mode", effectiveMode);
    root.style.colorScheme = resolvedTheme;

    return () => {
      if (previousTheme) root.setAttribute("data-portal-theme", previousTheme);
      else root.removeAttribute("data-portal-theme");

      if (previousMode) root.setAttribute("data-portal-theme-mode", previousMode);
      else root.removeAttribute("data-portal-theme-mode");

      root.style.colorScheme = previousColorScheme;
    };
  }, [effectiveMode, resolvedTheme]);

  const colorScheme = useMemo(() => resolvedTheme, [resolvedTheme]);

  return (
    <div data-portal-theme={resolvedTheme} data-portal-theme-mode={effectiveMode} style={{ colorScheme }}>
      {children}
    </div>
  );
}