import { prisma } from "@/lib/db";
import { trySendTransactionalEmail } from "@/lib/emailSender";

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

export async function getPortalAccountRecipientEmails(ownerId: string): Promise<string[]> {
  const [owner, members] = await Promise.all([
    prisma.user.findUnique({ where: { id: ownerId }, select: { email: true, active: true } }),
    prisma.portalAccountMember.findMany({
      where: { ownerId },
      select: { user: { select: { email: true, active: true } } },
    }),
  ]);

  const emails = [
    owner?.active ? owner.email : null,
    ...members.map((m) => (m.user?.active ? m.user.email : null)),
  ]
    .map((e) => safeOneLine(e || ""))
    .filter((e) => e && e.includes("@"));

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const e of emails) {
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(e);
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
  const recipients = await getPortalAccountRecipientEmails(opts.ownerId).catch(() => []);
  if (!recipients.length) return { ok: false, reason: "No recipients" };

  const profile = await prisma.businessProfile
    .findUnique({ where: { ownerId: opts.ownerId }, select: { businessName: true } })
    .catch(() => null);

  const fromName = safeOneLine(opts.fromName || "") || safeOneLine(profile?.businessName || "") || "Purely Automation";

  // If your email provider requires verified senders, make sure this is verified.
  const fromEmail = "contact@purelyautomation.com";

  const res = await trySendTransactionalEmail({
    to: recipients,
    subject: opts.subject,
    text: opts.text,
    html: opts.html ?? null,
    fromEmail,
    fromName,
    replyTo: opts.replyTo ?? null,
    messageStream: opts.kind,
  });

  if (!res.ok) return { ok: false, reason: res.reason };
  return { ok: true, recipients };
}
