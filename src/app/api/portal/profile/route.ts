import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSession } from "@/lib/apiAuth";
import { verifyPassword } from "@/lib/password";
import { getOrCreateStripeCustomerId, isStripeConfigured, stripePost } from "@/lib/stripeFetch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().optional(),
    currentPassword: z.string().min(6),
  })
  .refine((v) => Boolean(v.name || v.email), {
    message: "Provide at least one field to update",
    path: ["name"],
  });

export async function GET() {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const userId = auth.session.user.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, updatedAt: true },
  });

  return NextResponse.json({ ok: true, user });
}

export async function PUT(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const userId = auth.session.user.id;

  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, passwordHash: true },
  });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ok = await verifyPassword(parsed.data.currentPassword, current.passwordHash);
  if (!ok) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });

  const nextEmail = parsed.data.email ? parsed.data.email.toLowerCase().trim() : undefined;
  if (nextEmail && nextEmail !== current.email.toLowerCase()) {
    const existing = await prisma.user.findUnique({ where: { email: nextEmail }, select: { id: true } });
    if (existing && existing.id !== current.id) {
      return NextResponse.json({ error: "That email is already in use" }, { status: 409 });
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(parsed.data.name ? { name: parsed.data.name.trim() } : {}),
      ...(nextEmail ? { email: nextEmail } : {}),
    },
    select: { id: true, name: true, email: true, role: true, updatedAt: true },
  });

  // Keep Stripe customer continuity by updating Stripe's customer email when possible.
  if (nextEmail && current.email && nextEmail !== current.email.toLowerCase().trim() && isStripeConfigured()) {
    try {
      const customerId = await getOrCreateStripeCustomerId(current.email);
      await stripePost(`/v1/customers/${customerId}`, { email: nextEmail });
    } catch {
      // Non-fatal; entitlements will still resolve by the new email once Stripe updates.
    }
  }

  return NextResponse.json({ ok: true, user: updated, note: "Sign out and back in to refresh your session." });
}
