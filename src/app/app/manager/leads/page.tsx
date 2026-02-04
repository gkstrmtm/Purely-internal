import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import ManagerLeadsClient from "./ManagerLeadsClient";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { deriveInterestedServiceFromNotes } from "@/lib/leadDerived";

export default async function ManagerLeadsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  if (role !== "MANAGER" && role !== "ADMIN") redirect("/app");

  const [hasContactPhone, hasInterestedService] = await Promise.all([
    hasPublicColumn("Lead", "contactPhone"),
    hasPublicColumn("Lead", "interestedService"),
  ]);

  const hasNotes = await hasPublicColumn("Lead", "notes");

  const leadSelect = {
    id: true,
    businessName: true,
    phone: true,
    contactName: true,
    contactEmail: true,
    ...(hasContactPhone ? { contactPhone: true } : {}),
    ...(hasInterestedService ? { interestedService: true } : {}),
    ...(hasNotes ? { notes: true } : {}),
    niche: true,
    location: true,
    source: true,
    status: true,
    createdAt: true,
    assignments: {
      where: { releasedAt: null },
      select: {
        claimedAt: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { claimedAt: "desc" },
      take: 1,
    },
    appointments: {
      where: { status: { in: ["SCHEDULED", "RESCHEDULED"] as Array<"SCHEDULED" | "RESCHEDULED"> } },
      orderBy: { startAt: "desc" },
      take: 1,
      select: {
        id: true,
        startAt: true,
        endAt: true,
        status: true,
        closer: { select: { id: true, name: true, email: true } },
      },
    },
  } as const;

  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: leadSelect,
  });

  const dialers = await prisma.user.findMany({
    where: { role: "DIALER" },
    select: { id: true, name: true, email: true, role: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });

  const initialLeads = leads.map((l) => {
    const assignment = l.assignments?.[0] ?? null;
    const assignedUser = assignment?.user ?? null;

    const record = l as unknown as Record<string, unknown>;
    const contactPhoneValue = record.contactPhone;
    const interestedServiceValue = record.interestedService;
    const notesValue = record.notes;
    const contactPhone = typeof contactPhoneValue === "string" ? contactPhoneValue : null;
    const interestedService =
      typeof interestedServiceValue === "string" && interestedServiceValue.trim()
        ? interestedServiceValue
        : deriveInterestedServiceFromNotes(notesValue);

    return {
      ...l,
      createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : (l.createdAt as unknown as string),
      contactPhone,
      interestedService,
      notes: typeof notesValue === "string" ? notesValue : null,
      appointments: (l.appointments ?? []).map((a) => ({
        ...a,
        startAt: a.startAt instanceof Date ? a.startAt.toISOString() : (a.startAt as unknown as string),
        endAt: a.endAt instanceof Date ? a.endAt.toISOString() : (a.endAt as unknown as string),
      })),
      assignments: assignment
        ? [
            {
              claimedAt:
                assignment.claimedAt instanceof Date
                  ? assignment.claimedAt.toISOString()
                  : (assignment.claimedAt as unknown as string),
              user: assignedUser ? { name: assignedUser.name, email: assignedUser.email } : null,
            },
          ]
        : [],
    };
  });

  return (
    <ManagerLeadsClient initialLeads={initialLeads} dialers={dialers} />
  );
}
