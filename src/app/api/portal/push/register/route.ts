import { Expo } from "expo-server-sdk";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getPortalUser } from "@/lib/portalAuth";

export async function POST(req: Request) {
  const user = await getPortalUser({ variant: "portal" });
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const expoPushToken = typeof body?.expoPushToken === "string" ? body.expoPushToken.trim() : "";
  const platform = typeof body?.platform === "string" ? body.platform.trim() : null;
  const deviceName = typeof body?.deviceName === "string" ? body.deviceName.trim() : null;

  if (!expoPushToken || !Expo.isExpoPushToken(expoPushToken)) {
    return NextResponse.json({ ok: false, error: "Invalid Expo push token" }, { status: 400 });
  }

  const now = new Date();
  try {
    await prisma.portalDeviceToken.upsert({
      where: { expoPushToken },
      create: {
        userId: user.memberId || user.id,
        expoPushToken,
        platform,
        deviceName,
        lastSeenAt: now,
        revokedAt: null,
      },
      update: {
        userId: user.memberId || user.id,
        platform,
        deviceName,
        lastSeenAt: now,
        revokedAt: null,
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Push registration unavailable (DB not migrated yet)" },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
