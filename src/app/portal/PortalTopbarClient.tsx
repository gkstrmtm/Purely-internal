"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { PortalHeaderCta } from "@/app/portal/PortalHeaderCta";
import { PortalHelpLink } from "@/app/portal/PortalHelpLink";
import GlassSurface from "@/components/GlassSurface";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const TOPBAR_TRANSITION_MS = 360;
const TOPBAR_TRANSITION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const TOPBAR_INTENT_EVENT = "pa.portal.topbar.intent";

function PortalPublicNav({ signInHref, getStartedHref }: { signInHref: string; getStartedHref: string }) {
  return (
    <nav className="flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap text-sm sm:text-base">
      <Link
        href={signInHref}
        className="rounded-xl px-3 py-2 font-medium text-zinc-600 transition-colors duration-100 hover:bg-zinc-100 hover:text-zinc-900"
      >
        Sign in
      </Link>
      <Link
        href={getStartedHref}
        className="rounded-xl bg-brand-ink px-3 py-2 font-semibold text-white transition-opacity duration-100 hover:opacity-95"
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
  const [intentHidden, setIntentHidden] = useState<boolean | null>(null);

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
  const isFunnelBuilderFormEditor =
    typeof pathname === "string" &&
    ((pathname.startsWith("/portal/app/services/funnel-builder/forms/") && pathname.endsWith("/edit")) ||
      (pathname.startsWith("/credit/app/services/funnel-builder/forms/") && pathname.endsWith("/edit")));
  const isHostedPageEditor = typeof pathname === "string" && pathname.includes("/page-editor");
  const isMobileApp = (searchParams?.get("pa_mobileapp") || "").trim() === "1";
  const hidden = isAiChat || isFunnelBuilderFormEditor || isHostedPageEditor || isMobileApp || (isPortalAppRoute && isSmallScreen);
  const effectiveHidden = intentHidden ?? hidden;
  const signedInLabel = (businessName || userEmail || "").trim();
  const animatedHeight = useMemo(() => (effectiveHidden ? 0 : measuredHeight), [effectiveHidden, measuredHeight]);
  const portalAppDesktopChrome = isPortalAppRoute && !isSmallScreen;

  useEffect(() => {
    const onIntent = (event: Event) => {
      const nextHidden = (event as CustomEvent<{ hidden?: boolean }>).detail?.hidden;
      if (typeof nextHidden === "boolean") {
        setIntentHidden(nextHidden);
      }
    };

    window.addEventListener(TOPBAR_INTENT_EVENT, onIntent as EventListener);
    return () => window.removeEventListener(TOPBAR_INTENT_EVENT, onIntent as EventListener);
  }, []);

  useEffect(() => {
    if (intentHidden === hidden) {
      setIntentHidden(null);
    }
  }, [hidden, intentHidden]);

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
    syncTopbarHeight(measuredHeight, effectiveHidden);
  }, [effectiveHidden, measuredHeight]);

  return (
    <header
      ref={topbarRef}
      aria-hidden={effectiveHidden}
      style={{
        height: `${animatedHeight}px`,
        ...(portalAppDesktopChrome
          ? {
              left: "var(--pa-portal-sidebar-width, 0px)",
              width: "calc(100vw - var(--pa-portal-sidebar-width, 0px))",
            }
          : null),
        transitionDuration: `${TOPBAR_TRANSITION_MS}ms`,
        transitionTimingFunction: TOPBAR_TRANSITION_EASING,
      }}
      className={classNames(
        portalAppDesktopChrome
          ? effectiveHidden
            ? "pa-portal-topbar fixed top-0 z-40 overflow-hidden border-b border-transparent bg-transparent transition-[left,width]"
            : "pa-portal-topbar fixed top-0 z-40 overflow-hidden border-b border-transparent bg-transparent transition-[left,width]"
          : "pa-portal-topbar sticky top-0 z-20 overflow-hidden bg-white/80 backdrop-blur transition-[height,border-color]",
        isPortalAppRoute && "max-sm:hidden",
        hidden ? "pointer-events-none border-b border-transparent" : portalAppDesktopChrome ? "" : "border-b border-zinc-200",
      )}
    >
      {portalAppDesktopChrome && !effectiveHidden ? (
        <div className="pointer-events-none absolute inset-0">
          <GlassSurface
            width="100%"
            height="100%"
            borderRadius={0}
            borderWidth={0.04}
            blur={7}
            displace={0.22}
            distortionScale={-72}
            redOffset={0}
            greenOffset={2}
            blueOffset={6}
            backgroundOpacity={0.16}
            saturation={1.05}
            brightness={46}
            opacity={0.985}
            mixBlendMode="soft-light"
            className="h-full w-full"
            style={{ background: "rgba(255,255,255,0.46)", boxShadow: "none" }}
          >
            <div className="h-full w-full bg-[rgba(255,255,255,0.62)] backdrop-blur-[2px]" />
          </GlassSurface>
        </div>
      ) : null}
      <div
        ref={topbarInnerRef}
        style={{
          transitionDuration: `${TOPBAR_TRANSITION_MS}ms`,
          transitionTimingFunction: TOPBAR_TRANSITION_EASING,
        }}
        className={classNames(
          portalAppDesktopChrome
            ? "relative z-10 flex items-center justify-between gap-4 px-4 py-[calc(env(safe-area-inset-top)+0.75rem)] transition-[transform,opacity] will-change-transform sm:px-5"
            : "mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 transition-[transform,opacity] will-change-transform sm:gap-6 sm:px-6",
          effectiveHidden ? "-translate-y-full opacity-0" : "translate-y-0 opacity-100",
        )}
      >
        {portalAppDesktopChrome ? (
          <>
            <Link href={homeHref} className="pointer-events-auto flex shrink-0 items-center gap-3 pl-1">
              <Image
                src={logoSrc}
                alt="Purely Automation"
                width={190}
                height={58}
                className="h-8 w-auto shrink-0 object-contain"
                priority
              />
            </Link>
            <div className="pointer-events-auto">
              <div className="flex flex-wrap items-center justify-end gap-3 px-1 py-2 sm:flex-nowrap sm:gap-4">
                {userEmail ? (
                  <>
                    <div className="hidden text-sm text-zinc-600 lg:block">{signedInLabel}</div>
                    <PortalHeaderCta canOpenPortalApp={canOpenPortalApp} glass />
                    <PortalHelpLink glass />
                  </>
                ) : (
                  <PortalPublicNav signInHref={signInHref} getStartedHref={getStartedHref} />
                )}
              </div>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </header>
  );
}
