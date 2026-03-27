import { prisma } from "@/lib/db";
import { getBookingCalendarsConfig } from "@/lib/bookingCalendars";
import { normalizeEmailKey, normalizeNameKey, normalizePhoneKey } from "@/lib/portalContacts";
import { createOwnerContactTag } from "@/lib/portalContactTags";
import { normalizeSmsPeerKey } from "@/lib/portalInbox";
import { ensurePortalInboxSchema } from "@/lib/portalInboxSchema";
import { listPortalAccountMembers } from "@/lib/portalAccounts";
import { isPuraRef, type PuraRef } from "@/lib/puraPlanner";

function safeParseUrl(raw: string | undefined | null): URL | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  try {
    if (s.startsWith("/")) return new URL(s, "http://local");
    return new URL(s);
  } catch {
    return null;
  }
}

function extractFunnelIdFromUrl(raw: string | undefined | null): string | null {
  const u = safeParseUrl(raw);
  if (!u) return null;
  const qp = u.searchParams.get("funnelId") || u.searchParams.get("funnel") || "";
  if (qp.trim()) return qp.trim().slice(0, 120);

  const p = u.pathname || "";
  const m = /\/funnels\/([^/?#]+)(?:\/|$)/.exec(p);
  return m?.[1] ? String(m[1]).trim().slice(0, 120) : null;
}

function extractAutomationIdFromUrl(raw: string | undefined | null): string | null {
  const u = safeParseUrl(raw);
  if (!u) return null;
  const qp = u.searchParams.get("automation") || u.searchParams.get("automationId") || "";
  if (qp.trim()) return qp.trim().slice(0, 120);
  return null;
}

function extractBookingIdFromUrl(raw: string | undefined | null): string | null {
  const u = safeParseUrl(raw);
  if (!u) return null;
  const qp = u.searchParams.get("bookingId") || u.searchParams.get("booking") || "";
  if (qp.trim()) return qp.trim().slice(0, 120);

  const p = u.pathname || "";
  const m1 = /\/bookings\/([^/?#]+)(?:\/|$)/.exec(p);
  if (m1?.[1]) return String(m1[1]).trim().slice(0, 120);
  const m2 = /\/reschedule\/([^/?#]+)(?:\/|$)/.exec(p);
  if (m2?.[1]) return String(m2[1]).trim().slice(0, 120);
  return null;
}

function extractBlogPostIdFromUrl(raw: string | undefined | null): string | null {
  const u = safeParseUrl(raw);
  if (!u) return null;
  const qp = u.searchParams.get("postId") || u.searchParams.get("post") || "";
  if (qp.trim()) return qp.trim().slice(0, 120);

  const p = u.pathname || "";
  const m = /\/services\/blogs\/([^/?#]+)(?:\/|$)/.exec(p);
  return m?.[1] ? String(m[1]).trim().slice(0, 120) : null;
}

function extractNewsletterIdFromUrl(raw: string | undefined | null): string | null {
  const u = safeParseUrl(raw);
  if (!u) return null;
  const qp = u.searchParams.get("newsletterId") || u.searchParams.get("draftId") || u.searchParams.get("newsletter") || "";
  if (qp.trim()) return qp.trim().slice(0, 120);
  return null;
}

function extractMediaFolderIdFromUrl(raw: string | undefined | null): string | null {
  const u = safeParseUrl(raw);
  if (!u) return null;
  const qp = u.searchParams.get("folderId") || u.searchParams.get("folder") || "";
  if (qp.trim()) return qp.trim().slice(0, 120);
  return null;
}

function extractMediaItemIdFromUrl(raw: string | undefined | null): string | null {
  const u = safeParseUrl(raw);
  if (!u) return null;
  const qp = u.searchParams.get("itemId") || u.searchParams.get("mediaItemId") || u.searchParams.get("id") || "";
  if (qp.trim()) return qp.trim().slice(0, 120);
  return null;
}

function extractTaskIdFromUrl(raw: string | undefined | null): string | null {
  const u = safeParseUrl(raw);
  if (!u) return null;
  const qp = u.searchParams.get("taskId") || u.searchParams.get("task") || "";
  if (qp.trim()) return qp.trim().slice(0, 120);
  return null;
}

function extractReviewIdFromUrl(raw: string | undefined | null): string | null {
  const u = safeParseUrl(raw);
  if (!u) return null;
  const qp = u.searchParams.get("reviewId") || u.searchParams.get("review") || "";
  if (qp.trim()) return qp.trim().slice(0, 120);
  return null;
}

function extractReviewQuestionIdFromUrl(raw: string | undefined | null): string | null {
  const u = safeParseUrl(raw);
  if (!u) return null;
  const qp = u.searchParams.get("questionId") || u.searchParams.get("reviewQuestionId") || "";
  if (qp.trim()) return qp.trim().slice(0, 120);
  return null;
}

function extractNurtureCampaignIdFromUrl(raw: string | undefined | null): string | null {
  const u = safeParseUrl(raw);
  if (!u) return null;
  const qp = u.searchParams.get("campaignId") || "";
  if (qp.trim()) return qp.trim().slice(0, 120);
  return null;
}

function extractNurtureStepIdFromUrl(raw: string | undefined | null): string | null {
  const u = safeParseUrl(raw);
  if (!u) return null;
  const qp = u.searchParams.get("stepId") || "";
  if (qp.trim()) return qp.trim().slice(0, 120);
  return null;
}

function extractScrapedLeadIdFromUrl(raw: string | undefined | null): string | null {
  const u = safeParseUrl(raw);
  if (!u) return null;
  const qp = u.searchParams.get("leadId") || u.searchParams.get("lead") || "";
  if (qp.trim()) return qp.trim().slice(0, 120);
  return null;
}

function extractCreditReportIdFromUrl(raw: string | undefined | null): string | null {
  const u = safeParseUrl(raw);
  if (!u) return null;
  const qp = u.searchParams.get("reportId") || u.searchParams.get("creditReportId") || "";
  if (qp.trim()) return qp.trim().slice(0, 120);
  return null;
}

function extractCreditReportItemIdFromUrl(raw: string | undefined | null): string | null {
  const u = safeParseUrl(raw);
  if (!u) return null;
  const qp = u.searchParams.get("itemId") || u.searchParams.get("reportItemId") || "";
  if (qp.trim()) return qp.trim().slice(0, 120);
  return null;
}

function extractCreditDisputeLetterIdFromUrl(raw: string | undefined | null): string | null {
  const u = safeParseUrl(raw);
  if (!u) return null;
  const qp = u.searchParams.get("letterId") || u.searchParams.get("disputeLetterId") || "";
  if (qp.trim()) return qp.trim().slice(0, 120);
  return null;
}

function extractCreditPullIdFromUrl(raw: string | undefined | null): string | null {
  const u = safeParseUrl(raw);
  if (!u) return null;
  const qp = u.searchParams.get("creditPullId") || u.searchParams.get("pullId") || "";
  if (qp.trim()) return qp.trim().slice(0, 120);
  return null;
}

function extractUserIdFromUrl(raw: string | undefined | null): string | null {
  const u = safeParseUrl(raw);
  if (!u) return null;
  const qp = u.searchParams.get("userId") || u.searchParams.get("memberId") || "";
  if (qp.trim()) return qp.trim().slice(0, 120);
  return null;
}

function extractFunnelFormIdFromUrl(raw: string | undefined | null): string | null {
  const u = safeParseUrl(raw);
  if (!u) return null;
  const qp = u.searchParams.get("formId") || "";
  if (qp.trim()) return qp.trim().slice(0, 120);

  const p = u.pathname || "";
  const m = /\/funnel-builder\/forms\/([^/?#]+)(?:\/|$)/.exec(p);
  return m?.[1] ? String(m[1]).trim().slice(0, 120) : null;
}

function extractFunnelPageIdFromUrl(raw: string | undefined | null): string | null {
  const u = safeParseUrl(raw);
  if (!u) return null;
  const qp = u.searchParams.get("pageId") || "";
  if (qp.trim()) return qp.trim().slice(0, 120);

  const p = u.pathname || "";
  const m = /\/pages\/([^/?#]+)(?:\/|$)/.exec(p);
  return m?.[1] ? String(m[1]).trim().slice(0, 120) : null;
}

function extractCustomDomainIdFromUrl(raw: string | undefined | null): string | null {
  const u = safeParseUrl(raw);
  if (!u) return null;
  const qp = u.searchParams.get("domainId") || "";
  if (qp.trim()) return qp.trim().slice(0, 120);
  return null;
}

function extractAiOutboundCallsCampaignIdFromUrl(raw: string | undefined | null): string | null {
  const u = safeParseUrl(raw);
  if (!u) return null;
  const qp = u.searchParams.get("campaignId") || "";
  if (qp.trim()) return qp.trim().slice(0, 120);
  return null;
}

function getThreadContextObj(threadContext: unknown): Record<string, unknown> | null {
  if (!threadContext || typeof threadContext !== "object" || Array.isArray(threadContext)) return null;
  return threadContext as Record<string, unknown>;
}

function getLastEntityObj(threadContext: unknown, key: string): Record<string, unknown> | null {
  const obj = getThreadContextObj(threadContext);
  const v = obj ? (obj as any)[key] : null;
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function getLastEntityId(
  threadContext: unknown,
  key:
    | "lastFunnel"
    | "lastAutomation"
    | "lastBooking"
    | "lastBlogPost"
    | "lastNewsletter"
    | "lastMediaFolder"
    | "lastMediaItem"
    | "lastTask"
    | "lastReview"
    | "lastReviewQuestion"
    | "lastNurtureCampaign"
    | "lastNurtureStep"
    | "lastScrapedLead"
    | "lastCreditPull"
    | "lastCreditDisputeLetter"
    | "lastCreditReport"
    | "lastCreditReportItem"
    | "lastUser"
    | "lastFunnelForm"
    | "lastFunnelPage"
    | "lastCustomDomain"
    | "lastAiOutboundCallsCampaign",
): string | null {
  const obj = getThreadContextObj(threadContext);
  const v = obj ? (obj as any)[key] : null;
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const id = String((v as any).id || "").trim();
  return id ? id.slice(0, 120) : null;
}

function looksLikeId(raw: string): boolean {
  const s = String(raw || "").trim();
  if (!s) return false;
  if (s.length < 10 || s.length > 120) return false;
  return /^[a-z0-9_-]+$/i.test(s);
}

function normKey(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]+/g, "")
    .trim();
}

function normalizePhoneLike(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const digits = s.replace(/[^0-9+]/g, "");
  if (!digits) return null;
  const cleaned = digits.startsWith("+") ? `+${digits.slice(1).replace(/\D+/g, "")}` : digits.replace(/\D+/g, "");
  if (cleaned.replace(/\D+/g, "").length < 8) return null;
  return cleaned.slice(0, 20);
}

function extractFirstEmailLike(textRaw: string): string | null {
  const t = String(textRaw || "");
  const m = /\b([A-Z0-9._%+-]{1,80}@[A-Z0-9.-]{1,120}\.[A-Z]{2,24})\b/i.exec(t);
  return m?.[1] ? String(m[1]).trim().slice(0, 140) : null;
}

function firstLinePreview(textRaw: string): string {
  const s = String(textRaw ?? "").replace(/\s+/g, " ").trim();
  return s.slice(0, 90);
}

async function resolveContactId(opts: {
  ownerId: string;
  hint: string;
}): Promise<
  | { kind: "ok"; contactId: string; contactName: string }
  | { kind: "clarify"; question: string }
  | { kind: "not_found"; question: string }
> {
  const ownerId = String(opts.ownerId);
  const hint = String(opts.hint || "").trim();
  if (!hint) return { kind: "clarify", question: "Which contact should I use? Reply with a name, email, or phone." };

  const emailLike = extractFirstEmailLike(hint);
  const emailKey = emailLike ? normalizeEmailKey(emailLike) : null;
  const phoneLike = normalizePhoneLike(hint);
  const phoneKey = phoneLike ? normalizePhoneKey(phoneLike).phoneKey : null;
  const nameLike = hint.slice(0, 80);

  if (emailKey) {
    const rows = await (prisma as any).portalContact.findMany({
      where: { ownerId, emailKey },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, name: true, email: true, phone: true },
    });
    if (rows?.length === 1) {
      return { kind: "ok", contactId: String(rows[0].id), contactName: String(rows[0].name || "").trim() || emailLike || "Contact" };
    }
    if (rows?.length > 1) {
      const list = rows
        .slice(0, 5)
        .map((r: any) => {
          const bits = [r.email ? `email: ${r.email}` : null, r.phone ? `phone: ${r.phone}` : null].filter(Boolean).join(" · ");
          return `- ${String(r.name || "(No name)").trim()}${bits ? ` (${bits})` : ""}`;
        })
        .join("\n");
      return { kind: "clarify", question: `I found multiple matches for “${hint}”. Reply with the contact’s email or phone:\n\n${list}` };
    }
  }

  if (phoneKey) {
    const row = await (prisma as any).portalContact.findFirst({
      where: { ownerId, phoneKey },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true },
    });
    if (row?.id) return { kind: "ok", contactId: String(row.id), contactName: String(row.name || "").trim() || phoneLike || "Contact" };
  }

  if (nameLike) {
    const rows = await (prisma as any).portalContact.findMany({
      where: { ownerId, nameKey: normalizeNameKey(nameLike) },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, name: true, email: true, phone: true },
    });
    if (rows?.length === 1) {
      return { kind: "ok", contactId: String(rows[0].id), contactName: String(rows[0].name || "").trim() || nameLike };
    }
    if (rows?.length > 1) {
      const list = rows
        .slice(0, 5)
        .map((r: any) => {
          const bits = [r.email ? `email: ${r.email}` : null, r.phone ? `phone: ${r.phone}` : null].filter(Boolean).join(" · ");
          return `- ${String(r.name || "(No name)").trim()}${bits ? ` (${bits})` : ""}`;
        })
        .join("\n");
      return { kind: "clarify", question: `I found multiple contacts named “${nameLike}”. Reply with the email or phone:\n\n${list}` };
    }
  }

  return { kind: "not_found", question: `I couldn’t find a contact for “${hint}”. Reply with their email or phone.` };
}

async function resolveContactTagId(opts: {
  ownerId: string;
  name: string;
  createIfMissing?: boolean;
}): Promise<{ kind: "ok"; tagId: string; tagName: string } | { kind: "missing"; message: string }> {
  const ownerId = String(opts.ownerId);
  const name = String(opts.name || "").trim().slice(0, 60);
  if (!name) return { kind: "missing", message: "Missing tag name." };

  const nameKey = normalizeNameKey(name);
  const row = await (prisma as any).portalContactTag
    .findFirst({ where: { ownerId, nameKey }, select: { id: true, name: true } })
    .catch(() => null);

  if (row?.id) return { kind: "ok", tagId: String(row.id), tagName: String(row.name) };

  if (opts.createIfMissing) {
    const created = await createOwnerContactTag({ ownerId, name }).catch(() => null);
    if (created?.id) return { kind: "ok", tagId: created.id, tagName: created.name };
  }

  return { kind: "missing", message: `No tag named “${name}” exists.` };
}

async function resolveInboxThreadId(opts: {
  ownerId: string;
  hint: string;
  channel?: "email" | "sms";
}): Promise<
  | { kind: "ok"; threadId: string; channel: "email" | "sms" }
  | { kind: "clarify"; question: string }
  | { kind: "not_found"; question: string }
> {
  const ownerId = String(opts.ownerId);
  const hint = String(opts.hint || "").trim();
  if (!hint) {
    return { kind: "clarify", question: "Which conversation should I use? Reply with the customer’s email or phone number." };
  }

  const emailLike = extractFirstEmailLike(hint);
  const smsLike = normalizeSmsPeerKey(hint);

  const channel =
    opts.channel === "sms" || opts.channel === "email"
      ? opts.channel
      : emailLike
        ? "email"
        : smsLike?.peerKey
          ? "sms"
          : null;

  if (!channel) {
    return {
      kind: "clarify",
      question: "Is this an email or SMS conversation? Reply with the email address or phone number.",
    };
  }

  await ensurePortalInboxSchema();

  if (channel === "sms") {
    if (smsLike?.error) {
      return {
        kind: "clarify",
        question: `That phone number looks invalid (${smsLike.error}). Reply with a valid number (including country code if needed).`,
      };
    }

    const peerKey = String(smsLike?.peerKey || "").trim();
    if (!peerKey) {
      return { kind: "clarify", question: "Which SMS conversation? Reply with the phone number (e.g. +15551231234)." };
    }

    const row = await (prisma as any).portalInboxThread
      .findFirst({
        where: { ownerId, channel: "SMS", peerKey },
        orderBy: { lastMessageAt: "desc" },
        select: { id: true },
      })
      .catch(() => null);

    if (row?.id) return { kind: "ok", threadId: String(row.id), channel: "sms" };
    return { kind: "not_found", question: `I couldn’t find an SMS conversation for “${hint}”. Reply with the phone number used in the thread.` };
  }

  // email
  if (!emailLike) {
    return { kind: "clarify", question: "Which email conversation? Reply with the customer’s email address." };
  }

  const peerKey = normalizeEmailKey(emailLike);
  if (!peerKey) {
    return { kind: "clarify", question: "That email address looks invalid. Reply with a valid email." };
  }

  const rows = (await (prisma as any).portalInboxThread
    .findMany({
      where: { ownerId, channel: "EMAIL", peerKey },
      orderBy: { lastMessageAt: "desc" },
      take: 5,
      select: { id: true, subject: true, lastMessagePreview: true, lastMessageAt: true },
    })
    .catch(() => [])) as any[];

  if (rows.length === 1) return { kind: "ok", threadId: String(rows[0].id), channel: "email" };
  if (rows.length > 1) {
    const list = rows
      .slice(0, 5)
      .map((r) => {
        const subject = String(r?.subject || "(no subject)").slice(0, 120);
        const preview = firstLinePreview(String(r?.lastMessagePreview || ""));
        const when = r?.lastMessageAt instanceof Date ? r.lastMessageAt.toLocaleString() : "";
        return `- ${subject}${when ? ` (${when})` : ""}${preview ? ` - ${preview}` : ""}`;
      })
      .join("\n");
    return {
      kind: "clarify",
      question: `I found multiple email threads with ${emailLike}. Reply with the subject line you mean:\n\n${list}`,
    };
  }

  return { kind: "not_found", question: `I couldn’t find an email conversation for ${emailLike}.` };
}

async function resolveFunnelId(opts: {
  ownerId: string;
  hint: string;
  url?: string;
  threadContext?: unknown;
}): Promise<
  | { kind: "ok"; funnelId: string; funnelName: string }
  | { kind: "clarify"; question: string }
  | { kind: "not_found"; question: string }
> {
  const ownerId = String(opts.ownerId);
  const hintRaw = String(opts.hint || "").trim();

  const fromUrl = extractFunnelIdFromUrl(opts.url);
  if (!hintRaw && fromUrl) {
    const row = await prisma.creditFunnel
      .findFirst({ where: { ownerId, id: fromUrl }, select: { id: true, name: true, slug: true } })
      .catch(() => null);
    if (row?.id) return { kind: "ok", funnelId: String(row.id), funnelName: String(row.name || row.slug || "Funnel") };
  }

  const last = !hintRaw ? getLastEntityId(opts.threadContext, "lastFunnel") : null;
  if (!hintRaw && last) {
    const row = await prisma.creditFunnel
      .findFirst({ where: { ownerId, id: last }, select: { id: true, name: true, slug: true } })
      .catch(() => null);
    if (row?.id) return { kind: "ok", funnelId: String(row.id), funnelName: String(row.name || row.slug || "Funnel") };
  }

  const hint = hintRaw.slice(0, 120);
  if (!hint) {
    return { kind: "clarify", question: "Which funnel should I use? Reply with the funnel name (or open it in Funnel Builder)." };
  }

  // If they pasted an ID, accept it.
  if (/^[a-z0-9]{20,40}$/i.test(hint) || hint.startsWith("c") || hint.startsWith("cl")) {
    const row = await prisma.creditFunnel.findFirst({ where: { ownerId, id: hint }, select: { id: true, name: true, slug: true } }).catch(() => null);
    if (row?.id) return { kind: "ok", funnelId: String(row.id), funnelName: String(row.name || row.slug || "Funnel") };
  }

  const rows = await prisma.creditFunnel
    .findMany({
      where: {
        ownerId,
        OR: [{ slug: hint }, { name: { contains: hint, mode: "insensitive" } }],
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { id: true, name: true, slug: true, updatedAt: true },
    })
    .catch(() => []);

  if (rows.length === 1) {
    return { kind: "ok", funnelId: String(rows[0]!.id), funnelName: String(rows[0]!.name || rows[0]!.slug || hint) };
  }

  if (rows.length > 1) {
    const list = rows
      .slice(0, 5)
      .map((r) => `- ${String(r.name || r.slug || "(no name)").trim()} (slug: ${String(r.slug)})`)
      .join("\n");
    return {
      kind: "clarify",
      question: `I found multiple funnels matching “${hint}”. Reply with the exact slug you mean:\n\n${list}`,
    };
  }

  return { kind: "not_found", question: `I couldn’t find a funnel matching “${hint}”. Reply with the funnel name or slug.` };
}

async function resolveAutomationId(opts: {
  ownerId: string;
  hint: string;
  url?: string;
  threadContext?: unknown;
}): Promise<
  | { kind: "ok"; automationId: string; automationName: string }
  | { kind: "clarify"; question: string }
  | { kind: "not_found"; question: string }
> {
  const ownerId = String(opts.ownerId);
  const hintRaw = String(opts.hint || "").trim();

  const fromUrl = extractAutomationIdFromUrl(opts.url);
  const last = !hintRaw ? getLastEntityId(opts.threadContext, "lastAutomation") : null;
  const idHint = (fromUrl || last || "").trim();

  const row = await prisma.portalServiceSetup
    .findUnique({ where: { ownerId_serviceSlug: { ownerId, serviceSlug: "automations" } }, select: { dataJson: true } })
    .catch(() => null);
  const dataJson = (row?.dataJson ?? null) as any;
  const list = Array.isArray(dataJson?.automations) ? (dataJson.automations as any[]) : [];

  if (!hintRaw && idHint) {
    const match = list.find((a) => String(a?.id || "").trim() === idHint);
    if (match?.id) return { kind: "ok", automationId: String(match.id), automationName: String(match.name || "Automation") };
  }

  const hint = hintRaw.slice(0, 120);
  if (!hint) {
    return { kind: "clarify", question: "Which automation should I use? Reply with the automation name (or open it in Automations)." };
  }

  // If they pasted an automation id, accept it.
  if (/^a_[a-z0-9]{10,}$/i.test(hint)) {
    const match = list.find((a) => String(a?.id || "").trim() === hint);
    if (match?.id) return { kind: "ok", automationId: String(match.id), automationName: String(match.name || "Automation") };
    return { kind: "not_found", question: `I couldn’t find that automation id (${hint}).` };
  }

  const wantKey = normalizeNameKey(hint);
  const matches = list
    .map((a) => ({ id: String(a?.id || "").trim(), name: String(a?.name || "").trim() }))
    .filter((a) => a.id && a.name)
    .filter((a) => normalizeNameKey(a.name) === wantKey)
    .slice(0, 6);

  if (matches.length === 1) return { kind: "ok", automationId: matches[0]!.id, automationName: matches[0]!.name };

  if (matches.length > 1) {
    const listText = matches.slice(0, 5).map((m) => `- ${m.name} (id: ${m.id})`).join("\n");
    return { kind: "clarify", question: `I found multiple automations named “${hint}”. Reply with the id you mean:\n\n${listText}` };
  }

  // Fallback: partial contains match.
  const contains = list
    .map((a) => ({ id: String(a?.id || "").trim(), name: String(a?.name || "").trim() }))
    .filter((a) => a.id && a.name)
    .filter((a) => a.name.toLowerCase().includes(hint.toLowerCase()))
    .slice(0, 6);

  if (contains.length === 1) return { kind: "ok", automationId: contains[0]!.id, automationName: contains[0]!.name };
  if (contains.length > 1) {
    const listText = contains.slice(0, 5).map((m) => `- ${m.name} (id: ${m.id})`).join("\n");
    return { kind: "clarify", question: `I found multiple automations matching “${hint}”. Reply with the exact name or id:\n\n${listText}` };
  }

  return { kind: "not_found", question: `I couldn’t find an automation matching “${hint}”. Reply with the exact automation name.` };
}

async function resolveBookingId(opts: {
  ownerId: string;
  hint: string;
  url?: string;
  threadContext?: unknown;
}): Promise<
  | { kind: "ok"; bookingId: string; label: string }
  | { kind: "clarify"; question: string }
  | { kind: "not_found"; question: string }
> {
  const ownerId = String(opts.ownerId);
  const hintRaw = String(opts.hint || "").trim();

  const fromUrl = extractBookingIdFromUrl(opts.url);
  if (!hintRaw && fromUrl) {
    const row = await prisma.portalBooking
      .findFirst({
        where: { id: fromUrl, site: { ownerId } },
        select: { id: true, startAt: true, contactName: true, contactEmail: true },
      })
      .catch(() => null);
    if (row?.id) {
      const when = row.startAt instanceof Date ? row.startAt.toLocaleString() : "";
      const label = `${String(row.contactName || "Booking").trim() || "Booking"}${when ? ` - ${when}` : ""}`;
      return { kind: "ok", bookingId: String(row.id), label };
    }
  }

  const last = !hintRaw ? getLastEntityId(opts.threadContext, "lastBooking") : null;
  if (!hintRaw && last) {
    const row = await prisma.portalBooking
      .findFirst({
        where: { id: last, site: { ownerId } },
        select: { id: true, startAt: true, contactName: true, contactEmail: true },
      })
      .catch(() => null);
    if (row?.id) {
      const when = row.startAt instanceof Date ? row.startAt.toLocaleString() : "";
      const label = `${String(row.contactName || "Booking").trim() || "Booking"}${when ? ` - ${when}` : ""}`;
      return { kind: "ok", bookingId: String(row.id), label };
    }
  }

  const hint = hintRaw.slice(0, 160);
  if (!hint) {
    return { kind: "clarify", question: "Which booking should I use? Reply with the customer’s email (or open the booking and try again)." };
  }

  // If they pasted an id, accept it.
  if (/^[a-z0-9]{20,40}$/i.test(hint)) {
    const row = await prisma.portalBooking
      .findFirst({ where: { id: hint, site: { ownerId } }, select: { id: true, startAt: true, contactName: true } })
      .catch(() => null);
    if (row?.id) {
      const when = row.startAt instanceof Date ? row.startAt.toLocaleString() : "";
      const label = `${String(row.contactName || "Booking").trim() || "Booking"}${when ? ` - ${when}` : ""}`;
      return { kind: "ok", bookingId: String(row.id), label };
    }
  }

  const emailLike = extractFirstEmailLike(hint);
  if (emailLike) {
    const rows = await prisma.portalBooking
      .findMany({
        where: { site: { ownerId }, contactEmail: { equals: emailLike, mode: "insensitive" } },
        orderBy: { startAt: "desc" },
        take: 6,
        select: { id: true, startAt: true, contactName: true, contactEmail: true },
      })
      .catch(() => []);
    if (rows.length === 1) {
      const r = rows[0]!;
      const when = r.startAt instanceof Date ? r.startAt.toLocaleString() : "";
      const label = `${String(r.contactName || "Booking").trim() || "Booking"}${when ? ` - ${when}` : ""}`;
      return { kind: "ok", bookingId: String(r.id), label };
    }
    if (rows.length > 1) {
      const list = rows
        .slice(0, 5)
        .map((r) => {
          const when = r.startAt instanceof Date ? r.startAt.toLocaleString() : "";
          return `- ${String(r.contactName || "Booking").trim() || "Booking"}${when ? ` - ${when}` : ""}`;
        })
        .join("\n");
      return { kind: "clarify", question: `I found multiple bookings for ${emailLike}. Reply with the date/time you mean, or paste the booking id:\n\n${list}` };
    }
  }

  // Name contains (bounded window to avoid returning ancient bookings).
  const now = new Date();
  const gte = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const lte = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const rows = await prisma.portalBooking
    .findMany({
      where: {
        site: { ownerId },
        startAt: { gte, lte },
        contactName: { contains: hint, mode: "insensitive" },
      },
      orderBy: { startAt: "desc" },
      take: 6,
      select: { id: true, startAt: true, contactName: true, contactEmail: true },
    })
    .catch(() => []);
  if (rows.length === 1) {
    const r = rows[0]!;
    const when = r.startAt instanceof Date ? r.startAt.toLocaleString() : "";
    const label = `${String(r.contactName || "Booking").trim() || "Booking"}${when ? ` - ${when}` : ""}`;
    return { kind: "ok", bookingId: String(r.id), label };
  }
  if (rows.length > 1) {
    const list = rows
      .slice(0, 5)
      .map((r) => {
        const when = r.startAt instanceof Date ? r.startAt.toLocaleString() : "";
        const email = String(r.contactEmail || "").trim();
        return `- ${String(r.contactName || "Booking").trim() || "Booking"}${when ? ` - ${when}` : ""}${email ? ` (${email})` : ""}`;
      })
      .join("\n");
    return { kind: "clarify", question: `I found multiple bookings matching “${hint}”. Reply with the customer’s email or the date/time:\n\n${list}` };
  }

  return { kind: "not_found", question: `I couldn’t find a booking matching “${hint}”. Reply with the customer’s email.` };
}

async function resolveBlogPostId(opts: {
  ownerId: string;
  hint: string;
  url?: string;
  threadContext?: unknown;
}): Promise<
  | { kind: "ok"; postId: string; postTitle: string }
  | { kind: "clarify"; question: string }
  | { kind: "not_found"; question: string }
> {
  const ownerId = String(opts.ownerId);
  const hintRaw = String(opts.hint || "").trim();

  const fromUrl = extractBlogPostIdFromUrl(opts.url);
  if (!hintRaw && fromUrl) {
    const row = await prisma.clientBlogPost
      .findFirst({ where: { id: fromUrl, site: { ownerId } }, select: { id: true, title: true, slug: true } })
      .catch(() => null);
    if (row?.id) return { kind: "ok", postId: String(row.id), postTitle: String(row.title || row.slug || "Blog post") };
  }

  const last = !hintRaw ? getLastEntityId(opts.threadContext, "lastBlogPost") : null;
  if (!hintRaw && last) {
    const row = await prisma.clientBlogPost
      .findFirst({ where: { id: last, site: { ownerId } }, select: { id: true, title: true, slug: true } })
      .catch(() => null);
    if (row?.id) return { kind: "ok", postId: String(row.id), postTitle: String(row.title || row.slug || "Blog post") };
  }

  const hint = hintRaw.slice(0, 140);
  if (!hint) {
    return { kind: "clarify", question: "Which blog post should I use? Reply with the post title (or open it in Blogs)." };
  }

  // If they pasted an id, accept it.
  if (/^[a-z0-9]{20,40}$/i.test(hint)) {
    const row = await prisma.clientBlogPost
      .findFirst({ where: { id: hint, site: { ownerId } }, select: { id: true, title: true, slug: true } })
      .catch(() => null);
    if (row?.id) return { kind: "ok", postId: String(row.id), postTitle: String(row.title || row.slug || "Blog post") };
  }

  const site = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true } }).catch(() => null);
  if (!site?.id) {
    return { kind: "not_found", question: "I couldn’t find your Blogs site yet. Open Blogs once in the portal and try again." };
  }

  const rows = await prisma.clientBlogPost
    .findMany({
      where: { siteId: site.id, OR: [{ slug: hint }, { title: { contains: hint, mode: "insensitive" } }] },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { id: true, title: true, slug: true },
    })
    .catch(() => []);

  if (rows.length === 1) {
    const r = rows[0]!;
    return { kind: "ok", postId: String(r.id), postTitle: String(r.title || r.slug || hint) };
  }
  if (rows.length > 1) {
    const list = rows
      .slice(0, 5)
      .map((r) => `- ${String(r.title || "(no title)").trim()} (slug: ${String(r.slug || "").trim()})`)
      .join("\n");
    return { kind: "clarify", question: `I found multiple posts matching “${hint}”. Reply with the exact slug you mean:\n\n${list}` };
  }

  return { kind: "not_found", question: `I couldn’t find a blog post matching “${hint}”. Reply with the exact post title.` };
}

async function resolveNewsletterId(opts: {
  ownerId: string;
  hint: string;
  url?: string;
  threadContext?: unknown;
}): Promise<
  | { kind: "ok"; newsletterId: string; newsletterTitle: string }
  | { kind: "clarify"; question: string }
  | { kind: "not_found"; question: string }
> {
  const ownerId = String(opts.ownerId);
  const hintRaw = String(opts.hint || "").trim();

  const site = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true } }).catch(() => null);
  if (!site?.id) {
    return { kind: "not_found", question: "I couldn’t find your site yet. Open Newsletter once in the portal and try again." };
  }

  const fromUrl = extractNewsletterIdFromUrl(opts.url);
  if (!hintRaw && fromUrl) {
    const row = await prisma.clientNewsletter
      .findFirst({ where: { id: fromUrl, siteId: site.id }, select: { id: true, title: true, slug: true, kind: true, status: true } })
      .catch(() => null);
    if (row?.id) return { kind: "ok", newsletterId: String(row.id), newsletterTitle: String(row.title || row.slug || "Newsletter") };
  }

  const last = !hintRaw ? getLastEntityId(opts.threadContext, "lastNewsletter") : null;
  if (!hintRaw && last) {
    const row = await prisma.clientNewsletter
      .findFirst({ where: { id: last, siteId: site.id }, select: { id: true, title: true, slug: true } })
      .catch(() => null);
    if (row?.id) return { kind: "ok", newsletterId: String(row.id), newsletterTitle: String(row.title || row.slug || "Newsletter") };
  }

  const hint = hintRaw.slice(0, 140);
  if (!hint) {
    return { kind: "clarify", question: "Which newsletter should I use? Reply with the newsletter title (or open it in Newsletter)." };
  }

  // If they pasted an id, accept it.
  if (/^[a-z0-9]{20,40}$/i.test(hint)) {
    const row = await prisma.clientNewsletter
      .findFirst({ where: { id: hint, siteId: site.id }, select: { id: true, title: true, slug: true } })
      .catch(() => null);
    if (row?.id) return { kind: "ok", newsletterId: String(row.id), newsletterTitle: String(row.title || row.slug || "Newsletter") };
  }

  const rows = await prisma.clientNewsletter
    .findMany({
      where: { siteId: site.id, OR: [{ slug: hint }, { title: { contains: hint, mode: "insensitive" } }] },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { id: true, title: true, slug: true, kind: true, status: true },
    })
    .catch(() => []);

  if (rows.length === 1) {
    const r = rows[0]!;
    return { kind: "ok", newsletterId: String(r.id), newsletterTitle: String(r.title || r.slug || hint) };
  }
  if (rows.length > 1) {
    const list = rows
      .slice(0, 5)
      .map((r) => `- [${String(r.kind)} / ${String(r.status)}] ${String(r.title || "(no title)").trim()} (slug: ${String(r.slug || "").trim()})`)
      .join("\n");
    return { kind: "clarify", question: `I found multiple newsletters matching “${hint}”. Reply with the exact slug you mean:\n\n${list}` };
  }

  return { kind: "not_found", question: `I couldn’t find a newsletter matching “${hint}”. Reply with the exact title or slug.` };
}

async function resolveMediaFolderId(opts: {
  ownerId: string;
  hint: string;
  url?: string;
  threadContext?: unknown;
}): Promise<
  | { kind: "ok"; folderId: string; folderName: string; folderTag: string }
  | { kind: "clarify"; question: string }
  | { kind: "not_found"; question: string }
> {
  const ownerId = String(opts.ownerId);
  const hintRaw = String(opts.hint || "").trim();

  const fromUrl = extractMediaFolderIdFromUrl(opts.url);
  if (!hintRaw && fromUrl) {
    const row = await prisma.portalMediaFolder.findFirst({ where: { ownerId, id: fromUrl }, select: { id: true, name: true, tag: true } }).catch(() => null);
    if (row?.id) return { kind: "ok", folderId: String(row.id), folderName: String(row.name || "Folder"), folderTag: String(row.tag || "") };
  }

  const last = !hintRaw ? getLastEntityId(opts.threadContext, "lastMediaFolder") : null;
  if (!hintRaw && last) {
    const row = await prisma.portalMediaFolder.findFirst({ where: { ownerId, id: last }, select: { id: true, name: true, tag: true } }).catch(() => null);
    if (row?.id) return { kind: "ok", folderId: String(row.id), folderName: String(row.name || "Folder"), folderTag: String(row.tag || "") };
  }

  const hint = hintRaw.slice(0, 140);
  if (!hint) {
    return { kind: "clarify", question: "Which Media Library folder should I use? Reply with the folder name (or open it in Media Library)." };
  }

  // If they pasted an id, accept it.
  if (/^[a-z0-9]{20,40}$/i.test(hint)) {
    const row = await prisma.portalMediaFolder.findFirst({ where: { ownerId, id: hint }, select: { id: true, name: true, tag: true } }).catch(() => null);
    if (row?.id) return { kind: "ok", folderId: String(row.id), folderName: String(row.name || "Folder"), folderTag: String(row.tag || "") };
  }

  // Try tag exact first (unique per owner).
  const byTag = await prisma.portalMediaFolder.findFirst({ where: { ownerId, tag: hint }, select: { id: true, name: true, tag: true } }).catch(() => null);
  if (byTag?.id) return { kind: "ok", folderId: String(byTag.id), folderName: String(byTag.name || hint), folderTag: String(byTag.tag || "") };

  const wantKey = normalizeNameKey(hint);
  const rows = await prisma.portalMediaFolder
    .findMany({
      where: {
        ownerId,
        OR: [{ nameKey: wantKey }, { name: { contains: hint, mode: "insensitive" } }, { tag: { contains: hint, mode: "insensitive" } }],
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { id: true, name: true, tag: true },
    })
    .catch(() => []);

  if (rows.length === 1) {
    const r = rows[0]!;
    return { kind: "ok", folderId: String(r.id), folderName: String(r.name || hint), folderTag: String(r.tag || "") };
  }
  if (rows.length > 1) {
    const list = rows
      .slice(0, 5)
      .map((r) => `- ${String(r.name || "(no name)").trim()} (tag: ${String(r.tag || "").trim()})`)
      .join("\n");
    return { kind: "clarify", question: `I found multiple folders matching “${hint}”. Reply with the exact tag you mean:\n\n${list}` };
  }

  return { kind: "not_found", question: `I couldn’t find a Media Library folder matching “${hint}”. Reply with the exact folder name.` };
}

async function resolveMediaItemId(opts: {
  ownerId: string;
  hint: string;
  url?: string;
  threadContext?: unknown;
}): Promise<
  | { kind: "ok"; itemId: string; fileName: string; tag: string }
  | { kind: "clarify"; question: string }
  | { kind: "not_found"; question: string }
> {
  const ownerId = String(opts.ownerId);
  const hintRaw = String(opts.hint || "").trim();

  const fromUrl = extractMediaItemIdFromUrl(opts.url);
  if (!hintRaw && fromUrl) {
    const row = await prisma.portalMediaItem.findFirst({ where: { ownerId, id: fromUrl }, select: { id: true, fileName: true, tag: true } }).catch(() => null);
    if (row?.id) return { kind: "ok", itemId: String(row.id), fileName: String(row.fileName || "Media item"), tag: String(row.tag || "") };
  }

  const last = !hintRaw ? getLastEntityId(opts.threadContext, "lastMediaItem") : null;
  if (!hintRaw && last) {
    const row = await prisma.portalMediaItem.findFirst({ where: { ownerId, id: last }, select: { id: true, fileName: true, tag: true } }).catch(() => null);
    if (row?.id) return { kind: "ok", itemId: String(row.id), fileName: String(row.fileName || "Media item"), tag: String(row.tag || "") };
  }

  const hint = hintRaw.slice(0, 180);
  if (!hint) {
    return { kind: "clarify", question: "Which Media Library item should I use? Reply with the filename or tag (or open it in Media Library)." };
  }

  // If they pasted an id, accept it.
  if (/^[a-z0-9]{20,40}$/i.test(hint)) {
    const row = await prisma.portalMediaItem.findFirst({ where: { ownerId, id: hint }, select: { id: true, fileName: true, tag: true } }).catch(() => null);
    if (row?.id) return { kind: "ok", itemId: String(row.id), fileName: String(row.fileName || "Media item"), tag: String(row.tag || "") };
  }

  // Try tag exact first (unique per owner).
  const byTag = await prisma.portalMediaItem.findFirst({ where: { ownerId, tag: hint }, select: { id: true, fileName: true, tag: true } }).catch(() => null);
  if (byTag?.id) return { kind: "ok", itemId: String(byTag.id), fileName: String(byTag.fileName || hint), tag: String(byTag.tag || "") };

  const folderIdFromUrl = extractMediaFolderIdFromUrl(opts.url);
  const baseWhere: any = {
    ownerId,
    OR: [{ fileName: { contains: hint, mode: "insensitive" } }, { tag: { contains: hint, mode: "insensitive" } }],
  };

  const rowsInFolder = folderIdFromUrl
    ? await prisma.portalMediaItem
        .findMany({ where: { ...baseWhere, folderId: folderIdFromUrl }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, fileName: true, tag: true } })
        .catch(() => [])
    : [];

  const rows = rowsInFolder.length
    ? rowsInFolder
    : await prisma.portalMediaItem
        .findMany({ where: baseWhere, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, fileName: true, tag: true } })
        .catch(() => []);

  if (rows.length === 1) {
    const r = rows[0]!;
    return { kind: "ok", itemId: String(r.id), fileName: String(r.fileName || hint), tag: String(r.tag || "") };
  }
  if (rows.length > 1) {
    const list = rows
      .slice(0, 5)
      .map((r) => `- ${String(r.fileName || "(no filename)").trim()} (tag: ${String(r.tag || "").trim()})`)
      .join("\n");
    return { kind: "clarify", question: `I found multiple media items matching “${hint}”. Reply with the exact tag you mean:\n\n${list}` };
  }

  return { kind: "not_found", question: `I couldn’t find a media item matching “${hint}”. Reply with the exact filename or tag.` };
}

async function resolveTaskId(opts: {
  ownerId: string;
  hint: string;
  url?: string;
  threadContext?: unknown;
}): Promise<
  | { kind: "ok"; taskId: string; taskTitle: string }
  | { kind: "clarify"; question: string }
  | { kind: "not_found"; question: string }
> {
  const ownerId = String(opts.ownerId);
  const hintRaw = String(opts.hint || "").trim();

  const fromUrl = extractTaskIdFromUrl(opts.url);
  if (!hintRaw && fromUrl) {
    const row = await prisma.portalTask.findFirst({ where: { ownerId, id: fromUrl }, select: { id: true, title: true, status: true } }).catch(() => null);
    if (row?.id) return { kind: "ok", taskId: String(row.id), taskTitle: String(row.title || "Task") };
  }

  const last = !hintRaw ? getLastEntityId(opts.threadContext, "lastTask") : null;
  if (!hintRaw && last) {
    const row = await prisma.portalTask.findFirst({ where: { ownerId, id: last }, select: { id: true, title: true } }).catch(() => null);
    if (row?.id) return { kind: "ok", taskId: String(row.id), taskTitle: String(row.title || "Task") };
  }

  const hint = hintRaw.slice(0, 200);
  if (!hint) {
    return { kind: "clarify", question: "Which task should I use? Reply with the task title (or open Tasks and tell me which one)." };
  }

  // If they pasted an id, accept it.
  if (/^[a-z0-9]{20,40}$/i.test(hint)) {
    const row = await prisma.portalTask.findFirst({ where: { ownerId, id: hint }, select: { id: true, title: true } }).catch(() => null);
    if (row?.id) return { kind: "ok", taskId: String(row.id), taskTitle: String(row.title || "Task") };
  }

  const rows = await prisma.portalTask
    .findMany({
      where: { ownerId, title: { contains: hint, mode: "insensitive" } },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { id: true, title: true, status: true, updatedAt: true },
    })
    .catch(() => []);

  if (rows.length === 1) {
    const r = rows[0]!;
    return { kind: "ok", taskId: String(r.id), taskTitle: String(r.title || hint) };
  }
  if (rows.length > 1) {
    const list = rows
      .slice(0, 5)
      .map((r) => {
        const when = r.updatedAt instanceof Date ? r.updatedAt.toLocaleString() : "";
        return `- [${String(r.status)}] ${String(r.title || "(no title)").trim()}${when ? ` - updated ${when}` : ""}`;
      })
      .join("\n");
    return { kind: "clarify", question: `I found multiple tasks matching “${hint}”. Reply with the exact title you mean, or paste the task id:\n\n${list}` };
  }

  return { kind: "not_found", question: `I couldn’t find a task matching “${hint}”. Reply with the exact task title.` };
}

async function resolveReviewId(opts: {
  ownerId: string;
  hint: string;
  url?: string;
  threadContext?: unknown;
}): Promise<
  | { kind: "ok"; reviewId: string; label: string }
  | { kind: "clarify"; question: string }
  | { kind: "not_found"; question: string }
> {
  const ownerId = String(opts.ownerId);
  const hintRaw = String(opts.hint || "").trim();

  const fromUrl = extractReviewIdFromUrl(opts.url);
  if (!hintRaw && fromUrl) {
    const row = await prisma.portalReview
      .findFirst({ where: { ownerId, id: fromUrl }, select: { id: true, name: true, rating: true, body: true } })
      .catch(() => null);
    if (row?.id) {
      const label = `${String(row.name || "Review").trim() || "Review"} (${Number(row.rating) || 0}★)`;
      return { kind: "ok", reviewId: String(row.id), label };
    }
  }

  const last = !hintRaw ? getLastEntityId(opts.threadContext, "lastReview") : null;
  if (!hintRaw && last) {
    const row = await prisma.portalReview
      .findFirst({ where: { ownerId, id: last }, select: { id: true, name: true, rating: true } })
      .catch(() => null);
    if (row?.id) {
      const label = `${String(row.name || "Review").trim() || "Review"} (${Number(row.rating) || 0}★)`;
      return { kind: "ok", reviewId: String(row.id), label };
    }
  }

  const hint = hintRaw.slice(0, 200);
  if (!hint) {
    return { kind: "clarify", question: "Which review should I use? Reply with the reviewer’s name, email, or a snippet of the review." };
  }

  // If they pasted an id, accept it.
  if (/^[a-z0-9]{20,40}$/i.test(hint)) {
    const row = await prisma.portalReview.findFirst({ where: { ownerId, id: hint }, select: { id: true, name: true, rating: true } }).catch(() => null);
    if (row?.id) {
      const label = `${String(row.name || "Review").trim() || "Review"} (${Number(row.rating) || 0}★)`;
      return { kind: "ok", reviewId: String(row.id), label };
    }
  }

  const emailLike = extractFirstEmailLike(hint);
  const phoneLike = normalizePhoneLike(hint);
  const phoneDigits = phoneLike ? phoneLike.replace(/\D+/g, "") : "";
  const phoneNeedle = phoneDigits.length >= 7 ? phoneDigits.slice(-10) : "";

  const rows = await prisma.portalReview
    .findMany({
      where: {
        ownerId,
        OR: [
          ...(emailLike ? [{ email: { equals: emailLike, mode: "insensitive" as const } }] : []),
          ...(phoneNeedle
            ? [
                { phone: { contains: phoneNeedle, mode: "insensitive" as const } },
                { phone: { contains: phoneNeedle.slice(-7), mode: "insensitive" as const } },
              ]
            : []),
          { name: { contains: hint, mode: "insensitive" } },
          { body: { contains: hint, mode: "insensitive" } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { id: true, name: true, rating: true, body: true, createdAt: true, email: true, phone: true },
    })
    .catch(() => []);

  if (rows.length === 1) {
    const r = rows[0]!;
    const label = `${String(r.name || "Review").trim() || "Review"} (${Number(r.rating) || 0}★)`;
    return { kind: "ok", reviewId: String(r.id), label };
  }

  if (rows.length > 1) {
    const list = rows
      .slice(0, 5)
      .map((r) => {
        const who = String(r.name || "(no name)").trim();
        const stars = `${Number(r.rating) || 0}★`;
        const preview = r.body ? ` - "${firstLinePreview(r.body)}"` : "";
        return `- ${who} (${stars})${preview} (id: ${String(r.id)})`;
      })
      .join("\n");
    return {
      kind: "clarify",
      question: `I found multiple reviews matching “${hint}”. Reply with the review id you mean:\n\n${list}`,
    };
  }

  return { kind: "not_found", question: `I couldn’t find a review matching “${hint}”. Reply with the reviewer’s name or email.` };
}

async function resolveReviewQuestionId(opts: {
  ownerId: string;
  hint: string;
  url?: string;
  threadContext?: unknown;
}): Promise<
  | { kind: "ok"; questionId: string; label: string }
  | { kind: "clarify"; question: string }
  | { kind: "not_found"; question: string }
> {
  const ownerId = String(opts.ownerId);
  const hintRaw = String(opts.hint || "").trim();

  const fromUrl = extractReviewQuestionIdFromUrl(opts.url);
  if (!hintRaw && fromUrl) {
    const row = await prisma.portalReviewQuestion
      .findFirst({ where: { ownerId, id: fromUrl }, select: { id: true, name: true, question: true } })
      .catch(() => null);
    if (row?.id) {
      const label = `${String(row.name || "Question").trim() || "Question"}: ${firstLinePreview(row.question)}`;
      return { kind: "ok", questionId: String(row.id), label };
    }
  }

  const last = !hintRaw ? getLastEntityId(opts.threadContext, "lastReviewQuestion") : null;
  if (!hintRaw && last) {
    const row = await prisma.portalReviewQuestion
      .findFirst({ where: { ownerId, id: last }, select: { id: true, name: true, question: true } })
      .catch(() => null);
    if (row?.id) {
      const label = `${String(row.name || "Question").trim() || "Question"}: ${firstLinePreview(row.question)}`;
      return { kind: "ok", questionId: String(row.id), label };
    }
  }

  const hint = hintRaw.slice(0, 200);
  if (!hint) {
    return { kind: "clarify", question: "Which review question should I use? Reply with the question text (or the question name)." };
  }

  // If they pasted an id, accept it.
  if (/^[a-z0-9]{20,40}$/i.test(hint)) {
    const row = await prisma.portalReviewQuestion
      .findFirst({ where: { ownerId, id: hint }, select: { id: true, name: true, question: true } })
      .catch(() => null);
    if (row?.id) {
      const label = `${String(row.name || "Question").trim() || "Question"}: ${firstLinePreview(row.question)}`;
      return { kind: "ok", questionId: String(row.id), label };
    }
  }

  const rows = await prisma.portalReviewQuestion
    .findMany({
      where: {
        ownerId,
        OR: [{ name: { contains: hint, mode: "insensitive" } }, { question: { contains: hint, mode: "insensitive" } }],
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { id: true, name: true, question: true, answeredAt: true },
    })
    .catch(() => []);

  if (rows.length === 1) {
    const r = rows[0]!;
    const label = `${String(r.name || "Question").trim() || "Question"}: ${firstLinePreview(r.question)}`;
    return { kind: "ok", questionId: String(r.id), label };
  }
  if (rows.length > 1) {
    const list = rows
      .slice(0, 5)
      .map((r) => {
        const name = String(r.name || "(no name)").trim();
        const q = firstLinePreview(r.question);
        const answered = r.answeredAt instanceof Date ? "answered" : "unanswered";
        return `- [${answered}] ${name}: ${q} (id: ${String(r.id)})`;
      })
      .join("\n");
    return { kind: "clarify", question: `I found multiple review questions matching “${hint}”. Reply with the question id you mean:\n\n${list}` };
  }

  return { kind: "not_found", question: `I couldn’t find a review question matching “${hint}”. Reply with the question text.` };
}

async function resolveNurtureCampaignId(opts: {
  ownerId: string;
  hint: string;
  url?: string;
  threadContext?: unknown;
}): Promise<
  | { kind: "ok"; campaignId: string; campaignName: string }
  | { kind: "clarify"; question: string }
  | { kind: "not_found"; question: string }
> {
  const ownerId = String(opts.ownerId);
  const hintRaw = String(opts.hint || "").trim();

  const fromUrl = extractNurtureCampaignIdFromUrl(opts.url);
  if (!hintRaw && fromUrl) {
    const row = await prisma.portalNurtureCampaign
      .findFirst({ where: { ownerId, id: fromUrl }, select: { id: true, name: true, status: true } })
      .catch(() => null);
    if (row?.id) return { kind: "ok", campaignId: String(row.id), campaignName: String(row.name || "Campaign") };
  }

  const last = !hintRaw ? getLastEntityId(opts.threadContext, "lastNurtureCampaign") : null;
  if (!hintRaw && last) {
    const row = await prisma.portalNurtureCampaign
      .findFirst({ where: { ownerId, id: last }, select: { id: true, name: true } })
      .catch(() => null);
    if (row?.id) return { kind: "ok", campaignId: String(row.id), campaignName: String(row.name || "Campaign") };
  }

  const hint = hintRaw.slice(0, 160);
  if (!hint) {
    return { kind: "clarify", question: "Which nurture campaign should I use? Reply with the campaign name." };
  }

  // If they pasted an id, accept it.
  if (/^[a-z0-9]{20,40}$/i.test(hint)) {
    const row = await prisma.portalNurtureCampaign.findFirst({ where: { ownerId, id: hint }, select: { id: true, name: true } }).catch(() => null);
    if (row?.id) return { kind: "ok", campaignId: String(row.id), campaignName: String(row.name || "Campaign") };
  }

  const rows = await prisma.portalNurtureCampaign
    .findMany({
      where: { ownerId, name: { contains: hint, mode: "insensitive" } },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { id: true, name: true, status: true, updatedAt: true },
    })
    .catch(() => []);

  if (rows.length === 1) {
    const r = rows[0]!;
    return { kind: "ok", campaignId: String(r.id), campaignName: String(r.name || hint) };
  }
  if (rows.length > 1) {
    const list = rows
      .slice(0, 5)
      .map((r) => {
        const when = r.updatedAt instanceof Date ? r.updatedAt.toLocaleString() : "";
        return `- [${String(r.status)}] ${String(r.name || "(no name)").trim()}${when ? ` - updated ${when}` : ""} (id: ${String(r.id)})`;
      })
      .join("\n");
    return { kind: "clarify", question: `I found multiple nurture campaigns matching “${hint}”. Reply with the campaign id you mean:\n\n${list}` };
  }

  return { kind: "not_found", question: `I couldn’t find a nurture campaign matching “${hint}”. Reply with the exact campaign name.` };
}

async function resolveNurtureStepId(opts: {
  ownerId: string;
  hint: string;
  url?: string;
  threadContext?: unknown;
  campaignIdHint?: string | null;
}): Promise<
  | { kind: "ok"; stepId: string; label: string; campaignId: string }
  | { kind: "clarify"; question: string }
  | { kind: "not_found"; question: string }
> {
  const ownerId = String(opts.ownerId);
  const hintRaw = String(opts.hint || "").trim();

  const fromUrl = extractNurtureStepIdFromUrl(opts.url);
  if (!hintRaw && fromUrl) {
    const row = await prisma.portalNurtureStep
      .findFirst({ where: { ownerId, id: fromUrl }, select: { id: true, ord: true, kind: true, subject: true, campaignId: true } })
      .catch(() => null);
    if (row?.id) {
      const label = `Step ${Number(row.ord) + 1} (${String(row.kind)}): ${firstLinePreview(row.subject || row.kind)}`;
      return { kind: "ok", stepId: String(row.id), label, campaignId: String(row.campaignId) };
    }
  }

  const last = !hintRaw ? getLastEntityId(opts.threadContext, "lastNurtureStep") : null;
  if (!hintRaw && last) {
    const row = await prisma.portalNurtureStep
      .findFirst({ where: { ownerId, id: last }, select: { id: true, ord: true, kind: true, subject: true, campaignId: true } })
      .catch(() => null);
    if (row?.id) {
      const label = `Step ${Number(row.ord) + 1} (${String(row.kind)}): ${firstLinePreview(row.subject || row.kind)}`;
      return { kind: "ok", stepId: String(row.id), label, campaignId: String(row.campaignId) };
    }
  }

  const hint = hintRaw.slice(0, 220);
  if (!hint) {
    return { kind: "clarify", question: "Which nurture step should I use? Reply with the step number (e.g. “step 2”) or a subject/snippet." };
  }

  const campaignId =
    String(opts.campaignIdHint || "").trim() ||
    extractNurtureCampaignIdFromUrl(opts.url) ||
    getLastEntityId(opts.threadContext, "lastNurtureCampaign") ||
    null;

  // If they pasted an id, accept it.
  if (/^[a-z0-9]{20,40}$/i.test(hint)) {
    const row = await prisma.portalNurtureStep
      .findFirst({ where: { ownerId, id: hint }, select: { id: true, ord: true, kind: true, subject: true, campaignId: true } })
      .catch(() => null);
    if (row?.id) {
      const label = `Step ${Number(row.ord) + 1} (${String(row.kind)}): ${firstLinePreview(row.subject || row.kind)}`;
      return { kind: "ok", stepId: String(row.id), label, campaignId: String(row.campaignId) };
    }
  }

  const stepNumMatch = /(?:^|\b)step\s*(\d{1,3})\b/i.exec(hint) || /(?:^|\b)(\d{1,3})\b/.exec(hint);
  const stepNum = stepNumMatch?.[1] ? Math.max(1, Math.min(999, Number(stepNumMatch[1]))) : null;

  if (stepNum && campaignId) {
    const ord0 = stepNum - 1;
    const row = await prisma.portalNurtureStep
      .findFirst({ where: { ownerId, campaignId, ord: ord0 }, select: { id: true, ord: true, kind: true, subject: true, campaignId: true } })
      .catch(() => null);
    if (row?.id) {
      const label = `Step ${Number(row.ord) + 1} (${String(row.kind)}): ${firstLinePreview(row.subject || row.kind)}`;
      return { kind: "ok", stepId: String(row.id), label, campaignId: String(row.campaignId) };
    }
  }

  if (stepNum && !campaignId) {
    return {
      kind: "clarify",
      question: `Which nurture campaign is step ${stepNum} in? Reply with the campaign name (or open the campaign and try again).`,
    };
  }

  const rows = await prisma.portalNurtureStep
    .findMany({
      where: {
        ownerId,
        ...(campaignId ? { campaignId } : {}),
        OR: [{ subject: { contains: hint, mode: "insensitive" } }, { body: { contains: hint, mode: "insensitive" } }],
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { id: true, ord: true, kind: true, subject: true, campaignId: true },
    })
    .catch(() => []);

  if (rows.length === 1) {
    const r = rows[0]!;
    const label = `Step ${Number(r.ord) + 1} (${String(r.kind)}): ${firstLinePreview(r.subject || r.kind)}`;
    return { kind: "ok", stepId: String(r.id), label, campaignId: String(r.campaignId) };
  }

  if (rows.length > 1) {
    const list = rows
      .slice(0, 5)
      .map((r) => `- Step ${Number(r.ord) + 1} (${String(r.kind)}): ${firstLinePreview(r.subject || r.kind)} (id: ${String(r.id)})`)
      .join("\n");
    return { kind: "clarify", question: `I found multiple nurture steps matching “${hint}”. Reply with the step id you mean:\n\n${list}` };
  }

  return { kind: "not_found", question: `I couldn’t find a nurture step matching “${hint}”. Reply with “step 1/2/3…” or a snippet of the step subject.` };
}

function normalizeDomainLike(raw: string): string | null {
  let s = String(raw || "").trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  s = (s.split("/")[0] || "").trim();
  s = (s.split("?")[0] || "").trim();
  s = (s.split("#")[0] || "").trim();
  if (!s || s.includes(" ")) return null;
  if (!/\.[a-z]{2,}$/i.test(s)) return null;
  return s.slice(0, 140);
}

async function resolveScrapedLeadId(opts: {
  ownerId: string;
  hint: string;
  url?: string;
  threadContext?: unknown;
}): Promise<
  | { kind: "ok"; leadId: string; label: string }
  | { kind: "clarify"; question: string }
  | { kind: "not_found"; question: string }
> {
  const ownerId = String(opts.ownerId);
  const hintRaw = String(opts.hint || "").trim();

  const fromUrl = extractScrapedLeadIdFromUrl(opts.url);
  if (!hintRaw && fromUrl) {
    const row = await prisma.portalLead
      .findFirst({ where: { ownerId, id: fromUrl }, select: { id: true, businessName: true, email: true, phone: true } })
      .catch(() => null);
    if (row?.id) {
      const label = String(row.businessName || "Lead").trim() || "Lead";
      return { kind: "ok", leadId: String(row.id), label };
    }
  }

  const last = !hintRaw ? getLastEntityId(opts.threadContext, "lastScrapedLead") : null;
  if (!hintRaw && last) {
    const row = await prisma.portalLead
      .findFirst({ where: { ownerId, id: last }, select: { id: true, businessName: true, email: true, phone: true } })
      .catch(() => null);
    if (row?.id) {
      const label = String(row.businessName || "Lead").trim() || "Lead";
      return { kind: "ok", leadId: String(row.id), label };
    }
  }

  const hint = hintRaw.slice(0, 200);
  if (!hint) {
    return { kind: "clarify", question: "Which scraped lead should I use? Reply with the business name, email, phone, or website." };
  }

  // If they pasted an id, accept it.
  if (/^[a-z0-9]{20,40}$/i.test(hint)) {
    const row = await prisma.portalLead.findFirst({ where: { ownerId, id: hint }, select: { id: true, businessName: true } }).catch(() => null);
    if (row?.id) {
      const label = String(row.businessName || "Lead").trim() || "Lead";
      return { kind: "ok", leadId: String(row.id), label };
    }
  }

  const emailLike = extractFirstEmailLike(hint);
  const phoneLike = normalizePhoneLike(hint);
  const phoneDigits = phoneLike ? phoneLike.replace(/\D+/g, "") : "";
  const phoneNeedle = phoneDigits.length >= 7 ? phoneDigits.slice(-10) : "";
  const domain = normalizeDomainLike(hint);

  const rows = await prisma.portalLead
    .findMany({
      where: {
        ownerId,
        OR: [
          ...(emailLike ? [{ email: { equals: emailLike, mode: "insensitive" as const } }] : []),
          ...(phoneNeedle
            ? [
                { phone: { contains: phoneNeedle, mode: "insensitive" as const } },
                { phone: { contains: phoneNeedle.slice(-7), mode: "insensitive" as const } },
              ]
            : []),
          ...(domain ? [{ website: { contains: domain, mode: "insensitive" as const } }] : []),
          { businessName: { contains: hint, mode: "insensitive" } },
        ],
      },
      orderBy: [{ starred: "desc" }, { createdAt: "desc" }],
      take: 6,
      select: { id: true, businessName: true, email: true, phone: true, website: true, starred: true, createdAt: true },
    })
    .catch(() => []);

  if (rows.length === 1) {
    const r = rows[0]!;
    const label = String(r.businessName || hint).trim() || "Lead";
    return { kind: "ok", leadId: String(r.id), label };
  }
  if (rows.length > 1) {
    const list = rows
      .slice(0, 5)
      .map((r) => {
        const bits = [r.email ? `email: ${r.email}` : null, r.phone ? `phone: ${r.phone}` : null, r.website ? `site: ${r.website}` : null]
          .filter(Boolean)
          .join(" · ");
        return `- ${String(r.businessName || "(no name)").trim()}${r.starred ? " ★" : ""}${bits ? ` (${bits})` : ""} (id: ${String(r.id)})`;
      })
      .join("\n");
    return { kind: "clarify", question: `I found multiple leads matching “${hint}”. Reply with the lead id you mean:\n\n${list}` };
  }

  return { kind: "not_found", question: `I couldn’t find a scraped lead matching “${hint}”. Reply with the business name, email, or website.` };
}

async function resolveCreditPullId(opts: {
  ownerId: string;
  hint: string;
  url?: string;
  threadContext?: unknown;
  contactIdHint?: string | null;
}): Promise<
  | { kind: "ok"; pullId: string; label: string }
  | { kind: "clarify"; question: string }
  | { kind: "not_found"; question: string }
> {
  const ownerId = String(opts.ownerId);
  const hint = String(opts.hint || "").trim();

  const fromUrl = extractCreditPullIdFromUrl(opts.url);
  if (fromUrl) return { kind: "ok", pullId: fromUrl, label: fromUrl };

  const lastId = getLastEntityId(opts.threadContext, "lastCreditPull");
  if ((!hint || /\b(last|latest|recent)\b/i.test(hint)) && lastId) return { kind: "ok", pullId: lastId, label: "Last credit pull" };

  if (looksLikeId(hint)) return { kind: "ok", pullId: hint.slice(0, 120), label: hint.slice(0, 40) };

  const contactId = opts.contactIdHint ? String(opts.contactIdHint).trim() : "";
  const rows = await (prisma as any).creditPull.findMany({
    where: { ownerId, ...(contactId ? { contactId } : {}) },
    orderBy: { requestedAt: "desc" },
    take: 5,
    select: { id: true, provider: true, status: true, requestedAt: true, contact: { select: { name: true, email: true } } },
  });

  if (!rows?.length) {
    return { kind: "not_found", question: "I couldn’t find a credit pull. Reply with which contact (or pull id) to use." };
  }

  if (rows.length === 1) {
    const r = rows[0];
    const who = String(r?.contact?.name || "").trim();
    const label = [who ? `for ${who}` : null, r.provider ? `via ${r.provider}` : null, r.status ? String(r.status) : null].filter(Boolean).join(" · ");
    return { kind: "ok", pullId: String(r.id), label: label || "Credit pull" };
  }

  const list = rows
    .map((r: any) => {
      const who = String(r?.contact?.name || "").trim();
      const bits = [who ? `for ${who}` : null, r.provider ? `via ${r.provider}` : null, r.status ? String(r.status) : null].filter(Boolean).join(" · ");
      return `- ${String(r.id).slice(0, 8)}…${bits ? ` (${bits})` : ""}`;
    })
    .join("\n");

  return { kind: "clarify", question: `Which credit pull should I use? Reply with the pull id:\n\n${list}` };
}

async function resolveCreditDisputeLetterId(opts: {
  ownerId: string;
  hint: string;
  url?: string;
  threadContext?: unknown;
  contactIdHint?: string | null;
}): Promise<
  | { kind: "ok"; letterId: string; label: string }
  | { kind: "clarify"; question: string }
  | { kind: "not_found"; question: string }
> {
  const ownerId = String(opts.ownerId);
  const hint = String(opts.hint || "").trim();

  const fromUrl = extractCreditDisputeLetterIdFromUrl(opts.url);
  if (fromUrl) return { kind: "ok", letterId: fromUrl, label: fromUrl };

  const lastId = getLastEntityId(opts.threadContext, "lastCreditDisputeLetter");
  if ((!hint || /\b(last|latest|recent)\b/i.test(hint)) && lastId) return { kind: "ok", letterId: lastId, label: "Last dispute letter" };

  if (looksLikeId(hint)) return { kind: "ok", letterId: hint.slice(0, 120), label: hint.slice(0, 40) };

  const contactId = opts.contactIdHint ? String(opts.contactIdHint).trim() : "";
  const rows = await (prisma as any).creditDisputeLetter.findMany({
    where: { ownerId, ...(contactId ? { contactId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { id: true, subject: true, status: true, createdAt: true, contact: { select: { name: true, email: true } } },
  });

  if (!rows?.length) {
    return { kind: "not_found", question: "I couldn’t find a dispute letter. Reply with which contact (or letter id) to use." };
  }

  const hk = normKey(hint);
  const filtered = hk
    ? rows.filter((r: any) => {
        const subj = normKey(r.subject);
        const who = normKey(r?.contact?.name || "");
        return (subj && subj.includes(hk)) || (who && who.includes(hk));
      })
    : rows;

  const pick = (filtered.length === 1 ? filtered : rows.length === 1 ? rows : null)?.[0] || null;
  if (pick) {
    const who = String(pick?.contact?.name || "").trim();
    const bits = [who ? `for ${who}` : null, pick.status ? String(pick.status) : null].filter(Boolean).join(" · ");
    return { kind: "ok", letterId: String(pick.id), label: (String(pick.subject || "").trim() || "Dispute letter") + (bits ? ` (${bits})` : "") };
  }

  const list = filtered
    .slice(0, 6)
    .map((r: any) => {
      const who = String(r?.contact?.name || "").trim();
      const bits = [who ? `for ${who}` : null, r.status ? String(r.status) : null].filter(Boolean).join(" · ");
      const subject = String(r.subject || "").trim().slice(0, 60) || "(No subject)";
      return `- ${String(r.id).slice(0, 8)}… ${subject}${bits ? ` (${bits})` : ""}`;
    })
    .join("\n");

  return { kind: "clarify", question: `Which dispute letter do you mean? Reply with the letter id:\n\n${list}` };
}

async function resolveCreditReportId(opts: {
  ownerId: string;
  hint: string;
  url?: string;
  threadContext?: unknown;
  contactIdHint?: string | null;
}): Promise<
  | { kind: "ok"; reportId: string; label: string }
  | { kind: "clarify"; question: string }
  | { kind: "not_found"; question: string }
> {
  const ownerId = String(opts.ownerId);
  const hint = String(opts.hint || "").trim();

  const fromUrl = extractCreditReportIdFromUrl(opts.url);
  if (fromUrl) return { kind: "ok", reportId: fromUrl, label: fromUrl };

  const lastId = getLastEntityId(opts.threadContext, "lastCreditReport");
  if ((!hint || /\b(last|latest|recent)\b/i.test(hint)) && lastId) return { kind: "ok", reportId: lastId, label: "Last credit report" };

  if (looksLikeId(hint)) return { kind: "ok", reportId: hint.slice(0, 120), label: hint.slice(0, 40) };

  const contactId = opts.contactIdHint ? String(opts.contactIdHint).trim() : "";
  const rows = await (prisma as any).creditReport.findMany({
    where: { ownerId, ...(contactId ? { contactId } : {}) },
    orderBy: { importedAt: "desc" },
    take: 8,
    select: { id: true, provider: true, importedAt: true, contact: { select: { name: true, email: true } }, _count: { select: { items: true } } },
  });

  if (!rows?.length) {
    return { kind: "not_found", question: "I couldn’t find a credit report. Reply with which contact (or report id) to use." };
  }

  const hk = normKey(hint);
  const filtered = hk
    ? rows.filter((r: any) => {
        const prov = normKey(r.provider);
        const who = normKey(r?.contact?.name || "");
        return (prov && prov.includes(hk)) || (who && who.includes(hk));
      })
    : rows;

  const pick = (filtered.length === 1 ? filtered : rows.length === 1 ? rows : null)?.[0] || null;
  if (pick) {
    const who = String(pick?.contact?.name || "").trim();
    const bits = [who ? `for ${who}` : null, pick.provider ? `via ${pick.provider}` : null, typeof pick?._count?.items === "number" ? `${pick._count.items} items` : null]
      .filter(Boolean)
      .join(" · ");
    return { kind: "ok", reportId: String(pick.id), label: bits || "Credit report" };
  }

  const list = filtered
    .slice(0, 6)
    .map((r: any) => {
      const who = String(r?.contact?.name || "").trim();
      const bits = [who ? `for ${who}` : null, r.provider ? `via ${r.provider}` : null, typeof r?._count?.items === "number" ? `${r._count.items} items` : null]
        .filter(Boolean)
        .join(" · ");
      return `- ${String(r.id).slice(0, 8)}…${bits ? ` (${bits})` : ""}`;
    })
    .join("\n");

  return { kind: "clarify", question: `Which credit report do you mean? Reply with the report id:\n\n${list}` };
}

async function resolveCreditReportItemId(opts: {
  ownerId: string;
  hint: string;
  url?: string;
  threadContext?: unknown;
  reportIdHint?: string | null;
}): Promise<
  | { kind: "ok"; itemId: string; label: string; reportId: string }
  | { kind: "clarify"; question: string }
  | { kind: "not_found"; question: string }
> {
  const hint = String(opts.hint || "").trim();

  const fromUrl = extractCreditReportItemIdFromUrl(opts.url);
  const reportIdFromUrl = extractCreditReportIdFromUrl(opts.url);
  if (fromUrl && reportIdFromUrl) return { kind: "ok", itemId: fromUrl, label: fromUrl, reportId: reportIdFromUrl };

  const lastObj = getLastEntityObj(opts.threadContext, "lastCreditReportItem");
  const lastItemId = lastObj ? String((lastObj as any).id || "").trim() : "";
  const lastReportId = lastObj ? String((lastObj as any).reportId || "").trim() : "";
  const reportIdHint = opts.reportIdHint ? String(opts.reportIdHint).trim() : "";
  if ((!hint || /\b(last|latest|recent)\b/i.test(hint)) && lastItemId && (!reportIdHint || reportIdHint === lastReportId)) {
    return { kind: "ok", itemId: lastItemId.slice(0, 120), label: "Last report item", reportId: reportIdHint || lastReportId };
  }

  if (looksLikeId(hint) && reportIdHint) return { kind: "ok", itemId: hint.slice(0, 120), label: hint.slice(0, 40), reportId: reportIdHint };

  const reportId = reportIdHint || lastReportId;
  if (!reportId) {
    return { kind: "clarify", question: "Which credit report item should I update? Reply with the report id (or open the report first)." };
  }

  const rows = await (prisma as any).creditReportItem.findMany({
    where: { reportId },
    orderBy: { updatedAt: "desc" },
    take: 12,
    select: { id: true, label: true, bureau: true, kind: true, auditTag: true, disputeStatus: true, updatedAt: true },
  });

  if (!rows?.length) return { kind: "not_found", question: "I couldn’t find any items for that report." };

  const hk = normKey(hint);
  const filtered = hk
    ? rows.filter((r: any) => {
        const label = normKey(r.label);
        const bureau = normKey(r.bureau || "");
        return (label && label.includes(hk)) || (bureau && bureau.includes(hk));
      })
    : rows;

  if (filtered.length === 1) return { kind: "ok", itemId: String(filtered[0].id), label: String(filtered[0].label || "Item"), reportId };
  if (rows.length === 1) return { kind: "ok", itemId: String(rows[0].id), label: String(rows[0].label || "Item"), reportId };

  const list = filtered
    .slice(0, 6)
    .map((r: any) => {
      const bits = [r.bureau ? String(r.bureau) : null, r.auditTag ? String(r.auditTag) : null].filter(Boolean).join(" · ");
      return `- ${String(r.id).slice(0, 8)}… ${String(r.label || "(No label)").slice(0, 60)}${bits ? ` (${bits})` : ""}`;
    })
    .join("\n");

  return { kind: "clarify", question: `Which report item do you mean? Reply with the item id:\n\n${list}` };
}

async function resolvePortalUserId(opts: {
  ownerId: string;
  hint: string;
  url?: string;
  threadContext?: unknown;
}): Promise<
  | { kind: "ok"; userId: string; label: string }
  | { kind: "clarify"; question: string }
  | { kind: "not_found"; question: string }
> {
  const ownerId = String(opts.ownerId);
  const hint = String(opts.hint || "").trim();

  const fromUrl = extractUserIdFromUrl(opts.url);
  if (fromUrl) return { kind: "ok", userId: fromUrl, label: fromUrl };

  const lastId = getLastEntityId(opts.threadContext, "lastUser");
  if ((!hint || /\b(last|latest|recent)\b/i.test(hint)) && lastId) return { kind: "ok", userId: lastId, label: "Last user" };

  if (!hint) return { kind: "clarify", question: "Which user do you mean? Reply with their email address." };
  if (looksLikeId(hint)) return { kind: "ok", userId: hint.slice(0, 120), label: hint.slice(0, 40) };

  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, email: true, name: true } }).catch(() => null);
  const members = await listPortalAccountMembers(ownerId).catch(() => [] as any[]);
  const merged = [
    ...(owner
      ? [
          {
            userId: owner.id,
            user: { id: owner.id, email: owner.email, name: owner.name },
            role: "OWNER",
          },
        ]
      : []),
    ...members.map((m: any) => ({ userId: m.userId, user: m.user, role: m.role })),
  ].filter((m, idx, arr) => arr.findIndex((x) => x.userId === m.userId) === idx);

  const emailLike = extractFirstEmailLike(hint);
  const hk = normKey(hint);
  const filtered = merged.filter((m: any) => {
    const email = String(m?.user?.email || "").toLowerCase().trim();
    const name = normKey(m?.user?.name || "");
    if (emailLike && email && email === emailLike.toLowerCase()) return true;
    if (hk && name && name.includes(hk)) return true;
    if (hk && email && email.includes(hk.replace(/\s+/g, ""))) return true;
    return false;
  });

  const rows = filtered.length ? filtered : merged;
  if (rows.length === 1) {
    const u = rows[0];
    const email = String(u?.user?.email || "").trim();
    const name = String(u?.user?.name || "").trim();
    return { kind: "ok", userId: String(u.userId), label: name || email || "User" };
  }

  const list = rows
    .slice(0, 8)
    .map((m: any) => {
      const email = String(m?.user?.email || "").trim();
      const name = String(m?.user?.name || "").trim();
      const role = String(m?.role || "").trim();
      return `- ${name || email || "(unknown)"}${role ? ` (${role})` : ""} - ${String(m.userId).slice(0, 8)}...`;
    })
    .join("\n");

  return { kind: "clarify", question: `Which user should I use? Reply with their email or user id:\n\n${list}` };
}

async function resolveFunnelFormId(opts: {
  ownerId: string;
  hint: string;
  url?: string;
  threadContext?: unknown;
}): Promise<
  | { kind: "ok"; formId: string; label: string }
  | { kind: "clarify"; question: string; choices?: AssistantChoice[] }
  | { kind: "not_found"; question: string; choices?: AssistantChoice[] }
> {
  const ownerId = String(opts.ownerId);
  const hint = String(opts.hint || "").trim();

  const fromUrl = extractFunnelFormIdFromUrl(opts.url);
  if (fromUrl) return { kind: "ok", formId: fromUrl, label: fromUrl };

  const lastId = getLastEntityId(opts.threadContext, "lastFunnelForm");
  if ((!hint || /\b(last|latest|recent)\b/i.test(hint)) && lastId) return { kind: "ok", formId: lastId, label: "Last form" };

  if (!hint) return { kind: "clarify", question: "Which form do you mean? Reply with the form name or slug." };
  if (looksLikeId(hint)) return { kind: "ok", formId: hint.slice(0, 120), label: hint.slice(0, 40) };

  const hk = normKey(hint);
  const rows = await prisma.creditForm
    .findMany({ where: { ownerId }, orderBy: { updatedAt: "desc" }, take: 8, select: { id: true, name: true, slug: true, status: true } })
    .catch(() => [] as any[]);

  if (!rows.length) return { kind: "not_found", question: "I couldn’t find any forms." };

  const filtered = hk
    ? rows.filter((r: any) => {
        const name = normKey(r.name);
        const slug = normKey(r.slug);
        return (name && name.includes(hk)) || (slug && slug.includes(hk));
      })
    : rows;

  if (filtered.length === 1) {
    const r = filtered[0];
    return { kind: "ok", formId: String(r.id), label: String(r.name || r.slug || "Form") };
  }

  if (hintMeansAny(hint) && filtered.length) {
    const r = filtered[0];
    return { kind: "ok", formId: String(r.id), label: String(r.name || r.slug || "Form") };
  }

  const choices: AssistantChoice[] = filtered
    .slice(0, 6)
    .map((r: any) => ({
      type: "entity",
      kind: "funnel_form",
      value: String(r.id),
      label: String(r.name || r.slug || "Form"),
      description: r.status ? String(r.status) : undefined,
    }));

  return { kind: "clarify", question: "Which form should I use?", choices };
}

async function resolveFunnelPageId(opts: {
  ownerId: string;
  hint: string;
  url?: string;
  threadContext?: unknown;
  funnelIdHint?: string | null;
}): Promise<
  | { kind: "ok"; pageId: string; label: string; funnelId: string }
  | { kind: "clarify"; question: string; choices?: AssistantChoice[] }
  | { kind: "not_found"; question: string; choices?: AssistantChoice[] }
> {
  const hint = String(opts.hint || "").trim();

  const fromUrl = extractFunnelPageIdFromUrl(opts.url);
  const funnelIdFromUrl = extractFunnelIdFromUrl(opts.url);
  if (fromUrl && funnelIdFromUrl) return { kind: "ok", pageId: fromUrl, label: fromUrl, funnelId: funnelIdFromUrl };

  const lastObj = getLastEntityObj(opts.threadContext, "lastFunnelPage");
  const lastPageId = lastObj ? String((lastObj as any).id || "").trim() : "";
  const lastFunnelId = lastObj ? String((lastObj as any).funnelId || "").trim() : "";
  const funnelIdHint = opts.funnelIdHint ? String(opts.funnelIdHint).trim() : "";
  if ((!hint || /\b(last|latest|recent)\b/i.test(hint)) && lastPageId && (!funnelIdHint || funnelIdHint === lastFunnelId)) {
    return { kind: "ok", pageId: lastPageId.slice(0, 120), label: "Last page", funnelId: funnelIdHint || lastFunnelId };
  }

  const funnelId = funnelIdHint || lastFunnelId || getLastEntityId(opts.threadContext, "lastFunnel") || "";
  if (!funnelId) {
    return { kind: "clarify", question: "Which funnel should I pull the page from? Open the funnel first (or tell me the funnel name)." };
  }

  if (looksLikeId(hint)) return { kind: "ok", pageId: hint.slice(0, 120), label: hint.slice(0, 40), funnelId };

  const rows = await prisma.creditFunnelPage
    .findMany({ where: { funnelId }, orderBy: { sortOrder: "asc" }, take: 50, select: { id: true, slug: true, title: true } })
    .catch(() => [] as any[]);
  if (!rows.length) return { kind: "not_found", question: "I couldn’t find any pages for that funnel." };

  const hk = normKey(hint);
  const filtered = hk
    ? rows.filter((r: any) => {
        const slug = normKey(r.slug);
        const title = normKey(r.title);
        return (slug && slug.includes(hk)) || (title && title.includes(hk));
      })
    : rows;

  if (filtered.length === 1) {
    const r = filtered[0];
    return { kind: "ok", pageId: String(r.id), label: String(r.title || r.slug || "Page"), funnelId };
  }

  // If the user says "any" / "doesn't matter", auto-pick the first match.
  if (hintMeansAny(hint) && filtered.length) {
    const r = filtered[0];
    return { kind: "ok", pageId: String(r.id), label: String(r.title || r.slug || "Page"), funnelId };
  }

  const choices: AssistantChoice[] = filtered
    .slice(0, 8)
    .map((r: any) => ({
      type: "entity",
      kind: "funnel_page",
      value: String(r.id),
      label: String(r.title || r.slug || "Page"),
      description: r.slug ? `/${String(r.slug)}` : undefined,
    }));

  return { kind: "clarify", question: "Which page should I use?", choices };
}

async function resolveCustomDomainId(opts: {
  ownerId: string;
  hint: string;
  url?: string;
  threadContext?: unknown;
}): Promise<
  | { kind: "ok"; domainId: string; label: string }
  | { kind: "clarify"; question: string; choices?: AssistantChoice[] }
  | { kind: "not_found"; question: string; choices?: AssistantChoice[] }
> {
  const ownerId = String(opts.ownerId);
  const hint = String(opts.hint || "").trim();

  const fromUrl = extractCustomDomainIdFromUrl(opts.url);
  if (fromUrl) return { kind: "ok", domainId: fromUrl, label: fromUrl };

  const lastId = getLastEntityId(opts.threadContext, "lastCustomDomain");
  if ((!hint || /\b(last|latest|recent)\b/i.test(hint)) && lastId) return { kind: "ok", domainId: lastId, label: "Last custom domain" };

  if (!hint) return { kind: "clarify", question: "Which custom domain do you mean? Reply with the domain name." };
  if (looksLikeId(hint)) return { kind: "ok", domainId: hint.slice(0, 120), label: hint.slice(0, 40) };

  const hk = normKey(hint).replace(/\s+/g, "");
  const rows = await prisma.creditCustomDomain
    .findMany({ where: { ownerId }, orderBy: { updatedAt: "desc" }, take: 10, select: { id: true, domain: true, status: true } })
    .catch(() => [] as any[]);
  if (!rows.length) return { kind: "not_found", question: "I couldn’t find any custom domains." };

  const filtered = hk
    ? rows.filter((r: any) => normKey(r.domain).replace(/\s+/g, "").includes(hk))
    : rows;

  if (filtered.length === 1) {
    const r = filtered[0];
    return { kind: "ok", domainId: String(r.id), label: String(r.domain || "Domain") };
  }

  if (hintMeansAny(hint) && filtered.length) {
    const r = filtered[0];
    return { kind: "ok", domainId: String(r.id), label: String(r.domain || "Domain") };
  }

  const choices: AssistantChoice[] = filtered
    .slice(0, 8)
    .map((r: any) => ({
      type: "entity",
      kind: "custom_domain",
      value: String(r.id),
      label: String(r.domain || "Domain"),
      description: r.status ? String(r.status) : undefined,
    }));

  return { kind: "clarify", question: "Which custom domain should I use?", choices };
}

async function resolveAiOutboundCallsCampaignId(opts: {
  ownerId: string;
  hint: string;
  url?: string;
  threadContext?: unknown;
}): Promise<
  | { kind: "ok"; campaignId: string; label: string }
  | { kind: "clarify"; question: string }
  | { kind: "not_found"; question: string }
> {
  const ownerId = String(opts.ownerId);
  const hint = String(opts.hint || "").trim();

  const fromUrl = extractAiOutboundCallsCampaignIdFromUrl(opts.url);
  if (fromUrl) return { kind: "ok", campaignId: fromUrl, label: fromUrl };

  const lastId = getLastEntityId(opts.threadContext, "lastAiOutboundCallsCampaign");
  if ((!hint || /\b(last|latest|recent)\b/i.test(hint)) && lastId) return { kind: "ok", campaignId: lastId, label: "Last AI outbound campaign" };

  if (!hint) return { kind: "clarify", question: "Which AI outbound calls campaign do you mean? Reply with the campaign name." };
  if (looksLikeId(hint)) return { kind: "ok", campaignId: hint.slice(0, 120), label: hint.slice(0, 40) };

  const rows = await (prisma as any).portalAiOutboundCallCampaign
    .findMany({ where: { ownerId }, orderBy: { updatedAt: "desc" }, take: 10, select: { id: true, name: true, status: true, updatedAt: true } })
    .catch(() => [] as any[]);
  if (!rows.length) return { kind: "not_found", question: "I couldn’t find any AI outbound call campaigns." };

  const hk = normKey(hint);
  const filtered = hk ? rows.filter((r: any) => normKey(r.name).includes(hk)) : rows;

  if (filtered.length === 1) {
    const r = filtered[0];
    return { kind: "ok", campaignId: String(r.id), label: String(r.name || "Campaign") };
  }

  const list = filtered
    .slice(0, 8)
    .map((r: any) => `- ${String(r.name || "(unnamed)")} (${String(r.status)}) - ${String(r.id).slice(0, 8)}...`)
    .join("\n");
  return { kind: "clarify", question: `Which AI outbound campaign do you mean? Reply with the campaign id:\n\n${list}` };
}

export type ResolveResult =
  | { ok: true; args: unknown; contextPatch?: Record<string, unknown> }
  | { ok: false; clarifyQuestion: string; choices?: AssistantChoice[] };

export type AssistantChoice =
  | {
      type: "booking_calendar";
      calendarId: string;
      label: string;
      description?: string;
    }
  | {
      type: "entity";
      kind: string;
      value: string;
      label: string;
      description?: string;
    };

function hintMeansAny(raw: string): boolean {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (!s) return false;

  // Exact matches (common short replies)
  if (
    s === "doesn't matter" ||
    s === "doesnt matter" ||
    s === "does not matter" ||
    s === "any" ||
    s === "either" ||
    s === "whatever" ||
    s === "no preference" ||
    s === "no pref" ||
    s === "pick one" ||
    s === "you pick" ||
    s === "choose for me"
  ) {
    return true;
  }

  // Embedded phrases (hints often include extra context/newlines)
  return (
    s.includes("doesn't matter") ||
    s.includes("doesnt matter") ||
    s.includes("does not matter") ||
    s.includes("no preference") ||
    s.includes("no pref") ||
    s.includes("you pick") ||
    s.includes("choose for me") ||
    /\b(any|either|whatever)\b/.test(s)
  );
}

function looksLikeCalendarIntent(raw: string): boolean {
  const s = String(raw || "").toLowerCase();
  return /\b(calendar|schedule|booking|book a call|book a meeting|appointment)\b/.test(s);
}

async function resolveBookingCalendarId(opts: {
  ownerId: string;
  hint: string;
}): Promise<
  | { kind: "ok"; calendarId: string; label: string }
  | { kind: "clarify"; question: string; choices: AssistantChoice[] }
  | { kind: "not_found"; question: string; choices?: AssistantChoice[] }
> {
  const ownerId = String(opts.ownerId);
  const hintRaw = String(opts.hint || "").trim().slice(0, 200);

  const cfg = await getBookingCalendarsConfig(ownerId).catch(() => ({ version: 1 as const, calendars: [] as any[] }));
  const calendars = Array.isArray((cfg as any).calendars) ? ((cfg as any).calendars as any[]) : [];
  const enabled = calendars
    .filter((c) => c && typeof c === "object")
    .map((c) => ({
      id: String((c as any).id || "").trim().slice(0, 80),
      title: String((c as any).title || "").trim().slice(0, 80),
      description: typeof (c as any).description === "string" ? String((c as any).description).trim().slice(0, 240) : "",
      enabled: (c as any).enabled !== false,
    }))
    .filter((c) => c.id && c.title && c.enabled);

  if (!enabled.length) {
    return {
      kind: "not_found",
      question: "I can embed a booking calendar, but you don’t have any enabled booking calendars configured yet.",
    };
  }

  const defaultCal = enabled[0]!;

  const mkChoices = (items: typeof enabled): AssistantChoice[] =>
    items.slice(0, 8).map((c) => ({
      type: "booking_calendar",
      calendarId: c.id,
      label: c.title,
      ...(c.description ? { description: c.description } : {}),
    }));

  if (!hintRaw) {
    if (enabled.length === 1) return { kind: "ok", calendarId: defaultCal.id, label: defaultCal.title };
    return {
      kind: "clarify",
      question: "Which booking calendar should I use? Click one:",
      choices: mkChoices(enabled),
    };
  }

  if (hintMeansAny(hintRaw)) {
    return { kind: "ok", calendarId: defaultCal.id, label: defaultCal.title };
  }

  const byId = enabled.find((c) => c.id.toLowerCase() === hintRaw.toLowerCase());
  if (byId) return { kind: "ok", calendarId: byId.id, label: byId.title };

  const needle = hintRaw.toLowerCase();
  const exactTitle = enabled.filter((c) => c.title.toLowerCase() === needle);
  if (exactTitle.length === 1) return { kind: "ok", calendarId: exactTitle[0]!.id, label: exactTitle[0]!.title };

  const fuzzy = enabled.filter((c) => c.title.toLowerCase().includes(needle));
  if (fuzzy.length === 1) return { kind: "ok", calendarId: fuzzy[0]!.id, label: fuzzy[0]!.title };

  if (enabled.length === 1) return { kind: "ok", calendarId: defaultCal.id, label: defaultCal.title };

  const question = fuzzy.length
    ? `I found multiple calendars matching “${hintRaw}”. Click one:`
    : `I couldn’t find a calendar matching “${hintRaw}”. Click one:`;
  return { kind: "clarify", question: question.slice(0, 800), choices: mkChoices(fuzzy.length ? fuzzy : enabled) };
}

function deepMapRefs(v: unknown, f: (ref: PuraRef) => unknown): unknown {
  if (isPuraRef(v)) return f(v);
  if (Array.isArray(v)) return v.map((x) => deepMapRefs(x, f));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = deepMapRefs(val, f);
    }
    return out;
  }
  return v;
}

export async function resolvePlanArgs(opts: {
  ownerId: string;
  stepKey: string;
  args: Record<string, unknown>;
  userHint?: string;
  url?: string;
  threadContext?: unknown;
}): Promise<ResolveResult> {
  const ownerId = String(opts.ownerId);
  const stepKeyLower = String(opts.stepKey || "").toLowerCase();
  let args: Record<string, unknown> = opts.args && typeof opts.args === "object" && !Array.isArray(opts.args) ? opts.args : {};
  let extraContextPatch: Record<string, unknown> | undefined = undefined;
  let resolvedContact: { id: string; name: string } | null = null;
  let resolvedInboxThread: { id: string; channel: "email" | "sms" } | null = null;
  let resolvedFunnel: { id: string; name: string } | null = null;
  let resolvedAutomation: { id: string; name: string } | null = null;
  let resolvedBooking: { id: string; label: string } | null = null;
  let resolvedBlogPost: { id: string; title: string } | null = null;
  let resolvedNewsletter: { id: string; title: string } | null = null;
  let resolvedMediaFolder: { id: string; name: string; tag: string } | null = null;
  let resolvedMediaItem: { id: string; fileName: string; tag: string } | null = null;
  let resolvedTask: { id: string; title: string } | null = null;
  let resolvedReview: { id: string; label: string } | null = null;
  let resolvedReviewQuestion: { id: string; label: string } | null = null;
  let resolvedNurtureCampaign: { id: string; name: string } | null = null;
  let resolvedNurtureStep: { id: string; label: string; campaignId: string } | null = null;
  let resolvedScrapedLead: { id: string; label: string } | null = null;
  let resolvedCreditPull: { id: string; label: string } | null = null;
  let resolvedCreditDisputeLetter: { id: string; label: string } | null = null;
  let resolvedCreditReport: { id: string; label: string } | null = null;
  let resolvedCreditReportItem: { id: string; label: string; reportId: string } | null = null;
  let resolvedUser: { id: string; label: string } | null = null;
  let resolvedFunnelForm: { id: string; label: string } | null = null;
  let resolvedFunnelPage: { id: string; label: string; funnelId: string } | null = null;
  let resolvedCustomDomain: { id: string; label: string } | null = null;
  let resolvedAiOutboundCallsCampaign: { id: string; label: string } | null = null;

  const threadChoiceOverrides =
    opts.threadContext && typeof opts.threadContext === "object" && !Array.isArray(opts.threadContext)
      ? ((opts.threadContext as any).choiceOverrides as any)
      : null;

  const clearBookingCalendarChoiceOverride = () => {
    const prevOverrides =
      threadChoiceOverrides && typeof threadChoiceOverrides === "object" && !Array.isArray(threadChoiceOverrides)
        ? { ...(threadChoiceOverrides as Record<string, unknown>) }
        : {};
    if (Object.prototype.hasOwnProperty.call(prevOverrides, "bookingCalendarId")) {
      delete (prevOverrides as any).bookingCalendarId;
      extraContextPatch = { ...(extraContextPatch || {}), choiceOverrides: prevOverrides };
    }
  };

  const clearFunnelPageChoiceOverride = () => {
    const prevOverrides =
      threadChoiceOverrides && typeof threadChoiceOverrides === "object" && !Array.isArray(threadChoiceOverrides)
        ? { ...(threadChoiceOverrides as Record<string, unknown>) }
        : {};
    if (Object.prototype.hasOwnProperty.call(prevOverrides, "funnelPageId")) {
      delete (prevOverrides as any).funnelPageId;
      extraContextPatch = { ...(extraContextPatch || {}), choiceOverrides: prevOverrides };
    }
  };

  const clearFunnelFormChoiceOverride = () => {
    const prevOverrides =
      threadChoiceOverrides && typeof threadChoiceOverrides === "object" && !Array.isArray(threadChoiceOverrides)
        ? { ...(threadChoiceOverrides as Record<string, unknown>) }
        : {};
    if (Object.prototype.hasOwnProperty.call(prevOverrides, "funnelFormId")) {
      delete (prevOverrides as any).funnelFormId;
      extraContextPatch = { ...(extraContextPatch || {}), choiceOverrides: prevOverrides };
    }
  };

  const clearCustomDomainChoiceOverride = () => {
    const prevOverrides =
      threadChoiceOverrides && typeof threadChoiceOverrides === "object" && !Array.isArray(threadChoiceOverrides)
        ? { ...(threadChoiceOverrides as Record<string, unknown>) }
        : {};
    if (Object.prototype.hasOwnProperty.call(prevOverrides, "customDomainId")) {
      delete (prevOverrides as any).customDomainId;
      extraContextPatch = { ...(extraContextPatch || {}), choiceOverrides: prevOverrides };
    }
  };

  // Special-case: for funnel HTML generation, treat booking calendar selection as an explicit disambiguation step.
  if (stepKeyLower === "funnel_builder.pages.generate_html") {
    const prompt = typeof (args as any).prompt === "string" ? String((args as any).prompt).trim() : "";
    if (looksLikeCalendarIntent(prompt)) {
      const overrideCalendarId =
        threadChoiceOverrides && typeof threadChoiceOverrides === "object" && typeof (threadChoiceOverrides as any).bookingCalendarId === "string"
          ? String((threadChoiceOverrides as any).bookingCalendarId).trim()
          : "";

      const hinted =
        overrideCalendarId ||
        (typeof (args as any).calendarId === "string" ? String((args as any).calendarId).trim() : "") ||
        String(opts.userHint || "");

      const rc = await resolveBookingCalendarId({ ownerId, hint: hinted });
      if (rc.kind === "clarify") return { ok: false, clarifyQuestion: rc.question, choices: rc.choices };
      if (rc.kind === "not_found") return { ok: false, clarifyQuestion: rc.question, choices: rc.choices };

      args = { ...args, calendarId: rc.calendarId };
      if (overrideCalendarId) clearBookingCalendarChoiceOverride();
    }
  }

  const resolveIdArgByKey = async (
    argKeyRaw: string,
    rawHintValue: unknown,
  ): Promise<{ ok: true; value: string } | { ok: false; clarifyQuestion: string; choices?: AssistantChoice[] }> => {
    const argKey = String(argKeyRaw || "").trim();
    const argKeyLower = argKey.toLowerCase();
    const rawHint = typeof rawHintValue === "string" ? rawHintValue.trim() : "";
    const fallbackHint = String(opts.userHint || "").trim();
    const hint = rawHint || fallbackHint;

    const mergeResolverHint = (baseHint?: string) => {
      const b = String(baseHint || "").trim();
      if (hint && b) return `${b}\n${hint}`;
      return hint || b;
    };

    if (!argKeyLower.endsWith("id")) {
      return { ok: true, value: String(rawHintValue ?? "").trim() };
    }

    if (argKeyLower === "contactid" || argKeyLower === "targetcontactid" || argKeyLower === "leadcontactid") {
      if (resolvedContact?.id) return { ok: true, value: resolvedContact.id };
      const rc = await resolveContactId({ ownerId, hint: mergeResolverHint(rawHint) });
      if (rc.kind !== "ok") return { ok: false, clarifyQuestion: rc.question };
      resolvedContact = { id: rc.contactId, name: rc.contactName };
      return { ok: true, value: rc.contactId };
    }

    if (argKeyLower === "tagid") {
      const tagName = rawHint || String(rawHintValue ?? "").trim();
      const rt = await resolveContactTagId({ ownerId, name: tagName, createIfMissing: true });
      if (rt.kind !== "ok") {
        return { ok: false, clarifyQuestion: `Which tag should I use for ${argKey}? Reply with the tag name.` };
      }
      return { ok: true, value: rt.tagId };
    }

    if (argKeyLower === "threadid") {
      if (resolvedInboxThread?.id) return { ok: true, value: resolvedInboxThread.id };
      const rt = await resolveInboxThreadId({ ownerId, hint: mergeResolverHint(rawHint) });
      if (rt.kind !== "ok") return { ok: false, clarifyQuestion: rt.question };
      resolvedInboxThread = { id: rt.threadId, channel: rt.channel };
      return { ok: true, value: rt.threadId };
    }

    if (argKeyLower === "calendarid" || argKeyLower === "bookingcalendarid") {
      const overrideCalendarId =
        threadChoiceOverrides && typeof threadChoiceOverrides === "object" && typeof (threadChoiceOverrides as any).bookingCalendarId === "string"
          ? String((threadChoiceOverrides as any).bookingCalendarId).trim()
          : "";

      const rc = await resolveBookingCalendarId({ ownerId, hint: overrideCalendarId || hint });
      if (rc.kind === "clarify") return { ok: false, clarifyQuestion: rc.question, choices: rc.choices };
      if (rc.kind === "not_found") return { ok: false, clarifyQuestion: rc.question, choices: rc.choices };

      if (overrideCalendarId) clearBookingCalendarChoiceOverride();
      return { ok: true, value: rc.calendarId };
    }

    if (argKeyLower === "funnelid") {
      if (resolvedFunnel?.id) return { ok: true, value: resolvedFunnel.id };
      const rf = await resolveFunnelId({ ownerId, hint: mergeResolverHint(rawHint), url: opts.url, threadContext: opts.threadContext });
      if (rf.kind !== "ok") return { ok: false, clarifyQuestion: rf.question };
      resolvedFunnel = { id: rf.funnelId, name: rf.funnelName };
      return { ok: true, value: rf.funnelId };
    }

    if (argKeyLower === "automationid") {
      if (resolvedAutomation?.id) return { ok: true, value: resolvedAutomation.id };
      const ra = await resolveAutomationId({ ownerId, hint: mergeResolverHint(rawHint), url: opts.url, threadContext: opts.threadContext });
      if (ra.kind !== "ok") return { ok: false, clarifyQuestion: ra.question };
      resolvedAutomation = { id: ra.automationId, name: ra.automationName };
      return { ok: true, value: ra.automationId };
    }

    if (argKeyLower === "bookingid") {
      if (resolvedBooking?.id) return { ok: true, value: resolvedBooking.id };
      const rb = await resolveBookingId({ ownerId, hint: mergeResolverHint(rawHint), url: opts.url, threadContext: opts.threadContext });
      if (rb.kind !== "ok") return { ok: false, clarifyQuestion: rb.question };
      resolvedBooking = { id: rb.bookingId, label: rb.label };
      return { ok: true, value: rb.bookingId };
    }

    if (argKeyLower === "calendarid") {
      const overrideCalendarId =
        threadChoiceOverrides && typeof threadChoiceOverrides === "object" && typeof (threadChoiceOverrides as any).bookingCalendarId === "string"
          ? String((threadChoiceOverrides as any).bookingCalendarId).trim()
          : "";

      const hinted = overrideCalendarId || mergeResolverHint(rawHint);
      const rc = await resolveBookingCalendarId({ ownerId, hint: hinted });
      if (rc.kind === "ok") {
        if (overrideCalendarId) clearBookingCalendarChoiceOverride();
        return { ok: true, value: rc.calendarId };
      }
      return { ok: false, clarifyQuestion: rc.question, ...(rc.kind === "clarify" ? { choices: rc.choices } : rc.choices ? { choices: rc.choices } : {}) };
    }

    if (argKeyLower === "postid" || argKeyLower === "blogpostid") {
      if (resolvedBlogPost?.id) return { ok: true, value: resolvedBlogPost.id };
      const rp = await resolveBlogPostId({ ownerId, hint: mergeResolverHint(rawHint), url: opts.url, threadContext: opts.threadContext });
      if (rp.kind !== "ok") return { ok: false, clarifyQuestion: rp.question };
      resolvedBlogPost = { id: rp.postId, title: rp.postTitle };
      return { ok: true, value: rp.postId };
    }

    if (argKeyLower === "newsletterid" || argKeyLower === "draftid") {
      if (resolvedNewsletter?.id) return { ok: true, value: resolvedNewsletter.id };
      const rn = await resolveNewsletterId({ ownerId, hint: mergeResolverHint(rawHint), url: opts.url, threadContext: opts.threadContext });
      if (rn.kind !== "ok") return { ok: false, clarifyQuestion: rn.question };
      resolvedNewsletter = { id: rn.newsletterId, title: rn.newsletterTitle };
      return { ok: true, value: rn.newsletterId };
    }

    if (argKeyLower === "folderid") {
      if (resolvedMediaFolder?.id) return { ok: true, value: resolvedMediaFolder.id };
      const rf = await resolveMediaFolderId({ ownerId, hint: mergeResolverHint(rawHint), url: opts.url, threadContext: opts.threadContext });
      if (rf.kind !== "ok") return { ok: false, clarifyQuestion: rf.question };
      resolvedMediaFolder = { id: rf.folderId, name: rf.folderName, tag: rf.folderTag };
      return { ok: true, value: rf.folderId };
    }

    if (argKeyLower === "mediaitemid" || (argKeyLower === "itemid" && stepKeyLower.startsWith("media."))) {
      if (resolvedMediaItem?.id) return { ok: true, value: resolvedMediaItem.id };
      const ri = await resolveMediaItemId({ ownerId, hint: mergeResolverHint(rawHint), url: opts.url, threadContext: opts.threadContext });
      if (ri.kind !== "ok") return { ok: false, clarifyQuestion: ri.question };
      resolvedMediaItem = { id: ri.itemId, fileName: ri.fileName, tag: ri.tag };
      return { ok: true, value: ri.itemId };
    }

    if (argKeyLower === "taskid") {
      if (resolvedTask?.id) return { ok: true, value: resolvedTask.id };
      const rt = await resolveTaskId({ ownerId, hint: mergeResolverHint(rawHint), url: opts.url, threadContext: opts.threadContext });
      if (rt.kind !== "ok") return { ok: false, clarifyQuestion: rt.question };
      resolvedTask = { id: rt.taskId, title: rt.taskTitle };
      return { ok: true, value: rt.taskId };
    }

    if (argKeyLower === "reviewid") {
      if (resolvedReview?.id) return { ok: true, value: resolvedReview.id };
      const rr = await resolveReviewId({ ownerId, hint: mergeResolverHint(rawHint), url: opts.url, threadContext: opts.threadContext });
      if (rr.kind !== "ok") return { ok: false, clarifyQuestion: rr.question };
      resolvedReview = { id: rr.reviewId, label: rr.label };
      return { ok: true, value: rr.reviewId };
    }

    if (argKeyLower === "questionid" || argKeyLower === "reviewquestionid") {
      if (resolvedReviewQuestion?.id) return { ok: true, value: resolvedReviewQuestion.id };
      const rq = await resolveReviewQuestionId({ ownerId, hint: mergeResolverHint(rawHint), url: opts.url, threadContext: opts.threadContext });
      if (rq.kind !== "ok") return { ok: false, clarifyQuestion: rq.question };
      resolvedReviewQuestion = { id: rq.questionId, label: rq.label };
      return { ok: true, value: rq.questionId };
    }

    if (argKeyLower === "campaignid") {
      if (stepKeyLower.startsWith("ai_outbound_calls.")) {
        if (resolvedAiOutboundCallsCampaign?.id) return { ok: true, value: resolvedAiOutboundCallsCampaign.id };
        const rc = await resolveAiOutboundCallsCampaignId({ ownerId, hint: mergeResolverHint(rawHint), url: opts.url, threadContext: opts.threadContext });
        if (rc.kind !== "ok") return { ok: false, clarifyQuestion: rc.question };
        resolvedAiOutboundCallsCampaign = { id: rc.campaignId, label: rc.label };
        return { ok: true, value: rc.campaignId };
      }
      if (resolvedNurtureCampaign?.id) return { ok: true, value: resolvedNurtureCampaign.id };
      const rc = await resolveNurtureCampaignId({ ownerId, hint: mergeResolverHint(rawHint), url: opts.url, threadContext: opts.threadContext });
      if (rc.kind !== "ok") return { ok: false, clarifyQuestion: rc.question };
      resolvedNurtureCampaign = { id: rc.campaignId, name: rc.campaignName };
      return { ok: true, value: rc.campaignId };
    }

    if (argKeyLower === "stepid") {
      if (resolvedNurtureStep?.id) return { ok: true, value: resolvedNurtureStep.id };
      const rs = await resolveNurtureStepId({ ownerId, hint: mergeResolverHint(rawHint), url: opts.url, threadContext: opts.threadContext, campaignIdHint: resolvedNurtureCampaign?.id || null });
      if (rs.kind !== "ok") return { ok: false, clarifyQuestion: rs.question };
      resolvedNurtureStep = { id: rs.stepId, label: rs.label, campaignId: rs.campaignId };
      return { ok: true, value: rs.stepId };
    }

    if (argKeyLower === "leadid" || argKeyLower === "scrapedleadid") {
      if (resolvedScrapedLead?.id) return { ok: true, value: resolvedScrapedLead.id };
      const rl = await resolveScrapedLeadId({ ownerId, hint: mergeResolverHint(rawHint), url: opts.url, threadContext: opts.threadContext });
      if (rl.kind !== "ok") return { ok: false, clarifyQuestion: rl.question };
      resolvedScrapedLead = { id: rl.leadId, label: rl.label };
      return { ok: true, value: rl.leadId };
    }

    if (argKeyLower === "creditpullid" || (argKeyLower === "pullid" && stepKeyLower.startsWith("credit."))) {
      if (resolvedCreditPull?.id) return { ok: true, value: resolvedCreditPull.id };
      const rp = await resolveCreditPullId({ ownerId, hint: mergeResolverHint(rawHint), url: opts.url, threadContext: opts.threadContext, contactIdHint: resolvedContact?.id || null });
      if (rp.kind !== "ok") return { ok: false, clarifyQuestion: rp.question };
      resolvedCreditPull = { id: rp.pullId, label: rp.label };
      return { ok: true, value: rp.pullId };
    }

    if (argKeyLower === "disputeletterid" || (argKeyLower === "letterid" && stepKeyLower.startsWith("credit."))) {
      if (resolvedCreditDisputeLetter?.id) return { ok: true, value: resolvedCreditDisputeLetter.id };
      const rl = await resolveCreditDisputeLetterId({ ownerId, hint: mergeResolverHint(rawHint), url: opts.url, threadContext: opts.threadContext, contactIdHint: resolvedContact?.id || null });
      if (rl.kind !== "ok") return { ok: false, clarifyQuestion: rl.question };
      resolvedCreditDisputeLetter = { id: rl.letterId, label: rl.label };
      return { ok: true, value: rl.letterId };
    }

    if (argKeyLower === "creditreportid" || (argKeyLower === "reportid" && stepKeyLower.startsWith("credit."))) {
      if (resolvedCreditReport?.id) return { ok: true, value: resolvedCreditReport.id };
      const rr = await resolveCreditReportId({ ownerId, hint: mergeResolverHint(rawHint), url: opts.url, threadContext: opts.threadContext, contactIdHint: resolvedContact?.id || null });
      if (rr.kind !== "ok") return { ok: false, clarifyQuestion: rr.question };
      resolvedCreditReport = { id: rr.reportId, label: rr.label };
      return { ok: true, value: rr.reportId };
    }

    if (argKeyLower === "reportitemid" || (argKeyLower === "itemid" && stepKeyLower.startsWith("credit."))) {
      if (resolvedCreditReportItem?.id) return { ok: true, value: resolvedCreditReportItem.id };
      const ri = await resolveCreditReportItemId({ ownerId, hint: mergeResolverHint(rawHint), url: opts.url, threadContext: opts.threadContext, reportIdHint: resolvedCreditReport?.id || null });
      if (ri.kind !== "ok") return { ok: false, clarifyQuestion: ri.question };
      resolvedCreditReportItem = { id: ri.itemId, label: ri.label, reportId: ri.reportId };
      return { ok: true, value: ri.itemId };
    }

    if (argKeyLower === "userid" || argKeyLower === "memberid" || argKeyLower === "assignedtouserid") {
      if (resolvedUser?.id) return { ok: true, value: resolvedUser.id };
      const ru = await resolvePortalUserId({ ownerId, hint: mergeResolverHint(rawHint), url: opts.url, threadContext: opts.threadContext });
      if (ru.kind !== "ok") return { ok: false, clarifyQuestion: ru.question };
      resolvedUser = { id: ru.userId, label: ru.label };
      return { ok: true, value: ru.userId };
    }

    if (argKeyLower === "formid") {
      if (resolvedFunnelForm?.id) return { ok: true, value: resolvedFunnelForm.id };
      const overrideFormId =
        threadChoiceOverrides && typeof threadChoiceOverrides === "object" && typeof (threadChoiceOverrides as any).funnelFormId === "string"
          ? String((threadChoiceOverrides as any).funnelFormId).trim()
          : "";

      const rf = await resolveFunnelFormId({ ownerId, hint: overrideFormId || mergeResolverHint(rawHint), url: opts.url, threadContext: opts.threadContext });
      if (rf.kind !== "ok") return { ok: false, clarifyQuestion: rf.question, ...(rf.choices ? { choices: rf.choices } : {}) };
      resolvedFunnelForm = { id: rf.formId, label: rf.label };
      if (overrideFormId) clearFunnelFormChoiceOverride();
      return { ok: true, value: rf.formId };
    }

    if (argKeyLower === "pageid") {
      if (resolvedFunnelPage?.id) return { ok: true, value: resolvedFunnelPage.id };
      const overridePageId =
        threadChoiceOverrides && typeof threadChoiceOverrides === "object" && typeof (threadChoiceOverrides as any).funnelPageId === "string"
          ? String((threadChoiceOverrides as any).funnelPageId).trim()
          : "";

      const rp = await resolveFunnelPageId({
        ownerId,
        hint: overridePageId || mergeResolverHint(rawHint),
        url: opts.url,
        threadContext: opts.threadContext,
        funnelIdHint: resolvedFunnel?.id || null,
      });
      if (rp.kind !== "ok") return { ok: false, clarifyQuestion: rp.question, ...(rp.choices ? { choices: rp.choices } : {}) };
      resolvedFunnelPage = { id: rp.pageId, label: rp.label, funnelId: rp.funnelId };
      if (overridePageId) clearFunnelPageChoiceOverride();
      return { ok: true, value: rp.pageId };
    }

    if (argKeyLower === "domainid") {
      if (resolvedCustomDomain?.id) return { ok: true, value: resolvedCustomDomain.id };
      const overrideDomainId =
        threadChoiceOverrides && typeof threadChoiceOverrides === "object" && typeof (threadChoiceOverrides as any).customDomainId === "string"
          ? String((threadChoiceOverrides as any).customDomainId).trim()
          : "";

      const rd = await resolveCustomDomainId({ ownerId, hint: overrideDomainId || mergeResolverHint(rawHint), url: opts.url, threadContext: opts.threadContext });
      if (rd.kind !== "ok") return { ok: false, clarifyQuestion: rd.question, ...(rd.choices ? { choices: rd.choices } : {}) };
      resolvedCustomDomain = { id: rd.domainId, label: rd.label };
      if (overrideDomainId) clearCustomDomainChoiceOverride();
      return { ok: true, value: rd.domainId };
    }

    if (argKeyLower === "aioutboundcallscampaignid") {
      if (resolvedAiOutboundCallsCampaign?.id) return { ok: true, value: resolvedAiOutboundCallsCampaign.id };
      const rc = await resolveAiOutboundCallsCampaignId({ ownerId, hint: mergeResolverHint(rawHint), url: opts.url, threadContext: opts.threadContext });
      if (rc.kind !== "ok") return { ok: false, clarifyQuestion: rc.question };
      resolvedAiOutboundCallsCampaign = { id: rc.campaignId, label: rc.label };
      return { ok: true, value: rc.campaignId };
    }

    if (looksLikeId(rawHint)) return { ok: true, value: rawHint };
    return { ok: true, value: rawHint || String(rawHintValue ?? "").trim() };
  };

  // First pass: resolve contact refs so tag refs can use contact context if needed later.
  const contactRefs: PuraRef[] = [];
  const inboxThreadRefs: PuraRef[] = [];
  const funnelRefs: PuraRef[] = [];
  const automationRefs: PuraRef[] = [];
  const bookingRefs: PuraRef[] = [];
  const blogPostRefs: PuraRef[] = [];
  const newsletterRefs: PuraRef[] = [];
  const mediaFolderRefs: PuraRef[] = [];
  const mediaItemRefs: PuraRef[] = [];
  const taskRefs: PuraRef[] = [];
  const reviewRefs: PuraRef[] = [];
  const reviewQuestionRefs: PuraRef[] = [];
  const nurtureCampaignRefs: PuraRef[] = [];
  const nurtureStepRefs: PuraRef[] = [];
  const scrapedLeadRefs: PuraRef[] = [];
  const creditPullRefs: PuraRef[] = [];
  const creditDisputeLetterRefs: PuraRef[] = [];
  const creditReportRefs: PuraRef[] = [];
  const creditReportItemRefs: PuraRef[] = [];
  const userRefs: PuraRef[] = [];
  const funnelFormRefs: PuraRef[] = [];
  const funnelPageRefs: PuraRef[] = [];
  const customDomainRefs: PuraRef[] = [];
  const aiOutboundCallsCampaignRefs: PuraRef[] = [];
  deepMapRefs(args, (ref) => {
    if (ref.$ref === "contact") contactRefs.push(ref);
    if (ref.$ref === "inbox_thread") inboxThreadRefs.push(ref);
    if (ref.$ref === "funnel") funnelRefs.push(ref);
    if (ref.$ref === "automation") automationRefs.push(ref);
    if (ref.$ref === "booking") bookingRefs.push(ref);
    if (ref.$ref === "blog_post") blogPostRefs.push(ref);
    if (ref.$ref === "newsletter") newsletterRefs.push(ref);
    if (ref.$ref === "media_folder") mediaFolderRefs.push(ref);
    if (ref.$ref === "media_item") mediaItemRefs.push(ref);
    if (ref.$ref === "task") taskRefs.push(ref);
    if (ref.$ref === "review") reviewRefs.push(ref);
    if (ref.$ref === "review_question") reviewQuestionRefs.push(ref);
    if (ref.$ref === "nurture_campaign") nurtureCampaignRefs.push(ref);
    if (ref.$ref === "nurture_step") nurtureStepRefs.push(ref);
    if (ref.$ref === "scraped_lead") scrapedLeadRefs.push(ref);
    if (ref.$ref === "credit_pull") creditPullRefs.push(ref);
    if (ref.$ref === "credit_dispute_letter") creditDisputeLetterRefs.push(ref);
    if (ref.$ref === "credit_report") creditReportRefs.push(ref);
    if (ref.$ref === "credit_report_item") creditReportItemRefs.push(ref);
    if (ref.$ref === "user") userRefs.push(ref);
    if (ref.$ref === "funnel_form") funnelFormRefs.push(ref);
    if (ref.$ref === "funnel_page") funnelPageRefs.push(ref);
    if (ref.$ref === "custom_domain") customDomainRefs.push(ref);
    if (ref.$ref === "ai_outbound_calls_campaign") aiOutboundCallsCampaignRefs.push(ref);
    return ref;
  });

  if (contactRefs.length) {
    const baseHint = String(contactRefs[0].hint || "").trim();
    const extra = String(opts.userHint || "").trim();
    const hint = extra && baseHint ? `${baseHint}\n${extra}` : extra || baseHint;
    const rc = await resolveContactId({ ownerId, hint });
    if (rc.kind === "ok") resolvedContact = { id: rc.contactId, name: rc.contactName };
    else return { ok: false, clarifyQuestion: rc.question };
  }

  if (inboxThreadRefs.length) {
    const baseHint = String(inboxThreadRefs[0].hint || "").trim();
    const extra = String(opts.userHint || "").trim();
    const hint = extra && baseHint ? `${baseHint}\n${extra}` : extra || baseHint;
    const channel = inboxThreadRefs[0].channel === "sms" ? "sms" : inboxThreadRefs[0].channel === "email" ? "email" : undefined;
    const rt = await resolveInboxThreadId({ ownerId, hint, channel });
    if (rt.kind === "ok") resolvedInboxThread = { id: rt.threadId, channel: rt.channel };
    else return { ok: false, clarifyQuestion: rt.question };
  }

  if (funnelRefs.length) {
    const baseHint = String(funnelRefs[0].name || funnelRefs[0].hint || "").trim();
    const extra = String(opts.userHint || "").trim();
    const hint = extra && baseHint ? `${baseHint}\n${extra}` : extra || baseHint;
    const rf = await resolveFunnelId({ ownerId, hint, url: opts.url, threadContext: opts.threadContext });
    if (rf.kind === "ok") resolvedFunnel = { id: rf.funnelId, name: rf.funnelName };
    else return { ok: false, clarifyQuestion: rf.question };
  }

  if (automationRefs.length) {
    const baseHint = String(automationRefs[0].name || automationRefs[0].hint || "").trim();
    const extra = String(opts.userHint || "").trim();
    const hint = extra && baseHint ? `${baseHint}\n${extra}` : extra || baseHint;
    const ra = await resolveAutomationId({ ownerId, hint, url: opts.url, threadContext: opts.threadContext });
    if (ra.kind === "ok") resolvedAutomation = { id: ra.automationId, name: ra.automationName };
    else return { ok: false, clarifyQuestion: ra.question };
  }

  if (bookingRefs.length) {
    const baseHint = String(bookingRefs[0].hint || bookingRefs[0].name || "").trim();
    const extra = String(opts.userHint || "").trim();
    const hint = extra && baseHint ? `${baseHint}\n${extra}` : extra || baseHint;
    const rb = await resolveBookingId({ ownerId, hint, url: opts.url, threadContext: opts.threadContext });
    if (rb.kind === "ok") resolvedBooking = { id: rb.bookingId, label: rb.label };
    else return { ok: false, clarifyQuestion: rb.question };
  }

  if (blogPostRefs.length) {
    const baseHint = String(blogPostRefs[0].name || blogPostRefs[0].hint || "").trim();
    const extra = String(opts.userHint || "").trim();
    const hint = extra && baseHint ? `${baseHint}\n${extra}` : extra || baseHint;
    const rp = await resolveBlogPostId({ ownerId, hint, url: opts.url, threadContext: opts.threadContext });
    if (rp.kind === "ok") resolvedBlogPost = { id: rp.postId, title: rp.postTitle };
    else return { ok: false, clarifyQuestion: rp.question };
  }

  if (newsletterRefs.length) {
    const baseHint = String(newsletterRefs[0].name || newsletterRefs[0].hint || "").trim();
    const extra = String(opts.userHint || "").trim();
    const hint = extra && baseHint ? `${baseHint}\n${extra}` : extra || baseHint;
    const rn = await resolveNewsletterId({ ownerId, hint, url: opts.url, threadContext: opts.threadContext });
    if (rn.kind === "ok") resolvedNewsletter = { id: rn.newsletterId, title: rn.newsletterTitle };
    else return { ok: false, clarifyQuestion: rn.question };
  }

  if (mediaFolderRefs.length) {
    const baseHint = String(mediaFolderRefs[0].name || mediaFolderRefs[0].hint || "").trim();
    const extra = String(opts.userHint || "").trim();
    const hint = extra && baseHint ? `${baseHint}\n${extra}` : extra || baseHint;
    const rf = await resolveMediaFolderId({ ownerId, hint, url: opts.url, threadContext: opts.threadContext });
    if (rf.kind === "ok") resolvedMediaFolder = { id: rf.folderId, name: rf.folderName, tag: rf.folderTag };
    else return { ok: false, clarifyQuestion: rf.question };
  }

  if (mediaItemRefs.length) {
    const baseHint = String(mediaItemRefs[0].name || mediaItemRefs[0].hint || "").trim();
    const extra = String(opts.userHint || "").trim();
    const hint = extra && baseHint ? `${baseHint}\n${extra}` : extra || baseHint;
    const ri = await resolveMediaItemId({ ownerId, hint, url: opts.url, threadContext: opts.threadContext });
    if (ri.kind === "ok") resolvedMediaItem = { id: ri.itemId, fileName: ri.fileName, tag: ri.tag };
    else return { ok: false, clarifyQuestion: ri.question };
  }

  if (taskRefs.length) {
    const baseHint = String(taskRefs[0].name || taskRefs[0].hint || "").trim();
    const extra = String(opts.userHint || "").trim();
    const hint = extra && baseHint ? `${baseHint}\n${extra}` : extra || baseHint;
    const rt = await resolveTaskId({ ownerId, hint, url: opts.url, threadContext: opts.threadContext });
    if (rt.kind === "ok") resolvedTask = { id: rt.taskId, title: rt.taskTitle };
    else return { ok: false, clarifyQuestion: rt.question };
  }

  if (reviewRefs.length) {
    const baseHint = String(reviewRefs[0].name || reviewRefs[0].hint || "").trim();
    const extra = String(opts.userHint || "").trim();
    const hint = extra && baseHint ? `${baseHint}\n${extra}` : extra || baseHint;
    const rr = await resolveReviewId({ ownerId, hint, url: opts.url, threadContext: opts.threadContext });
    if (rr.kind === "ok") resolvedReview = { id: rr.reviewId, label: rr.label };
    else return { ok: false, clarifyQuestion: rr.question };
  }

  if (reviewQuestionRefs.length) {
    const baseHint = String(reviewQuestionRefs[0].name || reviewQuestionRefs[0].hint || "").trim();
    const extra = String(opts.userHint || "").trim();
    const hint = extra && baseHint ? `${baseHint}\n${extra}` : extra || baseHint;
    const rq = await resolveReviewQuestionId({ ownerId, hint, url: opts.url, threadContext: opts.threadContext });
    if (rq.kind === "ok") resolvedReviewQuestion = { id: rq.questionId, label: rq.label };
    else return { ok: false, clarifyQuestion: rq.question };
  }

  if (nurtureCampaignRefs.length) {
    const baseHint = String(nurtureCampaignRefs[0].name || nurtureCampaignRefs[0].hint || "").trim();
    const extra = String(opts.userHint || "").trim();
    const hint = extra && baseHint ? `${baseHint}\n${extra}` : extra || baseHint;
    const rc = await resolveNurtureCampaignId({ ownerId, hint, url: opts.url, threadContext: opts.threadContext });
    if (rc.kind === "ok") resolvedNurtureCampaign = { id: rc.campaignId, name: rc.campaignName };
    else return { ok: false, clarifyQuestion: rc.question };
  }

  if (nurtureStepRefs.length) {
    const baseHint = String(nurtureStepRefs[0].name || nurtureStepRefs[0].hint || "").trim();
    const extra = String(opts.userHint || "").trim();
    const hint = extra && baseHint ? `${baseHint}\n${extra}` : extra || baseHint;
    const rs = await resolveNurtureStepId({
      ownerId,
      hint,
      url: opts.url,
      threadContext: opts.threadContext,
      campaignIdHint: resolvedNurtureCampaign?.id || null,
    });
    if (rs.kind === "ok") resolvedNurtureStep = { id: rs.stepId, label: rs.label, campaignId: rs.campaignId };
    else return { ok: false, clarifyQuestion: rs.question };
  }

  if (scrapedLeadRefs.length) {
    const baseHint = String(scrapedLeadRefs[0].name || scrapedLeadRefs[0].hint || "").trim();
    const extra = String(opts.userHint || "").trim();
    const hint = extra && baseHint ? `${baseHint}\n${extra}` : extra || baseHint;
    const rl = await resolveScrapedLeadId({ ownerId, hint, url: opts.url, threadContext: opts.threadContext });
    if (rl.kind === "ok") resolvedScrapedLead = { id: rl.leadId, label: rl.label };
    else return { ok: false, clarifyQuestion: rl.question };
  }

  if (creditReportRefs.length) {
    const baseHint = String(creditReportRefs[0].name || creditReportRefs[0].hint || "").trim();
    const extra = String(opts.userHint || "").trim();
    const hint = extra && baseHint ? `${baseHint}\n${extra}` : extra || baseHint;
    const rr = await resolveCreditReportId({
      ownerId,
      hint,
      url: opts.url,
      threadContext: opts.threadContext,
      contactIdHint: resolvedContact?.id || null,
    });
    if (rr.kind === "ok") resolvedCreditReport = { id: rr.reportId, label: rr.label };
    else return { ok: false, clarifyQuestion: rr.question };
  }

  if (creditReportItemRefs.length) {
    const baseHint = String(creditReportItemRefs[0].name || creditReportItemRefs[0].hint || "").trim();
    const extra = String(opts.userHint || "").trim();
    const hint = extra && baseHint ? `${baseHint}\n${extra}` : extra || baseHint;
    const ri = await resolveCreditReportItemId({
      ownerId,
      hint,
      url: opts.url,
      threadContext: opts.threadContext,
      reportIdHint: resolvedCreditReport?.id || null,
    });
    if (ri.kind === "ok") resolvedCreditReportItem = { id: ri.itemId, label: ri.label, reportId: ri.reportId };
    else return { ok: false, clarifyQuestion: ri.question };
  }

  if (creditPullRefs.length) {
    const baseHint = String(creditPullRefs[0].name || creditPullRefs[0].hint || "").trim();
    const extra = String(opts.userHint || "").trim();
    const hint = extra && baseHint ? `${baseHint}\n${extra}` : extra || baseHint;
    const rp = await resolveCreditPullId({
      ownerId,
      hint,
      url: opts.url,
      threadContext: opts.threadContext,
      contactIdHint: resolvedContact?.id || null,
    });
    if (rp.kind === "ok") resolvedCreditPull = { id: rp.pullId, label: rp.label };
    else return { ok: false, clarifyQuestion: rp.question };
  }

  if (creditDisputeLetterRefs.length) {
    const baseHint = String(creditDisputeLetterRefs[0].name || creditDisputeLetterRefs[0].hint || "").trim();
    const extra = String(opts.userHint || "").trim();
    const hint = extra && baseHint ? `${baseHint}\n${extra}` : extra || baseHint;
    const rl = await resolveCreditDisputeLetterId({
      ownerId,
      hint,
      url: opts.url,
      threadContext: opts.threadContext,
      contactIdHint: resolvedContact?.id || null,
    });
    if (rl.kind === "ok") resolvedCreditDisputeLetter = { id: rl.letterId, label: rl.label };
    else return { ok: false, clarifyQuestion: rl.question };
  }

  if (userRefs.length) {
    const baseHint = String(userRefs[0].name || userRefs[0].hint || "").trim();
    const extra = String(opts.userHint || "").trim();
    const hint = extra && baseHint ? `${baseHint}\n${extra}` : extra || baseHint;
    const ru = await resolvePortalUserId({ ownerId, hint, url: opts.url, threadContext: opts.threadContext });
    if (ru.kind === "ok") resolvedUser = { id: ru.userId, label: ru.label };
    else return { ok: false, clarifyQuestion: ru.question };
  }

  if (funnelFormRefs.length) {
    const baseHint = String(funnelFormRefs[0].name || funnelFormRefs[0].hint || "").trim();
    const extra = String(opts.userHint || "").trim();
    const hint = extra && baseHint ? `${baseHint}\n${extra}` : extra || baseHint;
    const rf = await resolveFunnelFormId({ ownerId, hint, url: opts.url, threadContext: opts.threadContext });
    if (rf.kind === "ok") resolvedFunnelForm = { id: rf.formId, label: rf.label };
    else return { ok: false, clarifyQuestion: rf.question };
  }

  if (funnelPageRefs.length) {
    const baseHint = String(funnelPageRefs[0].name || funnelPageRefs[0].hint || "").trim();
    const extra = String(opts.userHint || "").trim();
    const hint = extra && baseHint ? `${baseHint}\n${extra}` : extra || baseHint;
    const rp = await resolveFunnelPageId({
      ownerId,
      hint,
      url: opts.url,
      threadContext: opts.threadContext,
      funnelIdHint: resolvedFunnel?.id || null,
    });
    if (rp.kind === "ok") resolvedFunnelPage = { id: rp.pageId, label: rp.label, funnelId: rp.funnelId };
    else return { ok: false, clarifyQuestion: rp.question };
  }

  if (customDomainRefs.length) {
    const baseHint = String(customDomainRefs[0].name || customDomainRefs[0].hint || "").trim();
    const extra = String(opts.userHint || "").trim();
    const hint = extra && baseHint ? `${baseHint}\n${extra}` : extra || baseHint;
    const rd = await resolveCustomDomainId({ ownerId, hint, url: opts.url, threadContext: opts.threadContext });
    if (rd.kind === "ok") resolvedCustomDomain = { id: rd.domainId, label: rd.label };
    else return { ok: false, clarifyQuestion: rd.question };
  }

  if (aiOutboundCallsCampaignRefs.length) {
    const baseHint = String(aiOutboundCallsCampaignRefs[0].name || aiOutboundCallsCampaignRefs[0].hint || "").trim();
    const extra = String(opts.userHint || "").trim();
    const hint = extra && baseHint ? `${baseHint}\n${extra}` : extra || baseHint;
    const rc = await resolveAiOutboundCallsCampaignId({ ownerId, hint, url: opts.url, threadContext: opts.threadContext });
    if (rc.kind === "ok") resolvedAiOutboundCallsCampaign = { id: rc.campaignId, label: rc.label };
    else return { ok: false, clarifyQuestion: rc.question };
  }

  const resolved = deepMapRefs(args, (ref) => {
    if (ref.$ref === "contact") return resolvedContact?.id || null;
    if (ref.$ref === "inbox_thread") return resolvedInboxThread?.id || null;
    if (ref.$ref === "funnel") return resolvedFunnel?.id || null;
    if (ref.$ref === "automation") return resolvedAutomation?.id || null;
    if (ref.$ref === "booking") return resolvedBooking?.id || null;
    if (ref.$ref === "blog_post") return resolvedBlogPost?.id || null;
    if (ref.$ref === "newsletter") return resolvedNewsletter?.id || null;
    if (ref.$ref === "media_folder") return resolvedMediaFolder?.id || null;
    if (ref.$ref === "media_item") return resolvedMediaItem?.id || null;
    if (ref.$ref === "task") return resolvedTask?.id || null;
    if (ref.$ref === "review") return resolvedReview?.id || null;
    if (ref.$ref === "review_question") return resolvedReviewQuestion?.id || null;
    if (ref.$ref === "nurture_campaign") return resolvedNurtureCampaign?.id || null;
    if (ref.$ref === "nurture_step") return resolvedNurtureStep?.id || null;
    if (ref.$ref === "scraped_lead") return resolvedScrapedLead?.id || null;
    if (ref.$ref === "credit_pull") return resolvedCreditPull?.id || null;
    if (ref.$ref === "credit_dispute_letter") return resolvedCreditDisputeLetter?.id || null;
    if (ref.$ref === "credit_report") return resolvedCreditReport?.id || null;
    if (ref.$ref === "credit_report_item") return resolvedCreditReportItem?.id || null;
    if (ref.$ref === "user") return resolvedUser?.id || null;
    if (ref.$ref === "funnel_form") return resolvedFunnelForm?.id || null;
    if (ref.$ref === "funnel_page") return resolvedFunnelPage?.id || null;
    if (ref.$ref === "custom_domain") return resolvedCustomDomain?.id || null;
    if (ref.$ref === "ai_outbound_calls_campaign") return resolvedAiOutboundCallsCampaign?.id || null;
    if (ref.$ref === "id") {
      return {
        __PURA_GENERIC_ID_REF__: true,
        argKey: typeof (ref as any).argKey === "string" ? String((ref as any).argKey).trim() : "",
        hint: typeof ref.hint === "string" ? String(ref.hint).trim() : "",
      };
    }
    if (ref.$ref === "contact_tag") {
      // Tag resolution depends on action intent.
      const createIfMissing = Boolean(ref.createIfMissing);
      return { __PURA_TAG_REF__: true, name: ref.name || ref.hint || "", createIfMissing };
    }
    return null;
  });

  // Second pass: replace tag placeholders.
  const withTags = await (async () => {
    const walk = async (v: unknown): Promise<unknown> => {
      if (Array.isArray(v)) return Promise.all(v.map(walk));
      if (v && typeof v === "object") {
        const o = v as any;
        if (o.__PURA_TAG_REF__ && typeof o.name === "string") {
          const createIfMissing = Boolean(o.createIfMissing);
          const rt = await resolveContactTagId({ ownerId, name: o.name, createIfMissing });
          if (rt.kind === "ok") return rt.tagId;
          // For remove operations, missing tag is not fatal; let executor handle via messaging.
          // But for add operations we usually set createIfMissing=true.
          return null;
        }
        if (o.__PURA_GENERIC_ID_REF__) {
          const argKey = typeof o.argKey === "string" ? o.argKey.trim() : "";
          const hint = typeof o.hint === "string" ? o.hint.trim() : "";
          const resolvedGeneric = await resolveIdArgByKey(argKey, hint);
          if (!resolvedGeneric.ok) {
            return {
              __PURA_GENERIC_ID_REF_FAILED__: true,
              question: resolvedGeneric.clarifyQuestion,
              choices: Array.isArray((resolvedGeneric as any).choices) ? ((resolvedGeneric as any).choices as AssistantChoice[]) : undefined,
            };
          }
          return resolvedGeneric.value;
        }
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(o)) out[k] = await walk(val);
        return out;
      }
      return v;
    };

    return walk(resolved);
  })();

  let autoResolveClarifyQuestion: string | null = null;
  let autoResolveClarifyChoices: AssistantChoice[] | undefined = undefined;

  const withAutoResolvedIdFields = await (async () => {
    const walk = async (v: unknown, parentKey?: string): Promise<unknown> => {
      if (autoResolveClarifyQuestion) return v;

      if (Array.isArray(v)) {
        const maybeIds = String(parentKey || "").toLowerCase().endsWith("ids");
        const singularKey = maybeIds ? String(parentKey).slice(0, -1) : "";
        const arr: unknown[] = [];
        for (const item of v) {
          if (maybeIds && typeof item === "string") {
            const raw = item.trim();
            if (!raw || looksLikeId(raw)) {
              arr.push(raw);
            } else {
              const r = await resolveIdArgByKey(singularKey, raw);
              if (!r.ok) {
                autoResolveClarifyQuestion = r.clarifyQuestion;
                if (Array.isArray((r as any).choices)) autoResolveClarifyChoices = (r as any).choices as AssistantChoice[];
                arr.push(item);
              } else {
                arr.push(r.value);
              }
            }
          } else {
            arr.push(await walk(item));
          }
        }
        return arr;
      }

      if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        if ((o as any).__PURA_GENERIC_ID_REF_FAILED__ && typeof (o as any).question === "string") {
          autoResolveClarifyQuestion = String((o as any).question).trim() || "I need a specific ID to continue.";
          if (Array.isArray((o as any).choices)) autoResolveClarifyChoices = (o as any).choices as AssistantChoice[];
          return null;
        }
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(o)) {
          if (typeof val === "string" && /id$/i.test(k)) {
            const raw = val.trim();
            if (!raw || looksLikeId(raw)) {
              out[k] = raw;
            } else {
              const r = await resolveIdArgByKey(k, raw);
              if (!r.ok) {
                autoResolveClarifyQuestion = r.clarifyQuestion;
                if (Array.isArray((r as any).choices)) autoResolveClarifyChoices = (r as any).choices as AssistantChoice[];
                out[k] = val;
              } else {
                out[k] = r.value;
              }
            }
            continue;
          }
          out[k] = await walk(val, k);
        }
        return out;
      }

      return v;
    };

    return walk(withTags);
  })();

  if (autoResolveClarifyQuestion) {
    return {
      ok: false,
      clarifyQuestion: autoResolveClarifyQuestion,
      ...(autoResolveClarifyChoices ? { choices: autoResolveClarifyChoices } : {}),
    };
  }

  const baseContextPatch =
    resolvedContact ||
    resolvedInboxThread ||
    resolvedFunnel ||
    resolvedAutomation ||
    resolvedBooking ||
    resolvedBlogPost ||
    resolvedNewsletter ||
    resolvedMediaFolder ||
    resolvedMediaItem ||
    resolvedTask ||
    resolvedReview ||
    resolvedReviewQuestion ||
    resolvedNurtureCampaign ||
    resolvedNurtureStep ||
    resolvedScrapedLead ||
    resolvedCreditPull ||
    resolvedCreditDisputeLetter ||
    resolvedCreditReport ||
    resolvedCreditReportItem ||
    resolvedUser ||
    resolvedFunnelForm ||
    resolvedFunnelPage ||
    resolvedCustomDomain ||
    resolvedAiOutboundCallsCampaign
      ? {
          ...(resolvedContact ? { lastContact: resolvedContact } : {}),
          ...(resolvedInboxThread ? { lastInboxThread: resolvedInboxThread } : {}),
          ...(resolvedFunnel ? { lastFunnel: resolvedFunnel } : {}),
          ...(resolvedAutomation ? { lastAutomation: resolvedAutomation } : {}),
          ...(resolvedBooking ? { lastBooking: resolvedBooking } : {}),
          ...(resolvedBlogPost ? { lastBlogPost: resolvedBlogPost } : {}),
          ...(resolvedNewsletter ? { lastNewsletter: resolvedNewsletter } : {}),
          ...(resolvedMediaFolder ? { lastMediaFolder: resolvedMediaFolder } : {}),
          ...(resolvedMediaItem ? { lastMediaItem: resolvedMediaItem } : {}),
          ...(resolvedTask ? { lastTask: resolvedTask } : {}),
          ...(resolvedReview ? { lastReview: resolvedReview } : {}),
          ...(resolvedReviewQuestion ? { lastReviewQuestion: resolvedReviewQuestion } : {}),
          ...(resolvedNurtureCampaign ? { lastNurtureCampaign: resolvedNurtureCampaign } : {}),
          ...(resolvedNurtureStep ? { lastNurtureStep: resolvedNurtureStep } : {}),
          ...(resolvedScrapedLead ? { lastScrapedLead: resolvedScrapedLead } : {}),
          ...(resolvedCreditPull ? { lastCreditPull: resolvedCreditPull } : {}),
          ...(resolvedCreditDisputeLetter ? { lastCreditDisputeLetter: resolvedCreditDisputeLetter } : {}),
          ...(resolvedCreditReport ? { lastCreditReport: resolvedCreditReport } : {}),
          ...(resolvedCreditReportItem
            ? {
                lastCreditReportItem: {
                  id: resolvedCreditReportItem.id,
                  label: resolvedCreditReportItem.label,
                  reportId: resolvedCreditReportItem.reportId,
                },
              }
            : {}),
          ...(resolvedUser ? { lastUser: resolvedUser } : {}),
          ...(resolvedFunnelForm ? { lastFunnelForm: resolvedFunnelForm } : {}),
          ...(resolvedFunnelPage
            ? { lastFunnelPage: { id: resolvedFunnelPage.id, label: resolvedFunnelPage.label, funnelId: resolvedFunnelPage.funnelId } }
            : {}),
          ...(resolvedCustomDomain ? { lastCustomDomain: resolvedCustomDomain } : {}),
          ...(resolvedAiOutboundCallsCampaign ? { lastAiOutboundCallsCampaign: resolvedAiOutboundCallsCampaign } : {}),
        }
      : undefined;

  const mergedContextPatch =
    baseContextPatch || extraContextPatch
      ? { ...(baseContextPatch || {}), ...(extraContextPatch || {}) }
      : undefined;

  return {
    ok: true,
    args: withAutoResolvedIdFields,
    contextPatch: mergedContextPatch,
  };
}
