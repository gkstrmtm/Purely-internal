import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function ManagerCallsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  if (role !== "MANAGER" && role !== "ADMIN") redirect("/app");

  const calls = await prisma.callLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 150,
    include: {
      lead: true,
      dialer: { select: { name: true, email: true } },
      transcriptDoc: { select: { id: true, title: true } },
      recording: true,
      bookedAppointment: { select: { id: true, startAt: true, status: true } },
    },
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">All call logs</h1>
        <p className="mt-2 text-sm text-zinc-600">Across all dialers. Includes transcript + recording flags.</p>

        <div className="mt-6 space-y-3">
          {calls.map((c) => (
            <div key={c.id} className="rounded-2xl border border-zinc-200 p-4">
              <div className="flex flex-col justify-between gap-2 sm:flex-row">
                <div>
                  <div className="text-sm font-semibold text-brand-ink">{c.lead.businessName}</div>
                  <div className="mt-1 text-xs text-zinc-600">{c.lead.phone}</div>
                  <div className="mt-1 text-xs text-zinc-600">
                    {new Date(c.createdAt).toLocaleString()} • {c.disposition}
                  </div>
                </div>
                <div className="text-xs text-zinc-600">
                  <div>Dialer: {c.dialer.name}</div>
                  <div className="mt-1">
                    {c.recording ? "Recording: yes" : "Recording: no"} • {c.transcriptDoc ? "Transcript: yes" : "Transcript: no"}
                  </div>
                  {c.bookedAppointment ? (
                    <div className="mt-1">
                      Booked meeting: {new Date(c.bookedAppointment.startAt).toLocaleString()} ({c.bookedAppointment.status})
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}

          {calls.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-600">
              No call logs found.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
