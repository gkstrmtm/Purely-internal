"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type BuilderNodeType = "trigger" | "action" | "delay" | "condition" | "note";

type EdgePort = "out" | "true" | "false";

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
type ConditionOp = "equals" | "contains" | "starts_with" | "ends_with" | "is_empty" | "is_not_empty";

type MessageTarget = "inbound_sender" | "event_contact" | "internal_notification" | "custom";

type BuilderNodeConfig =
  | { kind: "trigger"; triggerKind: TriggerKind; tagId?: string; webhookKey?: string }
  | {
      kind: "action";
      actionKind: ActionKind;
      body?: string;
      subject?: string;
      tagId?: string;
      assignedToUserId?: string;
      smsTo?: MessageTarget;
      smsToNumber?: string;
      emailTo?: MessageTarget;
      emailToAddress?: string;
    }
  | { kind: "delay"; minutes: number }
  | { kind: "condition"; left: string; op: ConditionOp; right: string }
  | { kind: "note"; text: string };

type ContactTag = { id: string; name: string; color: string | null };

type AccountMember = {
  userId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  user: { id: string; email: string; name: string; role: string; active: boolean };
  implicit?: boolean;
};

const TAG_COLORS = [
  "#0EA5E9", // sky
  "#2563EB", // blue
  "#7C3AED", // violet
  "#EC4899", // pink
  "#F97316", // orange
  "#F59E0B", // amber
  "#10B981", // emerald
  "#22C55E", // green
  "#64748B", // slate
  "#111827", // gray-900
] as const;

function ColorSwatches({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const colors = (TAG_COLORS as readonly string[]).includes(value)
    ? (TAG_COLORS as readonly string[])
    : ([value, ...TAG_COLORS] as const);

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {colors.map((c) => {
        const selected = c.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(c);
            }}
            className={
              selected
                ? "h-7 w-7 rounded-full ring-2 ring-zinc-900 ring-offset-2"
                : "h-7 w-7 rounded-full ring-1 ring-zinc-300 hover:ring-zinc-400"
            }
            style={{ backgroundColor: c }}
            aria-label={`Pick ${c}`}
            title={c}
          />
        );
      })}
    </div>
  );
}

type BuilderNode = {
  id: string;
  type: BuilderNodeType;
  label: string;
  x: number;
  y: number;
  config?: BuilderNodeConfig;
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
  updatedAtIso?: string;
  nodes: BuilderNode[];
  edges: BuilderEdge[];
};

type ApiPayload =
  | { ok: true; automations: Automation[] }
  | { error: string };

const NODE_W = 240;
const NODE_H = 76;

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function clampInt(n: number, min: number, max: number) {
  const v = Number.isFinite(n) ? Math.round(n) : min;
  return Math.max(min, Math.min(max, v));
}

function safeString(v: unknown, fallback: string) {
  return typeof v === "string" && v.trim() ? v : fallback;
}

