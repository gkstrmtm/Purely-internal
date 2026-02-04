import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";

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

function isSchemaDriftError(err: unknown) {
  // Common Prisma error codes when the DB schema doesn't match the Prisma schema
  // (missing tables/columns due to production drift).
  if (err && typeof err === "object") {
    const code = (err as { code?: string }).code;
    return code === "P2021" || code === "P2022";
  }
  return false;
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isSchemaDriftError(e)) return fallback;
    throw e;
  }
}

async function safeVoid(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (isSchemaDriftError(e)) return;
    throw e;
  }
}

export async function POST(req: Request) {
  try {
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
        const appts = await safe(
          () =>
            tx.appointment.findMany({
              where: { leadId: { in: leadIds } },
              select: { id: true },
            }),
          [],
        );
        const appointmentIds = appts.map((a) => a.id);

        const outcomes = appointmentIds.length
          ? await safe(
              () =>
                tx.appointmentOutcome.findMany({
                  where: { appointmentId: { in: appointmentIds } },
                  select: { id: true },
                }),
              [],
            )
          : [];
        const outcomeIds = outcomes.map((o) => o.id);

        const drafts = outcomeIds.length
          ? await safe(
              () =>
                tx.contractDraft.findMany({
                  where: { appointmentOutcomeId: { in: outcomeIds } },
                  select: { id: true },
                }),
              [],
            )
          : [];
        const draftIds = drafts.map((d) => d.id);

        if (draftIds.length) {
          await safeVoid(() => tx.approval.deleteMany({ where: { contractDraftId: { in: draftIds } } }));
          await safeVoid(() => tx.contractDraft.deleteMany({ where: { id: { in: draftIds } } }));
        }

        if (appointmentIds.length) {
          await safeVoid(() =>
            tx.appointmentOutcome.deleteMany({ where: { appointmentId: { in: appointmentIds } } }),
          );
          await safeVoid(() =>
            tx.appointmentVideo.deleteMany({ where: { appointmentId: { in: appointmentIds } } }),
          );
          await safeVoid(() => tx.appointment.deleteMany({ where: { id: { in: appointmentIds } } }));
        }

        const callLogs = await safe(
          () =>
            tx.callLog.findMany({
              where: { leadId: { in: leadIds } },
              select: { id: true },
            }),
          [],
        );
        const callLogIds = callLogs.map((c) => c.id);

        if (callLogIds.length) {
          await safeVoid(() => tx.callRecording.deleteMany({ where: { callLogId: { in: callLogIds } } }));
          await safeVoid(() => tx.callLog.deleteMany({ where: { id: { in: callLogIds } } }));
        }

        await safeVoid(() => tx.leadAssignment.deleteMany({ where: { leadId: { in: leadIds } } }));

        // MarketingDemoRequest has dependent MarketingMessage rows.
        // Delete messages first to avoid FK violations.
        const demoRequests = await safe(
          () =>
            tx.marketingDemoRequest.findMany({
              where: { leadId: { in: leadIds } },
              select: { id: true },
            }),
          [],
        );
        const demoRequestIds = demoRequests.map((r) => r.id);
        if (demoRequestIds.length) {
          await safeVoid(() =>
            tx.marketingMessage.deleteMany({ where: { requestId: { in: demoRequestIds } } }),
          );
        }

        await safeVoid(() => tx.marketingDemoRequest.deleteMany({ where: { leadId: { in: leadIds } } }));
        await safeVoid(() => tx.doc.deleteMany({ where: { leadId: { in: leadIds } } }));

        const result = await tx.lead.deleteMany({ where: { id: { in: leadIds } } });
        return result.count;
      });

      return NextResponse.json({ ok: true, action: "delete", deleted });
    }

    if (parsed.data.action === "unassign") {
      const updated = await prisma.$transaction(async (tx) => {
        const res = await safe(
          () =>
            tx.leadAssignment.deleteMany({
              where: { leadId: { in: leadIds }, releasedAt: null },
            }),
          { count: 0 },
        );
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
      await safeVoid(() =>
        tx.leadAssignment.deleteMany({
          where: { leadId: { in: leadIds }, releasedAt: null },
        }),
      );

      await safeVoid(() =>
        tx.leadAssignment.createMany({
          data: leadIds.map((leadId) => ({ leadId, userId: parsed.data.assigneeId! })),
        }),
      );

      return leadIds.length;
    });

    return NextResponse.json({ ok: true, action: "reassign", updated });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && isSchemaDriftError(err)) {
      return NextResponse.json(
        {
          error:
            "Bulk action failed due to database schema drift. Run Prisma migrations (or redeploy after syncing schema) and retry.",
        },
        { status: 500 },
      );
    }

    console.error("/api/manager/leads/bulk failed", err);
    return NextResponse.json({ error: "Bulk action failed" }, { status: 500 });
  }
}
