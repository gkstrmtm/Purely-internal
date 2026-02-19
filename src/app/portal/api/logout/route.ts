import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { CREDIT_PORTAL_SESSION_COOKIE_NAME, PORTAL_SESSION_COOKIE_NAME } from "@/lib/portalAuth";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

export async function POST() {
  const h = await headers();
  const variant = normalizePortalVariant(h.get(PORTAL_VARIANT_HEADER)) || null;

  const res = NextResponse.json({ ok: true });

  const names =
    variant === "credit"
      ? [CREDIT_PORTAL_SESSION_COOKIE_NAME]
      : variant === "portal"
        ? [PORTAL_SESSION_COOKIE_NAME]
        : [PORTAL_SESSION_COOKIE_NAME, CREDIT_PORTAL_SESSION_COOKIE_NAME];

  for (const name of names) {
    res.cookies.set({
      name,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
  }
  return res;
}
