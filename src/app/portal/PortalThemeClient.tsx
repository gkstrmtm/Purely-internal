"use client";

import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";

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
  const [deviceTheme, setDeviceTheme] = useState<"light" | "dark">(() => resolveTheme("device"));
  const [transitionsReady, setTransitionsReady] = useState(false);
  const effectiveMode = previewMode ?? preferredMode;
  const resolvedTheme = effectiveMode === "device" ? deviceTheme : effectiveMode;

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
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setDeviceTheme(media.matches ? "dark" : "light");
    apply();

    const onChange = () => apply();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timeout = window.setTimeout(() => setTransitionsReady(true), 40);
    return () => window.clearTimeout(timeout);
  }, []);

  useLayoutEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;

    root.setAttribute("data-portal-theme", resolvedTheme);
    root.setAttribute("data-portal-theme-mode", effectiveMode);
    root.setAttribute("data-portal-device-theme", deviceTheme);
    root.setAttribute("data-portal-theme-ready", transitionsReady ? "true" : "false");
    root.style.colorScheme = resolvedTheme;
  }, [deviceTheme, effectiveMode, resolvedTheme, transitionsReady]);

  useEffect(() => {
    return () => {
      if (typeof document === "undefined") return;
      const root = document.documentElement;
      root.removeAttribute("data-portal-theme");
      root.removeAttribute("data-portal-theme-mode");
      root.removeAttribute("data-portal-device-theme");
      root.removeAttribute("data-portal-theme-ready");
      root.style.colorScheme = "";
    };
  }, []);

  const colorScheme = useMemo(() => resolvedTheme, [resolvedTheme]);

  return (
    <div
      data-portal-theme={resolvedTheme}
      data-portal-theme-mode={effectiveMode}
      data-portal-device-theme={deviceTheme}
      data-portal-theme-ready={transitionsReady ? "true" : "false"}
      style={{ colorScheme }}
    >
      {children}
    </div>
  );
}