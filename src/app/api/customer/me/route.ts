import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { isStripeConfigured } from "@/lib/stripeFetch";
import type { Entitlements } from "@/lib/entitlements";
import { resolveEntitlements } from "@/lib/entitlements";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "CLIENT" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const entitlements: Entitlements = await resolveEntitlements(session.user.email);

  return NextResponse.json({
    user: {
      email: session.user.email ?? "",
      name: session.user.name ?? "",
      role: session.user.role,
    },
    entitlements,
    metrics: {
      hoursSavedThisWeek: 0,
      hoursSavedAllTime: 0,
    },
    billing: {
      configured: isStripeConfigured(),
    },
  });
}
