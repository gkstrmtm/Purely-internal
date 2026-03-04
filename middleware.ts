import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function hostnameFromHeader(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim().toLowerCase() || "";
  if (!first) return null;
  // Strip port.
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

function platformHostnames(): Set<string> {
  const out = new Set<string>();
  out.add("localhost");
  out.add("127.0.0.1");
  out.add("purelyautomation.com");

  const candidates = [
    process.env.NEXT_PUBLIC_APP_CANONICAL_URL,
    process.env.APP_CANONICAL_URL,
    process.env.NEXTAUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ];

  for (const raw of candidates) {
    const h = parseHostnameFromUrl(raw);
    if (h) out.add(h);
  }

  return out;
}

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

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (isBypassPath(pathname)) return NextResponse.next();

  const host = hostnameFromHeader(req.headers.get("x-forwarded-host")) ?? hostnameFromHeader(req.headers.get("host"));
  if (!host) return NextResponse.next();

  // Avoid loops.
  if (pathname.startsWith("/domain-router/")) return NextResponse.next();

  const platforms = platformHostnames();
  const isPlatform = platforms.has(host) || host.endsWith(".vercel.app");
  if (isPlatform) return NextResponse.next();

  // Treat any non-platform host as a potential custom domain.
  const url = req.nextUrl.clone();
  url.pathname = `/domain-router/${encodeURIComponent(host)}${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/).*)"],
};
