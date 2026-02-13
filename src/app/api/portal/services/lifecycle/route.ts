import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import {
  getOrCreateStripeCustomerId,
  isStripeConfigured,
  stripeDelete,
  stripeGet,
} from "@/lib/stripeFetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z
  .object({
    serviceSlug: z.string().trim().min(1),
    action: z.enum(["pause", "cancel", "resume"]),
  })
  .strict();

function readObj(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as any;
}

function subMatchesService(sub: any, serviceSlug: string) {
  const moduleMeta = String(sub?.metadata?.module ?? "").trim();
  const planIdsRaw = String(sub?.metadata?.planIds ?? "").trim();
  const planIds = new Set(planIdsRaw.split(",").map((x: string) => x.trim()).filter(Boolean));

  if (serviceSlug === "blogs") return moduleMeta === "blog" || planIds.has("blogs");
  if (serviceSlug === "booking") return moduleMeta === "booking" || planIds.has("booking");
  if (serviceSlug === "automations") return moduleMeta === "automations" || planIds.has("automations");
  if (serviceSlug === "reviews") return moduleMeta === "reviews" || planIds.has("reviews");
  if (serviceSlug === "newsletter") return moduleMeta === "newsletter" || planIds.has("newsletter");
  if (serviceSlug === "nurture-campaigns") return moduleMeta === "nurture" || planIds.has("nurture");
  if (serviceSlug === "ai-receptionist") return moduleMeta === "aiReceptionist" || planIds.has("ai-receptionist");
  if (serviceSlug === "ai-outbound-calls") return moduleMeta === "leadOutbound" || planIds.has("ai-outbound");

  if (serviceSlug === "follow-up" || serviceSlug === "lead-scraping") return moduleMeta === "crm";
  return false;
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("billing", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const serviceSlug = parsed.data.serviceSlug;
  const known = PORTAL_SERVICES.some((s) => s.slug === serviceSlug);
  if (!known) return NextResponse.json({ ok: false, error: "Unknown service" }, { status: 400 });

  const ownerId = auth.session.user.id;
  const now = new Date();

  const targetState = parsed.data.action === "resume" ? "active" : parsed.data.action;
  const slugsToUpdate =
    serviceSlug === "follow-up" || serviceSlug === "lead-scraping" ? ["follow-up", "lead-scraping"] : [serviceSlug];

  await prisma.$transaction(async (tx) => {
    for (const slug of slugsToUpdate) {
      const existing = await tx.portalServiceSetup.findUnique({
        where: { ownerId_serviceSlug: { ownerId, serviceSlug: slug } },
        select: { dataJson: true, status: true },
      });

      const prevJson = readObj(existing?.dataJson) ?? {};
      const prevLifecycle = readObj(prevJson.lifecycle) ?? {};

      const nextJson = {
        ...prevJson,
        lifecycle: {
          ...prevLifecycle,
          state: targetState,
          updatedAtIso: now.toISOString(),
        },
      };

      await tx.portalServiceSetup.upsert({
        where: { ownerId_serviceSlug: { ownerId, serviceSlug: slug } },
        create: { ownerId, serviceSlug: slug, status: existing?.status ?? "COMPLETE", dataJson: nextJson },
        update: { dataJson: nextJson },
        select: { id: true },
      });
    }
  });

  const canceledSubscriptionIds: string[] = [];

  // For paid modules, pause/cancel should stop Stripe charges immediately.
  if (parsed.data.action !== "resume" && isStripeConfigured()) {
    const email = auth.session.user.email;

    if (email) {
      try {
        const customer = await getOrCreateStripeCustomerId(String(email));
        const subs = await stripeGet<{ data: any[] }>("/v1/subscriptions", {
          customer,
          status: "all",
          limit: 50,
          "expand[]": ["data.items.data.price"],
        });

        const active = (subs.data ?? []).filter((s) =>
          ["active", "trialing", "past_due"].includes(String(s?.status || "")),
        );

        for (const sub of active) {
          if (!subMatchesService(sub, serviceSlug)) continue;
          const subId = String(sub?.id || "").trim();
          if (!subId) continue;
          await stripeDelete(`/v1/subscriptions/${subId}`);
          canceledSubscriptionIds.push(subId);
        }
      } catch {
        // Best-effort; lifecycle state still updates.
      }
    }
  }

  return NextResponse.json({ ok: true, serviceSlug, updatedSlugs: slugsToUpdate, state: targetState, canceledSubscriptionIds });
}
