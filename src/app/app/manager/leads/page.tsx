import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";

export default async function ManagerLeadsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  if (role !== "MANAGER" && role !== "ADMIN") redirect("/app");

  const [hasContactPhone, hasInterestedService] = await Promise.all([
    hasPublicColumn("Lead", "contactPhone"),
    hasPublicColumn("Lead", "interestedService"),
  ]);

  const leadSelect = {
    id: true,
    businessName: true,
    phone: true,
    contactName: true,
    contactEmail: true,
    ...(hasContactPhone ? { contactPhone: true } : {}),
    ...(hasInterestedService ? { interestedService: true } : {}),
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
  } as const;

  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: leadSelect,
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">All leads</h1>
        <p className="mt-2 text-sm text-zinc-600">Across the entire system, with current assignment.</p>

        <div className="mt-6 space-y-3">
          {leads.map((l) => {
            const assignment = l.assignments?.[0] ?? null;
            const assignedUser = assignment?.user ?? null;

            const record = l as unknown as Record<string, unknown>;
            const contactPhoneValue = record.contactPhone;
            const interestedServiceValue = record.interestedService;
            const contactPhone = typeof contactPhoneValue === "string" ? contactPhoneValue : null;
            const interestedService =
              typeof interestedServiceValue === "string" ? interestedServiceValue : null;

            return (
              <div key={l.id} className="rounded-2xl border border-zinc-200 p-4">
                <div className="flex flex-col justify-between gap-2 sm:flex-row">
                  <div>
                    <div className="text-sm font-semibold text-brand-ink">{l.businessName}</div>
                    <div className="mt-1 text-xs text-zinc-600">{l.phone}</div>
                    {[l.contactName, l.contactEmail, contactPhone].some(Boolean) ? (
                      <div className="mt-1 text-xs text-zinc-600">
                        Contact: {[l.contactName, l.contactEmail, contactPhone]
                          .filter(Boolean)
                          .join(" • ")}
                      </div>
                    ) : null}
                    {interestedService ? (
                      <div className="mt-1 text-xs text-zinc-600">Interested in: {interestedService}</div>
                    ) : null}
                    {l.source ? (
                      <div className="mt-1 text-xs text-zinc-600">Source: {l.source}</div>
                    ) : null}
                    <div className="mt-1 text-xs text-zinc-600">
                      {(l.niche ?? "") + (l.niche && l.location ? " • " : "") + (l.location ?? "")}
                    </div>
                  </div>
                  <div className="text-xs text-zinc-600">
                    <div>Status: {l.status}</div>
                    <div className="mt-1">
                      {assignedUser
                        ? `Assigned: ${assignedUser.name} (${assignedUser.email})`
                        : "Assigned: (unassigned)"}
                    </div>
                    {assignment?.claimedAt ? (
                      <div className="mt-1">Claimed: {new Date(assignment.claimedAt).toLocaleString()}</div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}

          {leads.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-600">
              No leads found.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
