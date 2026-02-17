"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function computeHelpHref(pathname: string | null): string {
  const path = pathname ?? "";

  if (!path.startsWith("/portal")) {
    return "/portal/tutorials";
  }

  // Portal marketing / getting started routes fall back to main tutorials.
  if (path === "/portal" || path.startsWith("/portal/get-started")) {
    return "/portal/tutorials";
  }

  // Dashboard.
  if (path === "/portal/app" || path === "/portal/app/") {
    return "/portal/tutorials/dashboard";
  }

  // Services list view.
  if (path === "/portal/app/services" || path.startsWith("/portal/app/services?")) {
    return "/portal/tutorials";
  }

  // Specific service page, e.g. /portal/app/services/inbox/...
  if (path.startsWith("/portal/app/services/")) {
    const segments = path.split("/");
    // ['', 'portal', 'app', 'services', '<slug>', ...]
    const slug = segments[4];
    if (slug) return `/portal/tutorials/${slug}`;
    return "/portal/tutorials";
  }

  // People / Billing / Profile top-level sections.
  if (path.startsWith("/portal/app/people")) {
    return "/portal/tutorials/people";
  }

  if (path.startsWith("/portal/app/billing")) {
    return "/portal/tutorials/billing";
  }

  if (path.startsWith("/portal/app/profile")) {
    return "/portal/tutorials/profile";
  }

  return "/portal/tutorials";
}

export function PortalHelpLink() {
  const pathname = usePathname();
  const href = computeHelpHref(pathname);

  return (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50"
    >
      Help
    </Link>
  );
}
