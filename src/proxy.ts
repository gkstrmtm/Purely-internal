import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decode, getToken } from "next-auth/jwt";

const PORTAL_SESSION_COOKIE_NAME = "pa.portal.session";

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  const secret = process.env.NEXTAUTH_SECRET;
  const employeeToken = await getToken({ req, secret });
  const portalCookie = req.cookies.get(PORTAL_SESSION_COOKIE_NAME)?.value;
  const portalToken = portalCookie && secret ? await decode({ token: portalCookie, secret }).catch(() => null) : null;

  const isPortalMarketingHome = path === "/portal" || path === "/portal/";
  const isPortalPublicAuth =
    path === "/portal/login" ||
    path === "/portal/get-started" ||
    path.startsWith("/portal/get-started/");
  const isPortalPublicInvite = path === "/portal/invite" || path.startsWith("/portal/invite/");
  const isPortalPublicApiAuth = path === "/portal/api/login" || path === "/portal/api/logout";

  const isPortalApp = path === "/portal/app" || path.startsWith("/portal/app/");
  const isLegacyPortalAppRoute =
    path === "/portal/services" ||
    path.startsWith("/portal/services/") ||
    path === "/portal/billing" ||
    path.startsWith("/portal/billing/") ||
    path === "/portal/profile" ||
    path.startsWith("/portal/profile/") ||
    path === "/portal/modules" ||
    path.startsWith("/portal/modules/");

  function requireClientOrAdmin() {
    if (!portalToken) {
      const url = req.nextUrl.clone();
      url.pathname = "/portal/login";
      return url;
    }
    const role = (portalToken as unknown as { role?: string }).role;
    if (role !== "CLIENT" && role !== "ADMIN") {
      return new URL("/app", req.url);
    }
    return null;
  }

  // Public portal home (marketing) should remain accessible even when signed in.
  if (isPortalMarketingHome) {
    return NextResponse.next();
  }

  // Public portal auth pages
  if (isPortalPublicAuth) {
    return NextResponse.next();
  }

  // Public portal invite acceptance page must be reachable without an employee session.
  if (isPortalPublicInvite) {
    return NextResponse.next();
  }

  // Portal auth API routes must remain accessible without an employee session.
  // These endpoints manage the portal session cookie directly.
  if (isPortalPublicApiAuth) {
    return NextResponse.next();
  }

  // Redirect legacy authenticated portal URLs to the new /portal/app/* tree.
  if (isLegacyPortalAppRoute) {
    const guard = requireClientOrAdmin();
    if (guard) {
      if (guard.pathname === "/login") {
        let target = path;
        if (path === "/portal/modules" || path.startsWith("/portal/modules/")) {
          target = "/portal/app/services";
        } else if (path.startsWith("/portal/services")) {
          target = path.replace("/portal/services", "/portal/app/services");
        } else if (path.startsWith("/portal/billing")) {
          target = path.replace("/portal/billing", "/portal/app/billing");
        } else if (path.startsWith("/portal/profile")) {
          target = path.replace("/portal/profile", "/portal/app/profile");
        }
        guard.searchParams.set("from", target);
      }
      return NextResponse.redirect(guard);
    }

    if (path === "/portal/modules" || path.startsWith("/portal/modules/")) {
      return NextResponse.redirect(new URL("/portal/app/services", req.url));
    }
    if (path.startsWith("/portal/services")) {
      return NextResponse.redirect(new URL(path.replace("/portal/services", "/portal/app/services"), req.url));
    }
    if (path.startsWith("/portal/billing")) {
      return NextResponse.redirect(new URL(path.replace("/portal/billing", "/portal/app/billing"), req.url));
    }
    if (path.startsWith("/portal/profile")) {
      return NextResponse.redirect(new URL(path.replace("/portal/profile", "/portal/app/profile"), req.url));
    }
  }

  // Authenticated client portal (new URL tree)
  if (isPortalApp) {
    const guard = requireClientOrAdmin();
    if (guard) {
      if (guard.pathname === "/login") {
        guard.searchParams.set("from", path);
      }
      return NextResponse.redirect(guard);
    }
    return NextResponse.next();
  }

  // Keep the nicer /dashboard URL, but serve the existing /app routes.
  // This is a rewrite (URL stays /dashboard), not a redirect.
  if (path === "/dashboard" || path.startsWith("/dashboard/")) {
    const url = req.nextUrl.clone();
    url.pathname = path === "/dashboard" ? "/app" : path.replace("/dashboard", "/app");

    if (!employeeToken) {
      const login = req.nextUrl.clone();
      login.pathname = "/employeelogin";
      login.searchParams.set("from", req.nextUrl.pathname);
      return NextResponse.redirect(login);
    }

    const role = (employeeToken as unknown as { role?: string }).role;
    if (role === "CLIENT") {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    return NextResponse.rewrite(url);
  }

  if (!employeeToken) {
    const url = req.nextUrl.clone();
    url.pathname = "/employeelogin";
    url.searchParams.set("from", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  const role = (employeeToken as unknown as { role?: string }).role;

  // The client portal should not live under the employee dashboard route tree.
  if (path === "/app/customer" || path.startsWith("/app/customer/")) {
    if (role === "CLIENT") {
      return NextResponse.redirect(new URL("/portal/app", req.url));
    }
    return NextResponse.redirect(new URL("/app", req.url));
  }

  // Clients should never land in the internal employee dashboard
  if (role === "CLIENT") {
    return NextResponse.redirect(new URL("/portal/app", req.url));
  }

  if (path.startsWith("/app/dialer") && role === "CLOSER") {
    return NextResponse.redirect(new URL("/app/closer", req.url));
  }
  if (path.startsWith("/app/closer") && role === "DIALER") {
    return NextResponse.redirect(new URL("/app/dialer", req.url));
  }
  if (path.startsWith("/app/manager") && role !== "MANAGER" && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/app", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/dashboard/:path*", "/portal/:path*"],
};
