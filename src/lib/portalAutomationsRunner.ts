import { prisma } from "@/lib/db";
import { sendOwnerTwilioSms } from "@/lib/portalTwilio";
import { findOrCreatePortalContact } from "@/lib/portalContacts";
import { addContactTagAssignment } from "@/lib/portalContactTags";

type EdgePort = "out" | "true" | "false";

type BuilderNodeType = "trigger" | "action" | "delay" | "condition" | "note";

type TriggerKind = "inbound_sms" | "inbound_mms" | "inbound_call" | "new_lead";

type ActionKind = "send_sms" | "send_email" | "add_tag" | "create_task";

type ConditionOp = "equals" | "contains" | "starts_with" | "ends_with" | "is_empty" | "is_not_empty";

type BuilderNodeConfig =
  | { kind: "trigger"; triggerKind: TriggerKind }
  | { kind: "action"; actionKind: ActionKind; body?: string; tagId?: string }
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

function isTriggerConfig(cfg: unknown): cfg is { kind: "trigger"; triggerKind: TriggerKind } {
  return getConfigKind(cfg) === "trigger";
}

function isActionConfig(cfg: unknown): cfg is { kind: "action"; actionKind: ActionKind; body?: string; tagId?: string } {
  return getConfigKind(cfg) === "action";
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
  message: { from: string; to: string; body: string };
}) {
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
    return isTriggerConfig(cfg) && cfg.triggerKind === opts.triggerKind;
  });

  if (!triggerNodes.length) return;

  const contactId = await findOrCreatePortalContact({
    ownerId: opts.ownerId,
    name: opts.message.from || "Contact",
    email: null,
    phone: opts.message.from || null,
  });

  const ctx = {
    message: opts.message,
    contact: { id: contactId, phone: opts.message.from || null, email: null, name: opts.message.from || null },
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
            if (opts.message.from) {
              try {
                await sendOwnerTwilioSms({ ownerId: opts.ownerId, to: opts.message.from, body: body.slice(0, 1200) });
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
  const automations = await loadOwnerAutomations(opts.ownerId);

  await Promise.all(
    automations.map((automation) =>
      runAutomationOnce({
        ownerId: opts.ownerId,
        automation,
        triggerKind: "inbound_sms",
        message: { from: opts.from, to: opts.to, body: opts.body },
      }).catch(() => null),
    ),
  );
}
