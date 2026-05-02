import crypto from "crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import { dbHasPublicColumn } from "@/lib/dbSchemaCompat";
import { getAppBaseUrl, tryNotifyPortalUserIds } from "@/lib/portalNotifications";
import { ensurePortalTasksSchema } from "@/lib/portalTasksSchema";

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
    phone: z
      .string()
      .trim()
      .max(60)
      .optional()
      .transform((v) => (v === "" ? null : v)),
    website: z
      .string()
      .trim()
      .max(400)
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
    assignedToUserId: z
      .string()
      .trim()
      .max(64)
      .optional()
      .transform((v) => (v === "" ? null : v)),
    assignedToUserIds: z.array(z.string().trim().min(1).max(64)).max(25).optional(),
  })
  .refine(
    (v) =>
      v.starred !== undefined ||
      v.email !== undefined ||
      v.phone !== undefined ||
      v.website !== undefined ||
      v.tag !== undefined ||
      v.tagColor !== undefined ||
      v.assignedToUserId !== undefined ||
      v.assignedToUserIds !== undefined,
    {
      message: "No changes provided",
    },
  )
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

async function validateAssigneeIsOwnerOrMember(ownerId: string, userId: string): Promise<string | null> {
  const id = String(userId || "").trim();
  if (!id) return null;
  if (id === ownerId) return id;
  const member = await (prisma as any).portalAccountMember
    .findUnique({
      where: { ownerId_userId: { ownerId, userId: id } },
      select: { id: true },
    })
    .catch(() => null);
  return member?.id ? id : null;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const auth = await requireClientSessionForService("leadScraping");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const memberId = (auth.session.user as any).memberId || ownerId;
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

  const hasLeadEmailColumn =
    parsed.data.email === undefined
      ? false
      : await dbHasPublicColumn({ tableNames: ["PortalLead", "portalLead"], columnName: "email" }).catch(() => false);
  const wantsAssignmentUpdate = parsed.data.assignedToUserId !== undefined || parsed.data.assignedToUserIds !== undefined;

  const hasAssignedToUserIdColumn =
    !wantsAssignmentUpdate
      ? false
      : await dbHasPublicColumn({ tableNames: ["PortalLead", "portalLead"], columnName: "assignedToUserId" }).catch(() => false);

  const existingLead = await (prisma as any).portalLead
    .findFirst({
      where: { id: leadId.data, ownerId },
      select: { id: true, businessName: true, assignedToUserId: true, dataJson: true },
    })
    .catch(() => null);

  if (!existingLead?.id) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  let nextAssignedToUserIds: string[] | undefined = undefined;
  if (parsed.data.assignedToUserIds !== undefined) {
    const resolved = await Promise.all(
      parsed.data.assignedToUserIds.map(async (userId) => await validateAssigneeIsOwnerOrMember(ownerId, userId).catch(() => null)),
    );
    nextAssignedToUserIds = Array.from(new Set(resolved.filter(Boolean) as string[]));
    if (parsed.data.assignedToUserIds.length && !nextAssignedToUserIds.length) {
      return NextResponse.json({ ok: false, error: "Invalid assignee" }, { status: 400 });
    }
  } else if (parsed.data.assignedToUserId !== undefined) {
    const resolved = parsed.data.assignedToUserId
      ? await validateAssigneeIsOwnerOrMember(ownerId, parsed.data.assignedToUserId).catch(() => null)
      : null;
    if (parsed.data.assignedToUserId && !resolved) {
      return NextResponse.json({ ok: false, error: "Invalid assignee" }, { status: 400 });
    }
    nextAssignedToUserIds = resolved ? [resolved] : [];
  }

  const nextAssignedToUserId = nextAssignedToUserIds === undefined ? undefined : nextAssignedToUserIds[0] ?? null;

  const existingDataJson =
    existingLead.dataJson && typeof existingLead.dataJson === "object" && !Array.isArray(existingLead.dataJson)
      ? (existingLead.dataJson as Record<string, unknown>)
      : {};
  const existingAssignedToUserId =
    (typeof existingLead.assignedToUserId === "string" && existingLead.assignedToUserId.trim()) ||
    (typeof existingDataJson.assignedToUserId === "string" && String(existingDataJson.assignedToUserId).trim()) ||
    null;
  const existingAssignedToUserIds = Array.from(
    new Set(
      Array.isArray(existingDataJson.assignedToUserIds)
        ? existingDataJson.assignedToUserIds.map((value) => String(value || "").trim()).filter(Boolean)
        : existingAssignedToUserId
          ? [existingAssignedToUserId]
          : [],
    ),
  );

  const updated = await prisma.portalLead.updateMany({
    where: { id: leadId.data, ownerId },
    data: {
      ...(parsed.data.starred !== undefined ? { starred: parsed.data.starred } : {}),
      ...(parsed.data.email !== undefined && hasLeadEmailColumn ? { email: parsed.data.email } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
      ...(parsed.data.website !== undefined ? { website: parsed.data.website } : {}),
      ...(parsed.data.tag !== undefined ? { tag: parsed.data.tag } : {}),
      ...(parsed.data.tagColor !== undefined ? { tagColor: parsed.data.tagColor } : {}),
      ...(wantsAssignmentUpdate && hasAssignedToUserIdColumn ? { assignedToUserId: nextAssignedToUserId } : {}),
    },
  });

  if (updated.count === 0) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  if (wantsAssignmentUpdate) {
    const nextDataJson = { ...existingDataJson };
    if (nextAssignedToUserId) {
      nextDataJson.assignedToUserId = nextAssignedToUserId;
      nextDataJson.assignedAtIso = new Date().toISOString();
    } else {
      delete nextDataJson.assignedToUserId;
      delete nextDataJson.assignedAtIso;
    }
    nextDataJson.assignedToUserIds = nextAssignedToUserIds ?? [];

    try {
      await (prisma as any).portalLead.update({
        where: { id: leadId.data },
        data: {
          ...(hasAssignedToUserIdColumn ? { assignedToUserId: nextAssignedToUserId } : {}),
          dataJson: nextDataJson,
        },
        select: { id: true },
      });
    } catch {
      await (prisma as any).portalLead
        .updateMany({
          where: { id: leadId.data, ownerId },
          data: { dataJson: nextDataJson },
        })
        .catch(() => null);
    }

    const newAssigneeIds = (nextAssignedToUserIds ?? []).filter((userId) => !existingAssignedToUserIds.includes(userId));
    if (newAssigneeIds.length) {
      await ensurePortalTasksSchema().catch(() => null);
      const businessName = String(existingLead.businessName || "Lead").trim() || "Lead";
      const leadPath = `${getAppBaseUrl()}/portal/app/services/lead-scraping`;
      const title = `Review new lead: ${businessName}`.slice(0, 160);
      const description = [
        `${businessName} was assigned to you from Lead Scraping.`,
        "Review the new lead and follow up as needed.",
        `Open lead scraper: ${leadPath}`,
      ].join("\n\n");

      try {
        const sql = `
          INSERT INTO "PortalTask" ("id","ownerId","createdByUserId","title","description","status","assignedToUserId","dueAt","createdAt","updatedAt")
          VALUES ($1,$2,$3,$4,$5,'OPEN',$6,$7,DEFAULT,$8)
        `;
        await Promise.all(
          newAssigneeIds.map(async (assignedUserId) => {
            const id = crypto.randomUUID().replace(/-/g, "");
            const now = new Date();
            await prisma.$executeRawUnsafe(sql, id, ownerId, memberId, title, description, assignedUserId, null, now);
          }),
        );
      } catch {
        // ignore
      }

      void tryNotifyPortalUserIds({
        userIds: Array.from(new Set([...newAssigneeIds, ownerId].filter(Boolean))),
        subject: `Lead assigned: ${businessName}`,
        text: [
          `A new scraped lead was assigned to you: ${businessName}`,
          "",
          `Lead scraper: ${leadPath}`,
          "A follow-up task was created for this assignment.",
        ].join("\n"),
      }).catch(() => null);
    }
  }

  return NextResponse.json({
    ok: true,
    assignedToUserId: nextAssignedToUserId ?? existingAssignedToUserId ?? null,
    assignedToUserIds: nextAssignedToUserIds ?? existingAssignedToUserIds,
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const auth = await requireClientSessionForService("leadScraping");
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
