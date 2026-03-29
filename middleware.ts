import { NextRequest, NextResponse } from "next/server";

function hostnameFromHeader(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim().toLowerCase() || "";
  if (!first) return null;
  return first.replace(/:\d+$/, "");
}

function parseHostnameFromUrl(raw: string | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  try {
    return new URL(s).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

function addHostnameVariants(out: Set<string>, host: string) {
  const h = String(host || "").trim().toLowerCase();
  if (!h) return;
  out.add(h);

  const isIp = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(h);
  if (isIp) return;
  if (!h.includes(".")) return;

  if (h.startsWith("www.")) out.add(h.slice(4));
  else out.add(`www.${h}`);
}

function isPlatformHostnameCandidate(host: string): boolean {
  const h = String(host || "").trim().toLowerCase();
  if (!h) return false;
  if (h === "localhost" || h === "127.0.0.1") return true;
  if (h === "purelyautomation.com" || h.endsWith(".purelyautomation.com")) return true;
  if (h.endsWith(".vercel.app")) return true;
  return false;
}

function platformHostnames(): Set<string> {
  const out = new Set<string>();
  addHostnameVariants(out, "localhost");
  addHostnameVariants(out, "127.0.0.1");
  addHostnameVariants(out, "purelyautomation.com");

  const candidates = [
    process.env.NEXT_PUBLIC_APP_CANONICAL_URL,
    process.env.APP_CANONICAL_URL,
    process.env.NEXTAUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ];

  for (const raw of candidates) {
    const h = parseHostnameFromUrl(raw);
    if (h && isPlatformHostnameCandidate(h)) addHostnameVariants(out, h);
  }

  return out;
}

const PLATFORM_HOSTNAMES = platformHostnames();

function isBypassPath(pathname: string): boolean {
  if (!pathname.startsWith("/")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/api")) return true;
  if (pathname.startsWith("/favicon")) return true;
  if (pathname === "/robots.txt") return true;
  if (pathname === "/sitemap.xml") return true;
  if (pathname.startsWith("/opengraph-image")) return true;
  if (pathname.startsWith("/twitter-image")) return true;
  if (pathname.startsWith("/icon")) return true;
  if (pathname.startsWith("/apple-icon")) return true;
  return false;
}

function isMobileUserAgent(ua: string): boolean {
  const s = String(ua || "");
  if (!s) return false;
  // Keep iPad as non-mobile (it tends to want the desktop portal).
  if (/iPad/i.test(s)) return false;
  return /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(s);
}

function isLocalHost(host: string): boolean {
  const h = String(host || "").toLowerCase();
  return h.includes("localhost") || h.includes("127.0.0.1");
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Custom domain routing: rewrite any non-platform host to /domain-router/<domain>/*.
  // This is required so customer domains like example.com/testing resolve funnels.
  if (!isBypassPath(pathname) && !pathname.startsWith("/domain-router/")) {
    const rawHost = req.headers.get("host");
    const rawForwardedHost = req.headers.get("x-forwarded-host");
    const rawOriginalHost = req.headers.get("x-original-host");

    const hostFromHost = hostnameFromHeader(rawHost);
    const hostFromForwarded = hostnameFromHeader(rawForwardedHost);
    const hostFromOriginal = hostnameFromHeader(rawOriginalHost);

    const host =
      (hostFromHost && !PLATFORM_HOSTNAMES.has(hostFromHost)
        ? hostFromHost
        : hostFromForwarded && !PLATFORM_HOSTNAMES.has(hostFromForwarded)
          ? hostFromForwarded
          : hostFromOriginal && !PLATFORM_HOSTNAMES.has(hostFromOriginal)
            ? hostFromOriginal
            : hostFromHost ?? hostFromForwarded ?? hostFromOriginal) ||
      null;

    if (host && !PLATFORM_HOSTNAMES.has(host)) {
      const url = req.nextUrl.clone();
      url.pathname = `/domain-router/${encodeURIComponent(host)}${pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  if (!pathname.startsWith("/portal/app")) return NextResponse.next();

  const ua = req.headers.get("user-agent") || "";
  if (!isMobileUserAgent(ua)) return NextResponse.next();

  const host = req.headers.get("host") || "";
  if (isLocalHost(host)) return NextResponse.next();

  const target = new URL("https://purelyautomation.com");
  target.pathname = pathname;

  // Preserve query params + force the mobile-app experience.
  const sp = new URLSearchParams(req.nextUrl.searchParams);
  sp.set("pa_mobileapp", "1");
  target.search = sp.toString() ? `?${sp.toString()}` : "";

  // Avoid loops if we're already on the target URL.
  const alreadyOnTarget =
    String(host).toLowerCase().includes("purelyautomation.com") &&
    req.nextUrl.searchParams.get("pa_mobileapp") === "1";

  if (alreadyOnTarget) return NextResponse.next();

  return NextResponse.redirect(target, 307);
}

export const config = {
  matcher: ["/:path*"],
};
