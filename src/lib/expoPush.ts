import { Expo, type ExpoPushMessage } from "expo-server-sdk";

import { prisma } from "@/lib/db";

const expo = new Expo();

function safeStr(v: unknown, max = 160) {
  const s = String(v ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1).trim() + "…" : s;
}

export async function sendExpoPushToUserIds(opts: {
  userIds: string[];
  title: string;
  body: string;
  data?: Record<string, any>;
}): Promise<{ ok: true; sent: number } | { ok: false; reason: string }> {
  const ids = Array.isArray(opts.userIds) ? opts.userIds.map((x) => String(x || "").trim()).filter(Boolean) : [];
  const uniqueIds = Array.from(new Set(ids)).slice(0, 100);
  if (!uniqueIds.length) return { ok: false, reason: "No recipients" };

  const rows = await prisma.portalDeviceToken
    .findMany({
      where: { userId: { in: uniqueIds }, revokedAt: null },
      select: { expoPushToken: true },
      take: 500,
    })
    .catch(() => []);

  const tokens = Array.from(
    new Set(
      rows
        .map((r) => String(r.expoPushToken || "").trim())
        .filter((t) => t && Expo.isExpoPushToken(t)),
    ),
  ).slice(0, 500);

  if (!tokens.length) return { ok: false, reason: "No push tokens" };

  const messages: ExpoPushMessage[] = tokens.map((to) => ({
    to,
    sound: "default",
    title: safeStr(opts.title, 80),
    body: safeStr(opts.body, 160),
    data: opts.data ?? undefined,
  }));

  const chunks = expo.chunkPushNotifications(messages);
  let sent = 0;

  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      sent += tickets.filter((t) => t.status === "ok").length;
    } catch {
      // Best-effort.
    }
  }

  return { ok: true, sent };
}
