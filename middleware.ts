import { NextRequest, NextResponse } from "next/server";

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
  matcher: ["/portal/app/:path*"],
};
