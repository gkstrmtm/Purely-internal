import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (role !== "DIALER" && role !== "MANAGER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { callLogId?: unknown; url?: unknown; mimeType?: unknown; fileSize?: unknown }
    | null;

  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const callLogId = typeof body.callLogId === "string" ? body.callLogId : null;
  const url = typeof body.url === "string" ? body.url : null;
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "application/octet-stream";
  const fileSize = typeof body.fileSize === "number" ? body.fileSize : null;

  if (!callLogId || !url || !fileSize) {
    return NextResponse.json({ error: "callLogId, url, fileSize are required" }, { status: 400 });
  }

  const log = await prisma.callLog.findUnique({ where: { id: callLogId } });
  if (!log) return NextResponse.json({ error: "Call log not found" }, { status: 404 });

  if (role !== "MANAGER" && role !== "ADMIN" && log.dialerId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const recording = await prisma.callRecording.upsert({
    where: { callLogId },
    update: { filePath: url, mimeType, fileSize },
    create: { callLogId, filePath: url, mimeType, fileSize },
  });

  return NextResponse.json({ recording });
}
