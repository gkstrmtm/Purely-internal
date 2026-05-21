import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { getProviderSetupWizardPayload } from "@/lib/providerSetupWizard.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireClientSessionForService("profile", "view");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const ownerId = String((auth as any).access?.ownerId || auth.session.user.id || "").trim();
  const memberId = String((auth.session.user as any)?.memberId || auth.session.user.id || "").trim();
  const portalVariant = String((auth.session.user as any)?.portalVariant || "portal").trim() || "portal";

  try {
    const providerSetup = await getProviderSetupWizardPayload({
      ownerId,
      workspaceVariant: portalVariant,
      isOwnerSession: Boolean(ownerId && memberId === ownerId),
    });
    return NextResponse.json({ ok: true, providerSetup });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load provider setup." },
      { status: 500 },
    );
  }
}