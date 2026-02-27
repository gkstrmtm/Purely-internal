import { NextResponse } from "next/server";

import { ADS_SESSION_COOKIE_NAME } from "@/lib/adsAuth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ADS_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
