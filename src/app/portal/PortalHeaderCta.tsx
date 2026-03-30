"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { IconCalendar } from "@/app/portal/PortalIcons";

export function PortalHeaderCta({ canOpenPortalApp }: { canOpenPortalApp: boolean }) {
  const pathname = usePathname();

  if (!canOpenPortalApp) return null;

  // Always open the main portal app. Credit pages should not route users to a non-existent /credit/app.
  const appHref = "/portal/app";
  const inPortalApp = typeof pathname === "string" && (pathname.startsWith("/portal/app") || pathname.startsWith("/credit/app"));

  if (inPortalApp) {
    return (
      <a
        href="https://purelyautomation.com/#book-a-call"
        target="_blank"
        rel="noreferrer"
        className="group inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-zinc-700 transition-transform duration-150 hover:scale-110 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40"
      >
        <span className="text-zinc-600 transition-colors group-hover:text-zinc-900" aria-hidden="true">
          <IconCalendar size={18} />
        </span>
        <span>Book a call</span>
      </a>
    );
  }

  return (
    <Link href={appHref} className="rounded-xl bg-brand-ink px-3 py-2 text-sm font-semibold text-white hover:opacity-95">
      Open portal
    </Link>
  );
}
