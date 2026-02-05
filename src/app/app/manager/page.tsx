import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import PortalDemoSeeder from "./PortalDemoSeeder";

function fmtMoney(cents: number) {
  const dollars = (cents ?? 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(dollars);
}

function pct(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function ManagerHome() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  if (role !== "MANAGER" && role !== "ADMIN") {
    redirect("/app");
  }

  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);
  const monthAgo = new Date(now);
  monthAgo.setDate(now.getDate() - 30);

  const [
    totalLeads,
    totalCalls,
    bookedCalls,
    upcomingAppointments,
    closedCount30d,
    revenue30d,
    projectedMrr,
    recentCalls,
    recentLeads,
    nextAppointments,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.callLog.count(),
    prisma.callLog.count({ where: { disposition: "BOOKED" } }),
    prisma.appointment.count({
      where: { startAt: { gte: now }, status: "SCHEDULED" },
    }),
    prisma.appointmentOutcome.count({
      where: { outcome: "CLOSED", createdAt: { gte: monthAgo } },
    }),
    prisma.appointmentOutcome.aggregate({
      where: { createdAt: { gte: monthAgo } },
      _sum: { revenueCents: true },
    }),
    prisma.contractDraft.aggregate({
      where: {
        OR: [{ status: "APPROVED" }, { status: "SENT" }],
        appointmentOutcome: { outcome: "CLOSED" },
      },
      _sum: { monthlyFeeCents: true },
    }),
    prisma.callLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        createdAt: true,
        disposition: true,
        lead: { select: { businessName: true } },
        dialer: { select: { name: true, email: true } },
      },
    }),
    prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        businessName: true,
        niche: true,
        location: true,
        status: true,
        assignments: {
          where: { releasedAt: null },
          select: {
            claimedAt: true,
            user: { select: { name: true, email: true } },
          },
          orderBy: { claimedAt: "desc" },
          take: 1,
        },
      },
    }),
    prisma.appointment.findMany({
      where: { startAt: { gte: now } },
      orderBy: { startAt: "asc" },
      take: 8,
      select: {
        id: true,
        startAt: true,
        status: true,
        lead: { select: { businessName: true } },
        setter: { select: { name: true, email: true } },
        closer: { select: { name: true, email: true } },
        outcome: { select: { outcome: true } },
      },
    }),
  ]);

  const bookingRate = totalCalls > 0 ? bookedCalls / totalCalls : 0;
  const revenueCents30d = revenue30d._sum.revenueCents ?? 0;
  const projectedMrrCents = projectedMrr._sum.monthlyFeeCents ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-brand-ink">
              Manager dashboard
            </h1>
            <p className="mt-2 text-base text-zinc-600">
              KPIs, revenue, and quick access to Dialer/Closer views.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-base font-semibold text-white hover:opacity-95"
              href="/app/manager/appointments"
            >
              View appointments
            </Link>

            <Link
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-base font-semibold text-brand-ink hover:bg-zinc-50"
              href="/app/manager/blogs"
            >
              Blog automation
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-base font-semibold text-brand-ink hover:bg-zinc-50"
              href="/app/dialer"
            >
              Dialer view
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-base font-semibold text-brand-ink hover:bg-zinc-50"
              href="/app/closer"
            >
              Closer view
            </Link>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border border-zinc-200 bg-brand-mist p-6">
            <div className="text-sm font-semibold text-zinc-600">Leads</div>
            <div className="mt-2 text-3xl font-semibold text-brand-ink">{totalLeads}</div>
            <div className="mt-1 text-sm text-zinc-500">Total in system</div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-brand-mist p-6">
            <div className="text-sm font-semibold text-zinc-600">Calls</div>
            <div className="mt-2 text-3xl font-semibold text-brand-ink">{totalCalls}</div>
            <div className="mt-1 text-sm text-zinc-500">
              Booking rate: {pct(bookingRate)} ({bookedCalls} booked)
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-brand-mist p-6">
            <div className="text-sm font-semibold text-zinc-600">Upcoming meetings</div>
            <div className="mt-2 text-3xl font-semibold text-brand-ink">
              {upcomingAppointments}
            </div>
            <div className="mt-1 text-sm text-zinc-500">Scheduled from now</div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-brand-mist p-6">
            <div className="text-sm font-semibold text-zinc-600">Revenue</div>
            <div className="mt-2 text-3xl font-semibold text-brand-ink">
              {fmtMoney(revenueCents30d)}
            </div>
            <div className="mt-1 text-sm text-zinc-500">
              30d revenue • {closedCount30d} closes • Projected MRR: {fmtMoney(projectedMrrCents)}
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-base font-semibold text-brand-ink">Notes</div>
          <div className="mt-2 text-sm text-zinc-600">
            Revenue is currently sourced from appointment outcomes (optional) and projected MRR from approved/sent contract drafts.
          </div>
          <div className="mt-2 text-sm text-zinc-600">
            Last updated: {now.toLocaleString()} (week range starts {weekAgo.toLocaleDateString()})
          </div>
        </div>

        <PortalDemoSeeder />

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold text-brand-ink">Recent calls</div>
              <Link className="text-sm font-semibold text-[color:var(--color-brand-blue)]" href="/app/manager/calls">
                View all
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {recentCalls.map((c) => (
                <div key={c.id} className="rounded-2xl border border-zinc-200 p-3">
                  <div className="text-sm font-semibold text-brand-ink">{c.lead.businessName}</div>
                  <div className="mt-1 text-xs text-zinc-600">
                    {c.disposition} • {c.dialer.name} • {new Date(c.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
              {recentCalls.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 p-4 text-sm text-zinc-600">
                  No calls yet.
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold text-brand-ink">Recent leads</div>
              <Link className="text-sm font-semibold text-[color:var(--color-brand-blue)]" href="/app/manager/leads">
                View all
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {recentLeads.map((l) => {
                const assigned = l.assignments?.[0]?.user;
                return (
                  <div key={l.id} className="rounded-2xl border border-zinc-200 p-3">
                    <div className="text-sm font-semibold text-brand-ink">{l.businessName}</div>
                    <div className="mt-1 text-xs text-zinc-600">
                      {l.niche ?? ""}{l.niche && l.location ? " • " : ""}{l.location ?? ""}
                    </div>
                    <div className="mt-1 text-xs text-zinc-600">
                      {l.status}{assigned ? ` • Assigned: ${assigned.name}` : ""}
                    </div>
                  </div>
                );
              })}
              {recentLeads.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 p-4 text-sm text-zinc-600">
                  No leads yet.
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold text-brand-ink">Next meetings</div>
              <Link className="text-sm font-semibold text-[color:var(--color-brand-blue)]" href="/app/manager/appointments">
                View all
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {nextAppointments.map((a) => (
                <div key={a.id} className="rounded-2xl border border-zinc-200 p-3">
                  <div className="text-sm font-semibold text-brand-ink">{a.lead.businessName}</div>
                  <div className="mt-1 text-xs text-zinc-600">
                    {new Date(a.startAt).toLocaleString()} • Setter: {a.setter.name} • Closer: {a.closer.name}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">
                    {a.status}{a.outcome?.outcome ? ` • Outcome: ${a.outcome.outcome}` : ""}
                  </div>
                </div>
              ))}
              {nextAppointments.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 p-4 text-sm text-zinc-600">
                  No upcoming meetings.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
