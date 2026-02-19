import crypto from "crypto";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Settings = {
  notifyEmails: string[];
  webhookUrl: string | null;
  webhookSecret: string;
};

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

function parseSettings(dataJson: unknown): Settings {
  const rec = dataJson && typeof dataJson === "object" && !Array.isArray(dataJson) ? (dataJson as any) : {};
  const notifyEmails = normalizeEmailList(rec.notifyEmails);
  const webhookUrl = normalizeWebhookUrl(rec.webhookUrl);
  const webhookSecret = typeof rec.webhookSecret === "string" && rec.webhookSecret.trim().length >= 16
    ? rec.webhookSecret.trim()
    : crypto.randomBytes(24).toString("hex");
  return { notifyEmails, webhookUrl, webhookSecret };
}

export async function GET() {
  const auth = await requireCreditClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const row = await prisma.creditFunnelBuilderSettings
    .findUnique({ where: { ownerId }, select: { dataJson: true } })
    .catch(() => null);

  const settings = parseSettings(row?.dataJson);

  if (!row || (row.dataJson as any)?.webhookSecret !== settings.webhookSecret) {
    await prisma.creditFunnelBuilderSettings
      .upsert({ where: { ownerId }, update: { dataJson: settings as any }, create: { ownerId, dataJson: settings as any } })
      .catch(() => null);
  }

  return NextResponse.json({ ok: true, settings });
}

export async function POST(req: Request) {
  const auth = await requireCreditClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const body = (await req.json().catch(() => null)) as any;

  const row = await prisma.creditFunnelBuilderSettings
    .findUnique({ where: { ownerId }, select: { dataJson: true } })
    .catch(() => null);
  const current = parseSettings(row?.dataJson);

  const next: Settings = {
    notifyEmails: normalizeEmailList(body?.notifyEmails ?? current.notifyEmails),
    webhookUrl: normalizeWebhookUrl(body?.webhookUrl) ?? null,
    webhookSecret:
      body?.regenerateSecret === true ? crypto.randomBytes(24).toString("hex") : current.webhookSecret,
  };

  await prisma.creditFunnelBuilderSettings.upsert({
    where: { ownerId },
    update: { dataJson: next as any },
    create: { ownerId, dataJson: next as any },
  });

  return NextResponse.json({ ok: true, settings: next });
}
