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
  createFunnelDraft: FunnelCreateDraft | null;
};

type FunnelCreateDraft = {
  v: 1;
  updatedAt: string;
  stage: string;
  slug: string;
  name: string;
  pageType: string;
  primaryCta: string;
  heroAssetMode: string;
  audience: string;
  offer: string;
  goal: string;
  shellFrameId: string;
  companyContext: string;
  qualificationFields: string;
  preferCustomMode: boolean;
};

type SettingsResponse = {
  notifyEmails: string[];
  webhookUrl: string | null;
  webhookSecretMasked: string | null;
  hasWebhookSecret: boolean;
  metaPixelId: string | null;
  createFunnelDraft: FunnelCreateDraft | null;
};

function createWebhookSecret() {
  return crypto.randomBytes(24).toString("hex");
}

function maskSecret(secret: string) {
  const value = String(secret || "").trim();
  if (!value) return null;
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`;
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

function normalizeDraftText(raw: unknown, maxLen: number) {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, maxLen);
}

function normalizeFunnelCreateDraft(raw: unknown): Omit<FunnelCreateDraft, "updatedAt"> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  return {
    v: 1,
    stage: normalizeDraftText(rec.stage, 40) || "business",
    slug: normalizeDraftText(rec.slug, 160),
    name: normalizeDraftText(rec.name, 160),
    pageType: normalizeDraftText(rec.pageType, 80) || "lead-capture",
    primaryCta: normalizeDraftText(rec.primaryCta, 160),
    heroAssetMode: normalizeDraftText(rec.heroAssetMode, 80) || "auto",
    audience: normalizeDraftText(rec.audience, 400),
    offer: normalizeDraftText(rec.offer, 400),
    goal: normalizeDraftText(rec.goal, 800),
    shellFrameId: normalizeDraftText(rec.shellFrameId, 160),
    companyContext: normalizeDraftText(rec.companyContext, 4000),
    qualificationFields: normalizeDraftText(rec.qualificationFields, 2000),
    preferCustomMode: rec.preferCustomMode === true,
  };
}

function parseSettings(dataJson: unknown): Settings {
  const rec = dataJson && typeof dataJson === "object" && !Array.isArray(dataJson) ? (dataJson as any) : {};
  const notifyEmails = normalizeEmailList(rec.notifyEmails);
  const webhookUrl = normalizeWebhookUrl(rec.webhookUrl);
  const webhookSecret = typeof rec.webhookSecret === "string" && rec.webhookSecret.trim().length >= 16
    ? rec.webhookSecret.trim()
    : "";
  const metaPixelId = normalizeMetaPixelId(rec.metaPixelId);
  const createFunnelDraft = rec.createFunnelDraft && typeof rec.createFunnelDraft === "object" && !Array.isArray(rec.createFunnelDraft)
    ? ({
        ...(normalizeFunnelCreateDraft(rec.createFunnelDraft) || {
          v: 1,
          stage: "business",
          slug: "",
          name: "",
          pageType: "lead-capture",
          primaryCta: "",
          heroAssetMode: "auto",
          audience: "",
          offer: "",
          goal: "",
          shellFrameId: "",
          companyContext: "",
          qualificationFields: "",
          preferCustomMode: false,
        }),
        updatedAt: normalizeDraftText((rec.createFunnelDraft as any).updatedAt, 80),
      } as FunnelCreateDraft)
    : null;
  return { notifyEmails, webhookUrl, webhookSecret, metaPixelId, createFunnelDraft };
}

function serializeSettings(settings: Settings): SettingsResponse {
  return {
    notifyEmails: settings.notifyEmails,
    webhookUrl: settings.webhookUrl,
    webhookSecretMasked: maskSecret(settings.webhookSecret),
    hasWebhookSecret: Boolean(settings.webhookSecret),
    metaPixelId: settings.metaPixelId,
    createFunnelDraft: settings.createFunnelDraft,
  };
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

  return NextResponse.json({ ok: true, settings: serializeSettings(settings) });
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
  const nextCreateFunnelDraft = Object.prototype.hasOwnProperty.call(body || {}, "createFunnelDraft")
    ? (() => {
        const normalized = normalizeFunnelCreateDraft(body?.createFunnelDraft);
        return normalized ? { ...normalized, updatedAt: new Date().toISOString() } : null;
      })()
    : current.createFunnelDraft;

  const next: Settings = {
    notifyEmails: normalizeEmailList(body?.notifyEmails ?? current.notifyEmails),
    webhookUrl: normalizeWebhookUrl(body?.webhookUrl) ?? null,
    webhookSecret:
      body?.regenerateSecret === true ? createWebhookSecret() : current.webhookSecret || createWebhookSecret(),
    metaPixelId: normalizeMetaPixelId(body?.metaPixelId ?? current.metaPixelId),
    createFunnelDraft: nextCreateFunnelDraft,
  };

  await mutateCreditFunnelBuilderSettings(ownerId, (existing) => ({
    next: {
      ...existing,
      notifyEmails: next.notifyEmails,
      webhookUrl: next.webhookUrl,
      webhookSecret: next.webhookSecret,
      metaPixelId: next.metaPixelId,
      createFunnelDraft: next.createFunnelDraft,
    },
    value: next,
  }));

  return NextResponse.json({ ok: true, settings: serializeSettings(next) });
}
