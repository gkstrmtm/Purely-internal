import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import { findOrCreatePortalContact } from "@/lib/portalContacts";
import { extractEmailAddress } from "@/lib/portalInbox";
import { ensurePortalInboxSchema } from "@/lib/portalInboxSchema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_TAKE = 80;
const MAX_TAKE = 100;

function parseChannel(v: string | null): "EMAIL" | "SMS" {
  const s = String(v ?? "").toLowerCase().trim();
  return s === "sms" ? "SMS" : "EMAIL";
}

function parseTake(v: string | null) {
  const n = Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return DEFAULT_TAKE;
  return Math.max(20, Math.min(MAX_TAKE, n));
}

function parseCursor(url: URL) {
  const id = String(url.searchParams.get("cursorId") ?? "").trim();
  const lastMessageAtRaw = String(url.searchParams.get("cursorLastMessageAt") ?? "").trim();
  if (!id || !lastMessageAtRaw) return null;
  const lastMessageAt = new Date(lastMessageAtRaw);
  if (Number.isNaN(lastMessageAt.getTime())) return null;
  return { id, lastMessageAt };
}

function customerFriendlyError(err: unknown, channel: "EMAIL" | "SMS") {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const msg = raw.toLowerCase();

  // Common when migrations haven't been applied yet.
  if (msg.includes("portalinbox") && (msg.includes("does not exist") || msg.includes("relation") || msg.includes("table"))) {
    return {
      status: 503,
      code: "INBOX_NOT_READY",
      error:
        "Your inbox is still being set up. Please refresh in a minute. If this keeps happening, contact support.",
    };
  }

  if (msg.includes("unauthorized") || msg.includes("forbidden")) {
    return {
      status: 401,
      code: "SESSION_EXPIRED",
      error: "Please sign in again to view your inbox.",
    };
  }

  // Generic fallback.
  return {
    status: 500,
    code: "INBOX_LOAD_FAILED",
    error:
      channel === "SMS"
        ? "We couldn’t load your text message threads right now. Please try again in a moment."
        : "We couldn’t load your email threads right now. Please try again in a moment.",
  };
}

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("inbox");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const url = new URL(req.url);
  const channel = parseChannel(url.searchParams.get("channel"));
  const take = parseTake(url.searchParams.get("take"));
  const cursor = parseCursor(url);

  // Avoid runtime failures if migrations haven't been applied yet.
  await ensurePortalInboxSchema();

  try {
    const where: Record<string, unknown> = { ownerId, channel };
    if (cursor) {
      where.OR = [
        { lastMessageAt: { lt: cursor.lastMessageAt } },
        { lastMessageAt: cursor.lastMessageAt, id: { lt: cursor.id } },
      ];
    }

    const rows = (await (prisma as any).portalInboxThread.findMany({
      where,
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      take: take + 1,
      select: {
        id: true,
        channel: true,
        peerAddress: true,
        contactId: true,
        subject: true,
        lastMessageAt: true,
        lastMessagePreview: true,
        lastMessageDirection: true,
        lastMessageFrom: true,
        lastMessageTo: true,
        lastMessageSubject: true,
      },
    })) as any[];

    const hasMore = rows.length > take;
    const threads = hasMore ? rows.slice(0, take) : rows;

    // Repair: older threads may not have been linked to a contact.
    // Best-effort attach based on peerAddress so UI can show names.
    const threadsNeedingContact = (threads || []).filter((t) => !t?.contactId && t?.peerAddress).slice(0, 25);
    if (threadsNeedingContact.length) {
      await Promise.all(
        threadsNeedingContact.map(async (t) => {
          const peerAddressRaw = String(t.peerAddress ?? "").trim();
          if (!peerAddressRaw) return;

          const email = channel === "EMAIL" ? extractEmailAddress(peerAddressRaw) || peerAddressRaw : null;
          const phone = channel === "SMS" ? peerAddressRaw : null;
          const name = channel === "EMAIL" ? (email || peerAddressRaw) : peerAddressRaw;

          const contactId = await findOrCreatePortalContact({ ownerId, name, email, phone });
          if (!contactId) return;

          try {
            await (prisma as any).portalInboxThread.updateMany({
              where: { ownerId, id: t.id, contactId: null },
              data: { contactId },
            });
            t.contactId = contactId;
          } catch {
            // ignore
          }
        }),
      );
    }

    const contactIds = Array.from(
      new Set((threads || []).map((t: any) => String(t.contactId || "")).filter(Boolean)),
    );

    const contactsById = new Map<string, { id: string; name: string; email: string | null; phone: string | null }>();
    if (contactIds.length) {
      try {
        const rows = await (prisma as any).portalContact.findMany({
          where: { ownerId, id: { in: contactIds } },
          take: 500,
          select: { id: true, name: true, email: true, phone: true },
        });

        for (const r of rows || []) {
          contactsById.set(String(r.id), {
            id: String(r.id),
            name: String(r.name ?? "").slice(0, 80) || "Contact",
            email: r.email ? String(r.email).slice(0, 120) : null,
            phone: r.phone ? String(r.phone).slice(0, 40) : null,
          });
        }
      } catch {
        // ignore
      }
    }

    const tagsByContactId = new Map<string, Array<{ id: string; name: string; color: string | null }>>();
    if (contactIds.length) {
      try {
        const rows = await (prisma as any).portalContactTagAssignment.findMany({
          where: { ownerId, contactId: { in: contactIds } },
          take: 2000,
          select: {
            contactId: true,
            tag: { select: { id: true, name: true, color: true } },
          },
        });

        for (const r of rows || []) {
          const cid = String(r.contactId);
          const t = r.tag;
          if (!t) continue;
          const list = tagsByContactId.get(cid) || [];
          list.push({ id: String(t.id), name: String(t.name), color: t.color ? String(t.color) : null });
          tagsByContactId.set(cid, list);
        }
      } catch {
        // ignore
      }
    }

    const withTags = (threads || []).map((t: any) => ({
      ...t,
      contactId: t.contactId ? String(t.contactId) : null,
      contact: t.contactId ? contactsById.get(String(t.contactId)) || null : null,
      contactTags: t.contactId ? tagsByContactId.get(String(t.contactId)) || [] : [],
    }));

    const lastThread = withTags[withTags.length - 1] ?? null;
    const nextCursor = hasMore && lastThread
      ? {
          id: String(lastThread.id),
          lastMessageAt:
            lastThread.lastMessageAt instanceof Date
              ? lastThread.lastMessageAt.toISOString()
              : String(lastThread.lastMessageAt),
        }
      : null;

    return NextResponse.json({ ok: true, threads: withTags, hasMore, nextCursor });
  } catch (e) {
    const friendly = customerFriendlyError(e, channel);
    return NextResponse.json({ ok: false, code: friendly.code, error: friendly.error }, { status: friendly.status });
  }
}
