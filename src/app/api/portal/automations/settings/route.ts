import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSession } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SERVICE_SLUG = "automations";

const triggerConfigSchema = z
  .object({
    kind: z.literal("trigger"),
    triggerKind: z.enum(["inbound_sms", "inbound_mms", "inbound_call", "new_lead"]),
  })
  .passthrough();

const actionConfigSchema = z
  .object({
    kind: z.literal("action"),
    actionKind: z.enum(["send_sms", "send_email", "add_tag", "create_task"]),
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
    op: z.enum(["equals", "contains", "starts_with", "ends_with", "is_empty", "is_not_empty"]),
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
  to: z.string().min(1).max(60),
});

const automationSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().min(1).max(80),
  updatedAtIso: z.string().optional(),
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
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const automations = parseAutomations(row?.dataJson ?? null);
  return NextResponse.json({ ok: true, automations });
}

const putSchema = z.object({
  automations: z.array(automationSchema).max(50),
});

export async function PUT(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = putSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const next = parsed.data.automations.map((a) => ({
    ...a,
    updatedAtIso: typeof a.updatedAtIso === "string" && a.updatedAtIso.trim() ? a.updatedAtIso : new Date().toISOString(),
  }));

  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: {
      ownerId,
      serviceSlug: SERVICE_SLUG,
      status: "COMPLETE",
      dataJson: { version: 1, automations: next } as any,
    },
    update: {
      status: "COMPLETE",
      dataJson: { version: 1, automations: next } as any,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, automations: next });
}
