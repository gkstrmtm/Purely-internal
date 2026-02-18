import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { makeEmailThreadKey, normalizeSubjectKey, tryUpsertPortalInboxMessage } from "@/lib/portalInbox";
import { getOutboundEmailFrom, sendTransactionalEmail } from "@/lib/emailSender";

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
  const envClean = env && env.startsWith("http") ? env.replace(/\/$/, "") : null;

  const proto = req?.headers.get("x-forwarded-proto") || (process.env.NODE_ENV === "production" ? "https" : "http");

  const hostHeader = req?.headers.get("host")?.trim() || null;
  const forwardedHost = req?.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim()
    ?.toLowerCase() || null;

  const isBadHostname = (hostname: string) => {
    const h = hostname.toLowerCase();
    return h.endsWith(".vercel.app") || h.includes("your-vercel-domain");
  };

  const isCustomHostname = (hostname: string) => Boolean(hostname) && !isBadHostname(hostname);

  const safeEnvBase = (() => {
    if (!envClean) return null;
    try {
      const envHost = new URL(envClean).hostname;
      return isCustomHostname(envHost) ? envClean : null;
    } catch {
      return null;
    }
  })();

  const reqBases = [forwardedHost, hostHeader]
    .filter(Boolean)
    .map((h) => `${proto}://${h}`.replace(/\/$/, ""));

  for (const candidate of reqBases) {
    try {
      const candidateHost = new URL(candidate).hostname;
      if (isCustomHostname(candidateHost)) return candidate;
    } catch {
      // ignore
    }
  }

  if (safeEnvBase) return safeEnvBase;
  if (process.env.NODE_ENV === "production") return "https://purelyautomation.com";
  return reqBases[0] || "http://localhost:3000";
}

export async function sendEmail({
  to,
  cc,
  subject,
  text,
  fromEmail,
  fromName,
  ownerId,
  attachments,
}: {
  to: string;
  cc?: string | null;
  subject: string;
  text: string;
  fromEmail?: string;
  fromName?: string;
  ownerId?: string;
  attachments?: Array<{ fileName: string; mimeType: string; bytes: Buffer }>;
}) {
  const safeText = (text || "").trim() || " ";

  const sendResult = await sendTransactionalEmail({
    to,
    cc,
    subject,
    text: safeText,
    fromEmail,
    fromName,
    attachments,
  });

  const envFrom = getOutboundEmailFrom().fromEmail;
  const resolvedFromEmail = String(fromEmail || "").trim() || envFrom;
  if (!resolvedFromEmail) throw new Error("Email is not configured yet.");

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
        fromAddress: resolvedFromEmail,
        toAddress: thread.peerKey,
        bodyText: safeText,
        provider: sendResult.provider,
        providerMessageId: sendResult.providerMessageId,
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
