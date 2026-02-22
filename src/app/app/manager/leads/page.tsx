import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import ManagerLeadsClient, { type DialerRow, type LeadRow } from "./ManagerLeadsClient";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPublicColumn, hasPublicTable } from "@/lib/dbSchema";
import { deriveInterestedServiceFromNotes } from "@/lib/leadDerived";

export default async function ManagerLeadsPage() {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user) redirect("/employeelogin");

  const role = session.user.role;
  if (role !== "MANAGER" && role !== "ADMIN") redirect("/app");

  const [hasLead, hasUser, hasLeadAssignment, hasAppointment] = await Promise.all([
    hasPublicTable("Lead"),
    hasPublicTable("User"),
    hasPublicTable("LeadAssignment"),
    hasPublicTable("Appointment"),
  ]);

  const [hasContactPhone, hasInterestedService, hasNotes] = hasLead
    ? await Promise.all([
        hasPublicColumn("Lead", "contactPhone"),
        hasPublicColumn("Lead", "interestedService"),
        hasPublicColumn("Lead", "notes"),
      ])
    : [false, false, false];

  const leadSelect: Record<string, unknown> = {
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
    ...(hasLeadAssignment && hasUser
      ? {
          assignments: {
            where: { releasedAt: null },
            select: {
              claimedAt: true,
              user: { select: { name: true, email: true } },
            },
            orderBy: { claimedAt: "desc" },
            take: 1,
          },
        }
      : {}),
    ...(hasAppointment && hasUser
      ? {
          appointments: {
            where: {
              status: {
                in: ["SCHEDULED", "RESCHEDULED"] as Array<"SCHEDULED" | "RESCHEDULED">,
              },
            },
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
        }
      : {}),
  };

  // The select shape is dynamic (depends on which tables exist), so Prisma's
  // inferred types become a big union in `next build`. Normalize to a generic
  // record and access nested fields defensively.
  const leads: Array<Record<string, any>> = hasLead
    ? ((await prisma.lead
        .findMany({
          orderBy: { createdAt: "desc" },
          take: 200,
          select: leadSelect as any,
        })
        .catch(() => [])) as Array<Record<string, any>>)
    : [];

  const dialers: DialerRow[] = hasUser
    ? ((await prisma.user
        .findMany({
          where: { role: "DIALER" },
          select: { id: true, name: true, email: true, role: true },
          orderBy: [{ name: "asc" }, { email: "asc" }],
        })
        .catch(() => [])) as DialerRow[])
    : [];

  const initialLeads: LeadRow[] = leads.map((l): LeadRow => {
    const assignments = Array.isArray(l.assignments) ? l.assignments : [];
    const assignment = assignments[0] ?? null;
    const assignedUser = assignment?.user ?? null;

    const contactPhoneValue = l.contactPhone;
    const interestedServiceValue = l.interestedService;
    const notesValue = l.notes;
    const contactPhone = typeof contactPhoneValue === "string" ? contactPhoneValue : null;
    const interestedService =
      typeof interestedServiceValue === "string" && interestedServiceValue.trim()
        ? interestedServiceValue
        : deriveInterestedServiceFromNotes(notesValue);

    const appointments = Array.isArray(l.appointments) ? l.appointments : [];

    const createdAtValue = l.createdAt;
    const createdAt =
      createdAtValue instanceof Date
        ? createdAtValue.toISOString()
        : typeof createdAtValue === "string"
          ? createdAtValue
          : undefined;

    const id = typeof l.id === "string" ? l.id : "";
    const businessName = typeof l.businessName === "string" ? l.businessName : "";
    const phone = typeof l.phone === "string" ? l.phone : "";

    return {
      id,
      businessName,
      phone,
      contactName: typeof l.contactName === "string" ? l.contactName : (l.contactName ?? null),
      contactEmail: typeof l.contactEmail === "string" ? l.contactEmail : (l.contactEmail ?? null),
      contactPhone,
      interestedService,
      niche: typeof l.niche === "string" ? l.niche : (l.niche ?? null),
      location: typeof l.location === "string" ? l.location : (l.location ?? null),
      source: typeof l.source === "string" ? l.source : (l.source ?? null),
      status: typeof l.status === "string" ? l.status : (l.status ?? null),
      createdAt,
      notes: typeof notesValue === "string" ? notesValue : null,
      appointments: appointments.map((a) => ({
        id: typeof a.id === "string" ? a.id : "",
        startAt: a.startAt instanceof Date ? a.startAt.toISOString() : (a.startAt as unknown as string),
        endAt: a.endAt instanceof Date ? a.endAt.toISOString() : (a.endAt as unknown as string),
        status: typeof a.status === "string" ? a.status : String(a.status ?? ""),
        closer: a.closer ?? null,
      })),
      assignments: assignment
        ? [
            {
              claimedAt:
                assignment.claimedAt instanceof Date
                  ? assignment.claimedAt.toISOString()
                  : (assignment.claimedAt as unknown as string),
              user: assignedUser
                ? { name: assignedUser.name ?? null, email: assignedUser.email ?? null }
                : null,
            },
          ]
        : [],
    };
  });

  return (
    <ManagerLeadsClient initialLeads={initialLeads} dialers={dialers} />
  );
}
