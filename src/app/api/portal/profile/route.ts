import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { verifyPassword } from "@/lib/password";
import { getOrCreateStripeCustomerId, isStripeConfigured, stripePost } from "@/lib/stripeFetch";
import { normalizePhoneStrict } from "@/lib/phone";
import { resolveElevenLabsConvaiToolIdsByKeys } from "@/lib/elevenLabsConvai";
import { VOICE_TOOL_DEFS } from "@/lib/voiceAgentTools";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

async function getProfileVoiceAgentApiKey(ownerId: string): Promise<string | null> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const rec =
    row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
      ? (row.dataJson as Record<string, unknown>)
      : null;

  const raw = rec?.voiceAgentApiKey;
  const key = typeof raw === "string" ? raw.trim().slice(0, 400) : "";
  return key ? key : null;
}

async function setProfileVoiceAgentApiKey(ownerId: string, voiceAgentApiKey: string | null): Promise<boolean> {
  const existing = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const base =
    existing?.dataJson && typeof existing.dataJson === "object" && !Array.isArray(existing.dataJson)
      ? (existing.dataJson as Record<string, unknown>)
      : {};

  const next: any = { ...base, version: 1 };
  const k = typeof voiceAgentApiKey === "string" ? voiceAgentApiKey.trim().slice(0, 400) : "";
  if (k) {
    next.voiceAgentApiKey = k;

    // Best-effort: resolve tool IDs from the API key so features like call transfer work automatically.
    // This keeps the portal setup simple: users paste API key + agent ID, and we do the rest.
    try {
      const resolved = await resolveElevenLabsConvaiToolIdsByKeys({ apiKey: k, toolKeys: VOICE_TOOL_DEFS.map((d) => d.key) });
      if (resolved.ok) {
        next.voiceAgentToolIds = resolved.toolIds;
        next.voiceAgentToolIdsUpdatedAtIso = new Date().toISOString();
      }
    } catch {
      // ignore
    }
  } else {
    delete next.voiceAgentApiKey;
    delete next.voiceAgentToolIds;
    delete next.voiceAgentToolIdsUpdatedAtIso;
  }

  const row = await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG } },
    create: {
      ownerId,
      serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG,
      status: "COMPLETE",
      dataJson: next,
    },
    update: {
      status: "COMPLETE",
      dataJson: next,
    },
    select: { dataJson: true },
  });

  const rec =
    row.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
      ? (row.dataJson as Record<string, unknown>)
      : null;

  const raw = rec?.voiceAgentApiKey;
  const out = typeof raw === "string" ? raw.trim().slice(0, 400) : "";
  return Boolean(out);
}

async function getProfilePhone(ownerId: string): Promise<string | null> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const rec = row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
    ? (row.dataJson as Record<string, unknown>)
    : null;

  const raw = rec?.phone;
  if (typeof raw !== "string") return null;

  const parsed = normalizePhoneStrict(raw);
  return parsed.ok ? parsed.e164 : null;
}

async function getProfileVoiceAgentId(ownerId: string): Promise<string | null> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const rec =
    row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
      ? (row.dataJson as Record<string, unknown>)
      : null;

  const raw = rec?.voiceAgentId;
  const id = typeof raw === "string" ? raw.trim().slice(0, 120) : "";
  return id ? id : null;
}

async function setProfileVoiceAgentId(ownerId: string, voiceAgentId: string | null): Promise<string | null> {
  const existing = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const base =
    existing?.dataJson && typeof existing.dataJson === "object" && !Array.isArray(existing.dataJson)
      ? (existing.dataJson as Record<string, unknown>)
      : {};

  const next: any = { ...base, version: 1 };
  const id = typeof voiceAgentId === "string" ? voiceAgentId.trim().slice(0, 120) : "";
  if (id) next.voiceAgentId = id;
  else delete next.voiceAgentId;

  const row = await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG } },
    create: {
      ownerId,
      serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG,
      status: "COMPLETE",
      dataJson: next,
    },
    update: {
      status: "COMPLETE",
      dataJson: next,
    },
    select: { dataJson: true },
  });

  const rec = row.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
    ? (row.dataJson as Record<string, unknown>)
    : null;

  const raw = rec?.voiceAgentId;
  const out = typeof raw === "string" ? raw.trim().slice(0, 120) : "";
  return out ? out : null;
}

