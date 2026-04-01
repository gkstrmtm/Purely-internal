"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { PortalHeaderCta } from "@/app/portal/PortalHeaderCta";
import { PortalHelpLink } from "@/app/portal/PortalHelpLink";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const TOPBAR_TRANSITION_MS = 360;
const TOPBAR_TRANSITION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

function PortalPublicNav({ signInHref, getStartedHref }: { signInHref: string; getStartedHref: string }) {
  return (
    <nav className="flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap text-sm sm:text-base">
      <Link
        href={signInHref}
        className="rounded-xl px-3 py-2 font-medium text-zinc-600 transition-all duration-150 hover:-translate-y-0.5 hover:bg-zinc-100 hover:text-zinc-900"
      >
        Sign in
      </Link>
      <Link
        href={getStartedHref}
        className="rounded-xl bg-brand-ink px-3 py-2 font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95"
      >
        Get started
      </Link>
    </nav>
  );
}

function syncTopbarHeightWithTransition(topbar: HTMLElement | null, hidden: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const currentHeight = !topbar ? 0 : Math.ceil(topbar.getBoundingClientRect().height);

  const prevTimer = root.getAttribute("data-pa-portal-topbar-hide-timer");
  if (prevTimer) {
    window.clearTimeout(Number(prevTimer));
    root.removeAttribute("data-pa-portal-topbar-hide-timer");
  }

  if (!hidden) {
    root.style.setProperty("--pa-portal-topbar-height", `${currentHeight}px`);
    root.removeAttribute("data-pa-portal-topbar-hidden");
    return;
  }

  if (currentHeight > 0) {
    root.style.setProperty("--pa-portal-topbar-height", `${currentHeight}px`);
  }
  root.setAttribute("data-pa-portal-topbar-hidden", "1");

  const timer = window.setTimeout(() => {
    root.style.setProperty("--pa-portal-topbar-height", "0px");
    root.removeAttribute("data-pa-portal-topbar-hide-timer");
  }, TOPBAR_TRANSITION_MS);
  root.setAttribute("data-pa-portal-topbar-hide-timer", String(timer));
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
  const searchParams = useSearchParams();
  const topbarRef = useRef<HTMLElement | null>(null);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 639px)");
    const sync = () => setIsSmallScreen(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const isAiChat =
    typeof pathname === "string" && (pathname.startsWith("/portal/app/ai-chat") || pathname.startsWith("/credit/app/ai-chat"));
  const isPortalAppRoute =
    typeof pathname === "string" && (pathname.startsWith("/portal/app") || pathname.startsWith("/credit/app"));
  const isMobileApp = (searchParams?.get("pa_mobileapp") || "").trim() === "1";
  const hidden = isAiChat || isMobileApp || (isPortalAppRoute && isSmallScreen);
  const signedInLabel = (businessName || userEmail || "").trim();

  useEffect(() => {
    const topbar = topbarRef.current;
    syncTopbarHeightWithTransition(topbar, hidden);

    if (!topbar) return;

    const update = () => syncTopbarHeightWithTransition(topbarRef.current, hidden);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => update()) : null;
    ro?.observe(topbar);
    window.addEventListener("resize", update, { passive: true });
    window.requestAnimationFrame(update);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
      if (typeof document !== "undefined") {
        const root = document.documentElement;
        const prevTimer = root.getAttribute("data-pa-portal-topbar-hide-timer");
        if (prevTimer) {
          window.clearTimeout(Number(prevTimer));
          root.removeAttribute("data-pa-portal-topbar-hide-timer");
        }
      }
    };
  }, [hidden, pathname]);

  return (
    <header
      ref={topbarRef}
      aria-hidden={hidden}
      style={{
        transitionDuration: `${TOPBAR_TRANSITION_MS}ms`,
        transitionTimingFunction: TOPBAR_TRANSITION_EASING,
      }}
      className={classNames(
        "pa-portal-topbar sticky top-0 z-20 overflow-hidden bg-white/80 backdrop-blur transition-[max-height,opacity,transform,border-color]",
        hidden
          ? "pointer-events-none max-h-0 -translate-y-4 border-b border-transparent opacity-0"
          : "max-h-32 translate-y-0 border-b border-zinc-200 opacity-100",
      )}
    >
      <div
        style={{
          transitionDuration: `${TOPBAR_TRANSITION_MS}ms`,
          transitionTimingFunction: TOPBAR_TRANSITION_EASING,
        }}
        className={classNames(
          "mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 transition-[transform,opacity] sm:gap-6 sm:px-6",
          hidden ? "-translate-y-2 opacity-0" : "translate-y-0 opacity-100",
        )}
      >
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
