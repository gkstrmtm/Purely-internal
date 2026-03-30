"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";

export type PortalSidebarOverride = {
  desktopTopRight?: ReactNode;
  desktopSidebarContent?: ReactNode;
};

type PortalSidebarOverrideController = {
  override: PortalSidebarOverride | null;
  setOverride: (override: PortalSidebarOverride | null) => void;
};

const PortalSidebarOverrideContext = createContext<PortalSidebarOverrideController | null>(null);

export function PortalSidebarOverrideProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<PortalSidebarOverride | null>(null);
  const value = useMemo(() => ({ override, setOverride }), [override]);

  return <PortalSidebarOverrideContext.Provider value={value}>{children}</PortalSidebarOverrideContext.Provider>;
}

export function usePortalSidebarOverride(): PortalSidebarOverride | null {
  return useContext(PortalSidebarOverrideContext)?.override ?? null;
}

export function useSetPortalSidebarOverride(): (override: PortalSidebarOverride | null) => void {
  const controller = useContext(PortalSidebarOverrideContext);
  if (!controller) {
    throw new Error("useSetPortalSidebarOverride must be used within PortalSidebarOverrideProvider");
  }

  return controller.setOverride;
}
