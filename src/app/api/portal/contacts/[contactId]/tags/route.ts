import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForAnyService } from "@/lib/portalAccess";
import {
  addContactTagAssignment,
  listContactTagsForContact,
  removeContactTagAssignment,
} from "@/lib/portalContactTags";
import { runOwnerAutomationsForEvent } from "@/lib/portalAutomationsRunner";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const contactIdSchema = z.string().trim().min(1).max(120);

const bodySchema = z.object({
  tagId: z.string().trim().min(1).max(120),
});

export async function GET(_req: Request, ctx: { params: Promise<{ contactId: string }> }) {
  const auth = await requireClientSessionForAnyService(["inbox", "people", "automations"]);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const params = await ctx.params;
  const contactId = contactIdSchema.safeParse(params.contactId);
  if (!contactId.success) return NextResponse.json({ ok: false, error: "Invalid contact id" }, { status: 400 });

  const tags = await listContactTagsForContact(ownerId, contactId.data);
  return NextResponse.json({ ok: true, tags });
}

export async function POST(req: Request, ctx: { params: Promise<{ contactId: string }> }) {
  const auth = await requireClientSessionForAnyService(["inbox", "people", "automations"], "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const params = await ctx.params;
  const contactId = contactIdSchema.safeParse(params.contactId);
  if (!contactId.success) return NextResponse.json({ ok: false, error: "Invalid contact id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  const ok = await addContactTagAssignment({ ownerId, contactId: contactId.data, tagId: parsed.data.tagId });
  if (!ok) return NextResponse.json({ ok: false, error: "Failed to add tag" }, { status: 500 });

  // Best-effort: fire tag-added automations.
  try {
    await runOwnerAutomationsForEvent({
      ownerId,
      triggerKind: "tag_added",
      contact: { id: contactId.data },
      event: { tagId: parsed.data.tagId },
    });
  } catch {
    // ignore
  }

  const tags = await listContactTagsForContact(ownerId, contactId.data);
  return NextResponse.json({ ok: true, tags });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ contactId: string }> }) {
  const auth = await requireClientSessionForAnyService(["inbox", "people", "automations"], "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const params = await ctx.params;
  const contactId = contactIdSchema.safeParse(params.contactId);
  if (!contactId.success) return NextResponse.json({ ok: false, error: "Invalid contact id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  const ok = await removeContactTagAssignment({ ownerId, contactId: contactId.data, tagId: parsed.data.tagId });
  if (!ok) return NextResponse.json({ ok: false, error: "Failed to remove tag" }, { status: 500 });

  const tags = await listContactTagsForContact(ownerId, contactId.data);
  return NextResponse.json({ ok: true, tags });
}
