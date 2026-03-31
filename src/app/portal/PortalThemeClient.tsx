"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { PortalThemeMode } from "@/lib/portalTheme.server";

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
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => resolveTheme(preferredMode));

  useEffect(() => {
    const apply = () => setResolvedTheme(resolveTheme(preferredMode));
    apply();

    if (preferredMode !== "device" || typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preferredMode]);

  const colorScheme = useMemo(() => resolvedTheme, [resolvedTheme]);

  return (
    <div data-portal-theme={resolvedTheme} data-portal-theme-mode={preferredMode} style={{ colorScheme }}>
      {children}
    </div>
  );
}