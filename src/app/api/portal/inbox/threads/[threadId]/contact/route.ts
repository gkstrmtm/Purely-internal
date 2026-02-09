import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { ensurePortalContactTagsReady } from "@/lib/portalContactTags";
import { ensurePortalInboxSchema } from "@/lib/portalInboxSchema";
import {
  normalizeEmailKey,
  normalizeNameKey,
  normalizePhoneKey,
  findOrCreatePortalContact,
} from "@/lib/portalContacts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => {
      const s = String(v ?? "").trim();
      return s ? s : null;
    })
    .refine((v) => v === null || /.+@.+\..+/.test(v), { message: "Invalid email" }),
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => {
      const s = String(v ?? "").trim();
      return s ? s : null;
    }),
});

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const { threadId } = await params;

  const raw = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
  }

  await ensurePortalInboxSchema();
  await ensurePortalContactTagsReady().catch(() => null);

  const thread = await (prisma as any).portalInboxThread.findFirst({
    where: { id: String(threadId), ownerId },
    select: { id: true, channel: true, peerAddress: true, peerKey: true, contactId: true },
  });

  if (!thread) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const name = parsed.data.name;
  const nameKey = normalizeNameKey(name);

  const email = parsed.data.email;
  const emailKey = email ? normalizeEmailKey(email) : null;
  const emailFinal = emailKey ? email : null;

  const phoneNorm = normalizePhoneKey(parsed.data.phone || "");
  if (phoneNorm.error) {
    return NextResponse.json({ ok: false, error: phoneNorm.error }, { status: 400 });
  }

  const phoneFinal = phoneNorm.phoneKey ? phoneNorm.phone : null;
  const phoneKey = phoneNorm.phoneKey;

  let contactId: string | null = thread.contactId ? String(thread.contactId) : null;

  if (contactId) {
    try {
      await (prisma as any).portalContact.updateMany({
        where: { id: contactId, ownerId },
        data: {
          name,
          nameKey,
          email: emailFinal,
          emailKey: emailFinal ? emailKey : null,
          phone: phoneFinal,
          phoneKey,
        },
      });
    } catch {
      // ignore
    }
  } else {
    // Create or find a contact, then link the thread.
    contactId = await findOrCreatePortalContact({
      ownerId,
      name,
      email: emailFinal,
      phone: phoneFinal,
    });

    if (contactId) {
      try {
        await (prisma as any).portalInboxThread.updateMany({
          where: { id: String(thread.id), ownerId },
          data: { contactId },
        });
      } catch {
        // ignore
      }
    }
  }

  const contact = contactId
    ? await (async () => {
        try {
          const row = await (prisma as any).portalContact.findFirst({
            where: { id: contactId, ownerId },
            select: { id: true, name: true, email: true, phone: true },
          });
          if (!row) return null;
          return {
            id: String(row.id),
            name: String(row.name ?? "").slice(0, 80) || "Contact",
            email: row.email ? String(row.email).slice(0, 120) : null,
            phone: row.phone ? String(row.phone).slice(0, 40) : null,
          };
        } catch {
          return null;
        }
      })()
    : null;

  let tags: Array<{ id: string; name: string; color: string | null }> = [];
  if (contactId) {
    try {
      const rows = await (prisma as any).portalContactTagAssignment.findMany({
        where: { ownerId, contactId },
        take: 2000,
        select: { tag: { select: { id: true, name: true, color: true } } },
      });
      tags = (rows || [])
        .map((r: any) => r.tag)
        .filter(Boolean)
        .map((t: any) => ({
          id: String(t.id),
          name: String(t.name).slice(0, 60),
          color: t.color ? String(t.color) : null,
        }));
    } catch {
      // ignore
    }
  }

  return NextResponse.json({ ok: true, threadId: String(thread.id), contactId, contact, contactTags: tags });
}
