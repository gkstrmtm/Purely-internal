"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { IconHelpCircle } from "@/app/portal/PortalIcons";

function computeHelpHref(pathname: string | null): string {
  const path = pathname ?? "";

  const isCredit = path.startsWith("/credit");
  const base = isCredit ? "/credit" : "/portal";
  const internal = isCredit ? `/portal${path.slice("/credit".length) || ""}` : path;

  if (!internal.startsWith("/portal")) {
    return `${base}/tutorials`;
  }

  // Portal marketing / getting started routes fall back to main tutorials.
  if (internal === "/portal" || internal.startsWith("/portal/get-started")) {
    return `${base}/tutorials`;
  }

  // Dashboard.
  if (internal === "/portal/app" || internal === "/portal/app/") {
    return `${base}/tutorials/dashboard`;
  }

  // Services list view.
  if (internal === "/portal/app/services" || internal.startsWith("/portal/app/services?")) {
    return `${base}/tutorials`;
  }

  // Specific service page, e.g. /portal/app/services/inbox/...
  if (internal.startsWith("/portal/app/services/")) {
    const segments = internal.split("/");
    // ['', 'portal', 'app', 'services', '<slug>', ...]
    const slug = segments[4];
    if (slug) return `${base}/tutorials/${slug}`;
    return `${base}/tutorials`;
  }

  // People / Billing / Profile top-level sections.
  if (internal.startsWith("/portal/app/people")) {
    return `${base}/tutorials/people`;
  }

  if (internal.startsWith("/portal/app/billing")) {
    return `${base}/tutorials/billing`;
  }

  if (internal.startsWith("/portal/app/profile")) {
    return `${base}/tutorials/profile`;
  }

  return `${base}/tutorials`;
}

export function PortalHelpLink({ glass = false }: { glass?: boolean }) {
  const pathname = usePathname();
  const href = computeHelpHref(pathname);

  return (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Help"
      title="Help"
      className={glass
        ? "group relative inline-flex h-9 w-9 items-center justify-center text-zinc-700 transition-colors duration-150 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40"
        : "group relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-transparent text-zinc-700 transition-all duration-100 hover:scale-105 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40"}
    >
      <IconHelpCircle size={18} />

      <span className="sr-only">Help</span>

      <span className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 opacity-0 shadow-sm transition-opacity duration-100 group-hover:opacity-100">
        Help
      </span>
    </Link>
  );
}