async function setProfilePhone(ownerId: string, phone: string | null): Promise<string | null> {
  const existing = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const base =
    existing?.dataJson && typeof existing.dataJson === "object" && !Array.isArray(existing.dataJson)
      ? (existing.dataJson as Record<string, unknown>)
      : {};

  const next: any = { ...base, version: 1 };
  if (phone) next.phone = phone;
  else delete next.phone;

  const row = await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG } },
    create: {
      ownerId,
      serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG,
      status: "COMPLETE",
      dataJson: next,
    },
    update: {
      status: "COMPLETE",
      dataJson: next,
    },
    select: { dataJson: true },
  });

  const rec = row.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
    ? (row.dataJson as Record<string, unknown>)
    : null;

  const raw = rec?.phone;
  if (typeof raw !== "string") return null;

  const parsed = normalizePhoneStrict(raw);
  return parsed.ok ? parsed.e164 : null;
}

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().optional(),
    phone: z.string().trim().max(32).optional(),
    voiceAgentId: z.string().trim().max(120).optional(),
    voiceAgentApiKey: z.string().trim().max(400).optional(),
    currentPassword: z.string().min(6).optional(),
  })
  .refine((v) => Boolean(v.name || v.email || v.phone || v.voiceAgentId !== undefined || v.voiceAgentApiKey !== undefined), {
    message: "Provide at least one field to update",
    path: ["name"],
  })
  .refine((v) => Boolean(v.currentPassword) || (!v.name && !v.email), {
    message: "Current password is required to update name or email",
    path: ["currentPassword"],
  });

export async function GET() {
  const auth = await requireClientSessionForService("profile");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const userId = ((auth as any).access?.memberId as string | undefined) || auth.session.user.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, updatedAt: true },
  });

  const [phone, voiceAgentId, voiceAgentApiKey] = await Promise.all([
    getProfilePhone(userId),
    getProfileVoiceAgentId(userId),
    getProfileVoiceAgentApiKey(userId),
  ]);

  return NextResponse.json({
    ok: true,
    user: user
      ? {
          ...user,
          phone,
          voiceAgentId,
          voiceAgentApiKeyConfigured: Boolean(voiceAgentApiKey && voiceAgentApiKey.trim()),
        }
      : null,
  });
}

export async function PUT(req: Request) {
  const auth = await requireClientSessionForService("profile");
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

  const userId = ((auth as any).access?.memberId as string | undefined) || auth.session.user.id;

  const phoneProvided = parsed.data.phone !== undefined;
  let nextPhone: string | null = null;
  const voiceAgentProvided = parsed.data.voiceAgentId !== undefined;
  const nextVoiceAgentId =
    typeof parsed.data.voiceAgentId === "string" ? parsed.data.voiceAgentId.trim().slice(0, 120) : null;
  const voiceAgentApiKeyProvided = parsed.data.voiceAgentApiKey !== undefined;
  const nextVoiceAgentApiKey =
    typeof parsed.data.voiceAgentApiKey === "string" ? parsed.data.voiceAgentApiKey.trim().slice(0, 400) : null;
  if (phoneProvided) {
    const parsedPhone = normalizePhoneStrict(parsed.data.phone ?? "");
    if (!parsedPhone.ok) {
      return NextResponse.json({ error: parsedPhone.error }, { status: 400 });
    }
    nextPhone = parsedPhone.e164;
  }

  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, updatedAt: true, passwordHash: true },
  });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const wantsToUpdateNameOrEmail = Boolean(parsed.data.name || parsed.data.email);
  if (wantsToUpdateNameOrEmail) {
    const ok = await verifyPassword(parsed.data.currentPassword ?? "", current.passwordHash);
    if (!ok) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const nextEmail = parsed.data.email ? parsed.data.email.toLowerCase().trim() : undefined;
  if (nextEmail && nextEmail !== current.email.toLowerCase()) {
    const existing = await prisma.user.findUnique({ where: { email: nextEmail }, select: { id: true } });
    if (existing && existing.id !== current.id) {
      return NextResponse.json({ error: "That email is already in use" }, { status: 409 });
    }
  }

  if (parsed.data.name || nextEmail) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name.trim() } : {}),
        ...(nextEmail ? { email: nextEmail } : {}),
      },
      select: { id: true },
    });
  }

  const phone = phoneProvided ? await setProfilePhone(userId, nextPhone) : await getProfilePhone(userId);
  const voiceAgentId = voiceAgentProvided
    ? await setProfileVoiceAgentId(userId, nextVoiceAgentId)
    : await getProfileVoiceAgentId(userId);

  const voiceAgentApiKeyConfigured = voiceAgentApiKeyProvided
    ? await setProfileVoiceAgentApiKey(userId, nextVoiceAgentApiKey)
    : Boolean((await getProfileVoiceAgentApiKey(userId))?.trim());

  const user = await prisma.user.findUnique({
    where: { id: userId },
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

  return NextResponse.json({
    ok: true,
    user: user ? { ...user, phone, voiceAgentId, voiceAgentApiKeyConfigured } : null,
    note: wantsToUpdateNameOrEmail ? "Sign out and back in to refresh your session." : "Saved.",
  });
}
