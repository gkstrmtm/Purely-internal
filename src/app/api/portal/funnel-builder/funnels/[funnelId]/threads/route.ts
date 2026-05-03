import { NextResponse } from "next/server";

import {
  getCreditFunnelBuilderSettings,
  mutateCreditFunnelBuilderSettings,
} from "@/lib/creditFunnelBuilderSettingsStore";
import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import {
  buildDefaultFunnelThreadTitle,
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

function newThreadId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `thread_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function sortThreads(threads: FunnelThreadRecord[]) {
  return [...threads].sort((left, right) => {
    const leftAt = Date.parse(left.lastMessageAt || left.updatedAt || left.createdAt || "") || 0;
    const rightAt = Date.parse(right.lastMessageAt || right.updatedAt || right.createdAt || "") || 0;
    return rightAt - leftAt;
  });
}

function buildSeedThreads(input: {
  funnelId: string;
  pages: Array<{ id: string; title: string; customChatJson: unknown; updatedAt: Date }>;
}) {
  const nowIso = new Date().toISOString();
  const threads: FunnelThreadRecord[] = [
    {
      id: newThreadId(),
      funnelId: input.funnelId,
      pageId: null,
      title: buildDefaultFunnelThreadTitle({ kind: "main" }),
      kind: "main",
      messages: [],
      context: { seededFrom: "system" },
      lastMessageAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  for (const page of input.pages) {
    const messages = normalizeFunnelThreadMessages(page.customChatJson);
    if (!messages.length) continue;
    const updatedAt = page.updatedAt.toISOString();
    threads.push({
      id: newThreadId(),
      funnelId: input.funnelId,
      pageId: page.id,
      title: buildDefaultFunnelThreadTitle({ kind: "page", pageTitle: page.title }),
      kind: "page",
      messages,
      context: {
        seededFrom: "page.customChatJson",
        pageId: page.id,
        pageTitle: page.title,
      },
      lastMessageAt: readFunnelThreadLastMessageAt(messages, updatedAt),
      createdAt: updatedAt,
      updatedAt,
    });
  }

  return sortThreads(threads);
}

export async function GET(_req: Request, ctx: { params: Promise<{ funnelId: string }> }) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { funnelId: funnelIdRaw } = await ctx.params;
  const funnelId = String(funnelIdRaw || "").trim();
  if (!funnelId) return NextResponse.json({ ok: false, error: "Invalid funnel id" }, { status: 400 });

  const funnel = await prisma.creditFunnel.findFirst({
    where: { id: funnelId, ownerId: auth.session.user.id },
    select: { id: true },
  });
  if (!funnel) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const settings = await getCreditFunnelBuilderSettings(auth.session.user.id);
  let threads = readPersistedFunnelThreads(settings, funnelId);

  if (!threads.length) {
    const pages = await prisma.creditFunnelPage.findMany({
      where: { funnelId, funnel: { ownerId: auth.session.user.id } },
      select: { id: true, title: true, customChatJson: true, updatedAt: true },
      orderBy: { sortOrder: "asc" },
    });
    const seededThreads = buildSeedThreads({ funnelId, pages });
    const result = await mutateCreditFunnelBuilderSettings(auth.session.user.id, (current) => ({
      next: writePersistedFunnelThreads(current, funnelId, seededThreads),
      value: seededThreads,
    }));
    threads = result.value;
  }

  return NextResponse.json({ ok: true, threads });
}

export async function POST(req: Request, ctx: { params: Promise<{ funnelId: string }> }) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { funnelId: funnelIdRaw } = await ctx.params;
  const funnelId = String(funnelIdRaw || "").trim();
  if (!funnelId) return NextResponse.json({ ok: false, error: "Invalid funnel id" }, { status: 400 });

  const funnel = await prisma.creditFunnel.findFirst({
    where: { id: funnelId, ownerId: auth.session.user.id },
    select: { id: true },
  });
  if (!funnel) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = normalizeFunnelThreadKind(body?.kind);
  const pageId = typeof body?.pageId === "string" && body.pageId.trim() ? body.pageId.trim() : null;
  if (pageId) {
    const page = await prisma.creditFunnelPage.findFirst({
      where: { id: pageId, funnelId, funnel: { ownerId: auth.session.user.id } },
      select: { id: true },
    });
    if (!page) return NextResponse.json({ ok: false, error: "Page not found" }, { status: 404 });
  }

  const result = await mutateCreditFunnelBuilderSettings(auth.session.user.id, (current) => {
    const existingThreads = readPersistedFunnelThreads(current, funnelId);
    const cloneFromThreadId = typeof body?.cloneFromThreadId === "string" && body.cloneFromThreadId.trim()
      ? body.cloneFromThreadId.trim()
      : null;
    const cloneFrom = cloneFromThreadId
      ? existingThreads.find((thread) => thread.id === cloneFromThreadId) || null
      : null;
    const messages = normalizeFunnelThreadMessages(body?.messagesJson ?? cloneFrom?.messages);
    const pageTitle = typeof body?.contextJson === "object" && body?.contextJson && !Array.isArray(body.contextJson)
      ? String((body.contextJson as Record<string, unknown>).pageTitle || "").trim()
      : String(cloneFrom?.context?.pageTitle || "").trim();
    const nowIso = new Date().toISOString();
    const thread: FunnelThreadRecord = {
      id: newThreadId(),
      funnelId,
      pageId,
      title: normalizeFunnelThreadTitle(body?.title, buildDefaultFunnelThreadTitle({ kind, pageTitle })),
      kind,
      messages,
      context: normalizeFunnelThreadContext(body?.contextJson ?? cloneFrom?.context),
      lastMessageAt: readFunnelThreadLastMessageAt(messages, nowIso),
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const nextThreads = sortThreads([thread, ...existingThreads]);
    return {
      next: writePersistedFunnelThreads(current, funnelId, nextThreads),
      value: thread,
    };
  });

  return NextResponse.json({ ok: true, thread: result.value });
}