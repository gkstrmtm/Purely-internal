import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { getFollowUpSettings, setFollowUpSettings } from "@/lib/followUpAutomation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function requireLeadScrapingOrFollowUp() {
  const leadAuth = await requireClientSessionForService("leadScraping");
  if (leadAuth.ok) return leadAuth;

  const followAuth = await requireClientSessionForService("followUp");
  if (followAuth.ok) return followAuth;

  const status = leadAuth.status === 401 && followAuth.status === 401 ? 401 : 403;
  return { ok: false as const, status };
}

export async function GET() {
  const auth = await requireLeadScrapingOrFollowUp();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const settings = await getFollowUpSettings(ownerId).catch(() => null);

  return NextResponse.json({
    ok: true,
    customVariables: settings?.customVariables ?? {},
  });
}

const putSchema = z.object({
  key: z.string().trim().min(1).max(32).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  value: z.string().max(800).default(""),
});

export async function PUT(req: Request) {
  const auth = await requireLeadScrapingOrFollowUp();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const current = await getFollowUpSettings(ownerId).catch(() => null);
  const customVariables: Record<string, string> = {
    ...(current?.customVariables ?? {}),
    [parsed.data.key]: parsed.data.value,
  };

  const updated = await setFollowUpSettings(ownerId, { customVariables });

  return NextResponse.json({
    ok: true,
    customVariables: updated.customVariables ?? {},
  });
}
