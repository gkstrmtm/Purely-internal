import { NextResponse } from "next/server";

import { mutateCreditFunnelBuilderSettings } from "@/lib/creditFunnelBuilderSettingsStore";
import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import {
  normalizeFunnelThreadContext,
  normalizeFunnelThreadKind,
  normalizeFunnelThreadMessages,
  normalizeFunnelThreadTitle,
  readFunnelThreadLastMessageAt,
  readPersistedFunnelThreads,
  writePersistedFunnelThreads,
  type FunnelThreadRecord,
} from "@/lib/funnelThreads";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function sortThreads(threads: FunnelThreadRecord[]) {
  return [...threads].sort((left, right) => {
    const leftAt = Date.parse(left.lastMessageAt || left.updatedAt || left.createdAt || "") || 0;
    const rightAt = Date.parse(right.lastMessageAt || right.updatedAt || right.createdAt || "") || 0;
    return rightAt - leftAt;
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ funnelId: string; threadId: string }> }) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { funnelId: funnelIdRaw, threadId: threadIdRaw } = await ctx.params;
  const funnelId = String(funnelIdRaw || "").trim();
  const threadId = String(threadIdRaw || "").trim();
  if (!funnelId || !threadId) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  const funnel = await prisma.creditFunnel.findFirst({
    where: { id: funnelId, ownerId: auth.session.user.id },
    select: { id: true },
  });
  if (!funnel) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const requestedPageId = Object.prototype.hasOwnProperty.call(body ?? {}, "pageId")
    ? typeof body?.pageId === "string" && body.pageId.trim()
      ? body.pageId.trim()
      : null
    : undefined;

  if (requestedPageId) {
    const page = await prisma.creditFunnelPage.findFirst({
      where: { id: requestedPageId, funnelId, funnel: { ownerId: auth.session.user.id } },
      select: { id: true },
    });
    if (!page) return NextResponse.json({ ok: false, error: "Page not found" }, { status: 404 });
  }

  const result = await mutateCreditFunnelBuilderSettings(auth.session.user.id, (current) => {
    const threads = readPersistedFunnelThreads(current, funnelId);
    const existing = threads.find((thread) => thread.id === threadId) || null;
    if (!existing) throw new Error("THREAD_NOT_FOUND");

    const messages = Object.prototype.hasOwnProperty.call(body ?? {}, "messagesJson")
      ? normalizeFunnelThreadMessages(body?.messagesJson)
      : existing.messages;
    const updatedThread: FunnelThreadRecord = {
      ...existing,
      pageId: requestedPageId !== undefined ? requestedPageId : existing.pageId,
      title: Object.prototype.hasOwnProperty.call(body ?? {}, "title")
        ? normalizeFunnelThreadTitle(body?.title, existing.title)
        : existing.title,
      kind: Object.prototype.hasOwnProperty.call(body ?? {}, "kind")
        ? normalizeFunnelThreadKind(body?.kind)
        : existing.kind,
      messages,
      context: Object.prototype.hasOwnProperty.call(body ?? {}, "contextJson")
        ? normalizeFunnelThreadContext(body?.contextJson)
        : existing.context,
      lastMessageAt: Object.prototype.hasOwnProperty.call(body ?? {}, "messagesJson") || Object.prototype.hasOwnProperty.call(body ?? {}, "lastMessageAt")
        ? readFunnelThreadLastMessageAt(messages, typeof body?.lastMessageAt === "string" ? body.lastMessageAt : existing.lastMessageAt)
        : existing.lastMessageAt,
      updatedAt: new Date().toISOString(),
    };
    const nextThreads = sortThreads(threads.map((thread) => (thread.id === threadId ? updatedThread : thread)));
    return {
      next: writePersistedFunnelThreads(current, funnelId, nextThreads),
      value: updatedThread,
    };
  }).catch((error) => {
    if ((error as Error)?.message === "THREAD_NOT_FOUND") return null;
    throw error;
  });

  if (!result) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, thread: result.value });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ funnelId: string; threadId: string }> }) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { funnelId: funnelIdRaw, threadId: threadIdRaw } = await ctx.params;
  const funnelId = String(funnelIdRaw || "").trim();
  const threadId = String(threadIdRaw || "").trim();
  if (!funnelId || !threadId) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  const funnel = await prisma.creditFunnel.findFirst({
    where: { id: funnelId, ownerId: auth.session.user.id },
    select: { id: true },
  });
  if (!funnel) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const result = await mutateCreditFunnelBuilderSettings(auth.session.user.id, (current) => {
    const threads = readPersistedFunnelThreads(current, funnelId);
    if (!threads.some((thread) => thread.id === threadId)) throw new Error("THREAD_NOT_FOUND");
    if (threads.length <= 1) throw new Error("THREAD_MINIMUM");

    const nextThreads = threads.filter((thread) => thread.id !== threadId);
    return {
      next: writePersistedFunnelThreads(current, funnelId, nextThreads),
      value: true,
    };
  }).catch((error) => {
    const message = (error as Error)?.message || "";
    if (message === "THREAD_NOT_FOUND" || message === "THREAD_MINIMUM") return message;
    throw error;
  });

  if (result === "THREAD_NOT_FOUND") return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (result === "THREAD_MINIMUM") {
    return NextResponse.json({ ok: false, error: "Keep at least one thread for this funnel" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}