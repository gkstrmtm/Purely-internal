"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function PortalHeaderCta({ canOpenPortalApp }: { canOpenPortalApp: boolean }) {
  const pathname = usePathname();

  if (!canOpenPortalApp) return null;

  // The authenticated client portal app lives under /portal/app.
  // /credit is a branded entrypoint and does not have its own /credit/app.
  const appHref = "/portal/app";
  const inPortalApp = typeof pathname === "string" && pathname.startsWith("/portal/app");

  if (inPortalApp) {
    return (
      <a
        href="https://purelyautomation.com/#book-a-call"
        target="_blank"
        rel="noreferrer"
        className="rounded-xl bg-brand-ink px-3 py-2 text-sm font-semibold text-white hover:opacity-95"
      >
        Book a call
      </a>
    );
  }

  return (
    <Link
      href={appHref}
      className="rounded-xl bg-brand-ink px-3 py-2 text-sm font-semibold text-white hover:opacity-95"
    >
      Open portal
    </Link>
  );
}
