import { NextResponse } from "next/server";

import { CREDIT_PORTAL_SESSION_COOKIE_NAME } from "@/lib/portalAuth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: CREDIT_PORTAL_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
