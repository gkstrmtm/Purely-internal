import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { buildSuggestedSetupPreviewForOwner } from "@/lib/suggestedSetup/server";
import { applySuggestedSetupActions } from "@/lib/suggestedSetup/executor";
import type { SuggestedSetupAction } from "@/lib/suggestedSetup/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z
  .object({
    actionIds: z.array(z.string().trim().min(1)).min(1).max(50),
  })
  .strict();

export async function POST(req: Request) {
  // Gate apply on Profile edit so portal members can use setup.
  // Individual actions are still approval-gated and revalidated at apply time.
  const auth = await requireClientSessionForService("profile", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const ownerId = ((auth as any).access?.ownerId as string | undefined) || auth.session.user.id;

  // Recompute suggestions at apply-time. Only actions still proposed are eligible.
  let preview: { proposedActions: SuggestedSetupAction[] };
  try {
    preview = (await buildSuggestedSetupPreviewForOwner(ownerId)).preview;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unable to apply suggested setup" },
      { status: 500 },
    );
  }

  const proposedById = new Map(preview.proposedActions.map((a) => [a.id, a] as const));

  const selected: SuggestedSetupAction[] = parsed.data.actionIds
    .map((id) => proposedById.get(id))
    .filter((a): a is SuggestedSetupAction => Boolean(a));

  if (!selected.length) {
    return NextResponse.json(
      { ok: false, error: "No matching actions to apply" },
      { status: 409 },
    );
  }

  const res = await applySuggestedSetupActions({ ownerId, actions: selected });
  if (!res.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: res.error,
        appliedIds: res.appliedIds,
        skippedIds: res.skippedIds,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    appliedIds: res.appliedIds,
    skippedIds: res.skippedIds,
  });
}
