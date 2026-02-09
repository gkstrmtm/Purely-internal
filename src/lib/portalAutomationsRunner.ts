import { prisma } from "@/lib/db";
import { sendOwnerTwilioSms } from "@/lib/portalTwilio";
import { findOrCreatePortalContact } from "@/lib/portalContacts";
import { addContactTagAssignment } from "@/lib/portalContactTags";
import { sendEmail as sendSendgridEmail } from "@/lib/leadOutbound";

type EdgePort = "out" | "true" | "false";

type BuilderNodeType = "trigger" | "action" | "delay" | "condition" | "note";

type TriggerKind =
  | "inbound_sms"
  | "inbound_mms"
  | "inbound_call"
  | "inbound_email"
  | "new_lead"
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

type ActionKind = "send_sms" | "send_email" | "add_tag" | "create_task";

type MessageTarget = "inbound_sender" | "event_contact" | "internal_notification" | "custom";

type ConditionOp = "equals" | "contains" | "starts_with" | "ends_with" | "is_empty" | "is_not_empty";

type BuilderNodeConfig =
  | { kind: "trigger"; triggerKind: TriggerKind }
  | {
      kind: "action";
      actionKind: ActionKind;
      body?: string;
      subject?: string;
      tagId?: string;
      smsTo?: MessageTarget;
      smsToNumber?: string;
      emailTo?: Exclude<MessageTarget, "inbound_sender">;
      emailToAddress?: string;
    }
  | { kind: "delay"; minutes: number }
  | { kind: "condition"; left: string; op: ConditionOp; right: string }
  | { kind: "note"; text: string };

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

async function getOwnerInternalEmail(ownerId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: ownerId }, select: { email: true } });
  const email = user?.email?.trim() || "";
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

function fieldValue(leftRaw: string, ctx: {
  message: { from: string; to: string; body: string };
  contact: { id: string | null; phone: string | null; email: string | null; name: string | null };
}) {
  const left = String(leftRaw || "").trim();
  switch (left) {
    case "message.body":
      return ctx.message.body;
    case "message.from":
      return ctx.message.from;
    case "message.to":
      return ctx.message.to;
    case "contact.id":
      return ctx.contact.id || "";
    case "contact.phone":
      return ctx.contact.phone || "";
    case "contact.email":
      return ctx.contact.email || "";
    case "contact.name":
      return ctx.contact.name || "";
    default:
      return "";
  }
}

function evalCondition(cfg: { left: string; op: ConditionOp; right: string }, ctx: {
  message: { from: string; to: string; body: string };
  contact: { id: string | null; phone: string | null; email: string | null; name: string | null };
}) {
  const left = coerceString(fieldValue(cfg.left, ctx));
  const right = coerceString(cfg.right);
  const a = left;
  const b = right;

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
  event?: { tagId?: string; webhookKey?: string };
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

  const eventEmail =
    (opts.contact?.email && String(opts.contact.email).trim()) || (looksLikeEmail(message.from) ? message.from.trim() : "");
  const eventPhone =
    (opts.contact?.phone && String(opts.contact.phone).trim()) || (looksLikePhone(message.from) ? message.from.trim() : "");

  const eventName =
    (opts.contact?.name && String(opts.contact.name).trim()) || eventPhone || eventEmail || message.from.trim() || "Contact";

  const contactId =
    (opts.contact?.id ? String(opts.contact.id) : "") ||
    (await findOrCreatePortalContact({
      ownerId: opts.ownerId,
      name: eventName,
      email: eventEmail || null,
      phone: eventPhone || null,
    }));

  const contactRow = contactId ? await getPortalContactById(opts.ownerId, contactId).catch(() => null) : null;

  const ctx = {
    message,
    contact: {
      id: contactId,
      phone: contactRow?.phone || (eventPhone || null) || (looksLikePhone(message.from) ? message.from : null) || null,
      email: contactRow?.email || (eventEmail || null) || (looksLikeEmail(message.from) ? message.from : null) || null,
      name: contactRow?.name || eventName || null,
    },
  };

  const maxSteps = 120;

  for (const trigger of triggerNodes) {
    let currentId: string | null = String((trigger as any).id || "") || null;
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
        const ok = isConditionConfig(cfg) ? evalCondition(cfg, ctx) : false;
        const port: EdgePort = ok ? "true" : "false";
        const nexts = outgoing.get(outgoingKey(currentId, port)) || [];
        currentId = nexts[0] || null;
        continue;
      }

      if (node.type === "action") {
        const cfg = (node as any).config;
        if (isActionConfig(cfg)) {
          if (cfg.actionKind === "send_sms") {
            const body = String(cfg.body || "").trim() || "Got it — thanks!";
            const target = (String((cfg as any).smsTo || "inbound_sender") as MessageTarget) || "inbound_sender";
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

          if (cfg.actionKind === "send_email") {
            const text = String((cfg as any).body || "").trim();
            const subject = String((cfg as any).subject || "").trim() || "Automated message";
            const target = (String((cfg as any).emailTo || "internal_notification") as Exclude<MessageTarget, "inbound_sender">) ||
              "internal_notification";

            let toEmail: string | null = null;
            if (target === "event_contact") toEmail = ctx.contact.email || null;
            if (target === "internal_notification") toEmail = await getOwnerInternalEmail(opts.ownerId).catch(() => null);
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
        }
      }

      // trigger/delay/note/action all fall through via default output
      const nexts = outgoing.get(outgoingKey(currentId, "out")) || [];
      currentId = nexts[0] || null;
    }
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
  event?: { tagId?: string; webhookKey?: string };
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
  event?: { tagId?: string; webhookKey?: string };
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
