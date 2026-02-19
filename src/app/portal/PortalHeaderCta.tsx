"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function PortalHeaderCta({ canOpenPortalApp }: { canOpenPortalApp: boolean }) {
  const pathname = usePathname();

  if (!canOpenPortalApp) return null;

  const isCredit = typeof pathname === "string" && pathname.startsWith("/credit");
  const base = isCredit ? "/credit" : "/portal";
  const inPortalApp = typeof pathname === "string" && pathname.startsWith(`${base}/app`);

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
      href={`${base}/app`}
      className="rounded-xl bg-brand-ink px-3 py-2 text-sm font-semibold text-white hover:opacity-95"
    >
      Open portal
    </Link>
  );
}
