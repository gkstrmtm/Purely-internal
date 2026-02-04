import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const bodySchema = z.object({
  action: z.enum(["delete", "unassign", "reassign"]),
  leadIds: z.array(z.string().min(1)).min(1).max(500),
  assigneeId: z.string().min(1).optional(),
  confirm: z.boolean().optional(),
});

function uniq(ids: string[]) {
  return Array.from(new Set(ids));
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "MANAGER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const leadIds = uniq(parsed.data.leadIds);

  if (parsed.data.action === "delete") {
    if (!parsed.data.confirm) {
      return NextResponse.json({ error: "Deletion requires confirm=true" }, { status: 400 });
    }

    const deleted = await prisma.$transaction(async (tx) => {
      const appts = await tx.appointment.findMany({
        where: { leadId: { in: leadIds } },
        select: { id: true },
      });
      const appointmentIds = appts.map((a) => a.id);

      const outcomes = appointmentIds.length
        ? await tx.appointmentOutcome.findMany({
            where: { appointmentId: { in: appointmentIds } },
            select: { id: true },
          })
        : [];
      const outcomeIds = outcomes.map((o) => o.id);

      const drafts = outcomeIds.length
        ? await tx.contractDraft.findMany({
            where: { appointmentOutcomeId: { in: outcomeIds } },
            select: { id: true },
          })
        : [];
      const draftIds = drafts.map((d) => d.id);

      if (draftIds.length) {
        await tx.approval.deleteMany({ where: { contractDraftId: { in: draftIds } } });
        await tx.contractDraft.deleteMany({ where: { id: { in: draftIds } } });
      }

      if (appointmentIds.length) {
        await tx.appointmentOutcome.deleteMany({ where: { appointmentId: { in: appointmentIds } } });
        await tx.appointmentVideo.deleteMany({ where: { appointmentId: { in: appointmentIds } } });
        await tx.appointment.deleteMany({ where: { id: { in: appointmentIds } } });
      }

      const callLogs = await tx.callLog.findMany({
        where: { leadId: { in: leadIds } },
        select: { id: true },
      });
      const callLogIds = callLogs.map((c) => c.id);

      if (callLogIds.length) {
        await tx.callRecording.deleteMany({ where: { callLogId: { in: callLogIds } } });
        await tx.callLog.deleteMany({ where: { id: { in: callLogIds } } });
      }

      await tx.leadAssignment.deleteMany({ where: { leadId: { in: leadIds } } });
      await tx.marketingDemoRequest.deleteMany({ where: { leadId: { in: leadIds } } });
      await tx.doc.deleteMany({ where: { leadId: { in: leadIds } } });

      const result = await tx.lead.deleteMany({ where: { id: { in: leadIds } } });
      return result.count;
    });

    return NextResponse.json({ ok: true, action: "delete", deleted });
  }

  if (parsed.data.action === "unassign") {
    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.leadAssignment.deleteMany({
        where: { leadId: { in: leadIds }, releasedAt: null },
      });
      return res.count;
    });

    return NextResponse.json({ ok: true, action: "unassign", updated });
  }

  // reassign
  if (!parsed.data.assigneeId) {
    return NextResponse.json({ error: "assigneeId is required for reassign" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: parsed.data.assigneeId },
    select: { id: true, role: true },
  });
  if (!target) return NextResponse.json({ error: "Assignee not found" }, { status: 404 });
  if (target.role !== "DIALER") {
    return NextResponse.json({ error: "Assignee must be a dialer" }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.leadAssignment.deleteMany({
      where: { leadId: { in: leadIds }, releasedAt: null },
    });

    await tx.leadAssignment.createMany({
      data: leadIds.map((leadId) => ({ leadId, userId: parsed.data.assigneeId! })),
    });

    return leadIds.length;
  });

  return NextResponse.json({ ok: true, action: "reassign", updated });
}
