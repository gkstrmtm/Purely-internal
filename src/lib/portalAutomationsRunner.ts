import crypto from "crypto";

import { prisma } from "@/lib/db";
import { sendOwnerTwilioSms } from "@/lib/portalTwilio";
import { findOrCreatePortalContact, normalizeEmailKey, normalizeNameKey, normalizePhoneKey } from "@/lib/portalContacts";
import { addContactTagAssignment, ensurePortalContactTagsReady } from "@/lib/portalContactTags";
import { sendEmail as sendSendgridEmail } from "@/lib/leadOutbound";
import { ensurePortalTasksSchema } from "@/lib/portalTasksSchema";
import { buildPortalTemplateVars } from "@/lib/portalTemplateVars";
import { renderTextTemplate } from "@/lib/textTemplate";
import { ensurePortalContactsSchema } from "@/lib/portalContactsSchema";
import { getOwnerPrimaryReviewLink } from "@/lib/reviewRequests";
import { getBookingCalendarsConfig } from "@/lib/bookingCalendars";
import { enqueueOutboundCallForContact } from "@/lib/portalAiOutboundCalls";
import { ensurePortalNurtureSchema } from "@/lib/portalNurtureSchema";

type EdgePort = "out" | "true" | "false";

type BuilderNodeType = "trigger" | "action" | "delay" | "condition" | "note";

type TriggerKind =
  | "manual"
  | "inbound_sms"
  | "inbound_mms"
  | "inbound_call"
  | "inbound_email"
  | "new_lead"
  | "lead_scraped"
  | "tag_added"
  | "contact_created"
  | "task_added"
  | "inbound_webhook"
  | "scheduled_time"
  | "missed_appointment"
  | "appointment_booked"
  | "missed_call"
  | "review_received"
  | "follow_up_sent"
  | "outbound_sent";

type ActionKind =
  | "send_sms"
  | "send_email"
  | "add_tag"
  | "create_task"
  | "assign_lead"
  | "find_contact"
  | "send_webhook"
  | "send_review_request"
  | "send_booking_link"
  | "update_contact"
  | "trigger_service";

