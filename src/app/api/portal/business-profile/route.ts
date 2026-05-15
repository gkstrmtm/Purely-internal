import { NextResponse } from "next/server";
import { z } from "zod";
import type { BusinessProfileBriefing, BusinessProfileGuidedIntake } from "@/lib/businessProfilePath";
import { requireClientSessionForService } from "@/lib/portalAccess";
import {
  BusinessProfileUpsertSchema,
  getPortalBusinessProfile,
  setBusinessProfileWorkspaceData,
  upsertPortalBusinessProfile,
} from "@/lib/portalBusinessProfile.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const workspaceDraftSchema = BusinessProfileUpsertSchema.partial().extend({
  businessName: z.string().trim().max(200).optional().or(z.literal("")),
});

const workspacePatchSchema = z.object({
  draftProfile: workspaceDraftSchema.optional().nullable(),
  briefing: z.unknown().optional().nullable(),
  guidedIntake: z.unknown().optional().nullable(),
});

export async function GET() {
  const auth = await requireClientSessionForService("businessProfile", "view");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const result = await getPortalBusinessProfile({ ownerId });
  return NextResponse.json(result.json, { status: result.status });
}

export async function PUT(req: Request) {
  const auth = await requireClientSessionForService("businessProfile", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const body = (await req.json().catch(() => null)) as unknown;
  const result = await upsertPortalBusinessProfile({ ownerId, body });
  return NextResponse.json(result.json, { status: result.status });
}

export async function PATCH(req: Request) {
  const auth = await requireClientSessionForService("businessProfile", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = workspacePatchSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const workspace = await setBusinessProfileWorkspaceData(auth.session.user.id, {
    ...(Object.prototype.hasOwnProperty.call(parsed.data, "draftProfile") ? { draftProfile: parsed.data.draftProfile ?? null } : {}),
    ...(Object.prototype.hasOwnProperty.call(parsed.data, "briefing") ? { briefing: (parsed.data.briefing ?? null) as BusinessProfileBriefing | null } : {}),
    ...(Object.prototype.hasOwnProperty.call(parsed.data, "guidedIntake") ? { guidedIntake: (parsed.data.guidedIntake ?? null) as BusinessProfileGuidedIntake | null } : {}),
  });

  return NextResponse.json({ ok: true, draftProfile: workspace.draftProfile, briefing: workspace.briefing, guidedIntake: workspace.guidedIntake });
}
