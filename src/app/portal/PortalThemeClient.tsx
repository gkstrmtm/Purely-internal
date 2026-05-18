"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { PortalThemeMode } from "@/lib/portalTheme.server";

function resolveLightMode(): "light" {
  return "light";
}

export function PortalThemeClient({
  preferredMode,
  children,
}: {
  preferredMode: PortalThemeMode;
  children: ReactNode;
}) {
  void preferredMode;
  const [transitionsReady, setTransitionsReady] = useState(false);
  const effectiveMode = resolveLightMode();
  const resolvedTheme = effectiveMode;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timeout = window.setTimeout(() => setTransitionsReady(true), 40);
    return () => window.clearTimeout(timeout);
  }, []);

  const colorScheme = useMemo(() => resolvedTheme, [resolvedTheme]);

  return (
    <div
      data-portal-theme={resolvedTheme}
      data-portal-theme-mode={effectiveMode}
      data-portal-device-theme="light"
      data-portal-theme-ready={transitionsReady ? "true" : "false"}
      style={{ colorScheme }}
    >
      {children}
    </div>
  );
}