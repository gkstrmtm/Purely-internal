import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  const path = req.nextUrl.pathname;

  // Public portal home (marketing)
  if (path === "/portal") {
    return NextResponse.next();
  }

  // Public portal auth pages
  if (path === "/portal/login" || path === "/portal/get-started") {
    return NextResponse.next();
  }

  // Client portal (separate from internal /app dashboard)
  if (path.startsWith("/portal/")) {
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = "/portal/login";
      url.searchParams.set("from", req.nextUrl.pathname);
      return NextResponse.redirect(url);
    }

    const role = (token as unknown as { role?: string }).role;
    if (role !== "CLIENT" && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/app", req.url));
    }

    return NextResponse.next();
  }

  // Keep the nicer /dashboard URL, but serve the existing /app routes.
  // This is a rewrite (URL stays /dashboard), not a redirect.
  if (path === "/dashboard" || path.startsWith("/dashboard/")) {
    const url = req.nextUrl.clone();
    url.pathname = path === "/dashboard" ? "/app" : path.replace("/dashboard", "/app");

    if (!token) {
      const login = req.nextUrl.clone();
      login.pathname = "/login";
      login.searchParams.set("from", req.nextUrl.pathname);
      return NextResponse.redirect(login);
    }

    const role = (token as unknown as { role?: string }).role;
    if (role === "CLIENT") {
      return NextResponse.redirect(new URL("/portal", req.url));
    }

    return NextResponse.rewrite(url);
  }

  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  const role = (token as unknown as { role?: string }).role;

  // The client portal should not live under the employee dashboard route tree.
  if (path === "/app/customer" || path.startsWith("/app/customer/")) {
    if (role === "CLIENT") {
      return NextResponse.redirect(new URL("/portal", req.url));
    }
    return NextResponse.redirect(new URL("/app", req.url));
  }

  // Clients should never land in the internal employee dashboard
  if (role === "CLIENT") {
    return NextResponse.redirect(new URL("/portal", req.url));
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
