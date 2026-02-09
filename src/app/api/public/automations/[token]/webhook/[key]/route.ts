import { NextResponse } from "next/server";
import { z } from "zod";

import { findOwnerByPortalAutomationsWebhookToken } from "@/lib/portalAutomations";
import { runOwnerAutomationsForEvent } from "@/lib/portalAutomationsRunner";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const bodySchema = z
  .object({
    message: z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        body: z.string().optional(),
      })
      .optional(),
    contact: z
      .object({
        id: z.string().optional().nullable(),
        name: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
      })
      .optional(),
  })
  .passthrough();

export async function POST(req: Request, ctx: { params: Promise<{ token: string; key: string }> }) {
  const params = await ctx.params;
  const ownerId = await findOwnerByPortalAutomationsWebhookToken(params.token);
  if (!ownerId) return NextResponse.json({ ok: true });

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(body ?? {});

  await runOwnerAutomationsForEvent({
    ownerId,
    triggerKind: "inbound_webhook",
    event: { webhookKey: String(params.key || "").trim().slice(0, 80) || undefined },
    message: parsed.success ? (parsed.data.message as any) : undefined,
    contact: parsed.success ? (parsed.data.contact as any) : undefined,
  }).catch(() => null);

  return NextResponse.json({ ok: true });
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string; key: string }> }) {
  const params = await ctx.params;
  const ownerId = await findOwnerByPortalAutomationsWebhookToken(params.token);
  if (!ownerId) return NextResponse.json({ ok: true });

  await runOwnerAutomationsForEvent({
    ownerId,
    triggerKind: "inbound_webhook",
    event: { webhookKey: String(params.key || "").trim().slice(0, 80) || undefined },
  }).catch(() => null);

  return NextResponse.json({ ok: true });
}
