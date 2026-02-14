import { prisma } from "@/lib/db";
import { trySendTransactionalEmail } from "@/lib/emailSender";
import { normalizePhoneStrict } from "@/lib/phone";
import { sendTwilioEnvSms } from "@/lib/twilioEnvSms";

function safeOneLine(s: string) {
  return String(s || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getAppBaseUrl() {
  const raw = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    return new URL(raw).toString().replace(/\/$/, "");
  } catch {
    return "http://localhost:3000";
  }
}

export type PortalNotificationKind =
  | "credits_purchased"
  | "inbound_email"
  | "inbound_sms"
  | "blog_published"
  | "booking_created"
  | "task_created"
  | "newsletter_ready"
  | "newsletter_sent"
  | "ai_receptionist_call_completed"
  | "missed_call"
  | "lead_scrape_run_completed"
  | "automations_run"
  | "review_received"
  | "review_question_received";

const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

type PortalRecipient = { userId: string; email: string };

async function getPortalAccountRecipients(ownerId: string): Promise<PortalRecipient[]> {
  const [owner, members] = await Promise.all([
    prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, email: true, active: true } }),
    prisma.portalAccountMember.findMany({
      where: { ownerId },
      select: { user: { select: { id: true, email: true, active: true } } },
    }),
  ]);

  const rows = [
    owner?.active ? { userId: owner.id, email: owner.email } : null,
    ...members.map((m) => (m.user?.active ? { userId: m.user.id, email: m.user.email } : null)),
  ].filter(Boolean) as PortalRecipient[];

  const seen = new Set<string>();
  const unique: PortalRecipient[] = [];
  for (const r of rows) {
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

export async function getPortalAccountRecipientEmails(ownerId: string): Promise<string[]> {
  const recips = await getPortalAccountRecipients(ownerId);
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
}): Promise<{ ok: true; recipients: string[] } | { ok: false; reason: string }> {
  const recipients = await getPortalAccountRecipients(opts.ownerId).catch(() => []);
  if (!recipients.length) return { ok: false, reason: "No recipients" };

  const profile = await prisma.businessProfile
    .findUnique({ where: { ownerId: opts.ownerId }, select: { businessName: true } })
    .catch(() => null);

  const fromName = safeOneLine(opts.fromName || "") || safeOneLine(profile?.businessName || "") || "Purely Automation";

  // If your email provider requires verified senders, make sure this is verified.
  const fromEmail = "contact@purelyautomation.com";

  const res = await trySendTransactionalEmail({
    to: recipients.map((r) => r.email),
    subject: opts.subject,
    text: opts.text,
    html: opts.html ?? null,
    fromEmail,
    fromName,
    replyTo: opts.replyTo ?? null,
    messageStream: opts.kind,
  });

  if (!res.ok) return { ok: false, reason: res.reason };

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
        .map((r) => sendTwilioEnvSms({ to: r.phone, body: smsBody, fromNumberEnvKeys: ["TWILIO_FROM_NUMBER"] })),
    );
  } catch {
    // ignore
  }

  return { ok: true, recipients: recipients.map((r) => r.email) };
}