function getBasePublicUrl() {
  const raw = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

async function getOwnerBookingLink(ownerId: string): Promise<string | null> {
  const site = await prisma.portalBookingSite.findUnique({ where: { ownerId }, select: { slug: true } });
  const slug = site?.slug ? String(site.slug).trim() : "";
  if (!slug) return null;
  return `${getBasePublicUrl()}/book/${encodeURIComponent(slug)}`;
}

type MessageTarget = "inbound_sender" | "event_contact" | "internal_notification" | "assigned_lead" | "custom";

type ConditionOp =
  | "equals"
  | "contains"
  | "starts_with"
  | "ends_with"
  | "is_empty"
  | "is_not_empty"
  | "gt"
  | "gte"
  | "lt"
  | "lte";

type BuilderNodeConfig =
  | { kind: "trigger"; triggerKind: TriggerKind }
  | {
      kind: "action";
      actionKind: ActionKind;
      body?: string;
      subject?: string;
      tagId?: string;
  assignedToUserId?: string;
      smsTo?: MessageTarget;
      smsToNumber?: string;
      emailTo?: Exclude<MessageTarget, "inbound_sender">;
      emailToAddress?: string;

      // Send webhook
      webhookUrl?: string;
      webhookBodyJson?: string;

      // Update contact
      contactName?: string;
      contactEmail?: string;
      contactPhone?: string;

      // Trigger service
      serviceSlug?: string;
      serviceCampaignId?: string;
    }
  | { kind: "delay"; minutes: number }
  | { kind: "condition"; left: string; op: ConditionOp; right: string }
  | { kind: "note"; text: string };

async function resolveAssignedLeadUserIdFromCalendar(ownerId: string, calendarId: string): Promise<string | null> {
  const calendarIdSafe = String(calendarId || "").trim();
  if (!calendarIdSafe) return null;

  const calendars = await getBookingCalendarsConfig(ownerId).catch(() => null);
  const cal = calendars?.calendars?.find((c) => String(c.id) === calendarIdSafe) || null;
  const emails = Array.isArray((cal as any)?.notificationEmails)
    ? (((cal as any).notificationEmails as unknown) as unknown[])
        .filter((x) => typeof x === "string")
        .map((x) => String(x).trim().toLowerCase())
        .filter((x) => x.includes("@"))
        .slice(0, 10)
    : [];
  if (!emails.length) return null;

  const emailSet = new Set(emails);

  const members = await (prisma as any).portalAccountMember
    .findMany({
      where: { ownerId },
      select: { userId: true, user: { select: { email: true, active: true } } },
      take: 200,
    })
    .catch(() => [] as any[]);

  for (const m of Array.isArray(members) ? members : []) {
    const id = m?.userId ? String(m.userId) : "";
    const email = m?.user?.email ? String(m.user.email).trim().toLowerCase() : "";
    const active = Boolean(m?.user?.active ?? true);
    if (!active) continue;
    if (id && email && emailSet.has(email)) return id;
  }

  return null;
}

async function validateAssigneeIsOwnerOrMember(ownerId: string, userId: string): Promise<string | null> {
  const id = String(userId || "").trim();
  if (!id) return null;
  if (id === ownerId) return id;
  const member = await (prisma as any).portalAccountMember
    .findUnique({
      where: { ownerId_userId: { ownerId, userId: id } },
      select: { id: true },
    })
    .catch(() => null);
  return member?.id ? id : null;
}

async function getLeadAssigneeUserIdFromDataJson(ownerId: string, leadId: string): Promise<string | null> {
  const id = String(leadId || "").trim();
  if (!id) return null;

  let row: any = null;
  try {
    row = await (prisma as any).portalLead.findFirst({
      where: { id, ownerId },
      select: { assignedToUserId: true, dataJson: true },
    });
  } catch {
    row = await (prisma as any).portalLead
      .findFirst({
        where: { id, ownerId },
        select: { dataJson: true },
      })
      .catch(() => null);
  }

  const fromColumn = row?.assignedToUserId ? String(row.assignedToUserId).trim() : "";
  if (fromColumn) return await validateAssigneeIsOwnerOrMember(ownerId, fromColumn).catch(() => null);

  const rec =
    row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
      ? (row.dataJson as Record<string, unknown>)
      : null;
  const raw = rec?.assignedToUserId ?? rec?.assigneeUserId;
  const candidate = typeof raw === "string" ? raw.trim() : "";
  if (!candidate) return null;
  return await validateAssigneeIsOwnerOrMember(ownerId, candidate).catch(() => null);
}

async function persistLeadAssigneeUserIdToDataJson(ownerId: string, leadId: string, assigneeUserId: string): Promise<void> {
  const id = String(leadId || "").trim();
  const assignedToUserId = String(assigneeUserId || "").trim();
  if (!id || !assignedToUserId) return;

  const safeAssignee = await validateAssigneeIsOwnerOrMember(ownerId, assignedToUserId).catch(() => null);
  if (!safeAssignee) return;

  const existingRow = await (prisma as any).portalLead
    .findFirst({
      where: { id, ownerId },
      select: { dataJson: true },
    })
    .catch(() => null);

  const existing =
    existingRow?.dataJson && typeof existingRow.dataJson === "object" && !Array.isArray(existingRow.dataJson)
      ? (existingRow.dataJson as Record<string, unknown>)
      : {};

  const next = {
    ...existing,
    assignedToUserId: safeAssignee,
    assignedAtIso: new Date().toISOString(),
  };

  try {
    await (prisma as any).portalLead.update({
      where: { id },
      data: { assignedToUserId: safeAssignee, dataJson: next },
      select: { id: true },
    });
  } catch {
    await (prisma as any).portalLead
      .update({
        where: { id },
        data: { dataJson: next },
        select: { id: true },
      })
      .catch(() => null);
  }
}

async function getLeadContactIdFromDataJson(ownerId: string, leadId: string): Promise<string | null> {
  const id = String(leadId || "").trim();
  if (!id) return null;

  let row: any = null;
  try {
    row = await (prisma as any).portalLead.findFirst({
      where: { id, ownerId },
      select: { contactId: true, dataJson: true },
    });
  } catch {
    row = await (prisma as any).portalLead
      .findFirst({
        where: { id, ownerId },
        select: { dataJson: true },
      })
      .catch(() => null);
  }

  const fromColumn = row?.contactId ? String(row.contactId).trim() : "";
  if (fromColumn) {
    const contact = await getPortalContactById(ownerId, fromColumn).catch(() => null);
    if (contact?.id) return fromColumn;
  }

  const rec =
    row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
      ? (row.dataJson as Record<string, unknown>)
      : null;

  const raw = rec?.contactId;
  const candidate = typeof raw === "string" ? raw.trim() : "";
  if (!candidate) return null;

  const contact = await getPortalContactById(ownerId, candidate).catch(() => null);
  return contact?.id ? candidate : null;
}

async function persistLeadContactIdToDataJson(ownerId: string, leadId: string, contactId: string): Promise<void> {
  const id = String(leadId || "").trim();
  const cid = String(contactId || "").trim();
  if (!id || !cid) return;

  const contact = await getPortalContactById(ownerId, cid).catch(() => null);
  if (!contact?.id) return;

  const existingRow = await (prisma as any).portalLead
    .findFirst({
      where: { id, ownerId },
      select: { dataJson: true },
    })
    .catch(() => null);

  const existing =
    existingRow?.dataJson && typeof existingRow.dataJson === "object" && !Array.isArray(existingRow.dataJson)
      ? (existingRow.dataJson as Record<string, unknown>)
      : {};

  const next = {
    ...existing,
    contactId: cid,
    contactAssignedAtIso: new Date().toISOString(),
  };

  try {
    await (prisma as any).portalLead.update({
      where: { id },
      data: { contactId: cid, dataJson: next },
      select: { id: true },
    });
  } catch {
    await (prisma as any).portalLead
      .update({
        where: { id },
        data: { dataJson: next },
        select: { id: true },
      })
      .catch(() => null);
  }
}

type BuilderNode = {
  id: string;
  type: BuilderNodeType;
  label: string;
  x: number;
  y: number;
  config?: BuilderNodeConfig | Record<string, unknown>;
};

type BuilderEdge = {
  id: string;
  from: string;
  fromPort?: EdgePort;
  to: string;
};

type Automation = {
  id: string;
  name: string;
  nodes: BuilderNode[];
  edges: BuilderEdge[];
};

type AutomationsJson = { version?: number; automations?: Automation[] };

const SERVICE_SLUG = "automations";

function coerceString(v: unknown) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function getConfigKind(cfg: unknown): string {
  return cfg && typeof cfg === "object" && !Array.isArray(cfg) ? String((cfg as any).kind || "") : "";
}

function isTriggerConfig(cfg: unknown): cfg is { kind: "trigger"; triggerKind: TriggerKind; tagId?: string; webhookKey?: string } {
  return getConfigKind(cfg) === "trigger";
}

function isActionConfig(cfg: unknown): cfg is { kind: "action"; actionKind: ActionKind; body?: string; tagId?: string } {
  return getConfigKind(cfg) === "action";
}

async function getOwnerInternalPhone(ownerId: string): Promise<string | null> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: "profile" } },
    select: { dataJson: true },
  });

  const rec =
    row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
      ? (row.dataJson as Record<string, unknown>)
      : null;
  const raw = rec?.phone;
  return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 32) : null;
}

