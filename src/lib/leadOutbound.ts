import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { makeEmailThreadKey, normalizeSubjectKey, tryUpsertPortalInboxMessage } from "@/lib/portalInbox";

export type LeadTemplateVars = {
  businessName: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  niche: string | null;
};

export function renderTemplate(raw: string, lead: LeadTemplateVars) {
  const map: Record<string, string> = {
    businessName: lead.businessName,
    phone: lead.phone ?? "",
    website: lead.website ?? "",
    address: lead.address ?? "",
    niche: lead.niche ?? "",
  };
  return raw.replace(/\{(businessName|phone|website|address|niche)\}/g, (_, k: string) => map[k] ?? "");
}

export function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function baseUrlFromRequest(req?: Request): string {
  const env = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL;
  if (env && env.startsWith("http")) return env.replace(/\/$/, "");

  const proto = req?.headers.get("x-forwarded-proto") || "http";
  const host = req?.headers.get("x-forwarded-host") || req?.headers.get("host");
  if (host) return `${proto}://${host}`.replace(/\/$/, "");

  return "http://localhost:3000";
}

export async function sendEmail({
  to,
  cc,
  subject,
  text,
  fromName,
  ownerId,
}: {
  to: string;
  cc?: string | null;
  subject: string;
  text: string;
  fromName?: string;
  ownerId?: string;
}) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  if (!apiKey || !fromEmail) throw new Error("Email is not configured yet.");

  const safeText = (text || "").trim() || " ";

  const ccEmail = (cc || "").trim();
  const personalizations: any = {
    to: [{ email: to }],
    ...(ccEmail ? { cc: [{ email: ccEmail }] } : {}),
  };

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      personalizations: [personalizations],
      from: { email: fromEmail, name: fromName ?? "Purely Automation" },
      subject,
      content: [{ type: "text/plain", value: safeText }],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`SendGrid failed (${res.status}): ${t.slice(0, 400)}`);
  }

  if (ownerId) {
    const subjectKey = normalizeSubjectKey(subject);
    const thread = makeEmailThreadKey(to, subjectKey);
    if (thread) {
      await tryUpsertPortalInboxMessage({
        ownerId,
        channel: "EMAIL",
        direction: "OUT",
        threadKey: thread.threadKey,
        peerAddress: thread.peerAddress,
        peerKey: thread.peerKey,
        subject,
        subjectKey: thread.subjectKey,
        fromAddress: fromEmail,
        toAddress: thread.peerKey,
        bodyText: safeText,
        provider: "SENDGRID",
        providerMessageId: null,
      });
    }
  }
}

export async function sendSms({
  ownerId,
  to,
  body,
}: {
  ownerId: string;
  to: string;
  body: string;
}) {
  const twilio = await getOwnerTwilioSmsConfig(ownerId);
  if (!twilio) throw new Error("Texting is not configured yet.");

  const url = `https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`;
  const basic = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64");

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("From", twilio.fromNumberE164);
  form.set("Body", body.slice(0, 900));

  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Twilio failed (${res.status}): ${t.slice(0, 400)}`);
  }
}
