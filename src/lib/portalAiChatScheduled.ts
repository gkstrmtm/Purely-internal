import { prisma } from "@/lib/db";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import { isPortalSupportChatConfigured, runPortalSupportChat } from "@/lib/portalSupportChat";

export async function processDuePortalAiChatScheduledMessages(opts?: { limit?: number }) {
  const limit = Math.max(1, Math.min(200, opts?.limit ?? 50));

  await ensurePortalAiChatSchema();

  if (!isPortalSupportChatConfigured()) {
    return { ok: false as const, error: "AI chat is not configured for this environment." };
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
    select: { id: true, ownerId: true, threadId: true, text: true },
  });

  let processed = 0;

  for (const p of pending) {
    const ownerId = String(p.ownerId);
    const threadId = String(p.threadId);

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

    processed += 1;
  }

  return { ok: true as const, processed };
}
