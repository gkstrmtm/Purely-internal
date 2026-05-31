import { NextResponse } from "next/server";
import { z } from "zod";

import { getContactPortalAccessState } from "@/lib/contactPortalAccess";
import { prisma } from "@/lib/db";
import { createPortalAccountInvite } from "@/lib/portalAccounts";
import { sendPortalAccountInviteEmail } from "@/lib/portalAccountInviteEmail";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { PORTAL_SERVICE_KEYS, type PortalPermissions } from "@/lib/portalPermissions.shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const contactIdSchema = z.string().trim().min(1).max(120);
const bodySchema = z
  .object({
    portalVariant: z.enum(["portal", "credit"]).optional(),
  })
  .strict();

function buildRestrictedClientPermissions(): PortalPermissions {
  return Object.fromEntries(PORTAL_SERVICE_KEYS.map((key) => [key, { view: false, edit: false }])) as PortalPermissions;
}

export async function POST(req: Request, ctx: { params: Promise<{ contactId: string }> }) {
  const auth = await requireClientSessionForService("people", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const params = await ctx.params;
  const contactId = contactIdSchema.safeParse(params.contactId);
  if (!contactId.success) {
    return NextResponse.json({ ok: false, error: "Invalid contact id" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse((await req.json().catch(() => null)) ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
  }

  const portalVariant = parsed.data.portalVariant === "portal" ? "portal" : "credit";

  const contact = await prisma.portalContact.findFirst({
    where: { id: contactId.data, ownerId },
    select: { id: true, email: true, name: true },
  });

  if (!contact) {
    return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
  }

  const email = String(contact.email || "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ ok: false, error: "Add an email address before sending client access." }, { status: 400 });
  }

  const invite = await createPortalAccountInvite({
    ownerId,
    email,
    role: "MEMBER",
    permissionsJson: buildRestrictedClientPermissions(),
  }).catch(() => null);

  if (!invite) {
    return NextResponse.json({ ok: false, error: "Failed to create client access invite" }, { status: 500 });
  }

  const emailResult = await sendPortalAccountInviteEmail({
    email,
    token: invite.token,
    expiresAt: invite.expiresAt,
    portalVariant,
  });

  const portalAccess = await getContactPortalAccessState({ ownerId, email }).catch(() => null);

  return NextResponse.json({
    ok: true,
    portalAccess,
    link: emailResult.link,
    emailDelivery: emailResult.ok
      ? {
          ok: true,
          provider: emailResult.provider,
          providerMessageId: emailResult.providerMessageId,
        }
      : {
          ok: false,
          reason: emailResult.reason,
        },
  });
}