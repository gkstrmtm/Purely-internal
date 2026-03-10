"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams, useSelectedLayoutSegment } from "next/navigation";

import { PortalBlogsClient, type BlogsTab } from "@/app/portal/app/services/blogs/PortalBlogsClient";

function tabFromSegment(seg: string | null): BlogsTab {
  if (seg === "automation") return "automation";
  if (seg === "settings") return "settings";
  return "posts";
}

function hrefForTab(tab: BlogsTab) {
  if (tab === "posts") return "/portal/app/services/blogs";
  if (tab === "automation") return "/portal/app/services/blogs/automation";
  return "/portal/app/services/blogs/settings";
}

export function PortalBlogsShell() {
  const router = useRouter();
  const seg = useSelectedLayoutSegment();
  const searchParams = useSearchParams();

  const routeTab = useMemo(() => tabFromSegment(seg), [seg]);

  return (
    <PortalBlogsClient
      routeTab={routeTab}
      onTabChange={(next) => {
        const href = hrefForTab(next);
        if (!href) return;
        const qs = searchParams?.toString() || "";
        router.push(qs ? `${href}?${qs}` : href);
      }}
    />
  );
}