async function getUserInternalPhone(userId: string): Promise<string | null> {
  const id = String(userId || "").trim();
  if (!id) return null;

  const row = await prisma.portalServiceSetup
    .findUnique({
      where: { ownerId_serviceSlug: { ownerId: id, serviceSlug: "profile" } },
      select: { dataJson: true },
    })
    .catch(() => null);

  const rec =
    row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
      ? (row.dataJson as Record<string, unknown>)
      : null;
  const raw = rec?.phone;
  return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 32) : null;
}

async function getOwnerInternalEmail(ownerId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: ownerId }, select: { email: true } });
  const email = user?.email?.trim() || "";
  return email ? email : null;
}

async function getActiveUserEmail(userId: string): Promise<string | null> {
  const id = String(userId || "").trim();
  if (!id) return null;
  const row = await prisma.user
    .findUnique({ where: { id }, select: { email: true, active: true } })
    .catch(() => null);
  if (!row || row.active === false) return null;
  const email = row.email?.trim() || "";
  return email ? email : null;
}

async function getOwnerFromName(ownerId: string): Promise<string> {
  const profile = await prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } });
  const fromName = profile?.businessName?.trim();
  return fromName || "Purely Automation";
}

async function getPortalContactById(ownerId: string, contactId: string) {
  if (!contactId) return null;
  const contact = await prisma.portalContact.findFirst({
    where: { id: contactId, ownerId },
    select: { id: true, phone: true, email: true, name: true },
  });
  return contact;
}

function isConditionConfig(cfg: unknown): cfg is { kind: "condition"; left: string; op: ConditionOp; right: string } {
  return getConfigKind(cfg) === "condition";
}

function outgoingKey(fromId: string, fromPort: EdgePort) {
  return `${fromId}::${fromPort}`;
}

function fieldValue(
  leftRaw: string,
  vars: Record<string, string>,
) {
  const left = String(leftRaw || "").trim();
  if (!left) return "";

  // Allow templated left-hand expressions (e.g. {contact.phone}).
  if (left.includes("{")) {
    return renderTextTemplate(left, vars);
  }

  // Built-ins.
  if (left === "now.hour") return String(new Date().getHours());
  if (left === "now.weekday") return String(new Date().getDay());
  if (left === "now.iso") return new Date().toISOString();
  if (left === "now.date") return new Date().toISOString().slice(0, 10);

  return vars[left] ?? "";
}

function evalCondition(
  cfg: { left: string; op: ConditionOp; right: string },
  vars: Record<string, string>,
) {
  const left = coerceString(fieldValue(cfg.left, vars));
  const right = cfg.right && String(cfg.right).includes("{") ? renderTextTemplate(String(cfg.right), vars) : coerceString(cfg.right);
  const a = left;
  const b = coerceString(right);

  switch (cfg.op) {
    case "equals":
      return a === b;
    case "contains":
      return a.toLowerCase().includes(b.toLowerCase());
    case "starts_with":
      return a.toLowerCase().startsWith(b.toLowerCase());
    case "ends_with":
      return a.toLowerCase().endsWith(b.toLowerCase());
    case "is_empty":
      return !a.trim();
    case "is_not_empty":
      return Boolean(a.trim());
    case "gt": {
      const na = Number(a);
      const nb = Number(b);
      if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
      return na > nb;
    }
    case "gte": {
      const na = Number(a);
      const nb = Number(b);
      if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
      return na >= nb;
    }
    case "lt": {
      const na = Number(a);
      const nb = Number(b);
      if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
      return na < nb;
    }
    case "lte": {
      const na = Number(a);
      const nb = Number(b);
      if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
      return na <= nb;
    }
    default:
      return false;
  }
}

async function loadOwnerAutomations(ownerId: string): Promise<Automation[]> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const data = row?.dataJson as AutomationsJson | null;
  const autos = Array.isArray(data?.automations) ? (data?.automations as any[]) : [];

  return autos
    .filter((a) => a && typeof a === "object")
    .map((a) => ({
      id: String((a as any).id || ""),
      name: String((a as any).name || ""),
      nodes: Array.isArray((a as any).nodes) ? ((a as any).nodes as any[]) : [],
      edges: Array.isArray((a as any).edges) ? ((a as any).edges as any[]) : [],
    }))
    .filter((a) => a.id && Array.isArray(a.nodes) && Array.isArray(a.edges));
}

