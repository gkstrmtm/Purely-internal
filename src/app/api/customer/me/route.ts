import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { isStripeConfigured } from "@/lib/stripeFetch";
import type { Entitlements } from "@/lib/entitlements";
import { resolveEntitlements } from "@/lib/entitlements";
import { getPortalUser } from "@/lib/portalAuth";

export async function GET() {
  // This endpoint is used by both the employee app and the client portal.
  // Prefer the employee session when present, otherwise fall back to the portal session cookie.
  const session = await getServerSession(authOptions);
  const employeeUser = session?.user ?? null;

  const portalUser = employeeUser ? null : await getPortalUser();

  const user = employeeUser
    ? { email: employeeUser.email ?? "", name: employeeUser.name ?? "", role: employeeUser.role }
    : portalUser
      ? { email: portalUser.email, name: portalUser.name ?? "", role: portalUser.role }
      : null;

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== "CLIENT" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const entitlements: Entitlements = await resolveEntitlements(user.email);

  return NextResponse.json({
    user: {
      email: user.email,
      name: user.name,
      role: user.role,
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
