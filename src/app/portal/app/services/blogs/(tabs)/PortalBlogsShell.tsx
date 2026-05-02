"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams, useSelectedLayoutSegment } from "next/navigation";

import { PortalBlogsClient, type BlogsTab } from "@/app/portal/app/services/blogs/PortalBlogsClient";

function tabFromSegment(seg: string | null): BlogsTab {
  if (seg === "automation") return "automation";
  if (seg === "settings") return "settings";
  return "posts";
}

function hrefForTab(tab: BlogsTab, pathname: string | null) {
  const appBase = String(pathname || "").startsWith("/credit") ? "/credit/app" : "/portal/app";
  if (tab === "posts") return `${appBase}/services/blogs`;
  if (tab === "automation") return `${appBase}/services/blogs/automation`;
  return `${appBase}/services/blogs/settings`;
}

export function PortalBlogsShell() {
  const router = useRouter();
  const pathname = usePathname();
  const seg = useSelectedLayoutSegment();
  const searchParams = useSearchParams();

  const routeTab = useMemo(() => tabFromSegment(seg), [seg]);

  return (
    <PortalBlogsClient
      routeTab={routeTab}
      onTabChange={(next) => {
        const href = hrefForTab(next, pathname);
        if (!href) return;
        const qs = searchParams?.toString() || "";
        router.push(qs ? `${href}?${qs}` : href, { scroll: false });
      }}
    />
  );
}