function badgeForType(t: BuilderNodeType) {
  switch (t) {
    case "trigger":
      return { label: "Trigger", cls: "bg-sky-50 text-sky-700 border-sky-200" };
    case "action":
      return { label: "Action", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "delay":
      return { label: "Delay", cls: "bg-amber-50 text-amber-700 border-amber-200" };
    case "condition":
      return { label: "Condition", cls: "bg-violet-50 text-violet-700 border-violet-200" };
    default:
      return { label: "Note", cls: "bg-zinc-50 text-zinc-700 border-zinc-200" };
  }
}

function edgePath(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(80, Math.abs(x2 - x1) * 0.5);
  const c1x = x1 + dx;
  const c2x = x2 - dx;
  return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
}

function buildStarterAutomation(): Automation {
  const triggerId = uid("n");
  const actionId = uid("n");

  return {
    id: uid("auto"),
    name: "New automation",
    updatedAtIso: new Date().toISOString(),
    nodes: [
      {
        id: triggerId,
        type: "trigger",
        label: "Trigger: Inbound SMS",
        x: 80,
        y: 120,
        config: { kind: "trigger", triggerKind: "inbound_sms" },
      },
      {
        id: actionId,
        type: "action",
        label: "Action: Send SMS",
        x: 420,
        y: 120,
        config: { kind: "action", actionKind: "send_sms", smsTo: "inbound_sender", body: "" },
      },
    ],
    edges: [{ id: uid("e"), from: triggerId, to: actionId }],
  };
}

function defaultConfigForType(t: BuilderNodeType): BuilderNodeConfig {
  switch (t) {
    case "trigger":
      return { kind: "trigger", triggerKind: "inbound_sms" };
    case "action":
      return { kind: "action", actionKind: "send_sms", smsTo: "inbound_sender", body: "" };
    case "delay":
      return { kind: "delay", minutes: 5 };
    case "condition":
      return { kind: "condition", left: "contact.phone", op: "is_not_empty", right: "" };
    default:
      return { kind: "note", text: "" };
  }
}

function labelForConfig(t: BuilderNodeType, cfg: BuilderNodeConfig | undefined) {
  if (!cfg) {
    return t === "note" ? "Note" : `${t[0].toUpperCase()}${t.slice(1)}: (configure)`;
  }

  if (cfg.kind === "trigger") {
    const map: Record<TriggerKind, string> = {
      inbound_sms: "Inbound SMS",
      inbound_mms: "Inbound MMS",
      inbound_call: "Inbound Call",
      inbound_email: "Inbound Email",
      new_lead: "New Lead",
      tag_added: "Tag added",
      contact_created: "Contact created",
      task_added: "Task added",
      inbound_webhook: "Inbound webhook",
      scheduled_time: "Scheduled time",
      missed_appointment: "Missed appointment",
      appointment_booked: "Appointment booked",
      missed_call: "Missed call",
      review_received: "Review received",
      follow_up_sent: "Follow-up sent",
      outbound_sent: "Outbound sent",
    };
    return `Trigger: ${map[cfg.triggerKind]}`;
  }
  if (cfg.kind === "action") {
    const map: Record<ActionKind, string> = {
      send_sms: "Send SMS",
      send_email: "Send Email",
      add_tag: "Add Tag",
      create_task: "Create Task",
    };
    return `Action: ${map[cfg.actionKind]}`;
  }
  if (cfg.kind === "delay") {
    const m = Math.max(0, Math.floor(cfg.minutes || 0));
    return `Delay: ${m} minute${m === 1 ? "" : "s"}`;
  }
  if (cfg.kind === "condition") {
    const left = cfg.left?.trim() || "(field)";
    const right = cfg.right?.trim() || "";
    const opLabel: Record<ConditionOp, string> = {
      equals: "=",
      contains: "contains",
      starts_with: "starts with",
      ends_with: "ends with",
      is_empty: "is empty",
      is_not_empty: "is not empty",
    };
    const op = opLabel[cfg.op] ?? cfg.op;
    return `Condition: ${left} ${op}${cfg.op === "is_empty" || cfg.op === "is_not_empty" ? "" : ` ${right || "(value)"}`}`;
  }
  return "Note";
}

function shouldAutolabel(currentLabel: string) {
  const s = (currentLabel || "").trim();
  if (!s) return true;
  if (s.includes("(choose one)")) return true;
  if (s.includes("(configure)")) return true;
  if (/^(Trigger|Action|Delay|Condition):/i.test(s)) return true;
  return false;
}

export function PortalAutomationsClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [testOpen, setTestOpen] = useState(false);
  const [testFrom, setTestFrom] = useState("+15555550123");
  const [testBody, setTestBody] = useState("Hello");

  const [ownerTags, setOwnerTags] = useState<ContactTag[]>([]);
  const [accountMembers, setAccountMembers] = useState<AccountMember[]>([]);

  const [createTagOpen, setCreateTagOpen] = useState(false);
  const [createTagName, setCreateTagName] = useState("");
  const [createTagColor, setCreateTagColor] = useState<string>("#2563EB");
  const [createTagBusy, setCreateTagBusy] = useState(false);
  const [createTagError, setCreateTagError] = useState<string | null>(null);
  const [createTagApplyTo, setCreateTagApplyTo] = useState<null | { nodeId: string; kind: "action" | "trigger" }>(null);

  const CREATE_TAG_VALUE = "__create_tag__";

  const [automations, setAutomations] = useState<Automation[]>([]);
  const [selectedAutomationId, setSelectedAutomationId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement | null>(null);

  const [view, setView] = useState<{ panX: number; panY: number; zoom: number }>({ panX: 80, panY: 80, zoom: 1 });

  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const [panning, setPanning] = useState<
    | null
    | {
        startClientX: number;
        startClientY: number;
        startPanX: number;
        startPanY: number;
      }
  >(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [autolabelSelectedNode, setAutolabelSelectedNode] = useState(true);

  const [dragging, setDragging] = useState<
    | null
    | {
        nodeId: string;
        startClientX: number;
        startClientY: number;
        startX: number;
        startY: number;
      }
  >(null);

  const [connecting, setConnecting] = useState<
    | null
    | {
        fromNodeId: string;
        fromPort: EdgePort;
        fromX: number;
        fromY: number;
        curX: number;
        curY: number;
      }
  >(null);

  function setSelectedAutomation(nextId: string | null) {
    setSelectedAutomationId(nextId);
    setSelectedNodeId(null);
    setAutolabelSelectedNode(true);
    try {
      const url = new URL(window.location.href);
      if (!nextId) url.searchParams.delete("automation");
      else url.searchParams.set("automation", nextId);
      window.history.replaceState(null, "", url.toString());
    } catch {
      // ignore
    }
  }

  function updateSelectedAutomation(mutator: (a: Automation) => Automation) {
    setAutomations((prev) =>
      prev.map((a) => (a.id === selectedAutomationId ? mutator(a) : a)),
    );
  }

  const selectedAutomation = useMemo(() => {
    if (!selectedAutomationId) return null;
    return automations.find((a) => a.id === selectedAutomationId) ?? null;
  }, [automations, selectedAutomationId]);

  const selectedNode = useMemo(() => {
    if (!selectedAutomation || !selectedNodeId) return null;
    return selectedAutomation.nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [selectedAutomation, selectedNodeId]);

  function clampZoom(z: number) {
    return clamp(z, 0.3, 2.5);
  }

  async function load() {
    setLoading(true);
    setError(null);
    setNote(null);

    const res = await fetch("/api/portal/automations/settings", { cache: "no-store" }).catch(() => null as any);
    if (!res?.ok) {
      setLoading(false);
      setError("Failed to load.");
      return;
    }

    const data = (await res.json().catch(() => null)) as ApiPayload | null;
    if (!data || (data as any).error) {
      setLoading(false);
      setError((data as any)?.error || "Failed to load.");
      return;
    }

    const list = Array.isArray((data as any).automations) ? ((data as any).automations as Automation[]) : [];
    setAutomations(list);

    let selected: string | null = null;
    try {
      const url = new URL(window.location.href);
      const a = url.searchParams.get("automation");
      if (a && list.some((x) => x.id === a)) selected = a;
    } catch {
      // ignore
    }

    if (!selected && list[0]?.id) selected = list[0].id;

    if (!selected) {
      const starter = buildStarterAutomation();
      setAutomations([starter]);
      selected = starter.id;
    }

    setSelectedAutomationId(selected);
    setLoading(false);
  }

  function disconnectIncoming(nodeId: string) {
    if (!selectedAutomation) return;
    updateSelectedAutomation((a) => {
      const nextEdges = a.edges.filter((e) => e.to !== nodeId);
      if (nextEdges.length === a.edges.length) return a;
      return { ...a, edges: nextEdges, updatedAtIso: new Date().toISOString() };
    });
  }

  function disconnectOutgoing(nodeId: string) {
    if (!selectedAutomation) return;
    updateSelectedAutomation((a) => {
      const nextEdges = a.edges.filter((e) => e.from !== nodeId);
      if (nextEdges.length === a.edges.length) return a;
      return { ...a, edges: nextEdges, updatedAtIso: new Date().toISOString() };
    });
  }

  function disconnectOutgoingPort(nodeId: string, fromPort: EdgePort) {
    if (!selectedAutomation) return;
    updateSelectedAutomation((a) => {
      const nextEdges = a.edges.filter((e) => !(e.from === nodeId && (e.fromPort ?? "out") === fromPort));
      if (nextEdges.length === a.edges.length) return a;
      return { ...a, edges: nextEdges, updatedAtIso: new Date().toISOString() };
    });
  }

  async function saveAll(next?: Automation[]) {
    setSaving(true);
    setError(null);
    setNote(null);

    const payload = { automations: next ?? automations };

    const res = await fetch("/api/portal/automations/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null as any);

    const data = (await res?.json?.().catch(() => null)) as ApiPayload | null;
    if (!res?.ok || !data || (data as any).error) {
      setSaving(false);
      setError((data as any)?.error || "Save failed.");
      return;
    }

    setAutomations((data as any).automations || []);
    setSaving(false);
    setNote("Saved.");
    window.setTimeout(() => setNote(null), 1400);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/portal/people/users", { cache: "no-store" }).catch(() => null as any);
      const data = (await res?.json?.().catch(() => null)) as any;
      if (cancelled) return;
      if (res?.ok && data?.ok && Array.isArray(data?.members)) {
        setAccountMembers(
          (data.members as any[])
            .map((m) => ({
              userId: String(m?.userId || m?.user?.id || ""),
              role: (String(m?.role || "MEMBER") as any) || "MEMBER",
              implicit: Boolean(m?.implicit),
              user: {
                id: String(m?.user?.id || m?.userId || ""),
                email: String(m?.user?.email || ""),
                name: String(m?.user?.name || ""),
                role: String(m?.user?.role || "CLIENT"),
                active: Boolean(m?.user?.active ?? true),
              },
            }))
            .filter((m) => m.userId && m.user.id),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function createOwnerTag(name: string, color?: string | null) {
    const clean = String(name || "").trim().slice(0, 60);
    if (!clean) return null;

    const safeColor = typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color.trim()) ? color.trim() : null;

    setCreateTagBusy(true);
    setCreateTagError(null);
    const res = await fetch("/api/portal/contact-tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(safeColor ? { name: clean, color: safeColor } : { name: clean }),
    }).catch(() => null as any);

    const data = (await res?.json?.().catch(() => null)) as any;
    if (!res?.ok || !data?.ok || !data?.tag?.id) {
      setCreateTagBusy(false);
      setCreateTagError(String(data?.error || "Failed to create tag."));
      return null;
    }

    const created: ContactTag = {
      id: String(data.tag.id),
      name: String(data.tag.name || clean).slice(0, 60),
      color: typeof data.tag.color === "string" ? String(data.tag.color) : null,
    };

    setOwnerTags((prev) => {
      const next = [...prev.filter((t) => t.id !== created.id), created];
      next.sort((a, b) => a.name.localeCompare(b.name));
      return next;
    });

    setCreateTagBusy(false);
    return created;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/portal/contact-tags", { cache: "no-store" }).catch(() => null as any);
      const data = (await res?.json?.().catch(() => null)) as any;
      if (cancelled) return;
      if (res?.ok && data?.ok && Array.isArray(data?.tags)) {
        setOwnerTags(
          (data.tags as any[]).map((t) => ({
            id: String(t?.id || ""),
            name: String(t?.name || "").slice(0, 60),
            color: typeof t?.color === "string" ? String(t.color) : null,
          })),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (ev: WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      const v = viewRef.current;

      // Contain scroll/zoom within the canvas.
      ev.preventDefault();
      ev.stopPropagation();

      // Trackpad pinch triggers ctrl/meta wheel in browsers.
      if (ev.ctrlKey || ev.metaKey) {
        const dir = ev.deltaY < 0 ? 1 : -1;
        const factor = dir > 0 ? 1.1 : 0.9;
        const nextZoom = clampZoom(v.zoom * factor);

        const wx = (ev.clientX - rect.left - v.panX) / v.zoom;
        const wy = (ev.clientY - rect.top - v.panY) / v.zoom;
        const nextPanX = ev.clientX - rect.left - wx * nextZoom;
        const nextPanY = ev.clientY - rect.top - wy * nextZoom;

        setView({
          zoom: nextZoom,
          panX: clamp(nextPanX, -6000, 6000),
          panY: clamp(nextPanY, -6000, 6000),
        });
        return;
      }

      // Two-finger scroll pans around the world.
      setView((prev) => ({
        ...prev,
        panX: clamp(prev.panX - ev.deltaX, -6000, 6000),
        panY: clamp(prev.panY - ev.deltaY, -6000, 6000),
      }));
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", onWheel as any);
    };
  }, []);

  useEffect(() => {
    const onMove = (ev: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();

      if (panning) {
        const dx = ev.clientX - panning.startClientX;
        const dy = ev.clientY - panning.startClientY;
        setView((prev) => ({
          ...prev,
          panX: clamp(panning.startPanX + dx, -6000, 6000),
          panY: clamp(panning.startPanY + dy, -6000, 6000),
        }));
      }

      if (dragging && selectedAutomationId) {
        const dx = (ev.clientX - dragging.startClientX) / view.zoom;
        const dy = (ev.clientY - dragging.startClientY) / view.zoom;
        const nextX = dragging.startX + dx;
        const nextY = dragging.startY + dy;

        updateSelectedAutomation((a) => {
          const nodes = a.nodes.map((n) =>
            n.id === dragging.nodeId ? { ...n, x: clamp(nextX, -6000, 8000), y: clamp(nextY, -6000, 8000) } : n,
          );
          return { ...a, nodes, updatedAtIso: new Date().toISOString() };
        });
      }

      if (connecting) {
        setConnecting((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            curX: clamp((ev.clientX - rect.left - view.panX) / view.zoom, -6000, 8000),
            curY: clamp((ev.clientY - rect.top - view.panY) / view.zoom, -6000, 8000),
          };
        });
      }
    };

    const onUp = () => {
      if (dragging) setDragging(null);
      if (connecting) setConnecting(null);
      if (panning) setPanning(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, connecting, selectedAutomationId, view.zoom, view.panX, view.panY, panning]);

  function onCanvasDrop(ev: React.DragEvent) {
    ev.preventDefault();
    const t = (ev.dataTransfer.getData("text/plain") || "").trim() as BuilderNodeType;
    if (!t) return;

    const canvas = canvasRef.current;
    if (!canvas || !selectedAutomationId) return;

    const rect = canvas.getBoundingClientRect();
    const x = clamp((ev.clientX - rect.left - view.panX) / view.zoom - NODE_W / 2, -6000, 8000);
    const y = clamp((ev.clientY - rect.top - view.panY) / view.zoom - NODE_H / 2, -6000, 8000);

    const config = defaultConfigForType(t);
    const node: BuilderNode = { id: uid("n"), type: t, label: labelForConfig(t, config), x, y, config };

    updateSelectedAutomation((a) => ({
      ...a,
      nodes: [...a.nodes, node].slice(0, 250),
      updatedAtIso: new Date().toISOString(),
    }));

    setSelectedNodeId(node.id);
    setAutolabelSelectedNode(true);
  }

  function handleStartDragNode(ev: React.PointerEvent, nodeId: string) {
    if (!selectedAutomation) return;
    const node = selectedAutomation.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
    setDragging({
      nodeId,
      startClientX: ev.clientX,
      startClientY: ev.clientY,
      startX: node.x,
      startY: node.y,
    });
  }

  function startConnect(fromNodeId: string, fromPort: EdgePort = "out") {
    const canvas = canvasRef.current;
    if (!canvas || !selectedAutomation) return;

    const from = selectedAutomation.nodes.find((n) => n.id === fromNodeId);
    if (!from) return;

    const fromX = from.x + NODE_W;
    const fromY =
      from.type === "condition"
        ? fromPort === "true"
          ? from.y + NODE_H * 0.35
          : fromPort === "false"
            ? from.y + NODE_H * 0.65
            : from.y + NODE_H / 2
        : from.y + NODE_H / 2;

    setConnecting({ fromNodeId, fromPort, fromX, fromY, curX: fromX, curY: fromY });
  }

  function completeConnect(toNodeId: string) {
    if (!connecting || !selectedAutomation) return;
    if (connecting.fromNodeId === toNodeId) {
      setConnecting(null);
      return;
    }

    const to = selectedAutomation.nodes.find((n) => n.id === toNodeId);
    if (!to) {
      setConnecting(null);
      return;
    }

    updateSelectedAutomation((a) => {
      const exists = a.edges.some(
        (e) => e.from === connecting.fromNodeId && (e.fromPort ?? "out") === connecting.fromPort && e.to === toNodeId,
      );
      if (exists) return a;

      const nextEdges = [...a.edges, { id: uid("e"), from: connecting.fromNodeId, fromPort: connecting.fromPort, to: toNodeId }].slice(0, 500);
      return { ...a, edges: nextEdges, updatedAtIso: new Date().toISOString() };
    });

    setConnecting(null);
  }

  function deleteSelectedNode() {
    if (!selectedAutomation || !selectedNodeId) return;

    updateSelectedAutomation((a) => {
      const nodes = a.nodes.filter((n) => n.id !== selectedNodeId);
      const edges = a.edges.filter((e) => e.from !== selectedNodeId && e.to !== selectedNodeId);
      return { ...a, nodes, edges, updatedAtIso: new Date().toISOString() };
    });

    setSelectedNodeId(null);
    setAutolabelSelectedNode(true);
  }

  function deleteSelectedEdge(edgeId: string) {
    if (!selectedAutomation) return;
    updateSelectedAutomation((a) => ({
      ...a,
      edges: a.edges.filter((e) => e.id !== edgeId),
      updatedAtIso: new Date().toISOString(),
    }));
  }

  function createAutomation() {
    const next: Automation = {
      id: uid("auto"),
      name: `Automation ${automations.length + 1}`,
      updatedAtIso: new Date().toISOString(),
      nodes: [{ id: uid("n"), type: "trigger", label: "Trigger: Inbound SMS", x: 100, y: 120 }],
      edges: [],
    };

    next.nodes[0].config = defaultConfigForType("trigger");

    const list = [next, ...automations].slice(0, 50);
    setAutomations(list);
    setSelectedAutomation(next.id);
    void saveAll(list);
  }

  function openRenameModal() {
    if (!selectedAutomation || saving) return;
    setRenameValue(selectedAutomation.name);
    setRenameOpen(true);
  }

  function applyRename(nextNameRaw: string) {
    if (!selectedAutomation) return;
    const trimmed = String(nextNameRaw || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    if (!trimmed) return;

    const nextList = automations.map((a) =>
      a.id === selectedAutomation.id ? { ...a, name: trimmed, updatedAtIso: new Date().toISOString() } : a,
    );
    setAutomations(nextList);
    void saveAll(nextList);
  }

  function duplicateAutomation() {
    if (!selectedAutomation) return;
    const copy: Automation = {
      ...selectedAutomation,
      id: uid("auto"),
      name: `${selectedAutomation.name} (copy)`
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80),
      updatedAtIso: new Date().toISOString(),
      nodes: selectedAutomation.nodes.map((n) => ({ ...n, id: uid("n") })),
      edges: [],
    };

    // Re-map edges using old->new ids by index ordering
    const oldIds = selectedAutomation.nodes.map((n) => n.id);
    const newIds = copy.nodes.map((n) => n.id);
    const map = new Map<string, string>();
    for (let i = 0; i < Math.min(oldIds.length, newIds.length); i++) map.set(oldIds[i], newIds[i]);
    copy.edges = selectedAutomation.edges
      .flatMap((e) => {
        const from = map.get(e.from);
        const to = map.get(e.to);
        if (!from || !to) return [] as BuilderEdge[];
        return [{ id: uid("e"), from, to }];
      })
      .slice(0, 500);

    const nextList = [copy, ...automations].slice(0, 50);
    setAutomations(nextList);
    setSelectedAutomation(copy.id);
    void saveAll(nextList);
  }

  function deleteAutomation() {
    if (!selectedAutomation) return;
    const ok = window.confirm(`Delete automation "${selectedAutomation.name}"?`);
    if (!ok) return;

    const nextList = automations.filter((a) => a.id !== selectedAutomation.id);
    setAutomations(nextList);
    setSelectedAutomation(nextList[0]?.id ?? null);
    void saveAll(nextList);
  }

  function openTestModal() {
    if (!selectedAutomation || saving) return;
    setTestFrom("+15555550123");
    setTestBody("Hello");
    setTestOpen(true);
  }

  async function runTestAutomation() {
    if (!selectedAutomation) return;

    const from = String(testFrom || "").trim().slice(0, 64);
    const body = String(testBody ?? "").slice(0, 2000);
    if (!from) return;

    setSaving(true);
    setError(null);
    setNote(null);

    try {
      const res = await fetch("/api/portal/automations/test-sms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ automationId: selectedAutomation.id, from, body }),
      }).catch(() => null as any);

      const data = (await res?.json?.().catch(() => null)) as any;
      if (!res?.ok || !data?.ok) {
        setSaving(false);
        setError(data?.error || "Test failed.");
        return;
      }

      setSaving(false);
      setNote("Test started.");
      window.setTimeout(() => setNote(null), 1400);
      setTestOpen(false);
    } catch {
      setSaving(false);
      setError("Test failed.");
    }
  }

  const nodesById = useMemo(() => {
    const m = new Map<string, BuilderNode>();
    for (const n of selectedAutomation?.nodes ?? []) m.set(n.id, n);
    return m;
  }, [selectedAutomation]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-zinc-600">Loading…</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Automation Builder</h1>
          <div className="mt-1 text-sm text-zinc-600">Drag triggers + steps, connect them, and save multiple automations.</div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/portal/app/services" className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50">
            All services
          </Link>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {note ? <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{note}</div> : null}

      {renameOpen && selectedAutomation ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={() => setRenameOpen(false)}>
          <div
            className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-4 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Rename automation</div>
                <div className="mt-1 text-sm text-zinc-600">Update the name shown in the left panel.</div>
              </div>
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
                onClick={() => setRenameOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-4">
              <label className="text-xs font-semibold text-zinc-600">Name</label>
              <input
                value={renameValue}
                autoFocus
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    applyRename(renameValue);
                    setRenameOpen(false);
                  }
                  if (e.key === "Escape") setRenameOpen(false);
                }}
                className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-300"
                placeholder="Automation name"
                maxLength={80}
              />
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
                onClick={() => setRenameOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                onClick={() => {
                  applyRename(renameValue);
                  setRenameOpen(false);
                }}
                disabled={!String(renameValue || "").trim() || saving}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {testOpen && selectedAutomation ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={() => setTestOpen(false)}>
          <div
            className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-4 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Test inbound SMS</div>
                <div className="mt-1 text-sm text-zinc-600">Runs this automation as if a text was received.</div>
              </div>
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
                onClick={() => setTestOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <div>
                <label className="text-xs font-semibold text-zinc-600">From (E.164)</label>
                <input
                  value={testFrom}
                  autoFocus
                  onChange={(e) => setTestFrom(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setTestOpen(false);
                  }}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-300"
                  placeholder="+15555550123"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-600">Message</label>
                <textarea
                  value={testBody}
                  onChange={(e) => setTestBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setTestOpen(false);
                  }}
                  className="mt-1 min-h-[110px] w-full resize-y rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-300"
                  placeholder="Hello"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
                onClick={() => setTestOpen(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                onClick={() => void runTestAutomation()}
                disabled={!String(testFrom || "").trim() || saving}
              >
                {saving ? "Running…" : "Run test"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createTagOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={() => setCreateTagOpen(false)}>
          <div
            className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-4 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Create tag</div>
                <div className="mt-1 text-sm text-zinc-600">Add a reusable tag you can use anywhere.</div>
              </div>
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
                onClick={() => setCreateTagOpen(false)}
                disabled={createTagBusy}
              >
                Close
              </button>
            </div>

            {createTagError ? <div className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">{createTagError}</div> : null}

            <div className="mt-4">
              <label className="text-xs font-semibold text-zinc-600">Name</label>
              <input
                value={createTagName}
                autoFocus
                onChange={(e) => setCreateTagName(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === "Escape") setCreateTagOpen(false);
                  if (e.key === "Enter") {
                    const created = await createOwnerTag(createTagName, createTagColor);
                    if (!created) return;
                    if (createTagApplyTo && selectedAutomationId) {
                      updateSelectedAutomation((a) => {
                        const nodes = a.nodes.map((n) => {
                          if (n.id !== createTagApplyTo.nodeId) return n;
                          if (createTagApplyTo.kind === "action") {
                            const prev = n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                            const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "action", tagId: created.id };
                            const nextLabel =
                              autolabelSelectedNode && shouldAutolabel(n.label) ? labelForConfig("action", nextCfg) : n.label;
                            return { ...n, config: nextCfg, label: nextLabel };
                          }
                          const prev = n.config?.kind === "trigger" ? n.config : (defaultConfigForType("trigger") as any);
                          const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "trigger", tagId: created.id };
                          const nextLabel =
                            autolabelSelectedNode && shouldAutolabel(n.label) ? labelForConfig("trigger", nextCfg) : n.label;
                          return { ...n, config: nextCfg, label: nextLabel };
                        });
                        return { ...a, nodes, updatedAtIso: new Date().toISOString() };
                      });
                    }
                    setCreateTagOpen(false);
                    setCreateTagName("");
                    setCreateTagApplyTo(null);
                    setCreateTagError(null);
                  }
                }}
                className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-300"
                placeholder="e.g. Hot lead"
                maxLength={60}
                disabled={createTagBusy}
              />
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-zinc-600">Color</div>
              <ColorSwatches value={createTagColor} onChange={(hex) => setCreateTagColor(hex)} />
              <div className="mt-1 text-[11px] text-zinc-500">Pick one of the standard tag colors.</div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
                onClick={() => setCreateTagOpen(false)}
                disabled={createTagBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                onClick={async () => {
                  const created = await createOwnerTag(createTagName, createTagColor);
                  if (!created) return;
                  if (createTagApplyTo && selectedAutomationId) {
                    updateSelectedAutomation((a) => {
                      const nodes = a.nodes.map((n) => {
                        if (n.id !== createTagApplyTo.nodeId) return n;
                        if (createTagApplyTo.kind === "action") {
                          const prev = n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                          const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "action", tagId: created.id };
                          const nextLabel =
                            autolabelSelectedNode && shouldAutolabel(n.label) ? labelForConfig("action", nextCfg) : n.label;
                          return { ...n, config: nextCfg, label: nextLabel };
                        }
                        const prev = n.config?.kind === "trigger" ? n.config : (defaultConfigForType("trigger") as any);
                        const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "trigger", tagId: created.id };
                        const nextLabel =
                          autolabelSelectedNode && shouldAutolabel(n.label) ? labelForConfig("trigger", nextCfg) : n.label;
                        return { ...n, config: nextCfg, label: nextLabel };
                      });
                      return { ...a, nodes, updatedAtIso: new Date().toISOString() };
                    });
                  }
                  setCreateTagOpen(false);
                  setCreateTagName("");
                  setCreateTagApplyTo(null);
                  setCreateTagError(null);
                }}
                disabled={!String(createTagName || "").trim() || createTagBusy}
              >
                {createTagBusy ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-3">
          <div className="rounded-3xl border border-zinc-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-zinc-900">Automations</div>
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
                onClick={createAutomation}
                disabled={saving}
              >
                + New
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {automations
                .filter((a) => a.id !== selectedAutomationId)
                .map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-sm transition hover:bg-zinc-100"
                    onClick={() => setSelectedAutomation(a.id)}
                  >
                    <div className="truncate font-semibold text-zinc-900">{a.name}</div>
                    <div className="mt-1 text-xs text-zinc-600">
                      {(a.nodes?.length ?? 0)} nodes · {(a.edges?.length ?? 0)} connections
                    </div>
                  </button>
                ))}
            </div>

            {selectedAutomation ? (
              <div className="mt-4">
                <div className="rounded-2xl border border-zinc-900 bg-zinc-900 px-4 py-3 text-white">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate text-sm font-semibold">{selectedAutomation.name}</div>
                    <button
                      type="button"
                      className="shrink-0 rounded-xl border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs font-semibold hover:bg-zinc-700 disabled:opacity-60"
                      onClick={openRenameModal}
                      disabled={saving}
                    >
                      Rename
                    </button>
                  </div>
                  <div className="mt-1 text-xs text-zinc-200">
                    {(selectedAutomation.nodes?.length ?? 0)} nodes · {(selectedAutomation.edges?.length ?? 0)} connections
                  </div>
                </div>

                <div className="mt-3 grid gap-2">
                  <button
                    type="button"
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-60"
                    onClick={openTestModal}
                    disabled={saving}
                  >
                    Test automation
                  </button>
                  <button
                    type="button"
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-60"
                    onClick={duplicateAutomation}
                    disabled={saving}
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="w-full rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                    onClick={() => void saveAll()}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                    onClick={deleteAutomation}
                    disabled={saving}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-4">
            <div className="text-sm font-semibold text-zinc-900">Palette</div>
            <div className="mt-1 text-sm text-zinc-600">Drag onto the canvas.</div>

            <div className="mt-3 space-y-2">
              {([
                { type: "trigger" as const, title: "Trigger" },
                { type: "action" as const, title: "Action" },
                { type: "condition" as const, title: "Condition" },
                { type: "delay" as const, title: "Delay" },
                { type: "note" as const, title: "Note" },
              ] as const).map((x) => {
                const b = badgeForType(x.type);
                return (
                  <div
                    key={x.type}
                    draggable
                    onDragStart={(ev) => {
                      ev.dataTransfer.setData("text/plain", x.type);
                      ev.dataTransfer.effectAllowed = "copy";
                    }}
                    className="cursor-grab rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 active:cursor-grabbing"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-zinc-900">{x.title}</div>
                      <div className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${b.cls}`}>{b.label}</div>
                    </div>
                    <div className="mt-1 text-xs text-zinc-600">Drop to add a {x.title.toLowerCase()} node.</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="lg:col-span-9">
          <div className="rounded-3xl border border-zinc-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Canvas</div>
                <div className="mt-1 text-sm text-zinc-600">Connect nodes by dragging from the right handle to the left handle.</div>
              </div>
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
                onClick={() => void load()}
                disabled={saving}
              >
                Refresh
              </button>
            </div>

            {!selectedAutomation ? (
              <div className="mt-4 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                Create an automation to start.
              </div>
            ) : (
              <div
                ref={canvasRef}
                className="relative mt-4 h-[660px] w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white"
                style={{
                  backgroundImage: "radial-gradient(#0f172a12 1px, transparent 1px)",
                  backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`,
                  backgroundPosition: `${view.panX}px ${view.panY}px`,
                  overscrollBehavior: "contain",
                  touchAction: "none",
                }}
                onDragOver={(ev) => ev.preventDefault()}
                onDrop={onCanvasDrop}
                onPointerDown={(ev) => {
                  // click empty area starts panning + clears selection
                  const target = ev.target as HTMLElement | null;
                  if (!target) return;
                  if (target.closest?.("[data-kind='ui']")) return;
                  if (target.dataset?.kind === "node" || target.closest?.("[data-kind='node']")) return;
                  setSelectedNodeId(null);

                  (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
                  setPanning({
                    startClientX: ev.clientX,
                    startClientY: ev.clientY,
                    startPanX: view.panX,
                    startPanY: view.panY,
                  });
                }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`,
                    transformOrigin: "0 0",
                  }}
                >
                  <svg className="pointer-events-none absolute left-0 top-0" width={1} height={1} style={{ overflow: "visible" }}>
                    {(selectedAutomation.edges || []).map((e) => {
                      const from = nodesById.get(e.from);
                      const to = nodesById.get(e.to);
                      if (!from || !to) return null;
                      const fromPort = (e.fromPort ?? "out") as EdgePort;
                      const x1 = from.x + NODE_W;
                      const y1 =
                        from.type === "condition"
                          ? fromPort === "true"
                            ? from.y + NODE_H * 0.35
                            : fromPort === "false"
                              ? from.y + NODE_H * 0.65
                              : from.y + NODE_H / 2
                          : from.y + NODE_H / 2;
                      const x2 = to.x;
                      const y2 = to.y + NODE_H / 2;
                      return (
                        <g key={e.id}>
                          <path d={edgePath(x1, y1, x2, y2)} stroke="#0f172a" strokeOpacity={0.45} strokeWidth={3} fill="none" />
                          <path d={edgePath(x1, y1, x2, y2)} stroke="#ffffff" strokeOpacity={0.6} strokeWidth={1} fill="none" />
                          <circle cx={x2} cy={y2} r={4} fill="#0f172a" fillOpacity={0.35} />
                        </g>
                      );
                    })}

                    {connecting ? (
                      <path
                        d={edgePath(connecting.fromX, connecting.fromY, connecting.curX, connecting.curY)}
                        stroke="#0f172a"
                        strokeOpacity={0.35}
                        strokeWidth={3}
                        fill="none"
                        strokeDasharray="6 6"
                      />
                    ) : null}
                  </svg>

                  {(selectedAutomation.nodes || []).map((n) => {
                    const b = badgeForType(n.type);
                    const isSel = n.id === selectedNodeId;
                    const canHaveInput = n.type !== "trigger";
                    const canHaveOutput = n.type !== "note";

                    return (
                      <div
                        key={n.id}
                        data-kind="node"
                        className={
                          "absolute rounded-2xl border bg-white shadow-sm transition " +
                          (isSel ? "border-zinc-900 shadow" : "border-zinc-200")
                        }
                        style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
                        onPointerDown={(ev) => {
                          const t = ev.target as HTMLElement;
                          if (t.dataset?.kind === "handle") return;
                          setSelectedNodeId(n.id);
                          setAutolabelSelectedNode(true);
                          handleStartDragNode(ev, n.id);
                        }}
                        onDoubleClick={() => setSelectedNodeId(n.id)}
                      >
                        <div className="flex h-full flex-col justify-between p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 text-xs font-semibold text-zinc-600">{b.label}</div>
                            <div className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${b.cls}`}>{n.type}</div>
                          </div>
                          <div className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-900">{safeString(n.label, "(untitled)")}</div>
                        </div>

                        {canHaveInput ? (
                          <button
                            type="button"
                            data-kind="handle"
                            title="Connect here"
                            className="absolute left-[-9px] top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full border border-zinc-200 bg-white shadow"
                            onPointerUp={() => completeConnect(n.id)}
                            onDoubleClick={(ev) => {
                              ev.stopPropagation();
                              disconnectIncoming(n.id);
                            }}
                          />
                        ) : null}

                        {canHaveOutput ? (
                          n.type === "condition" ? (
                            <>
                              <button
                                type="button"
                                data-kind="handle"
                                title="Start TRUE connection"
                                className="absolute right-[-9px] top-[35%] h-[18px] w-[18px] -translate-y-1/2 rounded-full border border-violet-200 bg-white shadow"
                                onPointerDown={(ev) => {
                                  ev.stopPropagation();
                                  startConnect(n.id, "true");
                                }}
                                onDoubleClick={(ev) => {
                                  ev.stopPropagation();
                                  disconnectOutgoingPort(n.id, "true");
                                }}
                              />
                              <button
                                type="button"
                                data-kind="handle"
                                title="Start FALSE connection"
                                className="absolute right-[-9px] top-[65%] h-[18px] w-[18px] -translate-y-1/2 rounded-full border border-violet-200 bg-white shadow"
                                onPointerDown={(ev) => {
                                  ev.stopPropagation();
                                  startConnect(n.id, "false");
                                }}
                                onDoubleClick={(ev) => {
                                  ev.stopPropagation();
                                  disconnectOutgoingPort(n.id, "false");
                                }}
                              />
                              <div className="pointer-events-none absolute right-[-28px] top-[35%] -translate-y-1/2 text-[10px] font-semibold text-violet-700">
                                T
                              </div>
                              <div className="pointer-events-none absolute right-[-28px] top-[65%] -translate-y-1/2 text-[10px] font-semibold text-violet-700">
                                F
                              </div>
                            </>
                          ) : (
                            <button
                              type="button"
                              data-kind="handle"
                              title="Start connection"
                              className="absolute right-[-9px] top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full border border-zinc-200 bg-white shadow"
                              onPointerDown={(ev) => {
                                ev.stopPropagation();
                                startConnect(n.id, "out");
                              }}
                              onDoubleClick={(ev) => {
                                ev.stopPropagation();
                                disconnectOutgoing(n.id);
                              }}
                            />
                          )
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div
                  data-kind="ui"
                  className="absolute top-3 right-3 flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 shadow-sm"
                  onPointerDown={(ev) => ev.stopPropagation()}
                >
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-200 bg-white px-2 py-1 font-semibold hover:bg-zinc-50"
                    onClick={() => setView((prev) => ({ ...prev, zoom: clampZoom(prev.zoom / 1.1) }))}
                    title="Zoom out"
                  >
                    −
                  </button>
                  <div className="min-w-[52px] text-center font-semibold">{Math.round(view.zoom * 100)}%</div>
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-200 bg-white px-2 py-1 font-semibold hover:bg-zinc-50"
                    onClick={() => setView((prev) => ({ ...prev, zoom: clampZoom(prev.zoom * 1.1) }))}
                    title="Zoom in"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="ml-1 rounded-xl border border-zinc-200 bg-white px-2 py-1 font-semibold hover:bg-zinc-50"
                    onClick={() => setView({ panX: 80, panY: 80, zoom: 1 })}
                    title="Reset view"
                  >
                    Reset
                  </button>
                </div>

                <div
                  data-kind="ui"
                  className="absolute left-3 top-3 w-[360px] max-w-[calc(100%-1.5rem)] rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-sm backdrop-blur"
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onWheel={(ev) => ev.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-zinc-900">Inspector</div>
                    </div>
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold hover:bg-zinc-50"
                      onClick={() => setSelectedNodeId(null)}
                      title="Close inspector"
                    >
                      ✕
                    </button>
                  </div>

                  {!selectedNode ? (
                    <div className="mt-3 text-sm text-zinc-600">Select a node to edit.</div>
                  ) : (
                    <div className="mt-3 max-h-[420px] overflow-auto pr-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold text-zinc-600">Type</div>
                        <div className="text-xs font-semibold text-zinc-900">{selectedNode.type}</div>
                      </div>

                      <div className="mt-3">
                        <div className="text-xs font-semibold text-zinc-600">Label</div>
                        <input
                          className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          value={selectedNode.label}
                          onChange={(e) => {
                            const nextLabel = e.target.value.slice(0, 80);
                            setAutolabelSelectedNode(false);
                            updateSelectedAutomation((a) => ({
                              ...a,
                              nodes: a.nodes.map((n) => (n.id === selectedNode.id ? { ...n, label: nextLabel } : n)),
                              updatedAtIso: new Date().toISOString(),
                            }));
                          }}
                        />
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <input
                          id="autolabel_canvas"
                          type="checkbox"
                          className="h-4 w-4"
                          checked={autolabelSelectedNode}
                          onChange={(e) => setAutolabelSelectedNode(e.target.checked)}
                        />
                        <label htmlFor="autolabel_canvas" className="text-xs text-zinc-700">
                          Auto-update label from config
                        </label>
                      </div>

                      <div className="mt-4">
                        <div className="text-xs font-semibold text-zinc-600">Config</div>

                        {selectedNode.type === "trigger" ? (
                          <>
                            <select
                              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              value={
                                selectedNode.config?.kind === "trigger"
                                  ? selectedNode.config.triggerKind
                                  : (defaultConfigForType("trigger") as any).triggerKind
                              }
                              onChange={(e) => {
                                const nextKind = e.target.value as TriggerKind;
                                updateSelectedAutomation((a) => {
                                  const nodes = a.nodes.map((n) => {
                                    if (n.id !== selectedNode.id) return n;
                                    const prevCfg = n.config?.kind === "trigger" ? n.config : defaultConfigForType("trigger");
                                    const nextCfg: BuilderNodeConfig = { ...(prevCfg as any), kind: "trigger", triggerKind: nextKind };
                                    const nextLabel =
                                      autolabelSelectedNode && shouldAutolabel(n.label)
                                        ? labelForConfig("trigger", nextCfg)
                                        : n.label;
                                    return { ...n, config: nextCfg, label: nextLabel };
                                  });
                                  return { ...a, nodes, updatedAtIso: new Date().toISOString() };
                                });
                              }}
                            >
                              <option value="inbound_sms">Inbound SMS</option>
                              <option value="inbound_mms">Inbound MMS</option>
                              <option value="inbound_call">Inbound Call</option>
                              <option value="inbound_email">Inbound Email</option>
                              <option value="new_lead">New Lead</option>
                              <option value="tag_added">Tag added</option>
                              <option value="contact_created">Contact created</option>
                              <option value="task_added">Task added</option>
                              <option value="inbound_webhook">Inbound webhook</option>
                              <option value="scheduled_time">Scheduler / time</option>
                              <option value="missed_appointment">Missed appointment</option>
                              <option value="appointment_booked">Appointment booked</option>
                              <option value="missed_call">Missed call</option>
                              <option value="review_received">Review received</option>
                              <option value="follow_up_sent">Follow-up sent</option>
                              <option value="outbound_sent">Outbound sent</option>
                            </select>

                            {(() => {
                              const cfg =
                                selectedNode.config?.kind === "trigger"
                                  ? selectedNode.config
                                  : (defaultConfigForType("trigger") as any);
                              if (cfg.triggerKind === "tag_added") {
                                const tagId = String((cfg as any).tagId || "");
                                return (
                                  <div className="mt-2">
                                    <div className="text-xs font-semibold text-zinc-600">Only when tag is</div>
                                    <select
                                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                      value={tagId}
                                      onChange={(e) => {
                                        const next = String(e.target.value || "");
                                        if (next === CREATE_TAG_VALUE) {
                                          setCreateTagApplyTo({ nodeId: selectedNode.id, kind: "trigger" });
                                          setCreateTagName("");
                                          setCreateTagColor("#2563EB");
                                          setCreateTagError(null);
                                          setCreateTagOpen(true);
                                          return;
                                        }
                                        updateSelectedAutomation((a) => {
                                          const nodes = a.nodes.map((n) => {
                                            if (n.id !== selectedNode.id) return n;
                                            const prev = n.config?.kind === "trigger" ? n.config : (defaultConfigForType("trigger") as any);
                                            const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "trigger", tagId: next || undefined };
                                            const nextLabel =
                                              autolabelSelectedNode && shouldAutolabel(n.label)
                                                ? labelForConfig("trigger", nextCfg)
                                                : n.label;
                                            return { ...n, config: nextCfg, label: nextLabel };
                                          });
                                          return { ...a, nodes, updatedAtIso: new Date().toISOString() };
                                        });
                                      }}
                                    >
                                      <option value="">Any tag…</option>
                                      <option value={CREATE_TAG_VALUE}>+ Create new tag…</option>
                                      {ownerTags.map((t) => (
                                        <option key={t.id} value={t.id}>
                                          {t.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                );
                              }

                              if (cfg.triggerKind === "inbound_webhook") {
                                const webhookKey = String((cfg as any).webhookKey || "").slice(0, 80);
                                return (
                                  <div className="mt-2">
                                    <div className="text-xs font-semibold text-zinc-600">Webhook key</div>
                                    <input
                                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                      placeholder="e.g. calendly-lead"
                                      value={webhookKey}
                                      onChange={(e) => {
                                        const next = e.target.value.slice(0, 80);
                                        updateSelectedAutomation((a) => {
                                          const nodes = a.nodes.map((n) => {
                                            if (n.id !== selectedNode.id) return n;
                                            const prev = n.config?.kind === "trigger" ? n.config : (defaultConfigForType("trigger") as any);
                                            const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "trigger", webhookKey: next || undefined };
                                            const nextLabel =
                                              autolabelSelectedNode && shouldAutolabel(n.label)
                                                ? labelForConfig("trigger", nextCfg)
                                                : n.label;
                                            return { ...n, config: nextCfg, label: nextLabel };
                                          });
                                          return { ...a, nodes, updatedAtIso: new Date().toISOString() };
                                        });
                                      }}
                                    />
                                    <div className="mt-1 text-[11px] text-zinc-600">Used to match inbound webhook events.</div>
                                  </div>
                                );
                              }

                              if (cfg.triggerKind === "scheduled_time") {
                                const intervalMinutes = clampInt(Number((cfg as any).intervalMinutes || 60), 5, 43200);
                                return (
                                  <div className="mt-2">
                                    <div className="text-xs font-semibold text-zinc-600">Run every</div>
                                    <div className="mt-1 flex items-center gap-2">
                                      <input
                                        type="number"
                                        min={5}
                                        max={43200}
                                        className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                        value={intervalMinutes}
                                        onChange={(e) => {
                                          const next = clampInt(Number(e.target.value || 60), 5, 43200);
                                          updateSelectedAutomation((a) => {
                                            const nodes = a.nodes.map((n) => {
                                              if (n.id !== selectedNode.id) return n;
                                              const prev = n.config?.kind === "trigger" ? n.config : (defaultConfigForType("trigger") as any);
                                              const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "trigger", intervalMinutes: next } as any;
                                              const nextLabel =
                                                autolabelSelectedNode && shouldAutolabel(n.label)
                                                  ? labelForConfig("trigger", nextCfg)
                                                  : n.label;
                                              return { ...n, config: nextCfg, label: nextLabel };
                                            });
                                            return { ...a, nodes, updatedAtIso: new Date().toISOString() };
                                          });
                                        }}
                                      />
                                      <div className="shrink-0 text-xs text-zinc-600">minutes</div>
                                    </div>
                                    <div className="mt-1 text-[11px] text-zinc-600">Requires the automations cron to run.</div>
                                  </div>
                                );
                              }

                              return null;
                            })()}
                          </>
                        ) : null}

                        {selectedNode.type === "action" ? (
                          <>
                            <select
                              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              value={
                                selectedNode.config?.kind === "action"
                                  ? selectedNode.config.actionKind
                                  : (defaultConfigForType("action") as any).actionKind
                              }
                              onChange={(e) => {
                                const nextKind = e.target.value as ActionKind;
                                updateSelectedAutomation((a) => {
                                  const nodes = a.nodes.map((n) => {
                                    if (n.id !== selectedNode.id) return n;
                                    const prevCfg = n.config?.kind === "action" ? n.config : defaultConfigForType("action");
                                    const nextCfg: BuilderNodeConfig = { ...(prevCfg as any), kind: "action", actionKind: nextKind };
                                    const nextLabel =
                                      autolabelSelectedNode && shouldAutolabel(n.label)
                                        ? labelForConfig("action", nextCfg)
                                        : n.label;
                                    return { ...n, config: nextCfg, label: nextLabel };
                                  });
                                  return { ...a, nodes, updatedAtIso: new Date().toISOString() };
                                });
                              }}
                            >
                              <option value="send_sms">Send SMS</option>
                              <option value="send_email">Send Email</option>
                              <option value="add_tag">Add Tag</option>
                              <option value="create_task">Create Task</option>
                            </select>

                            {(() => {
                              const cfg =
                                selectedNode.config?.kind === "action"
                                  ? selectedNode.config
                                  : (defaultConfigForType("action") as any);
                              if (cfg.actionKind === "send_sms") {
                                const smsTo = ((cfg as any).smsTo as MessageTarget) || "inbound_sender";
                                const smsToNumber = String((cfg as any).smsToNumber || "").slice(0, 32);
                                return (
                                  <>
                                    <div className="mt-2">
                                      <div className="text-xs font-semibold text-zinc-600">Send to</div>
                                      <select
                                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                        value={smsTo}
                                        onChange={(e) => {
                                          const next = e.target.value as MessageTarget;
                                          updateSelectedAutomation((a) => {
                                            const nodes = a.nodes.map((n) => {
                                              if (n.id !== selectedNode.id) return n;
                                              const prev =
                                                n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                              const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "action", smsTo: next };
                                              const nextLabel =
                                                autolabelSelectedNode && shouldAutolabel(n.label)
                                                  ? labelForConfig("action", nextCfg)
                                                  : n.label;
                                              return { ...n, config: nextCfg, label: nextLabel };
                                            });
                                            return { ...a, nodes, updatedAtIso: new Date().toISOString() };
                                          });
                                        }}
                                      >
                                        <option value="inbound_sender">Inbound sender</option>
                                        <option value="event_contact">Step contact</option>
                                        <option value="internal_notification">Internal notification (my number)</option>
                                        <option value="custom">Custom number</option>
                                      </select>
                                    </div>

                                    {smsTo === "custom" ? (
                                      <input
                                        className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                        placeholder="Custom number (E.164, e.g. +15551234567)"
                                        value={smsToNumber}
                                        onChange={(e) => {
                                          const next = e.target.value.slice(0, 32);
                                          updateSelectedAutomation((a) => {
                                            const nodes = a.nodes.map((n) => {
                                              if (n.id !== selectedNode.id) return n;
                                              const prev =
                                                n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                              const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "action", smsToNumber: next };
                                              const nextLabel =
                                                autolabelSelectedNode && shouldAutolabel(n.label)
                                                  ? labelForConfig("action", nextCfg)
                                                  : n.label;
                                              return { ...n, config: nextCfg, label: nextLabel };
                                            });
                                            return { ...a, nodes, updatedAtIso: new Date().toISOString() };
                                          });
                                        }}
                                      />
                                    ) : null}

                                    <textarea
                                      className="mt-2 w-full resize-none rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                      rows={3}
                                      placeholder="SMS body"
                                      value={String(cfg.body || "").slice(0, 1200)}
                                      onChange={(e) => {
                                        const body = e.target.value.slice(0, 1200);
                                        updateSelectedAutomation((a) => {
                                          const nodes = a.nodes.map((n) => {
                                            if (n.id !== selectedNode.id) return n;
                                            const prev =
                                              n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                            const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "action", body };
                                            const nextLabel =
                                              autolabelSelectedNode && shouldAutolabel(n.label)
                                                ? labelForConfig("action", nextCfg)
                                                : n.label;
                                            return { ...n, config: nextCfg, label: nextLabel };
                                          });
                                          return { ...a, nodes, updatedAtIso: new Date().toISOString() };
                                        });
                                      }}
                                    />
                                  </>
                                );
                              }

                              if (cfg.actionKind === "send_email") {
                                const emailTo = ((cfg as any).emailTo as MessageTarget) || "internal_notification";
                                const emailToAddress = String((cfg as any).emailToAddress || "").slice(0, 160);
                                const subject = String((cfg as any).subject || "").slice(0, 140);
                                return (
                                  <>
                                    <div className="mt-2">
                                      <div className="text-xs font-semibold text-zinc-600">Send to</div>
                                      <select
                                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                        value={emailTo}
                                        onChange={(e) => {
                                          const next = e.target.value as MessageTarget;
                                          updateSelectedAutomation((a) => {
                                            const nodes = a.nodes.map((n) => {
                                              if (n.id !== selectedNode.id) return n;
                                              const prev =
                                                n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                              const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "action", emailTo: next };
                                              const nextLabel =
                                                autolabelSelectedNode && shouldAutolabel(n.label)
                                                  ? labelForConfig("action", nextCfg)
                                                  : n.label;
                                              return { ...n, config: nextCfg, label: nextLabel };
                                            });
                                            return { ...a, nodes, updatedAtIso: new Date().toISOString() };
                                          });
                                        }}
                                      >
                                        <option value="internal_notification">Internal notification (my email)</option>
                                        <option value="event_contact">Step contact</option>
                                        <option value="custom">Custom email</option>
                                      </select>
                                    </div>

                                    {emailTo === "custom" ? (
                                      <input
                                        className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                        placeholder="Custom email address"
                                        value={emailToAddress}
                                        onChange={(e) => {
                                          const next = e.target.value.slice(0, 160);
                                          updateSelectedAutomation((a) => {
                                            const nodes = a.nodes.map((n) => {
                                              if (n.id !== selectedNode.id) return n;
                                              const prev =
                                                n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                              const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "action", emailToAddress: next };
                                              const nextLabel =
                                                autolabelSelectedNode && shouldAutolabel(n.label)
                                                  ? labelForConfig("action", nextCfg)
                                                  : n.label;
                                              return { ...n, config: nextCfg, label: nextLabel };
                                            });
                                            return { ...a, nodes, updatedAtIso: new Date().toISOString() };
                                          });
                                        }}
                                      />
                                    ) : null}

                                    <input
                                      className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                      placeholder="Subject"
                                      value={subject}
                                      onChange={(e) => {
                                        const next = e.target.value.slice(0, 140);
                                        updateSelectedAutomation((a) => {
                                          const nodes = a.nodes.map((n) => {
                                            if (n.id !== selectedNode.id) return n;
                                            const prev =
                                              n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                            const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "action", subject: next };
                                            const nextLabel =
                                              autolabelSelectedNode && shouldAutolabel(n.label)
                                                ? labelForConfig("action", nextCfg)
                                                : n.label;
                                            return { ...n, config: nextCfg, label: nextLabel };
                                          });
                                          return { ...a, nodes, updatedAtIso: new Date().toISOString() };
                                        });
                                      }}
                                    />

                                    <textarea
                                      className="mt-2 w-full resize-none rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                      rows={4}
                                      placeholder="Email body"
                                      value={String(cfg.body || "").slice(0, 4000)}
                                      onChange={(e) => {
                                        const body = e.target.value.slice(0, 4000);
                                        updateSelectedAutomation((a) => {
                                          const nodes = a.nodes.map((n) => {
                                            if (n.id !== selectedNode.id) return n;
                                            const prev =
                                              n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                            const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "action", body };
                                            const nextLabel =
                                              autolabelSelectedNode && shouldAutolabel(n.label)
                                                ? labelForConfig("action", nextCfg)
                                                : n.label;
                                            return { ...n, config: nextCfg, label: nextLabel };
                                          });
                                          return { ...a, nodes, updatedAtIso: new Date().toISOString() };
                                        });
                                      }}
                                    />
                                  </>
                                );
                              }

                              if (cfg.actionKind === "add_tag") {
                                const tagId = String(cfg.tagId || "");
                                return (
                                  <div className="mt-2">
                                    <select
                                      className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                      value={tagId}
                                      onChange={(e) => {
                                        const nextTagId = String(e.target.value || "");
                                        if (nextTagId === CREATE_TAG_VALUE) {
                                          setCreateTagApplyTo({ nodeId: selectedNode.id, kind: "action" });
                                          setCreateTagName("");
                                          setCreateTagColor("#2563EB");
                                          setCreateTagError(null);
                                          setCreateTagOpen(true);
                                          return;
                                        }
                                        updateSelectedAutomation((a) => {
                                          const nodes = a.nodes.map((n) => {
                                            if (n.id !== selectedNode.id) return n;
                                            const prev =
                                              n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                            const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "action", tagId: nextTagId || undefined };
                                            const nextLabel =
                                              autolabelSelectedNode && shouldAutolabel(n.label)
                                                ? labelForConfig("action", nextCfg)
                                                : n.label;
                                            return { ...n, config: nextCfg, label: nextLabel };
                                          });
                                          return { ...a, nodes, updatedAtIso: new Date().toISOString() };
                                        });
                                      }}
                                    >
                                      <option value="">Choose a tag…</option>
                                      <option value={CREATE_TAG_VALUE}>+ Create new tag…</option>
                                      {ownerTags.map((t) => (
                                        <option key={t.id} value={t.id}>
                                          {t.name}
                                        </option>
                                      ))}
                                    </select>
                                    <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-600">
                                      <span
                                        className="h-2.5 w-2.5 rounded-full border border-zinc-200"
                                        style={{ background: ownerTags.find((t) => t.id === tagId)?.color || "#e4e4e7" }}
                                      />
                                      Idempotent: won’t double-tag.
                                    </div>
                                  </div>
                                );
                              }

                              if (cfg.actionKind === "create_task") {
                                const title = String((cfg as any).subject || "").slice(0, 160);
                                const description = String((cfg as any).body || "").slice(0, 5000);
                                const assignedToUserId = String((cfg as any).assignedToUserId || "");
                                const memberOptions = accountMembers
                                  .filter((m) => m.user?.active)
                                  .sort((a, b) => (a.user?.email || "").localeCompare(b.user?.email || ""));

                                return (
                                  <>
                                    <div className="mt-2">
                                      <div className="text-xs font-semibold text-zinc-600">Title</div>
                                      <input
                                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                        placeholder="Task title"
                                        value={title}
                                        onChange={(e) => {
                                          const next = e.target.value.slice(0, 160);
                                          updateSelectedAutomation((a) => {
                                            const nodes = a.nodes.map((n) => {
                                              if (n.id !== selectedNode.id) return n;
                                              const prev =
                                                n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                              const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "action", subject: next };
                                              const nextLabel =
                                                autolabelSelectedNode && shouldAutolabel(n.label)
                                                  ? labelForConfig("action", nextCfg)
                                                  : n.label;
                                              return { ...n, config: nextCfg, label: nextLabel };
                                            });
                                            return { ...a, nodes, updatedAtIso: new Date().toISOString() };
                                          });
                                        }}
                                      />
                                    </div>

                                    <div className="mt-2">
                                      <div className="text-xs font-semibold text-zinc-600">Description</div>
                                      <textarea
                                        className="mt-1 w-full resize-none rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                        rows={4}
                                        placeholder="Details (optional)"
                                        value={description}
                                        onChange={(e) => {
                                          const next = e.target.value.slice(0, 5000);
                                          updateSelectedAutomation((a) => {
                                            const nodes = a.nodes.map((n) => {
                                              if (n.id !== selectedNode.id) return n;
                                              const prev =
                                                n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                              const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "action", body: next };
                                              const nextLabel =
                                                autolabelSelectedNode && shouldAutolabel(n.label)
                                                  ? labelForConfig("action", nextCfg)
                                                  : n.label;
                                              return { ...n, config: nextCfg, label: nextLabel };
                                            });
                                            return { ...a, nodes, updatedAtIso: new Date().toISOString() };
                                          });
                                        }}
                                      />
                                    </div>

                                    <div className="mt-2">
                                      <div className="text-xs font-semibold text-zinc-600">Assign to</div>
                                      <select
                                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                        value={assignedToUserId}
                                        onChange={(e) => {
                                          const next = String(e.target.value || "");
                                          updateSelectedAutomation((a) => {
                                            const nodes = a.nodes.map((n) => {
                                              if (n.id !== selectedNode.id) return n;
                                              const prev =
                                                n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                              const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "action", assignedToUserId: next || undefined };
                                              const nextLabel =
                                                autolabelSelectedNode && shouldAutolabel(n.label)
                                                  ? labelForConfig("action", nextCfg)
                                                  : n.label;
                                              return { ...n, config: nextCfg, label: nextLabel };
                                            });
                                            return { ...a, nodes, updatedAtIso: new Date().toISOString() };
                                          });
                                        }}
                                      >
                                        <option value="">Account owner</option>
                                        {memberOptions.map((m) => (
                                          <option key={m.userId} value={m.userId}>
                                            {m.user?.email || m.userId}
                                            {m.role === "ADMIN" ? " (admin)" : m.role === "OWNER" ? " (owner)" : ""}
                                          </option>
                                        ))}
                                      </select>
                                      <div className="mt-1 text-[11px] text-zinc-600">Create Task runs server-side (default: owner).</div>
                                    </div>
                                  </>
                                );
                              }

                              return null;
                            })()}
                          </>
                        ) : null}

                        {selectedNode.type === "delay" ? (
                          <div className="mt-1 flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              max={43200}
                              className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              value={
                                selectedNode.config?.kind === "delay"
                                  ? selectedNode.config.minutes
                                  : (defaultConfigForType("delay") as any).minutes
                              }
                              onChange={(e) => {
                                const minutes = clamp(Number(e.target.value || 0), 0, 43200);
                                updateSelectedAutomation((a) => {
                                  const nodes = a.nodes.map((n) => {
                                    if (n.id !== selectedNode.id) return n;
                                    const nextCfg: BuilderNodeConfig = { kind: "delay", minutes };
                                    const nextLabel =
                                      autolabelSelectedNode && shouldAutolabel(n.label)
                                        ? labelForConfig("delay", nextCfg)
                                        : n.label;
                                    return { ...n, config: nextCfg, label: nextLabel };
                                  });
                                  return { ...a, nodes, updatedAtIso: new Date().toISOString() };
                                });
                              }}
                            />
                            <div className="shrink-0 text-xs text-zinc-600">minutes</div>
                          </div>
                        ) : null}

                        {selectedNode.type === "condition" ? (
                          <div className="mt-1 space-y-2">
                            <input
                              className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              placeholder="Field (e.g. contact.email)"
                              value={
                                selectedNode.config?.kind === "condition"
                                  ? selectedNode.config.left
                                  : (defaultConfigForType("condition") as any).left
                              }
                              onChange={(e) => {
                                const left = e.target.value.slice(0, 60);
                                updateSelectedAutomation((a) => {
                                  const nodes = a.nodes.map((n) => {
                                    if (n.id !== selectedNode.id) return n;
                                    const prev =
                                      n.config?.kind === "condition" ? n.config : (defaultConfigForType("condition") as any);
                                    const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "condition", left };
                                    const nextLabel =
                                      autolabelSelectedNode && shouldAutolabel(n.label)
                                        ? labelForConfig("condition", nextCfg)
                                        : n.label;
                                    return { ...n, config: nextCfg, label: nextLabel };
                                  });
                                  return { ...a, nodes, updatedAtIso: new Date().toISOString() };
                                });
                              }}
                            />

                            <select
                              className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              value={
                                selectedNode.config?.kind === "condition"
                                  ? selectedNode.config.op
                                  : (defaultConfigForType("condition") as any).op
                              }
                              onChange={(e) => {
                                const op = e.target.value as ConditionOp;
                                updateSelectedAutomation((a) => {
                                  const nodes = a.nodes.map((n) => {
                                    if (n.id !== selectedNode.id) return n;
                                    const prev =
                                      n.config?.kind === "condition" ? n.config : (defaultConfigForType("condition") as any);
                                    const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "condition", op };
                                    const nextLabel =
                                      autolabelSelectedNode && shouldAutolabel(n.label)
                                        ? labelForConfig("condition", nextCfg)
                                        : n.label;
                                    return { ...n, config: nextCfg, label: nextLabel };
                                  });
                                  return { ...a, nodes, updatedAtIso: new Date().toISOString() };
                                });
                              }}
                            >
                              <option value="equals">Equals</option>
                              <option value="contains">Contains</option>
                              <option value="starts_with">Starts with</option>
                              <option value="ends_with">Ends with</option>
                              <option value="is_empty">Is empty</option>
                              <option value="is_not_empty">Is not empty</option>
                            </select>

                            <input
                              className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              placeholder="Value"
                              value={
                                selectedNode.config?.kind === "condition"
                                  ? selectedNode.config.right
                                  : (defaultConfigForType("condition") as any).right
                              }
                              onChange={(e) => {
                                const right = e.target.value.slice(0, 120);
                                updateSelectedAutomation((a) => {
                                  const nodes = a.nodes.map((n) => {
                                    if (n.id !== selectedNode.id) return n;
                                    const prev =
                                      n.config?.kind === "condition" ? n.config : (defaultConfigForType("condition") as any);
                                    const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "condition", right };
                                    const nextLabel =
                                      autolabelSelectedNode && shouldAutolabel(n.label)
                                        ? labelForConfig("condition", nextCfg)
                                        : n.label;
                                    return { ...n, config: nextCfg, label: nextLabel };
                                  });
                                  return { ...a, nodes, updatedAtIso: new Date().toISOString() };
                                });
                              }}
                            />

                          </div>
                        ) : null}

                        {selectedNode.type === "note" ? (
                          <textarea
                            className="mt-1 w-full resize-none rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            rows={4}
                            placeholder="Write a note shown on this node"
                            value={
                              selectedNode.config?.kind === "note"
                                ? selectedNode.config.text
                                : (defaultConfigForType("note") as any).text
                            }
                            onChange={(e) => {
                              const text = e.target.value.slice(0, 500);
                              updateSelectedAutomation((a) => {
                                const nodes = a.nodes.map((n) => {
                                  if (n.id !== selectedNode.id) return n;
                                  const nextCfg: BuilderNodeConfig = { kind: "note", text };
                                  const nextLabel =
                                    autolabelSelectedNode && shouldAutolabel(n.label)
                                      ? labelForConfig("note", nextCfg)
                                      : n.label;
                                  return { ...n, config: nextCfg, label: nextLabel };
                                });
                                return { ...a, nodes, updatedAtIso: new Date().toISOString() };
                              });
                            }}
                          />
                        ) : null}
                      </div>

                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                          onClick={deleteSelectedNode}
                        >
                          Delete node
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="absolute bottom-3 right-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
                  Tip: double-click a dot to remove a connection.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
