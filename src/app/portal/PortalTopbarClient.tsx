"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

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

function syncTopbarHeight(height: number, hidden: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--pa-portal-topbar-height", `${hidden ? 0 : height}px`);
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
  const searchParams = useSearchParams();
  const topbarRef = useRef<HTMLElement | null>(null);
  const topbarInnerRef = useRef<HTMLDivElement | null>(null);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [measuredHeight, setMeasuredHeight] = useState(0);

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
  const animatedHeight = useMemo(() => (hidden ? 0 : measuredHeight), [hidden, measuredHeight]);

  useEffect(() => {
    const inner = topbarInnerRef.current;
    if (!inner) return;

    const update = () => setMeasuredHeight(Math.ceil(inner.getBoundingClientRect().height));
    update();

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => update()) : null;
    ro?.observe(inner);
    window.addEventListener("resize", update, { passive: true });
    window.requestAnimationFrame(update);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [pathname, signedInLabel, userEmail]);

  useEffect(() => {
    syncTopbarHeight(measuredHeight, hidden);
  }, [hidden, measuredHeight]);

  return (
    <header
      ref={topbarRef}
      aria-hidden={hidden}
      style={{
        height: `${animatedHeight}px`,
        transitionDuration: `${TOPBAR_TRANSITION_MS}ms`,
        transitionTimingFunction: TOPBAR_TRANSITION_EASING,
      }}
      className={classNames(
        "pa-portal-topbar sticky top-0 z-20 overflow-hidden bg-white/80 backdrop-blur transition-[height,border-color]",
        hidden ? "pointer-events-none border-b border-transparent" : "border-b border-zinc-200",
      )}
    >
      <div
        ref={topbarInnerRef}
        style={{
          transitionDuration: `${TOPBAR_TRANSITION_MS}ms`,
          transitionTimingFunction: TOPBAR_TRANSITION_EASING,
        }}
        className={classNames(
          "mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 transition-[transform,opacity] will-change-transform sm:gap-6 sm:px-6",
          hidden ? "-translate-y-full opacity-0" : "translate-y-0 opacity-100",
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