async function runAutomationOnce(opts: {
  ownerId: string;
  automation: Automation;
  triggerKind: TriggerKind;
  message?: { from?: string; to?: string; body?: string };
  contact?: { id?: string | null; name?: string | null; email?: string | null; phone?: string | null };
  event?: { tagId?: string; webhookKey?: string; triggerNodeId?: string; bookingId?: string; calendarId?: string; leadId?: string };
}) {
  const message = {
    from: coerceString(opts.message?.from),
    to: coerceString(opts.message?.to),
    body: coerceString(opts.message?.body),
  };

  const nodesById = new Map<string, BuilderNode>();
  for (const n of opts.automation.nodes || []) {
    if (!n || typeof n !== "object") continue;
    const id = String((n as any).id || "");
    if (!id) continue;
    nodesById.set(id, n as any);
  }

  const outgoing = new Map<string, string[]>();
  for (const e of opts.automation.edges || []) {
    if (!e || typeof e !== "object") continue;
    const from = String((e as any).from || "");
    const to = String((e as any).to || "");
    const fromPort = (String((e as any).fromPort || "out") as EdgePort) || "out";
    if (!from || !to) continue;
    const k = outgoingKey(from, fromPort);
    outgoing.set(k, [...(outgoing.get(k) || []), to]);
  }

  const triggerNodes = (opts.automation.nodes || []).filter((n: any) => {
    if (!n || n.type !== "trigger") return false;
    if (opts.event?.triggerNodeId && String((n as any).id || "") !== String(opts.event.triggerNodeId)) return false;
    const cfg = (n as any).config;
    if (!isTriggerConfig(cfg) || cfg.triggerKind !== opts.triggerKind) return false;
    // Optional trigger-level filters for certain trigger kinds.
    if (opts.triggerKind === "tag_added") {
      const expected = String((cfg as any).tagId || "").trim();
      const actual = String(opts.event?.tagId || "").trim();
      if (expected && actual && expected !== actual) return false;
      if (expected && !actual) return false;
    }
    if (opts.triggerKind === "inbound_webhook") {
      const expected = String((cfg as any).webhookKey || "").trim();
      const actual = String(opts.event?.webhookKey || "").trim();
      if (expected && actual && expected !== actual) return false;
      if (expected && !actual) return false;
    }
    return true;
  });

  if (!triggerNodes.length) return;

  const looksLikeEmail = (s: string) => Boolean(s && s.includes("@"));
  const looksLikePhone = (s: string) => Boolean(s && /^[+0-9\s\-().]{7,}$/.test(s));

  const eventEmail = (opts.contact?.email && String(opts.contact.email).trim()) || (looksLikeEmail(message.from) ? message.from.trim() : "");
  const eventPhone = (opts.contact?.phone && String(opts.contact.phone).trim()) || (looksLikePhone(message.from) ? message.from.trim() : "");
  const eventName = (opts.contact?.name && String(opts.contact.name).trim()) || eventPhone || eventEmail || message.from.trim();

  const hasContactInfo = Boolean(
    (opts.contact?.id && String(opts.contact.id).trim()) ||
      (opts.contact?.name && String(opts.contact.name).trim()) ||
      eventEmail ||
      eventPhone,
  );

  let contactId = hasContactInfo
    ? (opts.contact?.id ? String(opts.contact.id) : "") ||
      (await findOrCreatePortalContact({
        ownerId: opts.ownerId,
        name: eventName || "Contact",
        email: eventEmail || null,
        phone: eventPhone || null,
      }))
    : null;

  if (!contactId && opts.event?.leadId) {
    contactId = await getLeadContactIdFromDataJson(opts.ownerId, opts.event.leadId).catch(() => null);
  }

  if (contactId && opts.event?.leadId) {
    await persistLeadContactIdToDataJson(opts.ownerId, opts.event.leadId, contactId).catch(() => null);
  }

  const loadContactRow = async (id: string | null) => {
    if (!id) return null;
    return await getPortalContactById(opts.ownerId, id).catch(() => null);
  };

  let contactRow = await loadContactRow(contactId);

  const ctx: {
    message: { from: string; to: string; body: string };
    contact: { id: string | null; phone: string | null; email: string | null; name: string | null };
    assigneeUserId: string | null;
  } = {
    message,
    contact: {
      id: contactId,
      phone: contactRow?.phone || (eventPhone || null) || null,
      email: contactRow?.email || (eventEmail || null) || null,
      name: contactRow?.name || (eventName || null) || null,
    },
    assigneeUserId: null,
  };

  if (opts.event?.leadId) {
    ctx.assigneeUserId = await getLeadAssigneeUserIdFromDataJson(opts.ownerId, opts.event.leadId).catch(() => null);
  }

  const [ownerFromName, ownerInternalEmail, ownerInternalPhone] = await Promise.all([
    getOwnerFromName(opts.ownerId).catch(() => "Purely Automation"),
    getOwnerInternalEmail(opts.ownerId).catch(() => null),
    getOwnerInternalPhone(opts.ownerId).catch(() => null),
  ]);

  const getTemplateVars = () => {
    const base = buildPortalTemplateVars({
      contact: {
        id: ctx.contact.id,
        name: ctx.contact.name,
        email: ctx.contact.email,
        phone: ctx.contact.phone,
      },
      business: { name: ownerFromName },
      owner: { email: ownerInternalEmail, phone: ownerInternalPhone },
      message: { from: ctx.message.from, to: ctx.message.to, body: ctx.message.body },
    });
    // Dynamic time vars.
    base["now.hour"] = String(new Date().getHours());
    base["now.weekday"] = String(new Date().getDay());
    base["now.iso"] = new Date().toISOString();
    base["now.date"] = new Date().toISOString().slice(0, 10);
    return base;
  };

  const maxSteps = 120;

  const runFromNode = async (startId: string | null, depth: number) => {
    let currentId: string | null = startId;
    let steps = 0;
    const visited = new Map<string, number>();

    while (currentId && steps < maxSteps) {
      steps += 1;
      visited.set(currentId, (visited.get(currentId) || 0) + 1);
      if ((visited.get(currentId) || 0) > 5) break;

      const node = nodesById.get(currentId);
      if (!node) break;

      if (node.type === "condition") {
        const cfg = (node as any).config;
        const ok = isConditionConfig(cfg) ? evalCondition(cfg, getTemplateVars()) : false;
        const port: EdgePort = ok ? "true" : "false";
        const nexts = outgoing.get(outgoingKey(currentId, port)) || [];
        currentId = nexts[0] || null;
        continue;
      }

      if (node.type === "action") {
        const cfg = (node as any).config;
        if (isActionConfig(cfg)) {
          if (cfg.actionKind === "assign_lead") {
            const assignedToUserIdRaw = String((cfg as any).assignedToUserId || "").trim();
            let resolved: string | null = null;

            if (assignedToUserIdRaw === "__assigned_lead__") {
              const calendarId = String(opts.event?.calendarId || "").trim();
              resolved =
                ctx.assigneeUserId ||
                (calendarId ? await resolveAssignedLeadUserIdFromCalendar(opts.ownerId, calendarId).catch(() => null) : null);
              if (!resolved) resolved = opts.ownerId;
            } else if (assignedToUserIdRaw && assignedToUserIdRaw !== "__all_users__") {
              resolved = await validateAssigneeIsOwnerOrMember(opts.ownerId, assignedToUserIdRaw).catch(() => null);
              if (!resolved) resolved = opts.ownerId;
            } else {
              resolved = opts.ownerId;
            }

            ctx.assigneeUserId = resolved;

            if (opts.event?.leadId && resolved) {
              await persistLeadAssigneeUserIdToDataJson(opts.ownerId, opts.event.leadId, resolved).catch(() => null);
            }
          }

          if (cfg.actionKind === "find_contact") {
            const vars = getTemplateVars();
            const tagId = String((cfg as any).tagId || "").trim();
            const tagMode = String((cfg as any).tagMode || "latest").trim();
            const maxContactsRaw = Number((cfg as any).maxContacts || 25);
            const maxContacts = Math.max(1, Math.min(50, Number.isFinite(maxContactsRaw) ? Math.floor(maxContactsRaw) : 25));
            const nameTemplate = String((cfg as any).contactName || "").trim();
            const emailTemplate = String((cfg as any).contactEmail || "").trim();
            const phoneTemplate = String((cfg as any).contactPhone || "").trim();

            if (tagId) {
              try {
                await ensurePortalContactsSchema().catch(() => null);
                await ensurePortalContactTagsReady().catch(() => null);

                if (tagMode === "all" && depth < 1) {
                  const rows = await prisma.portalContactTagAssignment.findMany({
                    where: { ownerId: opts.ownerId, tagId },
                    orderBy: { createdAt: "desc" },
                    select: { contactId: true },
                    distinct: ["contactId"],
                    take: maxContacts,
                  });

                  const contactIds = rows
                    .map((r) => String(r.contactId || "").trim())
                    .filter(Boolean);

                  const nexts = outgoing.get(outgoingKey(currentId, "out")) || [];
                  const nextStart = nexts[0] || null;

                  if (nextStart && contactIds.length) {
                    const savedContactId = contactId;
                    const savedContactRow = contactRow;
                    const savedCtxContact = { ...ctx.contact };

                    for (const cid of contactIds) {
                      contactId = cid;
                      contactRow = await loadContactRow(cid);
                      ctx.contact.id = cid;
                      ctx.contact.phone = contactRow?.phone || null;
                      ctx.contact.email = contactRow?.email || null;
                      ctx.contact.name = contactRow?.name || null;
                      await runFromNode(nextStart, depth + 1);
                    }

                    contactId = savedContactId;
                    contactRow = savedContactRow;
                    ctx.contact.id = savedCtxContact.id;
                    ctx.contact.phone = savedCtxContact.phone;
                    ctx.contact.email = savedCtxContact.email;
                    ctx.contact.name = savedCtxContact.name;

                    return;
                  }
                }

                const byTag = await prisma.portalContactTagAssignment.findFirst({
                  where: { ownerId: opts.ownerId, tagId },
                  orderBy: { createdAt: "desc" },
                  select: { contactId: true },
                });
                if (byTag?.contactId) {
                  contactId = String(byTag.contactId);
                }
              } catch {
                // best-effort
              }

              if (contactId) {
                contactRow = await loadContactRow(contactId);
                ctx.contact.id = contactId;
                ctx.contact.phone = contactRow?.phone || null;
                ctx.contact.email = contactRow?.email || null;
                ctx.contact.name = contactRow?.name || null;
              }
            }

            const renderedName = nameTemplate ? renderTextTemplate(nameTemplate, vars).trim().slice(0, 80) : "";
            const renderedEmail = emailTemplate ? renderTextTemplate(emailTemplate, vars).trim().slice(0, 120) : "";
            const renderedPhone = phoneTemplate ? renderTextTemplate(phoneTemplate, vars).trim().slice(0, 64) : "";

            const fallbackEmail = looksLikeEmail(ctx.message.from) ? ctx.message.from.trim() : "";
            const fallbackPhone = looksLikePhone(ctx.message.from) ? ctx.message.from.trim() : "";

            const email = renderedEmail || fallbackEmail;
            const phone = renderedPhone || fallbackPhone;
            const name = renderedName || phone || email;

            if (email || phone || name) {
              try {
                await ensurePortalContactsSchema().catch(() => null);
                const nextId = await findOrCreatePortalContact({
                  ownerId: opts.ownerId,
                  name: name || "Contact",
                  email: email || null,
                  phone: phone || null,
                });
                contactId = nextId || contactId;
              } catch {
                // best-effort
              }

              if (contactId) {
                contactRow = await loadContactRow(contactId);
                ctx.contact.id = contactId;
                ctx.contact.phone = contactRow?.phone || phone || null;
                ctx.contact.email = contactRow?.email || email || null;
                ctx.contact.name = contactRow?.name || renderedName || name || null;
              }
            }
          }

          if (cfg.actionKind === "send_sms") {
            const bodyTemplate = String(cfg.body || "").trim() || "Got it — thanks!";
            const body = renderTextTemplate(bodyTemplate, getTemplateVars());
            const target = (String((cfg as any).smsTo || "inbound_sender") as MessageTarget) || "inbound_sender";
            let to: string | null = null;

            if (target === "inbound_sender") to = message.from || null;
            if (target === "event_contact") to = ctx.contact.phone || message.from || null;
            if (target === "internal_notification") to = await getOwnerInternalPhone(opts.ownerId).catch(() => null);
            if (target === "assigned_lead") {
              const id = ctx.assigneeUserId || opts.ownerId;
              const safeId = await validateAssigneeIsOwnerOrMember(opts.ownerId, id).catch(() => null);
              to = safeId ? await getUserInternalPhone(safeId).catch(() => null) : null;
              if (!to) to = await getOwnerInternalPhone(opts.ownerId).catch(() => null);
            }
            if (target === "custom") to = String((cfg as any).smsToNumber || "").trim() || null;

            if (to) {
              try {
                await sendOwnerTwilioSms({ ownerId: opts.ownerId, to, body: body.slice(0, 1200) });
              } catch {
                // best-effort
              }
            }
          }

          if (cfg.actionKind === "send_email") {
            const textTemplate = String((cfg as any).body || "").trim();
            const subjectTemplate = String((cfg as any).subject || "").trim() || "Automated message";
            const text = renderTextTemplate(textTemplate, getTemplateVars());
            const subject = renderTextTemplate(subjectTemplate, getTemplateVars());
            const target = (String((cfg as any).emailTo || "internal_notification") as Exclude<MessageTarget, "inbound_sender">) ||
              "internal_notification";

            let toEmail: string | null = null;
            if (target === "event_contact") toEmail = ctx.contact.email || null;
            if (target === "internal_notification") toEmail = await getOwnerInternalEmail(opts.ownerId).catch(() => null);
            if (target === "assigned_lead") {
              const id = ctx.assigneeUserId || opts.ownerId;
              const safeId = await validateAssigneeIsOwnerOrMember(opts.ownerId, id).catch(() => null);
              toEmail = safeId ? await getActiveUserEmail(safeId).catch(() => null) : null;
              if (!toEmail) toEmail = await getOwnerInternalEmail(opts.ownerId).catch(() => null);
            }
            if (target === "custom") toEmail = String((cfg as any).emailToAddress || "").trim() || null;

            if (toEmail && (text || subject)) {
              try {
                const fromName = await getOwnerFromName(opts.ownerId).catch(() => "Purely Automation");
                await sendSendgridEmail({
                  to: toEmail,
                  subject: subject.slice(0, 180),
                  text: text.slice(0, 8000) || " ",
                  fromName,
                  ownerId: opts.ownerId,
                });
              } catch {
                // best-effort
              }
            }
          }

          if (cfg.actionKind === "add_tag") {
            const tagId = String((cfg as any).tagId || "").trim();
            if (tagId && contactId) {
              try {
                await addContactTagAssignment({ ownerId: opts.ownerId, contactId, tagId });
              } catch {
                // best-effort
              }
            }
          }

          if (cfg.actionKind === "create_task") {
            const titleRaw = String((cfg as any).subject || "").trim();
            const descriptionRaw = String((cfg as any).body || "").trim();
            const assignedToUserIdRaw = String((cfg as any).assignedToUserId || "").trim();

            const vars = getTemplateVars();
            const title = renderTextTemplate(titleRaw || "Task", vars).slice(0, 160);
            let description = renderTextTemplate(descriptionRaw, vars).slice(0, 5000);
            if (!description && (ctx.contact.name || ctx.contact.email || ctx.contact.phone)) {
              const bits = [ctx.contact.name, ctx.contact.email, ctx.contact.phone].filter(Boolean).join(" • ");
              description = bits ? `Related contact: ${bits}`.slice(0, 5000) : "";
            }

            await ensurePortalTasksSchema().catch(() => null);

            const resolveSpecialAssignee = async (): Promise<string | null> => {
              if (assignedToUserIdRaw !== "__assigned_lead__") return null;

              if (ctx.assigneeUserId) return ctx.assigneeUserId;

              const calendarId = String(opts.event?.calendarId || "").trim();
              if (!calendarId) return null;

              return await resolveAssignedLeadUserIdFromCalendar(opts.ownerId, calendarId);
            };

            let assignedToUserId: string | null = null;
            const specialAssignedTo = await resolveSpecialAssignee();
            if (specialAssignedTo) {
              assignedToUserId = specialAssignedTo;
            } else if (assignedToUserIdRaw && assignedToUserIdRaw !== "__assigned_lead__") {
              // Only allow assigning to the account owner or an existing member.
              assignedToUserId = await validateAssigneeIsOwnerOrMember(opts.ownerId, assignedToUserIdRaw).catch(() => null);
            }

            // Default assignment: account owner.
            if (!assignedToUserId && assignedToUserIdRaw !== "__all_users__") assignedToUserId = opts.ownerId;

            const createOneTask = async (userId: string | null) => {
              try {
                const id = crypto.randomUUID().replace(/-/g, "");
                const now = new Date();
                await prisma.$executeRawUnsafe(
                  `INSERT INTO "PortalTask" ("id","ownerId","createdByUserId","title","description","status","assignedToUserId","dueAt","createdAt","updatedAt")
                   VALUES ($1,$2,$3,$4,$5,'OPEN',$6,NULL,DEFAULT,$7)`,
                  id,
                  opts.ownerId,
                  opts.ownerId,
                  title,
                  description || null,
                  userId,
                  now,
                );
              } catch {
                // best-effort
              }
            };

            if (assignedToUserIdRaw === "__all_users__") {
              try {
                const members = await (prisma as any).portalAccountMember
                  .findMany({
                    where: { ownerId: opts.ownerId },
                    select: { userId: true, user: { select: { active: true } } },
                    take: 200,
                  })
                  .catch(() => [] as any[]);
                const ids = new Set<string>();
                ids.add(opts.ownerId);
                for (const m of Array.isArray(members) ? members : []) {
                  const id = m?.userId ? String(m.userId) : "";
                  const active = Boolean(m?.user?.active ?? true);
                  if (id && active) ids.add(id);
                }
                for (const id of Array.from(ids)) {
                  await createOneTask(id);
                }
              } catch {
                // ignore
              }
            } else {
              await createOneTask(assignedToUserId);
            }
          }

          if (cfg.actionKind === "send_review_request") {
            const link = await getOwnerPrimaryReviewLink(opts.ownerId).catch(() => null);
            const url = link?.url ? String(link.url) : "";
            if (url) {
              const bodyTemplate = String((cfg as any).body || "").trim() || "Thanks for choosing {business.name}! Leave a review: {link}";
              const body = renderTextTemplate(bodyTemplate, { ...getTemplateVars(), link: url });

              const target = (String((cfg as any).smsTo || "event_contact") as MessageTarget) || "event_contact";
              let to: string | null = null;

              if (target === "inbound_sender") to = message.from || null;
              if (target === "event_contact") to = ctx.contact.phone || message.from || null;
              if (target === "internal_notification") to = await getOwnerInternalPhone(opts.ownerId).catch(() => null);
              if (target === "custom") to = String((cfg as any).smsToNumber || "").trim() || null;

              if (to) {
                try {
                  await sendOwnerTwilioSms({ ownerId: opts.ownerId, to, body: body.slice(0, 1200) });
                } catch {
                  // best-effort
                }
              }
            }
          }

          if (cfg.actionKind === "send_booking_link") {
            const url = (await getOwnerBookingLink(opts.ownerId).catch(() => null)) || "";
            if (url) {
              const bodyTemplate = String((cfg as any).body || "").trim() || "Book an appointment here: {link}";
              const body = renderTextTemplate(bodyTemplate, { ...getTemplateVars(), link: url });

              const target = (String((cfg as any).smsTo || "event_contact") as MessageTarget) || "event_contact";
              let to: string | null = null;

              if (target === "inbound_sender") to = message.from || null;
              if (target === "event_contact") to = ctx.contact.phone || message.from || null;
              if (target === "internal_notification") to = await getOwnerInternalPhone(opts.ownerId).catch(() => null);
              if (target === "custom") to = String((cfg as any).smsToNumber || "").trim() || null;

              if (to) {
                try {
                  await sendOwnerTwilioSms({ ownerId: opts.ownerId, to, body: body.slice(0, 1200) });
                } catch {
                  // best-effort
                }
              }
            }
          }

          if (cfg.actionKind === "send_webhook") {
            const webhookUrl = String((cfg as any).webhookUrl || "").trim();
            if (webhookUrl) {
              let urlOk = false;
              try {
                const u = new URL(webhookUrl);
                urlOk = u.protocol === "https:" || u.protocol === "http:";
              } catch {
                urlOk = false;
              }

              if (urlOk) {
                const defaultPayload = {
                  ownerId: opts.ownerId,
                  triggerKind: opts.triggerKind,
                  contact: ctx.contact,
                  message,
                  event: opts.event ?? {},
                };

                const bodyJsonTemplate = String((cfg as any).webhookBodyJson || "").trim();
                let payload: any = defaultPayload;
                if (bodyJsonTemplate) {
                  const rendered = renderTextTemplate(bodyJsonTemplate, getTemplateVars());
                  try {
                    payload = JSON.parse(rendered);
                  } catch {
                    payload = { ...defaultPayload, body: rendered };
                  }
                }

                try {
                  await fetch(webhookUrl, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(payload).slice(0, 200_000),
                  });
                } catch {
                  // best-effort
                }
              }
            }
          }

          if (cfg.actionKind === "update_contact") {
            if (contactId) {
              const nameTemplate = String((cfg as any).contactName || "").trim();
              const emailTemplate = String((cfg as any).contactEmail || "").trim();
              const phoneTemplate = String((cfg as any).contactPhone || "").trim();

              const vars = getTemplateVars();
              const nextName = nameTemplate ? renderTextTemplate(nameTemplate, vars).trim().slice(0, 80) : "";
              const nextEmailRaw = emailTemplate ? renderTextTemplate(emailTemplate, vars).trim().slice(0, 120) : "";
              const nextPhoneRaw = phoneTemplate ? renderTextTemplate(phoneTemplate, vars).trim().slice(0, 64) : "";

              const nameKey = nextName ? normalizeNameKey(nextName) : null;
              const emailKey = nextEmailRaw ? normalizeEmailKey(nextEmailRaw) : null;
              const phoneNorm = nextPhoneRaw ? normalizePhoneKey(nextPhoneRaw) : { phone: null, phoneKey: null };

              const data: any = {};
              if (nextName && nameKey) {
                data.name = nextName;
                data.nameKey = nameKey;
              }
              if (nextEmailRaw) {
                data.email = emailKey ? nextEmailRaw : null;
                data.emailKey = emailKey;
              }
              if (nextPhoneRaw) {
                data.phone = phoneNorm.phone;
                data.phoneKey = phoneNorm.phoneKey;
              }

              if (Object.keys(data).length) {
                try {
                  await ensurePortalContactsSchema().catch(() => null);
                  await (prisma as any).portalContact.update({
                    where: { id: contactId },
                    data,
                    select: { id: true },
                  });
                } catch {
                  // best-effort
                }
              }
            }
          }

          if (cfg.actionKind === "trigger_service") {
            const serviceSlug = String((cfg as any).serviceSlug || "").trim();

            let effectiveContactId = contactId;
            if (!effectiveContactId && (ctx.contact.phone || ctx.contact.email || ctx.contact.name)) {
              const name = ctx.contact.name || ctx.contact.phone || ctx.contact.email || "Contact";
              try {
                await ensurePortalContactsSchema().catch(() => null);
                effectiveContactId =
                  (await findOrCreatePortalContact({
                    ownerId: opts.ownerId,
                    name,
                    email: ctx.contact.email || null,
                    phone: ctx.contact.phone || null,
                  }).catch(() => null)) || null;
              } catch {
                effectiveContactId = null;
              }
            }

            if (serviceSlug === "ai-outbound-calls") {
              if (effectiveContactId) {
                const campaignId = String((cfg as any).serviceCampaignId || "").trim() || undefined;
                await enqueueOutboundCallForContact({ ownerId: opts.ownerId, contactId: effectiveContactId, campaignId }).catch(() => null);
              }
            }

            if (serviceSlug === "nurture-campaigns") {
              if (!effectiveContactId) return;
              const campaignIdRaw = String((cfg as any).serviceCampaignId || "").trim();
              try {
                await ensurePortalNurtureSchema().catch(() => null);

                const campaign = campaignIdRaw
                  ? await prisma.portalNurtureCampaign.findFirst({
                      where: { ownerId: opts.ownerId, id: campaignIdRaw, status: "ACTIVE" },
                      select: { id: true },
                    })
                  : await prisma.portalNurtureCampaign.findFirst({
                      where: { ownerId: opts.ownerId, status: "ACTIVE" },
                      select: { id: true },
                      orderBy: [{ updatedAt: "desc" }],
                    });

                if (!campaign?.id) return;

                const steps = await prisma.portalNurtureStep.findMany({
                  where: { ownerId: opts.ownerId, campaignId: campaign.id },
                  select: { ord: true, delayMinutes: true },
                  orderBy: [{ ord: "asc" }],
                  take: 1,
                });
                const firstDelay = steps.length ? Math.max(0, Number(steps[0].delayMinutes) || 0) : 0;
                const now = new Date();
                const firstSendAt = new Date(now.getTime() + firstDelay * 60 * 1000);

                await prisma.portalNurtureEnrollment.upsert({
                  where: { campaignId_contactId: { campaignId: campaign.id, contactId: effectiveContactId } },
                  create: {
                    id: crypto.randomUUID(),
                    ownerId: opts.ownerId,
                    campaignId: campaign.id,
                    contactId: effectiveContactId,
                    status: "ACTIVE",
                    stepIndex: 0,
                    nextSendAt: firstSendAt,
                    createdAt: now,
                    updatedAt: now,
                  },
                  update: {
                    status: "ACTIVE",
                    nextSendAt: firstSendAt,
                    updatedAt: now,
                  },
                });
              } catch {
                // best-effort
              }
            }
          }
        }
      }

      // trigger/delay/note/action all fall through via default output
      const nexts = outgoing.get(outgoingKey(currentId, "out")) || [];
      currentId = nexts[0] || null;
    }

    return;
  };

  for (const trigger of triggerNodes) {
    await runFromNode(String((trigger as any).id || "") || null, 0);
  }
}

