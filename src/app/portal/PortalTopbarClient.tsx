"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { PortalHeaderCta } from "@/app/portal/PortalHeaderCta";
import { PortalHelpLink } from "@/app/portal/PortalHelpLink";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function PortalPublicNav({ signInHref, getStartedHref }: { signInHref: string; getStartedHref: string }) {
  return (
    <nav className="flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap text-sm sm:text-base">
      <Link
        href={signInHref}
        className="rounded-xl px-3 py-2 font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
      >
        Sign in
      </Link>
      <Link
        href={getStartedHref}
        className="rounded-xl bg-brand-ink px-3 py-2 font-semibold text-white hover:opacity-95"
      >
        Get started
      </Link>
    </nav>
  );
}

function syncTopbarHeight(topbar: HTMLElement | null, hidden: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const height = hidden || !topbar ? 0 : Math.ceil(topbar.getBoundingClientRect().height);
  root.style.setProperty("--pa-portal-topbar-height", `${height}px`);
  if (hidden) root.setAttribute("data-pa-portal-topbar-hidden", "1");
  else root.removeAttribute("data-pa-portal-topbar-hidden");
}

export function PortalTopbarClient(props: {
  logoSrc: string;
  homeHref: string;
  signInHref: string;
  getStartedHref: string;
  businessName?: string | null;
  userEmail?: string | null;
  canOpenPortalApp: boolean;
}) {
  const { logoSrc, homeHref, signInHref, getStartedHref, businessName, userEmail, canOpenPortalApp } = props;
  const pathname = usePathname();
  const topbarRef = useRef<HTMLElement | null>(null);

  const isAiChat =
    typeof pathname === "string" && (pathname.startsWith("/portal/app/ai-chat") || pathname.startsWith("/credit/app/ai-chat"));
  const hidden = isAiChat;
  const signedInLabel = (businessName || userEmail || "").trim();

  useEffect(() => {
    const topbar = topbarRef.current;
    syncTopbarHeight(topbar, hidden);

    if (!topbar) return;

    const update = () => syncTopbarHeight(topbarRef.current, hidden);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => update()) : null;
    ro?.observe(topbar);
    window.addEventListener("resize", update, { passive: true });
    window.requestAnimationFrame(update);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [hidden, pathname]);

  return (
    <header
      ref={topbarRef}
      aria-hidden={hidden}
      className={classNames(
        "pa-portal-topbar sticky top-0 z-20 overflow-hidden bg-white/80 backdrop-blur transition-[max-height,opacity,transform,border-color] duration-250 ease-out",
        hidden
          ? "pointer-events-none max-h-0 -translate-y-2 border-b border-transparent opacity-0"
          : "max-h-32 translate-y-0 border-b border-zinc-200 opacity-100",
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:gap-6 sm:px-6">
        <Link href={homeHref} className="flex shrink-0 items-center gap-3">
          <Image
            src={logoSrc}
            alt="Purely Automation"
            width={190}
            height={58}
            className="h-8 w-auto shrink-0 object-contain sm:h-9"
            priority
          />
        </Link>

        <div className="flex flex-wrap items-center justify-end gap-2 sm:flex-nowrap sm:gap-3">
          {userEmail ? (
            <>
              <div className="hidden text-sm text-zinc-600 sm:block">{signedInLabel}</div>
              <PortalHeaderCta canOpenPortalApp={canOpenPortalApp} />
              <PortalHelpLink />
            </>
          ) : (
            <PortalPublicNav signInHref={signInHref} getStartedHref={getStartedHref} />
          )}
        </div>
      </div>
    </header>
  );
}
