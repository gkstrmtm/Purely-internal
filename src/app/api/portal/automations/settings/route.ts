import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SERVICE_SLUG = "automations";

function newToken() {
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.replace(/[^a-z0-9]/gi, "").slice(0, 32);
}

const triggerConfigSchema = z
  .object({
    kind: z.literal("trigger"),
    triggerKind: z.enum([
      "manual",
      "inbound_sms",
      "inbound_mms",
      "inbound_call",
      "inbound_email",
      "new_lead",
      "lead_scraped",
      "tag_added",
      "contact_created",
      "task_added",
      "inbound_webhook",
      "scheduled_time",
      "missed_appointment",
      "appointment_booked",
      "missed_call",
      "review_received",
      "follow_up_sent",
      "outbound_sent",
    ]),
  })
  .passthrough();

const actionConfigSchema = z
  .object({
    kind: z.literal("action"),
    actionKind: z.enum([
      "send_sms",
      "send_email",
      "add_tag",
      "create_task",
      "assign_lead",
      "find_contact",
      "send_webhook",
      "send_review_request",
      "send_booking_link",
      "update_contact",
      "trigger_service",
    ]),
  })
  .passthrough();

const delayConfigSchema = z
  .object({
    kind: z.literal("delay"),
    minutes: z.number().int().min(0).max(43200),
  })
  .passthrough();

const conditionConfigSchema = z
  .object({
    kind: z.literal("condition"),
    left: z.string().max(60),
    op: z.enum([
      "equals",
      "contains",
      "starts_with",
      "ends_with",
      "is_empty",
      "is_not_empty",
      "gt",
      "gte",
      "lt",
      "lte",
      "before",
      "after",
    ]),
    right: z.string().max(120),
  })
  .passthrough();

const noteConfigSchema = z
  .object({
    kind: z.literal("note"),
    text: z.string().max(500),
  })
  .passthrough();

const nodeConfigSchema = z.union([
  triggerConfigSchema,
  actionConfigSchema,
  delayConfigSchema,
  conditionConfigSchema,
  noteConfigSchema,
]);

const nodeSchema = z.object({
  id: z.string().min(1).max(60),
  type: z.enum(["trigger", "action", "delay", "condition", "note"]),
  label: z.string().max(80),
  x: z.number().finite(),
  y: z.number().finite(),
  config: nodeConfigSchema.optional(),
});

const edgeSchema = z.object({
  id: z.string().min(1).max(80),
  from: z.string().min(1).max(60),
  fromPort: z.enum(["out", "true", "false"]).optional(),
  to: z.string().min(1).max(60),
});

const automationSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().min(1).max(80),
  updatedAtIso: z.string().optional(),
  createdBy: z
    .object({
      userId: z.string().min(1).max(80),
      email: z.string().max(200).optional(),
      name: z.string().max(200).optional(),
    })
    .optional(),
  nodes: z.array(nodeSchema).max(250),
  edges: z.array(edgeSchema).max(500),
});

function parseAutomations(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [] as any[];
  const rec = raw as Record<string, unknown>;
  const list = Array.isArray(rec.automations) ? rec.automations : [];

  const out: any[] = [];
  for (const a of list) {
    const parsed = automationSchema.safeParse(a);
    if (!parsed.success) continue;
    out.push(parsed.data);
    if (out.length >= 50) break;
  }

  return out;
}

export async function GET() {
  const auth = await requireClientSessionForService("automations");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const viewer = {
    userId: String(auth.session.user.id),
    email: String(auth.session.user.email || ""),
    name: String(auth.session.user.name || ""),
  };

  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const dataJson = (row?.dataJson ?? null) as any;
  const webhookTokenRaw = typeof dataJson?.webhookToken === "string" ? dataJson.webhookToken.trim() : "";
  const webhookToken = webhookTokenRaw.length >= 12 ? webhookTokenRaw : newToken();

  // Ensure the token exists for this owner (best-effort).
  if (webhookTokenRaw !== webhookToken) {
    const nextData = {
      ...(dataJson && typeof dataJson === "object" && !Array.isArray(dataJson) ? dataJson : {}),
      version: 1,
      webhookToken,
      automations: parseAutomations(dataJson ?? null),
    };
    await prisma.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
      create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: nextData as any },
      update: { status: "COMPLETE", dataJson: nextData as any },
      select: { id: true },
    });
  }

  const automations = parseAutomations(dataJson ?? null);
  return NextResponse.json({ ok: true, webhookToken, viewer, automations });
}

const putSchema = z.object({
  automations: z.array(automationSchema).max(50),
});

export async function PUT(req: Request) {
  const auth = await requireClientSessionForService("automations");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const viewer = {
    userId: String(auth.session.user.id),
    email: String(auth.session.user.email || ""),
    name: String(auth.session.user.name || ""),
  };
  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = putSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const existing = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });
  const existingDataJson = (existing?.dataJson ?? null) as any;

  const existingAutomations = parseAutomations(existingDataJson ?? null);
  const existingById = new Map(existingAutomations.map((a) => [a.id, a] as const));

  const next = parsed.data.automations.map((a) => {
    const prev = existingById.get(a.id) as any | undefined;
    const createdBy = a.createdBy || prev?.createdBy || viewer;
    return {
      ...a,
      createdBy,
      updatedAtIso: typeof a.updatedAtIso === "string" && a.updatedAtIso.trim() ? a.updatedAtIso : new Date().toISOString(),
    };
  });

  const existingTokenRaw = typeof existingDataJson?.webhookToken === "string" ? String(existingDataJson.webhookToken).trim() : "";
  const webhookToken = existingTokenRaw.length >= 12 ? existingTokenRaw : newToken();

  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: {
      ownerId,
      serviceSlug: SERVICE_SLUG,
      status: "COMPLETE",
      dataJson: { version: 1, webhookToken, automations: next } as any,
    },
    update: {
      status: "COMPLETE",
      dataJson: { version: 1, webhookToken, automations: next } as any,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, webhookToken, automations: next });
}
