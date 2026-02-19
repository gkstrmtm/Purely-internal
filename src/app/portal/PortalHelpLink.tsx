"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function computeHelpHref(pathname: string | null): string {
  const path = pathname ?? "";

  const isCredit = path.startsWith("/credit");
  const base = isCredit ? "/credit" : "/portal";
  const internal = isCredit ? path.replace("/credit", "/portal") : path;

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
