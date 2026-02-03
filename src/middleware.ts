import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  const role = (token as unknown as { role?: string }).role;
  const path = req.nextUrl.pathname;

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
  matcher: ["/app/:path*", "/dashboard/:path*"],
};
