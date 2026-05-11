import crypto from "crypto";
import { NextResponse } from "next/server";

import { getCreditFunnelBuilderSettings, mutateCreditFunnelBuilderSettings } from "@/lib/creditFunnelBuilderSettingsStore";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Settings = {
  notifyEmails: string[];
  webhookUrl: string | null;
  webhookSecret: string;
  metaPixelId: string | null;
};

function createWebhookSecret() {
  return crypto.randomBytes(24).toString("hex");
}

function normalizeEmailList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const e = v.trim().toLowerCase();
    if (!e) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) continue;
    out.push(e);
  }
  return Array.from(new Set(out)).slice(0, 10);
}

function normalizeWebhookUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function normalizeMetaPixelId(raw: unknown): string | null {
  const next = String(typeof raw === "string" ? raw : "")
    .trim()
    .replace(/[^0-9]/g, "")
    .slice(0, 32);
  return next || null;
}

function parseSettings(dataJson: unknown): Settings {
  const rec = dataJson && typeof dataJson === "object" && !Array.isArray(dataJson) ? (dataJson as any) : {};
  const notifyEmails = normalizeEmailList(rec.notifyEmails);
  const webhookUrl = normalizeWebhookUrl(rec.webhookUrl);
  const webhookSecret = typeof rec.webhookSecret === "string" && rec.webhookSecret.trim().length >= 16
    ? rec.webhookSecret.trim()
    : "";
  const metaPixelId = normalizeMetaPixelId(rec.metaPixelId);
  return { notifyEmails, webhookUrl, webhookSecret, metaPixelId };
}

export async function GET() {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const settings = parseSettings(await getCreditFunnelBuilderSettings(ownerId));

  return NextResponse.json({ ok: true, settings });
}

export async function POST(req: Request) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const body = (await req.json().catch(() => null)) as any;

  const current = parseSettings(await getCreditFunnelBuilderSettings(ownerId));

  const next: Settings = {
    notifyEmails: normalizeEmailList(body?.notifyEmails ?? current.notifyEmails),
    webhookUrl: normalizeWebhookUrl(body?.webhookUrl) ?? null,
    webhookSecret:
      body?.regenerateSecret === true ? createWebhookSecret() : current.webhookSecret || createWebhookSecret(),
    metaPixelId: normalizeMetaPixelId(body?.metaPixelId ?? current.metaPixelId),
  };

  await mutateCreditFunnelBuilderSettings(ownerId, (existing) => ({
    next: {
      ...existing,
      notifyEmails: next.notifyEmails,
      webhookUrl: next.webhookUrl,
      webhookSecret: next.webhookSecret,
      metaPixelId: next.metaPixelId,
    },
    value: next,
  }));

  return NextResponse.json({ ok: true, settings: next });
}
