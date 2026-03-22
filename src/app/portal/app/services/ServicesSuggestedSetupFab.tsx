"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";

import { SuggestedSetupModalLauncher } from "@/components/SuggestedSetupModalLauncher";

function getServiceSlugFromPathname(pathname: string): string | null {
  const parts = String(pathname || "")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);

  const idx = parts.indexOf("services");
  if (idx < 0) return null;

  const service = parts[idx + 1] ?? "";
  return service ? service : null;
}

export function ServicesSuggestedSetupFab() {
  const pathname = usePathname();

  const serviceSlug = useMemo(() => getServiceSlugFromPathname(pathname), [pathname]);

  return (
    <div className="fixed bottom-5 right-5 z-50">
      <SuggestedSetupModalLauncher
        serviceSlugs={serviceSlug ? [serviceSlug] : undefined}
        buttonLabel="Suggested setup"
        buttonClassName="inline-flex items-center justify-center rounded-full bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink) px-4 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-90"
        title={serviceSlug ? `Suggested setup: ${serviceSlug}` : "Suggested setup"}
      />
    </div>
  );
}
