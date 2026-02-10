import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { ensurePortalContactTagsReady } from "@/lib/portalContactTags";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const contactIdSchema = z.string().trim().min(1).max(120);

export async function GET(_req: Request, ctx: { params: Promise<{ contactId: string }> }) {
  const auth = await requireClientSessionForService("people");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  await ensurePortalContactTagsReady().catch(() => null);

  const params = await ctx.params;
  const contactId = contactIdSchema.safeParse(params.contactId);
  if (!contactId.success) {
    return NextResponse.json({ ok: false, error: "Invalid contact id" }, { status: 400 });
  }

  const contact = await prisma.portalContact.findFirst({
    where: { id: contactId.data, ownerId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      createdAt: true,
      updatedAt: true,
      portalLeads: {
        select: {
          id: true,
          businessName: true,
          phone: true,
          website: true,
          niche: true,
          source: true,
          kind: true,
          createdAt: true,
          assignedToUserId: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      inboxThreads: {
        select: {
          id: true,
          channel: true,
          peerAddress: true,
          subject: true,
          lastMessageAt: true,
          lastMessagePreview: true,
        },
        orderBy: { lastMessageAt: "desc" },
        take: 25,
      },
      bookings: {
        select: {
          id: true,
          startAt: true,
          endAt: true,
          status: true,
          createdAt: true,
          site: { select: { title: true } },
        },
        orderBy: { startAt: "desc" },
        take: 25,
      },
      reviews: {
        select: {
          id: true,
          rating: true,
          body: true,
          createdAt: true,
          archivedAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 25,
      },
      tagAssignments: {
        select: {
          tag: { select: { id: true, name: true, color: true } },
        },
      },
    },
  });

  if (!contact) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    contact: {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      createdAtIso: contact.createdAt.toISOString(),
      updatedAtIso: contact.updatedAt.toISOString(),
      tags: (contact as any).tagAssignments
        ? (contact as any).tagAssignments
            .map((a: any) => a?.tag)
            .filter(Boolean)
            .map((t: any) => ({
              id: String(t.id),
              name: String(t.name || "").slice(0, 60),
              color: typeof t.color === "string" ? String(t.color) : null,
            }))
        : [],
      leads: contact.portalLeads.map((l) => ({
        id: l.id,
        businessName: l.businessName,
        phone: l.phone,
        website: l.website,
        niche: l.niche,
        source: l.source,
        kind: l.kind,
        createdAtIso: l.createdAt.toISOString(),
        assignedToUserId: l.assignedToUserId,
      })),
      inboxThreads: contact.inboxThreads.map((t) => ({
        id: t.id,
        channel: t.channel,
        peerAddress: t.peerAddress,
        subject: t.subject,
        lastMessageAtIso: t.lastMessageAt.toISOString(),
        lastMessagePreview: t.lastMessagePreview,
      })),
      bookings: contact.bookings.map((b) => ({
        id: b.id,
        siteTitle: b.site?.title ?? null,
        startAtIso: b.startAt.toISOString(),
        endAtIso: b.endAt.toISOString(),
        status: b.status,
        createdAtIso: b.createdAt.toISOString(),
      })),
      reviews: contact.reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        body: r.body,
        archivedAtIso: r.archivedAt ? r.archivedAt.toISOString() : null,
        createdAtIso: r.createdAt.toISOString(),
      })),
    },
  });
}
