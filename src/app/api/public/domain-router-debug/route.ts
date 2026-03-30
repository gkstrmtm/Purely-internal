import { NextResponse } from "next/server";

import { resolveCustomDomain } from "@/lib/customDomainResolver";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function hostnameFromHeader(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim().toLowerCase() || "";
  if (!first) return null;
  return first.replace(/:\d+$/, "");
}

export async function GET(req: Request) {
  const host = hostnameFromHeader(req.headers.get("x-forwarded-host")) || hostnameFromHeader(req.headers.get("host"));
  const originalHost = hostnameFromHeader(req.headers.get("x-original-host"));
  const mapping = await resolveCustomDomain(host || originalHost || "").catch(() => null);

  return NextResponse.json({
    ok: true,
    host,
    originalHost,
    mapping,
  });
}
