import { prisma } from "@/lib/db";
import { findOrCreatePortalContact, normalizeEmailKey } from "@/lib/portalContacts";
import { ensurePortalContactsSchema } from "@/lib/portalContactsSchema";
import { normalizePhoneStrict } from "@/lib/phone";
import { randomBytes } from "crypto";

const SERVICE_SLUG = "inbox";

export type PortalInboxSettings = {
  webhookToken: string;
};

function newToken(): string {
  // URL-safe token: 24 chars
  return randomBytes(18).toString("base64url");
}

function parseSettings(raw: unknown): PortalInboxSettings {
  const base: PortalInboxSettings = { webhookToken: newToken() };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const rec = raw as Record<string, unknown>;
  const token = typeof rec.webhookToken === "string" ? rec.webhookToken.trim() : "";
  const webhookToken = token.length >= 12 ? token : base.webhookToken;
  return { webhookToken };
}

function parseServiceData(raw: unknown): { version: 1; settings: PortalInboxSettings } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { version: 1, settings: parseSettings(null) };
  }
  const rec = raw as Record<string, unknown>;
  return {
    version: 1,
    settings: parseSettings(rec.settings),
  };
}

export async function getPortalInboxSettings(ownerId: string): Promise<PortalInboxSettings> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const data = parseServiceData(row?.dataJson ?? null);

  // Ensure settings are persisted so webhooks have a stable token.
  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: data as any },
    update: { status: "COMPLETE", dataJson: data as any },
    select: { id: true },
  });

  return data.settings;
}

export async function regeneratePortalInboxWebhookToken(ownerId: string): Promise<PortalInboxSettings> {
  const current = await getPortalInboxSettings(ownerId);
  const next: PortalInboxSettings = { ...current, webhookToken: newToken() };
  const data = { version: 1 as const, settings: next };

  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: { ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: data as any },
    update: { status: "COMPLETE", dataJson: data as any },
    select: { id: true },
  });

  return next;
}

export async function findOwnerByPortalInboxWebhookToken(tokenRaw: string): Promise<string | null> {
  const token = String(tokenRaw ?? "").trim();
  if (token.length < 12) return null;

  const rows = await prisma.portalServiceSetup.findMany({
    where: { serviceSlug: SERVICE_SLUG },
    select: { ownerId: true, dataJson: true },
    take: 5000,
  });

  for (const row of rows) {
    const data = parseServiceData(row.dataJson ?? null);
    if (data.settings.webhookToken === token) return row.ownerId;
  }

  return null;
}

export function normalizeSubjectKey(subjectRaw: string): string {
  const subject = String(subjectRaw ?? "").trim();
  if (!subject) return "(no subject)";

  let s = subject;
  // Remove repeated prefixes like "Re:", "Fwd:", "FW:" (case-insensitive)
  // Keep it intentionally simple.
  for (let i = 0; i < 8; i += 1) {
    const next = s.replace(/^\s*(re|fw|fwd)\s*:\s*/i, "").trim();
    if (next === s) break;
    s = next;
  }

  return (s || "(no subject)").slice(0, 160);
}

export function extractEmailAddress(raw: string): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const m = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i.exec(text);
  if (!m) return null;
  return m[1].trim();
}

export function normalizeSmsPeerKey(peerRaw: string): { peer: string | null; peerKey: string | null; error?: string } {
  const res = normalizePhoneStrict(String(peerRaw ?? ""));
  if (!res.ok) return { peer: null, peerKey: null, error: res.error };
  if (!res.e164) return { peer: null, peerKey: null };
  return { peer: res.e164, peerKey: res.e164 };
}

export function makeEmailThreadKey(peerEmail: string, subjectRaw: string): {
  peerAddress: string;
  peerKey: string;
  subject: string;
  subjectKey: string;
  threadKey: string;
} | null {
  const peerKey = normalizeEmailKey(peerEmail);
  if (!peerKey) return null;
  const subjectKey = normalizeSubjectKey(subjectRaw);
  const threadKey = `${peerKey}::${subjectKey.toLowerCase()}`;
  return {
    peerAddress: peerEmail.trim().slice(0, 200),
    peerKey,
    subject: String(subjectRaw ?? "").trim().slice(0, 200) || "(no subject)",
    subjectKey,
    threadKey: threadKey.slice(0, 260),
  };
}

export function makeSmsThreadKey(peerE164: string): {
  peerAddress: string;
  peerKey: string;
  threadKey: string;
} {
  const peer = String(peerE164 ?? "").trim();
  return {
    peerAddress: peer,
    peerKey: peer,
    threadKey: peer,
  };
}

function previewFromBody(body: string): string {
  const text = String(body ?? "").replace(/\s+/g, " ").trim();
  return text.slice(0, 240);
}

