import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import {
  addPortalDashboardWidget,
  getPortalDashboardData,
  isDashboardWidgetId,
  removePortalDashboardWidget,
  resetPortalDashboard,
  savePortalDashboardData,
} from "@/lib/portalDashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const putSchema = z
  .object({
    action: z.enum(["save", "add", "remove", "reset"]),
    widgetId: z.string().optional(),
    data: z.any().optional(),
  })
  .strict();

function dashboardScopeFromReq(req: Request) {
  try {
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope");
    return scope === "embedded" ? "embedded" : "default";
  } catch {
    return "default" as const;
  }
}

export async function GET(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const scope = dashboardScopeFromReq(req);
  const data = await getPortalDashboardData(ownerId, scope);
  return NextResponse.json({ ok: true, data });
}

export async function PUT(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = putSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;
  const scope = dashboardScopeFromReq(req);

  switch (parsed.data.action) {
    case "reset": {
      const data = await resetPortalDashboard(ownerId, scope);
      return NextResponse.json({ ok: true, data });
    }

    case "add": {
      const id = parsed.data.widgetId;
      if (!isDashboardWidgetId(id)) {
        return NextResponse.json({ error: "Unknown widget" }, { status: 400 });
      }
      const data = await addPortalDashboardWidget(ownerId, scope, id);
      return NextResponse.json({ ok: true, data });
    }

    case "remove": {
      const id = parsed.data.widgetId;
      if (!isDashboardWidgetId(id)) {
        return NextResponse.json({ error: "Unknown widget" }, { status: 400 });
      }
      const data = await removePortalDashboardWidget(ownerId, scope, id);
      return NextResponse.json({ ok: true, data });
    }

    case "save": {
      const data = await savePortalDashboardData(ownerId, scope, parsed.data.data as any);
      return NextResponse.json({ ok: true, data });
    }

    default:
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }
}
