import { NextResponse } from "next/server";

import { getPortalUser, PORTAL_SESSION_COOKIE_NAME } from "@/lib/portalAuth";

function bearerTokenFromRequest(req: Request): string | null {
  const raw = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!raw) return null;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  return token ? token : null;
}

function safeNextPath(raw: string | null): string {
  const v = String(raw || "").trim();
  if (!v) return "/portal/app";
  if (!v.startsWith("/")) return "/portal/app";
  if (v.startsWith("/portal")) return v;
  return "/portal/app";
}

export async function GET(req: Request) {
  const user = await getPortalUser({ variant: "portal" });
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const token = bearerTokenFromRequest(req);
  if (!token) return NextResponse.json({ ok: false, error: "Missing bearer token" }, { status: 400 });

  const url = new URL(req.url);
  const nextPath = safeNextPath(url.searchParams.get("next"));
  const res = NextResponse.redirect(new URL(nextPath, url.origin));

  res.cookies.set(PORTAL_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return res;
}
