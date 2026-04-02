import { prisma } from "@/lib/db";
import { trySendTransactionalEmail } from "@/lib/emailSender";
import { normalizePhoneStrict } from "@/lib/phone";
import { hasPortalServiceCapability } from "@/lib/portalPermissions";
import type { PortalServiceKey } from "@/lib/portalPermissions.shared";
import { sendExpoPushToUserIds } from "@/lib/expoPush";
import { sendTwilioEnvSms } from "@/lib/twilioEnvSms";

function safeOneLine(s: string) {
  return String(s || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getAppBaseUrl() {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_CANONICAL_URL,
    process.env.APP_CANONICAL_URL,
    process.env.NEXTAUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

  for (const raw of candidates) {
    // Guard against the common placeholder value so we don't ship links to it.
    if (/your-vercel-domain\.vercel\.app/i.test(raw)) continue;
    try {
      return new URL(raw).toString().replace(/\/$/, "");
    } catch {
      continue;
    }
  }

  return "https://purelyautomation.com";
}

export type PortalNotificationKind =
  | "credits_purchased"
  | "password_changed"
  | "inbound_email"
  | "inbound_sms"
  | "review_request_sent"
  | "blog_published"
  | "booking_created"
  | "form_submitted"
  | "task_created"
  | "newsletter_ready"
  | "newsletter_sent"
  | "nurture_enrollment_created"
  | "ai_receptionist_call_completed"
  | "ai_outbound_call_completed"
  | "ai_outbound_call_failed"
  | "missed_call"
  | "lead_scrape_run_completed"
  | "automations_run"
  | "review_received"
  | "review_question_received";

const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

type PortalRecipient = { userId: string; email: string };

export type PortalRecipientContact = { userId: string; email: string; phoneE164: string | null };

function serviceForNotificationKind(kind: PortalNotificationKind): PortalServiceKey | null {
  switch (kind) {
    case "password_changed":
      return "profile";

    case "inbound_email":
    case "inbound_sms":
      return "inbox";

    case "booking_created":
      return "booking";

    case "review_request_sent":
      return "reviews";

    case "blog_published":
      return "blogs";

    case "newsletter_ready":
    case "newsletter_sent":
      return "newsletter";

    case "nurture_enrollment_created":
      return "nurtureCampaigns";

    case "ai_receptionist_call_completed":
      return "aiReceptionist";

    case "ai_outbound_call_completed":
    case "ai_outbound_call_failed":
      return "aiOutboundCalls";

    case "missed_call":
      return "missedCallTextback";

    case "lead_scrape_run_completed":
      return "leadScraping";

    case "review_received":
    case "review_question_received":
      return "reviews";

    case "automations_run":
      return "automations";

    // Generic/account-wide events.
    case "credits_purchased":
    case "form_submitted":
    case "task_created":
      return null;

    default:
      return null;
  }
}

function portalPathForNotificationKind(kind: PortalNotificationKind): string {
  switch (kind) {
    case "inbound_email":
    case "inbound_sms":
      return "/portal/app/inbox";

    case "task_created":
      return "/portal/app/services/tasks";

    case "review_request_sent":
      return "/portal/app/services/reviews";

    case "nurture_enrollment_created":
      return "/portal/app/services/nurture-campaigns";

    default:
      return "/portal/app";
  }
}

export async function tryNotifyPortalUserIds(opts: {
  userIds: string[];
  subject: string;
  text: string;
  html?: string | null;
  fromName?: string | null;
  replyTo?: string | null;
  smsMirror?: boolean;
  smsFromNumberEnvKeys?: string[];
}): Promise<{ ok: true; recipients: string[] } | { ok: false; reason: string }> {
  const ids = Array.isArray(opts.userIds) ? opts.userIds.map((x) => String(x || "").trim()).filter(Boolean) : [];
  const uniqueIds = Array.from(new Set(ids)).slice(0, 50);
  if (!uniqueIds.length) return { ok: false, reason: "No recipients" };

  const users = await prisma.user
    .findMany({
      where: { id: { in: uniqueIds }, active: true },
      select: { id: true, email: true },
      take: 60,
    })
    .catch(() => []);

  const recipients = users
    .map((u) => ({ userId: u.id, email: safeOneLine(u.email) }))
    .filter((r) => r.email && r.email.includes("@"));

  if (!recipients.length) return { ok: false, reason: "No recipients" };

  // Best-effort push (do not block email/SMS notification flow).
  try {
    void sendExpoPushToUserIds({
      userIds: recipients.map((r) => r.userId),
      title: safeOneLine(opts.subject || "Purely Automation"),
      body: safeOneLine(opts.text || ""),
      data: { kind: "generic" },
    });
  } catch {
    // ignore
  }

  const res = await trySendTransactionalEmail({
    to: recipients.map((r) => r.email),
    subject: opts.subject,
    text: opts.text,
    html: opts.html ?? null,
    fromName: safeOneLine(opts.fromName || "") || "Purely Automation",
    replyTo: opts.replyTo ?? null,
  });

  if (!res.ok) return { ok: false, reason: res.reason };

  const smsMirror = opts.smsMirror !== false;
  if (smsMirror) {
    try {
      const phones = await getRecipientPhones(recipients.map((r) => r.userId));
      const smsBody = [safeOneLine(opts.subject), String(opts.text || "").trim()]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 900);

      await Promise.all(
        recipients
          .map((r) => ({ userId: r.userId, phone: phones.get(r.userId) || "" }))
          .filter((r) => Boolean(r.phone))
          .map((r) =>
            sendTwilioEnvSms({
              to: r.phone,
              body: smsBody,
              fromNumberEnvKeys: opts.smsFromNumberEnvKeys ?? ["TWILIO_FROM_NUMBER"],
            }),
          ),
      );
    } catch {
      // ignore
    }
  }

  return { ok: true, recipients: recipients.map((r) => r.email) };
}

async function getPortalAccountRecipients(opts: { ownerId: string; kind?: PortalNotificationKind }): Promise<PortalRecipient[]> {
  const [owner, members] = await Promise.all([
    prisma.user.findUnique({ where: { id: opts.ownerId }, select: { id: true, email: true, active: true } }),
    prisma.portalAccountMember.findMany({
      where: { ownerId: opts.ownerId },
      select: { role: true, permissionsJson: true, user: { select: { id: true, email: true, active: true } } },
    }),
  ]);

  const service = opts.kind ? serviceForNotificationKind(opts.kind) : null;

  const rows: Array<PortalRecipient | null> = [];
  rows.push(owner?.active ? { userId: owner.id, email: owner.email } : null);

  for (const m of members) {
    if (!m.user?.active) continue;
    if (service) {
      const role = m.role === "ADMIN" ? "ADMIN" : "MEMBER";
      const ok = hasPortalServiceCapability({
        role,
        permissionsJson: m.permissionsJson,
        service,
        capability: "view",
      });
      if (!ok) continue;
    }
    rows.push({ userId: m.user.id, email: m.user.email });
  }

  const filtered = rows.filter(Boolean) as PortalRecipient[];

  const seen = new Set<string>();
  const unique: PortalRecipient[] = [];
  for (const r of filtered) {
    const email = safeOneLine(r.email);
    if (!email || !email.includes("@")) continue;
    const key = `${r.userId}:${email.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ userId: r.userId, email });
  }
  return unique;
}

async function getRecipientPhones(userIds: string[]): Promise<Map<string, string>> {
  if (!userIds.length) return new Map();

  const rows = await prisma.portalServiceSetup.findMany({
    where: { ownerId: { in: userIds }, serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG },
    select: { ownerId: true, dataJson: true },
  });

  const map = new Map<string, string>();
  for (const row of rows) {
    const rec =
      row.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
        ? (row.dataJson as Record<string, unknown>)
        : null;
    const raw = rec?.phone;
    if (typeof raw !== "string") continue;
    const parsed = normalizePhoneStrict(raw);
    if (parsed.ok && parsed.e164) map.set(row.ownerId, parsed.e164);
  }
  return map;
}

export async function listPortalAccountRecipientContacts(ownerId: string, kind?: PortalNotificationKind): Promise<PortalRecipientContact[]> {
  const recipients = await getPortalAccountRecipients({ ownerId, kind }).catch(() => []);
  if (!recipients.length) return [];

  const phones = await getRecipientPhones(recipients.map((r) => r.userId)).catch(() => new Map<string, string>());
  return recipients.map((r) => ({ ...r, phoneE164: phones.get(r.userId) || null }));
}

export async function getPortalAccountRecipientEmails(ownerId: string): Promise<string[]> {
  const recips = await getPortalAccountRecipients({ ownerId });
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const r of recips) {
    const key = r.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(r.email);
  }
  return unique;
}

export async function tryNotifyPortalAccountUsers(opts: {
  ownerId: string;
  kind: PortalNotificationKind;
  subject: string;
  text: string;
  html?: string | null;
  fromName?: string | null;
  replyTo?: string | null;
  smsMirror?: boolean;
  smsFromNumberEnvKeys?: string[];
}): Promise<{ ok: true; recipients: string[] } | { ok: false; reason: string }> {
  const recipients = await getPortalAccountRecipients({ ownerId: opts.ownerId, kind: opts.kind }).catch(() => []);
  if (!recipients.length) return { ok: false, reason: "No recipients" };

  // Best-effort push (even if email config is missing).
  try {
    void sendExpoPushToUserIds({
      userIds: recipients.map((r) => r.userId),
      title: safeOneLine(opts.subject || "Purely Automation"),
      body: safeOneLine(opts.text || ""),
      data: { kind: opts.kind, ownerId: opts.ownerId, path: portalPathForNotificationKind(opts.kind) },
    });
  } catch {
    // ignore
  }

  const profile = await prisma.businessProfile
    .findUnique({ where: { ownerId: opts.ownerId }, select: { businessName: true } })
    .catch(() => null);

  const fromName = safeOneLine(opts.fromName || "") || safeOneLine(profile?.businessName || "") || "Purely Automation";

  const res = await trySendTransactionalEmail({
    to: recipients.map((r) => r.email),
    subject: opts.subject,
    text: opts.text,
    html: opts.html ?? null,
    fromName,
    replyTo: opts.replyTo ?? null,
  });

  const smsMirror = opts.smsMirror !== false;
  if (smsMirror) {
    // Best-effort SMS mirror (only to users who have a profile phone configured).
    try {
      const phones = await getRecipientPhones(recipients.map((r) => r.userId));
      const smsBody = [safeOneLine(opts.subject), String(opts.text || "").trim()]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 900);

      await Promise.all(
        recipients
          .map((r) => ({ userId: r.userId, phone: phones.get(r.userId) || "" }))
          .filter((r) => Boolean(r.phone))
          .map((r) =>
            sendTwilioEnvSms({
              to: r.phone,
              body: smsBody,
              fromNumberEnvKeys: opts.smsFromNumberEnvKeys ?? ["TWILIO_FROM_NUMBER"],
            }),
          ),
      );
    } catch {
      // ignore
    }
  }

  if (!res.ok) return { ok: false, reason: res.reason };

  return { ok: true, recipients: recipients.map((r) => r.email) };
}
