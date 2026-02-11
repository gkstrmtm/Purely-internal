import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import { ensurePortalInboxSchema } from "@/lib/portalInboxSchema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function customerFriendlyError(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const msg = raw.toLowerCase();

  if (msg.includes("portalinbox") && (msg.includes("does not exist") || msg.includes("relation") || msg.includes("table"))) {
    return {
      status: 503,
      code: "INBOX_NOT_READY",
      error:
        "Your inbox is still being set up. Please refresh in a minute. If this keeps happening, contact support.",
    };
  }

  return {
    status: 500,
    code: "INBOX_LOAD_FAILED",
    error: "We couldn’t load this conversation right now. Please try again in a moment.",
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const auth = await requireClientSessionForService("inbox");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const { threadId } = await params;

  // Avoid runtime failures if migrations haven't been applied yet.
  await ensurePortalInboxSchema();

  try {
    const thread = await (prisma as any).portalInboxThread.findFirst({
      where: { id: threadId, ownerId },
      select: { id: true },
    });
    if (!thread) return NextResponse.json({ ok: false, error: "Conversation not found." }, { status: 404 });

    const url = new URL(req.url);
    const takeRaw = Number(url.searchParams.get("take") ?? "120");
    const take = Number.isFinite(takeRaw) ? Math.max(10, Math.min(500, takeRaw)) : 120;

    const messages = await (prisma as any).portalInboxMessage.findMany({
      where: { ownerId, threadId },
      orderBy: { createdAt: "asc" },
      take,
      select: {
        id: true,
        channel: true,
        direction: true,
        fromAddress: true,
        toAddress: true,
        subject: true,
        bodyText: true,
        provider: true,
        providerMessageId: true,
        createdAt: true,
        attachments: {
          select: { id: true, fileName: true, mimeType: true, fileSize: true, publicToken: true },
        },
      },
    });

    // Best-effort dedupe: historically, outbound SMS could be logged twice
    // (Twilio send helper + API route). Collapse by provider message id.
    const deduped: any[] = [];
    const seen = new Map<string, number>();
    for (const m of messages ?? []) {
      const provider = typeof m?.provider === "string" ? m.provider : "";
      const providerMessageId = typeof m?.providerMessageId === "string" ? m.providerMessageId : "";
      const key = provider && providerMessageId ? `${provider}:${providerMessageId}` : "";
      if (!key) {
        deduped.push(m);
        continue;
      }

      const idx = seen.get(key);
      if (idx === undefined) {
        seen.set(key, deduped.length);
        deduped.push(m);
        continue;
      }

      const existing = deduped[idx];
      const existingAtt = Array.isArray(existing?.attachments) ? existing.attachments.length : 0;
      const nextAtt = Array.isArray(m?.attachments) ? m.attachments.length : 0;
      const existingBody = String(existing?.bodyText ?? "").trim();
      const nextBody = String(m?.bodyText ?? "").trim();

      // Prefer the row that has attachments and/or a non-empty body.
      if (nextAtt > existingAtt || (!existingBody && nextBody)) {
        deduped[idx] = m;
      }
    }

    const withUrls = deduped.map((m: any) => ({
      ...m,
      attachments: Array.isArray(m.attachments)
        ? m.attachments.map((a: any) => ({
            id: a.id,
            fileName: a.fileName,
            mimeType: a.mimeType,
            fileSize: a.fileSize,
            url: `/api/public/inbox/attachment/${a.id}/${a.publicToken}`,
          }))
        : [],
    }));

    return NextResponse.json({ ok: true, messages: withUrls });
  } catch (e) {
    const friendly = customerFriendlyError(e);
    return NextResponse.json({ ok: false, code: friendly.code, error: friendly.error }, { status: friendly.status });
  }
}
