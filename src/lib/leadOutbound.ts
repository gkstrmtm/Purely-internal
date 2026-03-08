import { sendOwnerTwilioSms } from "@/lib/portalTwilio";
import { makeEmailThreadKey, normalizeSubjectKey, tryUpsertPortalInboxMessage } from "@/lib/portalInbox";
import { getOutboundEmailFrom, sendTransactionalEmail } from "@/lib/emailSender";

export type LeadTemplateVars = {
  businessName: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  niche: string | null;
};

export function renderTemplate(raw: string, lead: LeadTemplateVars, customVariables?: Record<string, string> | null) {
  const leadMap: Record<string, string> = {
    businessName: lead.businessName,
    phone: lead.phone ?? "",
    website: lead.website ?? "",
    address: lead.address ?? "",
    niche: lead.niche ?? "",
  };

  const custom =
    customVariables && typeof customVariables === "object" && !Array.isArray(customVariables)
      ? (customVariables as Record<string, string>)
      : null;

  return raw.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (match, kRaw: string) => {
    const k = String(kRaw || "").trim();
    if (!k) return match;

    if (Object.prototype.hasOwnProperty.call(leadMap, k)) return leadMap[k] ?? "";
    if (custom && Object.prototype.hasOwnProperty.call(custom, k)) return String(custom[k] ?? "");
    return match;
  });
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
  const res = await sendOwnerTwilioSms({ ownerId, to, body });
  if (!res.ok) throw new Error(res.error || "Twilio send failed");
}
