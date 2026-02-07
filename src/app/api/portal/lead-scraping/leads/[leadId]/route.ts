import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SERVICE_SLUG = "lead-scraping";

const leadIdSchema = z.string().trim().min(1).max(64);

const patchSchema = z
  .object({
    starred: z.boolean().optional(),
    email: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => (v === "" ? null : v)),
    tag: z
      .string()
      .trim()
      .max(60)
      .optional()
      .transform((v) => (v === "" ? null : v)),
    tagColor: z
      .string()
      .trim()
      .max(16)
      .optional()
      .transform((v) => (v === "" ? null : v)),
  })
  .refine((v) => v.starred !== undefined || v.email !== undefined || v.tag !== undefined || v.tagColor !== undefined, {
    message: "No changes provided",
  })
  .refine(
    (v) => {
      if (v.email === undefined || v.email === null) return true;
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email);
    },
    { message: "Invalid email" },
  )
  .refine(
    (v) => {
      if (v.tagColor === undefined || v.tagColor === null) return true;
      return /^#[0-9a-fA-F]{6}$/.test(v.tagColor);
    },
    { message: "Invalid tag color" },
  );

export async function PATCH(req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const params = await ctx.params;
  const leadId = leadIdSchema.safeParse(params.leadId);
  if (!leadId.success) {
    return NextResponse.json({ ok: false, error: "Invalid lead id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = patchSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const updated = await prisma.portalLead.updateMany({
    where: { id: leadId.data, ownerId },
    data: {
      ...(parsed.data.starred !== undefined ? { starred: parsed.data.starred } : {}),
      ...(parsed.data.email !== undefined ? { email: parsed.data.email } : {}),
      ...(parsed.data.tag !== undefined ? { tag: parsed.data.tag } : {}),
      ...(parsed.data.tagColor !== undefined ? { tagColor: parsed.data.tagColor } : {}),
    },
  });

  if (updated.count === 0) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const params = await ctx.params;
  const leadId = leadIdSchema.safeParse(params.leadId);
  if (!leadId.success) {
    return NextResponse.json({ ok: false, error: "Invalid lead id" }, { status: 400 });
  }

  const deleted = await prisma.portalLead.deleteMany({
    where: { id: leadId.data, ownerId },
  });

  if (deleted.count === 0) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  // Best-effort cleanup: remove state map entries for deleted lead.
  try {
    const setup = await prisma.portalServiceSetup.findUnique({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
      select: { dataJson: true },
    });

    const rec = setup?.dataJson && typeof setup.dataJson === "object" ? (setup.dataJson as Record<string, any>) : null;
    const outboundState = rec?.outboundState && typeof rec.outboundState === "object" ? (rec.outboundState as Record<string, any>) : null;

    const approved = outboundState?.approvedAtByLeadId && typeof outboundState.approvedAtByLeadId === "object" ? (outboundState.approvedAtByLeadId as Record<string, any>) : null;
    const sent = outboundState?.sentAtByLeadId && typeof outboundState.sentAtByLeadId === "object" ? (outboundState.sentAtByLeadId as Record<string, any>) : null;

    let changed = false;
    if (approved && approved[leadId.data]) {
      delete approved[leadId.data];
      changed = true;
    }
    if (sent && sent[leadId.data]) {
      delete sent[leadId.data];
      changed = true;
    }

    if (changed) {
      await prisma.portalServiceSetup.update({
        where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
        data: { dataJson: rec as any },
        select: { id: true },
      });
    }
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true });
}