export async function upsertPortalInboxMessage(opts: {
  ownerId: string;
  channel: "EMAIL" | "SMS";
  direction: "IN" | "OUT";
  threadKey: string;
  peerAddress: string;
  peerKey: string;
  subject?: string | null;
  subjectKey?: string | null;
  fromAddress: string;
  toAddress: string;
  bodyText: string;
  provider?: string | null;
  providerMessageId?: string | null;
  createdAt?: Date;
}): Promise<{ threadId: string; messageId: string }> {
  const ownerId = String(opts.ownerId);
  const channel = opts.channel;
  const direction = opts.direction;

  let contactId: string | null = null;
  try {
    await ensurePortalContactsSchema();
    if (channel === "SMS") {
      contactId = await findOrCreatePortalContact({
        ownerId,
        name: String(opts.peerAddress ?? opts.peerKey ?? "").slice(0, 80) || "SMS Contact",
        email: null,
        phone: String(opts.peerKey ?? ""),
      });
    } else {
      const email = extractEmailAddress(String(opts.peerAddress ?? "")) || String(opts.peerKey ?? "");
      contactId = await findOrCreatePortalContact({
        ownerId,
        name: email || "Email Contact",
        email: email || null,
        phone: null,
      });
    }
  } catch {
    // ignore
  }

  const subject = typeof opts.subject === "string" ? opts.subject.trim().slice(0, 200) : null;
  const subjectKey = typeof opts.subjectKey === "string" ? opts.subjectKey.trim().slice(0, 160) : null;

  const thread = await (prisma as any).portalInboxThread.upsert({
    where: { ownerId_channel_threadKey: { ownerId, channel, threadKey: opts.threadKey } },
    create: {
      ownerId,
      channel,
      threadKey: opts.threadKey,
      peerAddress: opts.peerAddress,
      peerKey: opts.peerKey,
      contactId,
      subject,
      subjectKey,
      lastMessageAt: opts.createdAt ?? new Date(),
      lastMessagePreview: previewFromBody(opts.bodyText),
      lastMessageDirection: direction,
      lastMessageFrom: String(opts.fromAddress ?? "").slice(0, 240),
      lastMessageTo: String(opts.toAddress ?? "").slice(0, 240),
      lastMessageSubject: subject,
    },
    update: {
      peerAddress: opts.peerAddress,
      peerKey: opts.peerKey,
      contactId,
      subject,
      subjectKey,
      lastMessageAt: opts.createdAt ?? new Date(),
      lastMessagePreview: previewFromBody(opts.bodyText),
      lastMessageDirection: direction,
      lastMessageFrom: String(opts.fromAddress ?? "").slice(0, 240),
      lastMessageTo: String(opts.toAddress ?? "").slice(0, 240),
      lastMessageSubject: subject,
    },
    select: { id: true },
  });

  const provider = opts.provider ? String(opts.provider).slice(0, 40) : null;
  const providerMessageId = opts.providerMessageId ? String(opts.providerMessageId).slice(0, 120) : null;
  const bodyText = String(opts.bodyText ?? "").slice(0, 20000);

  // Dedupe: the same provider message can be logged from multiple places
  // (e.g. send function + API route). If we already have it, return it.
  if (provider && providerMessageId) {
    const existing = await (prisma as any).portalInboxMessage.findFirst({
      where: { ownerId, provider, providerMessageId },
      select: { id: true, threadId: true, bodyText: true },
    });

    if (existing?.id) {
      const existingBody = String(existing.bodyText ?? "").trim();
      const nextBody = String(bodyText ?? "").trim();
      if (!existingBody && nextBody) {
        await (prisma as any).portalInboxMessage
          .update({
            where: { id: existing.id },
            data: { bodyText },
            select: { id: true },
          })
          .catch(() => null);
      }

      return { threadId: String(existing.threadId || thread.id), messageId: String(existing.id) };
    }
  }

  const msg = await (prisma as any).portalInboxMessage.create({
    data: {
      ownerId,
      threadId: thread.id,
      channel,
      direction,
      fromAddress: String(opts.fromAddress ?? "").slice(0, 240),
      toAddress: String(opts.toAddress ?? "").slice(0, 240),
      subject,
      bodyText,
      provider,
      providerMessageId,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    },
    select: { id: true },
  });

  return { threadId: thread.id, messageId: msg.id };
}

export async function tryUpsertPortalInboxMessage(
  opts: Parameters<typeof upsertPortalInboxMessage>[0],
): Promise<void> {
  try {
    await upsertPortalInboxMessage(opts);
  } catch {
    // Never block core flows on inbox logging.
  }
}
