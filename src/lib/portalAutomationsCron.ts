import { prisma } from "@/lib/db";
import { runOwnerAutomationByIdForEvent, runOwnerAutomationsForEvent } from "@/lib/portalAutomationsRunner";

const SERVICE_SLUG = "automations";

function nowIso() {
  return new Date().toISOString();
}

function parseIntervalMinutes(raw: unknown) {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : typeof raw === "string" ? Math.round(Number(raw)) : NaN;
  if (!Number.isFinite(n) || n <= 0) return 60;
  return Math.max(5, Math.min(43200, n));
}

function safeObj(raw: unknown): Record<string, any> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as any) : {};
}

export async function processDueScheduledAutomations(opts: {
  ownersLimit: number;
  perOwnerMaxRuns: number;
}) {
  const startedAt = Date.now();

  const rows = await prisma.portalServiceSetup.findMany({
    where: { serviceSlug: SERVICE_SLUG },
    select: { ownerId: true, dataJson: true },
    take: Math.max(1, Math.min(10_000, Math.round(opts.ownersLimit || 1000))),
  });

  let ownersChecked = 0;
  let triggersFired = 0;

  for (const row of rows) {
    ownersChecked += 1;

    const data = safeObj(row.dataJson);
    const automations = Array.isArray(data.automations) ? (data.automations as any[]) : [];

    const scheduleState = safeObj(data.scheduleState);
    const nextScheduleState: Record<string, string> = { ...scheduleState };

    let firedThisOwner = 0;
    for (const a of automations) {
      if (!a || typeof a !== "object") continue;
      const automationId = String((a as any).id || "").trim();
      if (!automationId) continue;

      const nodes = Array.isArray((a as any).nodes) ? ((a as any).nodes as any[]) : [];
      for (const n of nodes) {
        if (!n || typeof n !== "object") continue;
        if (String((n as any).type || "") !== "trigger") continue;
        const nodeId = String((n as any).id || "").trim();
        if (!nodeId) continue;

        const cfg = safeObj((n as any).config);
        if (cfg.kind !== "trigger") continue;
        if (cfg.triggerKind !== "scheduled_time") continue;

        const intervalMinutes = parseIntervalMinutes(cfg.intervalMinutes);
        const key = `${automationId}:${nodeId}`;
        const lastIso = typeof scheduleState[key] === "string" ? String(scheduleState[key]) : "";
        const lastAt = lastIso ? new Date(lastIso).getTime() : 0;
        const now = Date.now();

        const dueMs = intervalMinutes * 60_000;
        const isDue = !lastAt || !Number.isFinite(lastAt) ? true : now - lastAt >= dueMs;
        if (!isDue) continue;

        // Fire the automation only from this trigger node.
        await runOwnerAutomationByIdForEvent({
          ownerId: row.ownerId,
          automationId,
          triggerKind: "scheduled_time",
          event: { triggerNodeId: nodeId },
        }).catch(() => null);

        nextScheduleState[key] = nowIso();
        triggersFired += 1;
        firedThisOwner += 1;

        if (firedThisOwner >= Math.max(1, Math.min(100, opts.perOwnerMaxRuns || 10))) break;
      }
      if (firedThisOwner >= Math.max(1, Math.min(100, opts.perOwnerMaxRuns || 10))) break;
    }

    if (firedThisOwner > 0) {
      const nextData = { ...data, version: 1, scheduleState: nextScheduleState };
      await prisma.portalServiceSetup.update({
        where: { ownerId_serviceSlug: { ownerId: row.ownerId, serviceSlug: SERVICE_SLUG } },
        data: { dataJson: nextData as any },
        select: { id: true },
      });
    }
  }

  return {
    ok: true,
    ownersChecked,
    triggersFired,
    ms: Date.now() - startedAt,
  };
}

export async function processDueMissedAppointments(opts: {
  lookbackHours: number;
  graceMinutes: number;
  limit: number;
}) {
  const startedAt = Date.now();

  const graceMinutes = Math.max(5, Math.min(24 * 60, Math.round(opts.graceMinutes || 15)));
  const lookbackHours = Math.max(1, Math.min(24 * 14, Math.round(opts.lookbackHours || 48)));
  const cutoff = new Date(Date.now() - graceMinutes * 60_000);
  const lookbackStart = new Date(Date.now() - lookbackHours * 60 * 60_000);

  const bookings = await prisma.portalBooking.findMany({
    where: {
      status: "SCHEDULED",
      endAt: { lt: cutoff, gte: lookbackStart },
    },
    select: {
      id: true,
      endAt: true,
      contactId: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      site: { select: { ownerId: true } },
    },
    orderBy: { endAt: "desc" },
    take: Math.max(1, Math.min(2000, Math.round(opts.limit || 200))),
  });

  // Group by owner for state updates.
  const byOwner = new Map<string, Array<{ bookingId: string; payload: any }>>();

  for (const b of bookings) {
    const ownerId = b.site?.ownerId;
    if (!ownerId) continue;

    const list = byOwner.get(ownerId) || [];
    list.push({
      bookingId: b.id,
      payload: {
        ownerId,
        triggerKind: "missed_appointment" as const,
        contact: {
          id: b.contactId ?? null,
          name: b.contactName ?? null,
          email: b.contactEmail ?? null,
          phone: b.contactPhone ?? null,
        },
        message: {
          from: b.contactEmail || b.contactPhone || "",
          to: "",
          body: `Missed appointment: ${b.contactName || "(unknown)"} (${b.contactEmail || b.contactPhone || ""})`,
        },
        event: { webhookKey: undefined },
      },
    });
    byOwner.set(ownerId, list);
  }

  let ownersTouched = 0;
  let missedFired = 0;

  for (const [ownerId, items] of byOwner.entries()) {
    const row = await prisma.portalServiceSetup.findUnique({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
      select: { dataJson: true },
    });
    const data = safeObj(row?.dataJson);
    const fired = Array.isArray(data.missedAppointmentFiredIds)
      ? (data.missedAppointmentFiredIds as any[]).flatMap((x) => (typeof x === "string" && x ? [x] : []))
      : [];
    const firedSet = new Set(fired);

    let changed = false;

    for (const it of items) {
      if (firedSet.has(it.bookingId)) continue;

      await runOwnerAutomationsForEvent({
        ownerId,
        triggerKind: "missed_appointment",
        contact: it.payload.contact,
        message: it.payload.message,
      }).catch(() => null);

      firedSet.add(it.bookingId);
      missedFired += 1;
      changed = true;

      if (missedFired >= 500) break;
    }

    if (changed) {
      ownersTouched += 1;
      const nextIds = Array.from(firedSet).slice(-5000);
      const nextData = { ...data, version: 1, missedAppointmentFiredIds: nextIds };
      await prisma.portalServiceSetup.upsert({
        where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
        create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: nextData as any },
        update: { status: "COMPLETE", dataJson: nextData as any },
        select: { id: true },
      });
    }
  }

  return { ok: true, ownersTouched, missedFired, scanned: bookings.length, ms: Date.now() - startedAt };
}