export async function runOwnerAutomationsForInboundSms(opts: {
  ownerId: string;
  from: string;
  to: string;
  body: string;
}) {
  await runOwnerAutomationsForEvent({
    ownerId: opts.ownerId,
    triggerKind: "inbound_sms",
    message: { from: opts.from, to: opts.to, body: opts.body },
    contact: { phone: opts.from, name: opts.from },
  });
}

export async function runOwnerAutomationByIdForInboundSms(opts: {
  ownerId: string;
  automationId: string;
  from: string;
  to: string;
  body: string;
}) {
  await runOwnerAutomationByIdForEvent({
    ownerId: opts.ownerId,
    automationId: opts.automationId,
    triggerKind: "inbound_sms",
    message: { from: opts.from, to: opts.to, body: opts.body },
    contact: { phone: opts.from, name: opts.from },
  });
}

export async function runOwnerAutomationsForEvent(opts: {
  ownerId: string;
  triggerKind: TriggerKind;
  message?: { from?: string; to?: string; body?: string };
  contact?: { id?: string | null; name?: string | null; email?: string | null; phone?: string | null };
  event?: { tagId?: string; webhookKey?: string; triggerNodeId?: string; bookingId?: string; calendarId?: string; leadId?: string };
}) {
  const automations = await loadOwnerAutomations(opts.ownerId);

  await Promise.all(
    automations.map((automation) =>
      runAutomationOnce({
        ownerId: opts.ownerId,
        automation,
        triggerKind: opts.triggerKind,
        message: opts.message,
        contact: opts.contact,
        event: opts.event,
      }).catch(() => null),
    ),
  );
}

export async function runOwnerAutomationByIdForEvent(opts: {
  ownerId: string;
  automationId: string;
  triggerKind: TriggerKind;
  message?: { from?: string; to?: string; body?: string };
  contact?: { id?: string | null; name?: string | null; email?: string | null; phone?: string | null };
  event?: { tagId?: string; webhookKey?: string; triggerNodeId?: string; bookingId?: string; calendarId?: string; leadId?: string };
}) {
  const automations = await loadOwnerAutomations(opts.ownerId);
  const automation = automations.find((a) => a.id === opts.automationId);
  if (!automation) return;

  await runAutomationOnce({
    ownerId: opts.ownerId,
    automation,
    triggerKind: opts.triggerKind,
    message: opts.message,
    contact: opts.contact,
    event: opts.event,
  });
}
