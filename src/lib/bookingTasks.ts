import crypto from "crypto";

import { getBookingCalendarsConfig } from "@/lib/bookingCalendars";
import { prisma } from "@/lib/db";
import { ensurePortalTasksSchema } from "@/lib/portalTasksSchema";

async function validateAssignee(ownerId: string, userId: string | null | undefined): Promise<string | null> {
  const candidate = String(userId || "").trim();
  if (!candidate) return null;
  if (candidate === ownerId) return candidate;

  const member = await (prisma as any).portalAccountMember
    .findUnique({
      where: { ownerId_userId: { ownerId, userId: candidate } },
      select: { id: true },
    })
    .catch(() => null);

  return member?.id ? candidate : null;
}

async function resolveCalendarAssignee(ownerId: string, calendarId: string | null | undefined): Promise<string | null> {
  const id = String(calendarId || "").trim();
  if (!id) return null;

  const config = await getBookingCalendarsConfig(ownerId).catch(() => null);
  const calendar = config?.calendars?.find((item) => String(item.id) === id) ?? null;
  if (!calendar) return null;

  const explicit = await validateAssignee(ownerId, (calendar as any).assignedUserId).catch(() => null);
  if (explicit) return explicit;

  const emails = Array.isArray(calendar.notificationEmails)
    ? calendar.notificationEmails.map((item) => String(item || "").trim().toLowerCase()).filter((item) => item.includes("@"))
    : [];
  if (!emails.length) return null;

  const members = await (prisma as any).portalAccountMember
    .findMany({
      where: { ownerId },
      select: { userId: true, user: { select: { email: true, active: true } } },
      take: 200,
    })
    .catch(() => [] as any[]);

  const emailSet = new Set(emails);
  for (const member of members) {
    const userId = typeof member?.userId === "string" ? member.userId : "";
    const email = typeof member?.user?.email === "string" ? member.user.email.trim().toLowerCase() : "";
    if (!userId || !email || member?.user?.active === false) continue;
    if (emailSet.has(email)) return userId;
  }

  return null;
}

export async function createTaskForBookedCall({
  ownerId,
  bookingId,
  calendarId,
  title,
  contactName,
  contactEmail,
  contactPhone,
  notes,
  meetingLocation,
  meetingDetails,
  startAt,
}: {
  ownerId: string;
  bookingId: string;
  calendarId?: string | null;
  title: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
  notes?: string | null;
  meetingLocation?: string | null;
  meetingDetails?: string | null;
  startAt: Date;
}): Promise<boolean> {
  const safeOwnerId = String(ownerId || "").trim();
  const safeBookingId = String(bookingId || "").trim();
  if (!safeOwnerId || !safeBookingId) return false;

  await ensurePortalTasksSchema().catch(() => null);

  const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "PortalTask" WHERE "ownerId" = $1 AND "description" LIKE $2 LIMIT 1`,
    safeOwnerId,
    `%Booking ID: ${safeBookingId}%`,
  ).catch(() => []);
  if (existing.length) return false;

  const assignedToUserId = await resolveCalendarAssignee(safeOwnerId, calendarId).catch(() => null);
  const description = [
    contactName ? `Contact: ${String(contactName).trim()}` : null,
    contactEmail ? `Email: ${String(contactEmail).trim()}` : null,
    contactPhone ? `Phone: ${String(contactPhone).trim()}` : null,
    meetingLocation ? `Location: ${String(meetingLocation).trim()}` : null,
    meetingDetails ? `Details: ${String(meetingDetails).trim()}` : null,
    notes ? `Notes: ${String(notes).trim().slice(0, 2000)}` : null,
    `Booking ID: ${safeBookingId}`,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 5000);

  await prisma.$executeRawUnsafe(
    `INSERT INTO "PortalTask" ("id","ownerId","createdByUserId","title","description","status","assignedToUserId","dueAt","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,'OPEN',$6,$7,DEFAULT,$8)`,
    crypto.randomUUID().replace(/-/g, ""),
    safeOwnerId,
    safeOwnerId,
    String(title || "Booked call").trim().slice(0, 160),
    description || null,
    assignedToUserId,
    startAt,
    new Date(),
  );

  return true;
}

export async function createTaskForAiOutboundFollowUp({
  ownerId,
  taskKey,
  title,
  contactName,
  contactEmail,
  contactPhone,
  dueAt,
  notes,
}: {
  ownerId: string;
  taskKey: string;
  title: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  dueAt: Date;
  notes?: string | null;
}): Promise<boolean> {
  const safeOwnerId = String(ownerId || "").trim();
  const safeTaskKey = String(taskKey || "").trim();
  if (!safeOwnerId || !safeTaskKey) return false;

  await ensurePortalTasksSchema().catch(() => null);

  const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "PortalTask" WHERE "ownerId" = $1 AND "description" LIKE $2 LIMIT 1`,
    safeOwnerId,
    `%AI Outbound Task Key: ${safeTaskKey}%`,
  ).catch(() => []);
  if (existing.length) return false;

  const description = [
    contactName ? `Contact: ${String(contactName).trim()}` : null,
    contactEmail ? `Email: ${String(contactEmail).trim()}` : null,
    contactPhone ? `Phone: ${String(contactPhone).trim()}` : null,
    notes ? `Notes: ${String(notes).trim().slice(0, 2000)}` : null,
    `AI Outbound Task Key: ${safeTaskKey}`,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 5000);

  await prisma.$executeRawUnsafe(
    `INSERT INTO "PortalTask" ("id","ownerId","createdByUserId","title","description","status","assignedToUserId","dueAt","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,'OPEN',$6,$7,DEFAULT,$8)`,
    crypto.randomUUID().replace(/-/g, ""),
    safeOwnerId,
    safeOwnerId,
    String(title || "AI outbound follow-up").trim().slice(0, 160),
    description || null,
    null,
    dueAt,
    new Date(),
  );

  return true;
}