import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import { isPortalSupportChatConfigured, runPortalSupportChat } from "@/lib/portalSupportChat";

export async function processDuePortalAiChatScheduledMessages(opts?: { limit?: number }) {
  const limit = Math.max(1, Math.min(200, opts?.limit ?? 50));

  await ensurePortalAiChatSchema();

  if (!isPortalSupportChatConfigured()) {
    return { ok: false as const, error: "Pura is not configured for this environment." };
  }

  const now = new Date();

  const pending = await (prisma as any).portalAiChatMessage.findMany({
    where: {
      role: "user",
      sentAt: null,
      sendAt: { lte: now },
    },
    orderBy: { sendAt: "asc" },
    take: limit,
    select: {
      id: true,
      ownerId: true,
      threadId: true,
      text: true,
      attachmentsJson: true,
      createdByUserId: true,
      sendAt: true,
      repeatEveryMinutes: true,
    },
  });

  let processed = 0;

  for (const p of pending) {
    const ownerId = String(p.ownerId);
    const threadId = String(p.threadId);
    const repeatEveryMinutes =
      typeof (p as any).repeatEveryMinutes === "number" && Number.isFinite((p as any).repeatEveryMinutes)
        ? Math.max(0, Math.floor((p as any).repeatEveryMinutes))
        : 0;
    const scheduledAt = (p as any).sendAt ? new Date((p as any).sendAt) : null;

    // Mark as sent first to avoid double-processing.
    await (prisma as any).portalAiChatMessage.update({
      where: { id: p.id },
      data: { sentAt: new Date() },
    });

    const recentRows = await (prisma as any).portalAiChatMessage.findMany({
      where: { ownerId, threadId },
      orderBy: { createdAt: "desc" },
      take: 13,
      select: { id: true, role: true, text: true },
    });

    const recentMessages = recentRows
      .filter((m: any) => m.id !== p.id)
      .reverse()
      .slice(-12)
      .map((m: any) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        text: String(m.text || "").slice(0, 2000),
      }));

    const reply = await runPortalSupportChat({ message: String(p.text || ""), recentMessages });

    await (prisma as any).portalAiChatMessage.create({
      data: {
        ownerId,
        threadId,
        role: "assistant",
        text: reply,
        attachmentsJson: null,
        createdByUserId: null,
        sendAt: null,
        sentAt: new Date(),
      },
      select: { id: true },
    });

    await (prisma as any).portalAiChatThread.update({
      where: { id: threadId },
      data: { lastMessageAt: new Date() },
    });

    // If this was a repeating scheduled message, enqueue the next run.
    if (repeatEveryMinutes > 0) {
      const base = scheduledAt && Number.isFinite(scheduledAt.getTime()) ? scheduledAt : now;
      const nextAt = new Date(base.getTime() + repeatEveryMinutes * 60_000);
      await (prisma as any).portalAiChatMessage.create({
        data: {
          ownerId,
          threadId,
          role: "user",
          text: String((p as any).text || "").slice(0, 4000),
          attachmentsJson: (p as any).attachmentsJson ?? null,
          createdByUserId: (p as any).createdByUserId ?? null,
          sendAt: nextAt,
          sentAt: null,
          repeatEveryMinutes,
        },
        select: { id: true },
      });
    }

    processed += 1;
  }

  return { ok: true as const, processed };
}
