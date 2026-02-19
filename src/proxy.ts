import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decode, getToken } from "next-auth/jwt";

const PORTAL_SESSION_COOKIE_NAME = "pa.portal.session";
const CREDIT_PORTAL_SESSION_COOKIE_NAME = "pa.credit.session";
const PORTAL_VARIANT_HEADER = "x-portal-variant";

function isCreditPathname(pathname: string) {
  return pathname === "/credit" || pathname.startsWith("/credit/");
}

function isPortalPathname(pathname: string) {
  return pathname === "/portal" || pathname.startsWith("/portal/");
}

function refererIsCredit(req: NextRequest) {
  const referer = req.headers.get("referer") || "";
  try {
    const u = new URL(referer);
    return isCreditPathname(u.pathname);
  } catch {
    return referer === "/credit" || referer.startsWith("/credit/");
  }
}

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  const secret = process.env.NEXTAUTH_SECRET;
  const employeeToken = await getToken({ req, secret });
  const portalCookie = req.cookies.get(PORTAL_SESSION_COOKIE_NAME)?.value;
  const creditCookie = req.cookies.get(CREDIT_PORTAL_SESSION_COOKIE_NAME)?.value;
  const portalToken = portalCookie && secret ? await decode({ token: portalCookie, secret }).catch(() => null) : null;
  const creditToken = creditCookie && secret ? await decode({ token: creditCookie, secret }).catch(() => null) : null;
  const fromCredit = refererIsCredit(req);

  // Portal API calls should carry a portal variant hint so API auth can read the correct session cookie.
  if (path.startsWith("/api/portal/") || path === "/api/auth/client-signup") {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set(PORTAL_VARIANT_HEADER, fromCredit ? "credit" : "portal");
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const isCredit = isCreditPathname(path);
  const isPortal = isPortalPathname(path);

  // If a credit-portal user lands on /portal/* (usually via a hardcoded link),
  // keep the credit experience fully under /credit/*.
  if (isPortal && creditToken && !portalToken) {
    const url = req.nextUrl.clone();
    url.pathname = path.replace("/portal", "/credit") || "/credit";
    return NextResponse.redirect(url);
  }

  // Keep /portal and /credit fully independent.
  // If a user is signed into only one portal, do NOT redirect them across base paths.
  // Instead, treat the other portal as signed-out and let normal auth guards send them
  // to the correct login page for that base path.

  // Serve /credit/* as an internal alias of /portal/* (same code) but separate auth.
  if (isPortal || isCredit) {
    const portalBase = isCredit ? "/credit" : "/portal";
    const variantToken = isCredit ? creditToken : portalToken;

    const isCreditNative =
      isCredit &&
      (path === "/credit/login" ||
        path.startsWith("/credit/login/") ||
        path === "/credit/get-started" ||
        path.startsWith("/credit/get-started/") ||
        path.startsWith("/credit/f/") ||
        path.startsWith("/credit/forms/"));

    const rewrittenPath = isCredit ? (path.replace("/credit", "/portal") || "/portal") : path;
    const rewrittenUrl = req.nextUrl.clone();
    rewrittenUrl.pathname = rewrittenPath;

    const requestHeaders = new Headers(req.headers);
    requestHeaders.set(PORTAL_VARIANT_HEADER, isCredit ? "credit" : "portal");

    const isPortalMarketingHome = rewrittenPath === "/portal" || rewrittenPath === "/portal/";
    const isPortalPublicAuth =
      rewrittenPath === "/portal/login" ||
      rewrittenPath === "/portal/get-started" ||
      rewrittenPath.startsWith("/portal/get-started/");
    const isPortalPublicInvite = rewrittenPath === "/portal/invite" || rewrittenPath.startsWith("/portal/invite/");
    const isPortalPublicApiAuth = rewrittenPath === "/portal/api/login" || rewrittenPath === "/portal/api/logout";

    const isPortalApp = rewrittenPath === "/portal/app" || rewrittenPath.startsWith("/portal/app/");
    const isLegacyPortalAppRoute =
      rewrittenPath === "/portal/services" ||
      rewrittenPath.startsWith("/portal/services/") ||
      rewrittenPath === "/portal/billing" ||
      rewrittenPath.startsWith("/portal/billing/") ||
      rewrittenPath === "/portal/profile" ||
      rewrittenPath.startsWith("/portal/profile/") ||
      rewrittenPath === "/portal/modules" ||
      rewrittenPath.startsWith("/portal/modules/");

    function respondNextOrRewrite() {
      return isCredit
        ? isCreditNative
          ? NextResponse.next({ request: { headers: requestHeaders } })
          : NextResponse.rewrite(rewrittenUrl, { request: { headers: requestHeaders } })
        : NextResponse.next({ request: { headers: requestHeaders } });
    }

    function requireClientOrAdmin() {
      if (!variantToken) {
        const url = req.nextUrl.clone();
        url.pathname = `${portalBase}/login`;
        return url;
      }
      const role = (variantToken as unknown as { role?: string }).role;
      if (role !== "CLIENT" && role !== "ADMIN") {
        return new URL("/app", req.url);
      }
      return null;
    }

    // Public portal home (marketing) should remain accessible even when signed in.
    if (isPortalMarketingHome) return respondNextOrRewrite();

    // Public portal auth pages
    if (isPortalPublicAuth) return respondNextOrRewrite();

    // Public portal invite acceptance page must be reachable without an employee session.
    if (isPortalPublicInvite) return respondNextOrRewrite();

    // Portal auth API routes must remain accessible without an employee session.
    // These endpoints manage the portal session cookie directly.
    if (isPortalPublicApiAuth) return respondNextOrRewrite();

    // Redirect legacy authenticated portal URLs to the new /portal/app/* tree.
    if (isLegacyPortalAppRoute) {
      const guard = requireClientOrAdmin();
      if (guard) {
        let target = path;
        if (path === `${portalBase}/modules` || path.startsWith(`${portalBase}/modules/`)) {
          target = `${portalBase}/app/services`;
        } else if (path.startsWith(`${portalBase}/services`)) {
          target = path.replace(`${portalBase}/services`, `${portalBase}/app/services`);
        } else if (path.startsWith(`${portalBase}/billing`)) {
          target = path.replace(`${portalBase}/billing`, `${portalBase}/app/billing`);
        } else if (path.startsWith(`${portalBase}/profile`)) {
          target = path.replace(`${portalBase}/profile`, `${portalBase}/app/profile`);
        }
        guard.searchParams.set("from", target);
        return NextResponse.redirect(guard);
      }

      if (path === `${portalBase}/modules` || path.startsWith(`${portalBase}/modules/`)) {
        return NextResponse.redirect(new URL(`${portalBase}/app/services`, req.url));
      }
      if (path.startsWith(`${portalBase}/services`)) {
        return NextResponse.redirect(new URL(path.replace(`${portalBase}/services`, `${portalBase}/app/services`), req.url));
      }
      if (path.startsWith(`${portalBase}/billing`)) {
        return NextResponse.redirect(new URL(path.replace(`${portalBase}/billing`, `${portalBase}/app/billing`), req.url));
      }
      if (path.startsWith(`${portalBase}/profile`)) {
        return NextResponse.redirect(new URL(path.replace(`${portalBase}/profile`, `${portalBase}/app/profile`), req.url));
      }
    }

    // Authenticated client portal (new URL tree)
    if (isPortalApp) {
      const guard = requireClientOrAdmin();
      if (guard) {
        guard.searchParams.set("from", path);
        return NextResponse.redirect(guard);
      }
      return respondNextOrRewrite();
    }

    return respondNextOrRewrite();
  }

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
  matcher: ["/app/:path*", "/dashboard/:path*", "/portal/:path*", "/credit/:path*", "/api/portal/:path*", "/api/auth/client-signup"],
};
