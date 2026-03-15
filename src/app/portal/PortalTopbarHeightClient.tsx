"use client";

import { useEffect } from "react";

function setTopbarHeightVar() {
  const topbar = document.querySelector<HTMLElement>(".pa-portal-topbar");
  if (!topbar) return;
  const height = Math.ceil(topbar.getBoundingClientRect().height);
  document.documentElement.style.setProperty("--pa-portal-topbar-height", `${height}px`);
}

export function PortalTopbarHeightClient() {
  useEffect(() => {
    setTopbarHeightVar();

    const onResize = () => setTopbarHeightVar();
    window.addEventListener("resize", onResize, { passive: true });

    return () => window.removeEventListener("resize", onResize);
  }, []);

  return null;
}
