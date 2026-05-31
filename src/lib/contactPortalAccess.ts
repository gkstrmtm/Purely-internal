import { prisma } from "@/lib/db";

export type ContactPortalAccessState = {
  email: string | null;
  status: "missing_email" | "not_provisioned" | "invite_pending" | "active";
  memberUserId: string | null;
  invitedAtIso: string | null;
  expiresAtIso: string | null;
  acceptedAtIso: string | null;
};

function makeMissingEmailState(): ContactPortalAccessState {
  return {
    email: null,
    status: "missing_email",
    memberUserId: null,
    invitedAtIso: null,
    expiresAtIso: null,
    acceptedAtIso: null,
  };
}

export async function getContactPortalAccessStates(opts: {
  ownerId: string;
  emails: Array<string | null | undefined>;
}): Promise<Map<string, ContactPortalAccessState>> {
  const normalizedEmails = Array.from(
    new Set(
      (opts.emails || [])
        .map((email) => String(email || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  if (!normalizedEmails.length) return new Map();

  const [existingUsers, memberships, invites] = await Promise.all([
    prisma.user
      .findMany({
        where: { email: { in: normalizedEmails } },
        select: { id: true, email: true },
      })
      .catch(() => []),
    prisma.user
      .findMany({
        where: { email: { in: normalizedEmails } },
        select: { id: true },
      })
      .then(async (users) => {
        const userIds = users.map((user) => String(user.id || "")).filter(Boolean);
        if (!userIds.length) return [] as Array<{ userId: string }>;
        return await (prisma as any).portalAccountMember
          .findMany({
            where: { ownerId: opts.ownerId, userId: { in: userIds } },
            select: { userId: true },
          })
          .catch(() => []);
      }),
    (prisma as any).portalAccountInvite
      .findMany({
        where: { ownerId: opts.ownerId, email: { in: normalizedEmails } },
        orderBy: [{ email: "asc" }, { createdAt: "desc" }],
        select: { email: true, createdAt: true, expiresAt: true, acceptedAt: true },
      })
      .catch(() => []),
  ]);

  const userByEmail = new Map<string, string>();
  for (const user of existingUsers || []) {
    const email = String(user.email || "").trim().toLowerCase();
    const userId = String(user.id || "").trim();
    if (!email || !userId || userByEmail.has(email)) continue;
    userByEmail.set(email, userId);
  }

  const activeUserIds = new Set<string>();
  for (const membership of memberships || []) {
    const userId = String(membership?.userId || "").trim();
    if (!userId) continue;
    activeUserIds.add(userId);
  }

  const latestInviteByEmail = new Map<string, { createdAt: Date | null; expiresAt: Date | null; acceptedAt: Date | null }>();
  for (const invite of invites || []) {
    const email = String(invite?.email || "").trim().toLowerCase();
    if (!email || latestInviteByEmail.has(email)) continue;
    latestInviteByEmail.set(email, {
      createdAt: invite?.createdAt ? new Date(invite.createdAt) : null,
      expiresAt: invite?.expiresAt ? new Date(invite.expiresAt) : null,
      acceptedAt: invite?.acceptedAt ? new Date(invite.acceptedAt) : null,
    });
  }

  const out = new Map<string, ContactPortalAccessState>();
  for (const email of normalizedEmails) {
    const userId = userByEmail.get(email) || null;
    const latestInvite = latestInviteByEmail.get(email) || null;

    if (userId && activeUserIds.has(userId)) {
      out.set(email, {
        email,
        status: "active",
        memberUserId: userId,
        invitedAtIso: latestInvite?.createdAt ? latestInvite.createdAt.toISOString() : null,
        expiresAtIso: latestInvite?.expiresAt ? latestInvite.expiresAt.toISOString() : null,
        acceptedAtIso: latestInvite?.acceptedAt ? latestInvite.acceptedAt.toISOString() : null,
      });
      continue;
    }

    const hasPendingInvite = Boolean(
      latestInvite?.createdAt && latestInvite?.expiresAt && !latestInvite?.acceptedAt && latestInvite.expiresAt.getTime() >= Date.now(),
    );

    out.set(email, {
      email,
      status: hasPendingInvite ? "invite_pending" : "not_provisioned",
      memberUserId: null,
      invitedAtIso: latestInvite?.createdAt ? latestInvite.createdAt.toISOString() : null,
      expiresAtIso: latestInvite?.expiresAt ? latestInvite.expiresAt.toISOString() : null,
      acceptedAtIso: latestInvite?.acceptedAt ? latestInvite.acceptedAt.toISOString() : null,
    });
  }

  return out;
}

export async function getContactPortalAccessState(opts: { ownerId: string; email?: string | null }): Promise<ContactPortalAccessState> {
  const email = String(opts.email || "").trim().toLowerCase();
  if (!email) return makeMissingEmailState();
  const states = await getContactPortalAccessStates({ ownerId: opts.ownerId, emails: [email] });
  return states.get(email) || makeMissingEmailState();
}