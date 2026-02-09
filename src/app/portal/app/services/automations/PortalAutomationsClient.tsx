"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type BuilderNodeType = "trigger" | "action" | "delay" | "condition" | "note";

type TriggerKind = "inbound_sms" | "inbound_mms" | "inbound_call" | "new_lead";
type ActionKind = "send_sms" | "send_email" | "add_tag" | "create_task";
type ConditionOp = "equals" | "contains" | "starts_with" | "ends_with" | "is_empty" | "is_not_empty";

type BuilderNodeConfig =
  | { kind: "trigger"; triggerKind: TriggerKind }
  | { kind: "action"; actionKind: ActionKind }
  | { kind: "delay"; minutes: number }
  | { kind: "condition"; left: string; op: ConditionOp; right: string }
  | { kind: "note"; text: string };

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
        config: { kind: "action", actionKind: "send_sms" },
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
      return { kind: "action", actionKind: "send_sms" };
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
      new_lead: "New Lead",
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

  const [automations, setAutomations] = useState<Automation[]>([]);
  const [selectedAutomationId, setSelectedAutomationId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement | null>(null);

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
    const onMove = (ev: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();

      if (dragging && selectedAutomationId) {
        const dx = ev.clientX - dragging.startClientX;
        const dy = ev.clientY - dragging.startClientY;
        const nextX = dragging.startX + dx;
        const nextY = dragging.startY + dy;

        updateSelectedAutomation((a) => {
          const nodes = a.nodes.map((n) =>
            n.id === dragging.nodeId ? { ...n, x: clamp(nextX, -2000, 4000), y: clamp(nextY, -2000, 4000) } : n,
          );
          return { ...a, nodes, updatedAtIso: new Date().toISOString() };
        });
      }

      if (connecting) {
        setConnecting((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            curX: clamp(ev.clientX - rect.left, -2000, 6000),
            curY: clamp(ev.clientY - rect.top, -2000, 6000),
          };
        });
      }
    };

    const onUp = () => {
      if (dragging) setDragging(null);
      if (connecting) setConnecting(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, connecting, selectedAutomationId]);

  function onCanvasDrop(ev: React.DragEvent) {
    ev.preventDefault();
    const t = (ev.dataTransfer.getData("text/plain") || "").trim() as BuilderNodeType;
    if (!t) return;

    const canvas = canvasRef.current;
    if (!canvas || !selectedAutomationId) return;

    const rect = canvas.getBoundingClientRect();
    const x = clamp(ev.clientX - rect.left - NODE_W / 2, -2000, 6000);
    const y = clamp(ev.clientY - rect.top - NODE_H / 2, -2000, 6000);

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

  function startConnect(fromNodeId: string) {
    const canvas = canvasRef.current;
    if (!canvas || !selectedAutomation) return;

    const from = selectedAutomation.nodes.find((n) => n.id === fromNodeId);
    if (!from) return;

    const rect = canvas.getBoundingClientRect();
    const fromX = from.x + NODE_W;
    const fromY = from.y + NODE_H / 2;

    setConnecting({ fromNodeId, fromX, fromY, curX: fromX, curY: fromY });

    // Ensure focus selection
    setSelectedNodeId(fromNodeId);
    setAutolabelSelectedNode(true);
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
      const exists = a.edges.some((e) => e.from === connecting.fromNodeId && e.to === toNodeId);
      if (exists) return a;

      const nextEdges = [...a.edges, { id: uid("e"), from: connecting.fromNodeId, to: toNodeId }].slice(0, 500);
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

  function renameAutomation() {
    if (!selectedAutomation) return;
    const nextName = window.prompt("Automation name", selectedAutomation.name);
    if (!nextName) return;

    const trimmed = nextName.trim().slice(0, 80);
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
          <button
            type="button"
            className="rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
            disabled={saving}
            onClick={() => void saveAll()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {note ? <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{note}</div> : null}

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
              {automations.map((a) => {
                const isSel = a.id === selectedAutomationId;
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={
                      "w-full rounded-2xl border px-4 py-3 text-left text-sm transition " +
                      (isSel ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100")
                    }
                    onClick={() => setSelectedAutomation(a.id)}
                  >
                    <div className={"truncate font-semibold " + (isSel ? "text-white" : "text-zinc-900")}>{a.name}</div>
                    <div className={"mt-1 text-xs " + (isSel ? "text-zinc-200" : "text-zinc-600")}>
                      {(a.nodes?.length ?? 0)} nodes · {(a.edges?.length ?? 0)} connections
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
                onClick={renameAutomation}
                disabled={!selectedAutomation}
              >
                Rename
              </button>
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
                onClick={duplicateAutomation}
                disabled={!selectedAutomation}
              >
                Duplicate
              </button>
              <button
                type="button"
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                onClick={deleteAutomation}
                disabled={!selectedAutomation}
              >
                Delete
              </button>
            </div>
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

          <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-4">
            <div className="text-sm font-semibold text-zinc-900">Inspector</div>
            {!selectedNode ? (
              <div className="mt-2 text-sm text-zinc-600">Select a node to edit.</div>
            ) : (
              <div className="mt-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold text-zinc-600">Type</div>
                  <div className="text-xs font-semibold text-zinc-900">{selectedNode.type}</div>
                </div>

                <div className="mt-3">
                  <div className="text-xs font-semibold text-zinc-600">Label</div>
                  <input
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
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
                    id="autolabel"
                    type="checkbox"
                    className="h-4 w-4"
                    checked={autolabelSelectedNode}
                    onChange={(e) => setAutolabelSelectedNode(e.target.checked)}
                  />
                  <label htmlFor="autolabel" className="text-xs text-zinc-700">
                    Auto-update label from config
                  </label>
                </div>

                <div className="mt-4">
                  <div className="text-xs font-semibold text-zinc-600">Config</div>

                  {selectedNode.type === "trigger" ? (
                    <select
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
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
                      <option value="new_lead">New Lead</option>
                    </select>
                  ) : null}

                  {selectedNode.type === "action" ? (
                    <select
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
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
                  ) : null}

                  {selectedNode.type === "delay" ? (
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={43200}
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
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
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
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
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
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
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
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
                      className="mt-1 w-full resize-none rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
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
                className="relative mt-4 h-[660px] w-full overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white"
                onDragOver={(ev) => ev.preventDefault()}
                onDrop={onCanvasDrop}
                onPointerDown={(ev) => {
                  // click empty area clears selection
                  const target = ev.target as HTMLElement | null;
                  if (!target) return;
                  if (target.dataset?.kind === "node" || target.closest?.("[data-kind='node']")) return;
                  setSelectedNodeId(null);
                }}
              >
                <svg className="pointer-events-none absolute inset-0 h-full w-full">
                  {(selectedAutomation.edges || []).map((e) => {
                    const from = nodesById.get(e.from);
                    const to = nodesById.get(e.to);
                    if (!from || !to) return null;
                    const x1 = from.x + NODE_W;
                    const y1 = from.y + NODE_H / 2;
                    const x2 = to.x;
                    const y2 = to.y + NODE_H / 2;
                    const isSelected = false;
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
                        // only start drag on main card area
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
                        <button
                          type="button"
                          data-kind="handle"
                          title="Start connection"
                          className="absolute right-[-9px] top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full border border-zinc-200 bg-white shadow"
                          onPointerDown={(ev) => {
                            ev.stopPropagation();
                            startConnect(n.id);
                          }}
                          onDoubleClick={(ev) => {
                            ev.stopPropagation();
                            disconnectOutgoing(n.id);
                          }}
                        />
                      ) : null}
                    </div>
                  );
                })}

                <div className="absolute bottom-3 right-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
                  Tip: drag from a node’s right dot → another node’s left dot.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
