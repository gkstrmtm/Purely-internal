import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { baseUrlFromRequest, sendEmail } from "@/lib/leadOutbound";
import {
  createPortalAccountInvite,
  getPortalAccountMemberRole,
  listPortalAccountInvites,
  listPortalAccountMembers,
} from "@/lib/portalAccounts";
import { normalizePortalPermissions, portalPermissionsInputSchema } from "@/lib/portalPermissions";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const inviteSchema = z
  .object({
    email: z.string().email(),
    role: z.enum(["ADMIN", "MEMBER"]).optional(),
    permissions: portalPermissionsInputSchema.optional(),
  })
  .strict();

export async function GET() {
  const auth = await requireClientSessionForService("people");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const memberId = (auth.session.user as any).memberId || ownerId;

  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, email: true, name: true } });

  const members = await listPortalAccountMembers(ownerId).catch(() => [] as any[]);
  const invites = await listPortalAccountInvites(ownerId).catch(() => [] as any[]);

  // Include the owner as an implicit member.
  const mergedMembers = [
    ...(owner
      ? [
          {
            userId: owner.id,
            role: "OWNER",
            user: { id: owner.id, email: owner.email, name: owner.name, role: "CLIENT", active: true },
            implicit: true,
          },
        ]
      : []),
    ...members.map((m) => ({
      userId: m.userId,
      role: m.role,
      user: m.user,
      implicit: false,
    })),
  ].filter((m, idx, arr) => arr.findIndex((x) => x.userId === m.userId) === idx);

  const myRole = memberId === ownerId ? "OWNER" : await getPortalAccountMemberRole({ ownerId, userId: memberId });

  return NextResponse.json({ ok: true, ownerId, memberId, myRole, members: mergedMembers, invites });
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("people");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const memberId = (auth.session.user as any).memberId || ownerId;

  // Only the owner or an ADMIN member can invite.
  const myRole = memberId === ownerId ? "OWNER" : await getPortalAccountMemberRole({ ownerId, userId: memberId });
  if (myRole !== "OWNER" && myRole !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = inviteSchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  const email = parsed.data.email.toLowerCase().trim();
  const role = parsed.data.role ?? "MEMBER";

  const permissionsJson = normalizePortalPermissions(parsed.data.permissions, role);

  const invite = await createPortalAccountInvite({ ownerId, email, role, permissionsJson }).catch(() => null);
  if (!invite) return NextResponse.json({ ok: false, error: "Failed to create invite" }, { status: 500 });

  const base = process.env.NODE_ENV === "production" ? "https://purelyautomation.com" : baseUrlFromRequest(req);
  const link = `${base}/portalinvite/${invite.token}`;

  // Best-effort invite email.
  try {
    await sendEmail({
      to: email,
      subject: "You’ve been invited to Purely Automation",
      text: `You’ve been invited to access a Purely Automation client portal.\n\nAccept invite: ${link}\n\nThis invite expires on ${new Date(invite.expiresAt).toLocaleString()}.`,
    });
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, invite, link });
}
