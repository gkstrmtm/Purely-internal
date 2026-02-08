import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { isStripeConfigured } from "@/lib/stripeFetch";
import type { Entitlements } from "@/lib/entitlements";
import { resolveEntitlements } from "@/lib/entitlements";
import { getPortalUser } from "@/lib/portalAuth";

export async function GET(req: Request) {
  // This endpoint is used by both the employee app and the client portal.
  // IMPORTANT: in the same browser, both auth cookies can coexist. Portal requests must
  // explicitly bind to the portal cookie to avoid being treated as an employee session.
  const app = (req.headers.get("x-pa-app") ?? "").toLowerCase().trim();

  const user =
    app === "portal"
      ? await (async () => {
          const portalUser = await getPortalUser();
          return portalUser
            ? { email: portalUser.email, name: portalUser.name ?? "", role: portalUser.role }
            : null;
        })()
      : await (async () => {
          const session = await getServerSession(authOptions);
          const employeeUser = session?.user ?? null;
          return employeeUser
            ? { email: employeeUser.email ?? "", name: employeeUser.name ?? "", role: employeeUser.role }
            : null;
        })();

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
