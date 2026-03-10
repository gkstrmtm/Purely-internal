"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function PortalBackToOnboardingLink({
  className,
  wrapperClassName,
}: {
  className?: string;
  wrapperClassName?: string;
} = {}) {
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();

  const fromOnboarding = (searchParams?.get("from") || "").trim().toLowerCase() === "onboarding";
  if (!fromOnboarding) return null;

  const portalBase = pathname.startsWith("/credit") ? "/credit" : "/portal";
  const wrapper = wrapperClassName ?? "mb-4";

  return (
    <div className={wrapper}>
      <Link
        href={`${portalBase}/app/onboarding`}
        className={
          className ??
          "inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
        }
      >
        ← Back to onboarding
      </Link>
    </div>
  );
}
