import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { getPortalDashboardMeta, setPortalDashboardQuickAccess } from "@/lib/portalDashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SALES_SHORTCUT_SLUG = "sales-dashboard";

const putSchema = z
  .object({
    slugs: z.array(z.string()).max(12),
  })
  .strict();

const KNOWN_SERVICE_SLUGS = new Set([...PORTAL_SERVICES.map((s) => s.slug), SALES_SHORTCUT_SLUG]);

function normalizeSlugs(raw: string[]) {
  return (Array.isArray(raw) ? raw : [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => Boolean(s) && KNOWN_SERVICE_SLUGS.has(s))
    .slice(0, 12);
}

export async function GET() {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const meta = await getPortalDashboardMeta(ownerId);

  return NextResponse.json({ ok: true, slugs: meta.quickAccessSlugs ?? [] });
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
  const slugs = normalizeSlugs(parsed.data.slugs);
  const meta = await setPortalDashboardQuickAccess(ownerId, slugs);

  return NextResponse.json({ ok: true, slugs: meta.quickAccessSlugs ?? [] });
}
