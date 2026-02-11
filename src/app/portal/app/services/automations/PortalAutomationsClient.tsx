"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { PortalVariablePickerModal } from "@/components/PortalVariablePickerModal";
import { useToast } from "@/components/ToastProvider";
import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { PORTAL_LINK_VARIABLES, PORTAL_MESSAGE_VARIABLES, type TemplateVariable } from "@/lib/portalTemplateVars";

const PORTAL_TIME_VARIABLES: TemplateVariable[] = [
  { key: "now.hour", label: "Current hour (0–23)", group: "Custom", appliesTo: "Now" },
  { key: "now.weekday", label: "Current weekday (0=Sun…6=Sat)", group: "Custom", appliesTo: "Now" },
  { key: "now.date", label: "Today (YYYY-MM-DD)", group: "Custom", appliesTo: "Now" },
  { key: "now.iso", label: "Now (ISO timestamp)", group: "Custom", appliesTo: "Now" },
];

const CONDITION_FIELD_KEYS = Array.from(
  new Set([...PORTAL_TIME_VARIABLES, ...PORTAL_MESSAGE_VARIABLES, ...PORTAL_LINK_VARIABLES].map((v) => v.key)),
);

const CONDITION_FIELD_OPTIONS: Array<{ value: string; label: string; hint?: string }> = [
  ...PORTAL_TIME_VARIABLES.map((v) => ({ value: v.key, label: v.label || v.key, hint: v.key })),
  ...PORTAL_MESSAGE_VARIABLES.map((v) => ({ value: v.key, label: v.label || v.key, hint: v.key })),
  ...PORTAL_LINK_VARIABLES.map((v) => ({ value: v.key, label: v.label || v.key, hint: v.key })),
].filter((o) => o.value);

type BuilderNodeType = "trigger" | "action" | "delay" | "condition" | "note";

type EdgePort = "out" | "true" | "false";

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

type MessageTarget = "inbound_sender" | "event_contact" | "internal_notification" | "assigned_lead" | "custom";

type DelayUnit = "minutes" | "hours" | "days" | "weeks" | "months";

type BuilderNodeConfig =
  | {
      kind: "trigger";
      triggerKind: TriggerKind;
      tagId?: string;
      webhookKey?: string;

      // scheduled_time scheduler
      scheduleMode?: "every" | "specific";
      everyValue?: number;
      everyUnit?: "minutes" | "days" | "weeks" | "months";

      specificKind?: "daily" | "weekly" | "monthly";
      specificTime?: string; // HH:MM (24h)
      specificWeekday?: number; // 0..6 (Sun..Sat)
      specificDayOfMonth?: number; // 1..31

      // back-compat
      intervalMinutes?: number;
    }
  | {
      kind: "action";
      actionKind: ActionKind;
      body?: string;
      subject?: string;
      tagId?: string;
      tagMode?: "latest" | "all";
      maxContacts?: number;
      assignedToUserId?: string;
      smsTo?: MessageTarget;
      smsToNumber?: string;
      emailTo?: MessageTarget;
      emailToAddress?: string;

      webhookUrl?: string;
      webhookBodyJson?: string;

      contactName?: string;
      contactEmail?: string;
      contactPhone?: string;

      // Trigger service
      serviceSlug?: string;
      serviceCampaignId?: string;
    }
  | { kind: "delay"; minutes: number; unit?: DelayUnit; value?: number }
  | { kind: "condition"; left: string; op: ConditionOp; right: string }
  | { kind: "note"; text: string };

type ContactTag = { id: string; name: string; color: string | null };

type AiOutboundCallCampaign = { id: string; name: string; status: string };
type NurtureCampaign = { id: string; name: string; status: string };

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
  createdBy?: { userId: string; email?: string; name?: string };
  nodes: BuilderNode[];
  edges: BuilderEdge[];
};

type ApiPayload =
  | { ok: true; webhookToken?: string; viewer?: { userId: string; email?: string; name?: string }; automations: Automation[] }
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

type ActionKindOption = { value: ActionKind; label: string; disabled?: boolean; hint?: string };

function ActionKindDropdown(props: {
  value: ActionKind;
  options: ActionKindOption[];
  onChange: (v: ActionKind) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const current = props.options.find((o) => o.value === props.value) ?? { value: props.value, label: props.value };

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (ev.target && el.contains(ev.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative mt-1">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{current.label}</span>
        <span className="shrink-0 text-xs text-zinc-500">▾</span>
      </button>

      {open ? (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg">
          <div className="max-h-[260px] overflow-auto p-1">
            {props.options.map((o) => {
              const isSel = o.value === props.value;
              const disabled = Boolean(o.disabled);
              return (
                <button
                  key={o.value}
                  type="button"
                  className={
                    "w-full rounded-xl px-3 py-2 text-left text-sm transition " +
                    (disabled
                      ? "cursor-not-allowed text-zinc-400"
                      : isSel
                        ? "bg-zinc-900 text-white"
                        : "hover:bg-zinc-50 text-zinc-900")
                  }
                  onClick={() => {
                    if (disabled) return;
                    props.onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate font-semibold">{o.label}</div>
                    {isSel ? <div className="text-xs">✓</div> : null}
                  </div>
                  {o.hint ? <div className={"mt-0.5 text-xs " + (disabled ? "text-zinc-400" : "text-zinc-500")}>{o.hint}</div> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
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
    createdBy: undefined,
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
      return { kind: "delay", minutes: 5, unit: "minutes", value: 5 };
    case "condition":
      return { kind: "condition", left: "contact.phone", op: "is_not_empty", right: "" };
    default:
      return { kind: "note", text: "" };
  }
}

const DELAY_UNIT_TO_MINUTES: Record<DelayUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 60 * 24,
  weeks: 60 * 24 * 7,
  months: 60 * 24 * 30,
};

function inferDelayUnit(totalMinutesRaw: number): DelayUnit {
  const totalMinutes = Math.max(0, Math.floor(totalMinutesRaw || 0));
  if (totalMinutes !== 0) {
    if (totalMinutes % DELAY_UNIT_TO_MINUTES.months === 0) return "months";
    if (totalMinutes % DELAY_UNIT_TO_MINUTES.weeks === 0) return "weeks";
    if (totalMinutes % DELAY_UNIT_TO_MINUTES.days === 0) return "days";
    if (totalMinutes % DELAY_UNIT_TO_MINUTES.hours === 0) return "hours";
  }
  return "minutes";
}

function delayValueFromMinutes(totalMinutesRaw: number, unit: DelayUnit): number {
  const totalMinutes = Math.max(0, Math.floor(totalMinutesRaw || 0));
  const denom = DELAY_UNIT_TO_MINUTES[unit] || 1;
  return denom ? Math.max(0, Math.round(totalMinutes / denom)) : totalMinutes;
}

function delayMinutesFromValue(valueRaw: number, unit: DelayUnit): number {
  const value = Math.max(0, Math.floor(valueRaw || 0));
  const mult = DELAY_UNIT_TO_MINUTES[unit] || 1;
  return Math.max(0, value * mult);
}

function labelForConfig(t: BuilderNodeType, cfg: BuilderNodeConfig | undefined) {
  if (!cfg) {
    return t === "note" ? "Note" : `${t[0].toUpperCase()}${t.slice(1)}: (configure)`;
  }

  if (cfg.kind === "trigger") {
    const map: Record<TriggerKind, string> = {
      manual: "Manual",
      inbound_sms: "Inbound SMS",
      inbound_mms: "Inbound MMS",
      inbound_call: "Inbound Call",
      inbound_email: "Inbound Email",
      new_lead: "New Lead",
      lead_scraped: "Lead scraped",
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
      assign_lead: "Assign Lead",
      find_contact: "Find Contact",
      send_webhook: "Send Webhook",
      send_review_request: "Review Request",
      send_booking_link: "Book Appointment",
      update_contact: "Update Contact",
      trigger_service: "Trigger Service",
    };
    return `Action: ${map[cfg.actionKind]}`;
  }
  if (cfg.kind === "delay") {
    const minutes = Math.max(0, Math.floor(cfg.minutes || 0));
    const unit = cfg.unit ?? inferDelayUnit(minutes);
    const value = Math.max(0, Math.floor(cfg.value ?? delayValueFromMinutes(minutes, unit)));
    const labelUnit = unit === "hours" ? "hour" : unit === "days" ? "day" : unit === "weeks" ? "week" : unit === "months" ? "month" : "minute";
    return `Delay: ${value} ${labelUnit}${value === 1 ? "" : "s"}`;
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
      gt: ">",
      gte: ">=",
      lt: "<",
      lte: "<=",
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
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const autosaveBlockedUntilRef = useRef<number>(0);
  const lastErrorToastRef = useRef<{ msg: string; at: number } | null>(null);
  const lastSavedToastAtRef = useRef<number>(0);

  const [lastSavedAtIso, setLastSavedAtIso] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const lastSavedSigRef = useRef<string>("");
  const autosaveTimerRef = useRef<number | null>(null);

  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryMenuFor, setLibraryMenuFor] = useState<string | null>(null);
  const [manualRunBusyFor, setManualRunBusyFor] = useState<string | null>(null);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [testOpen, setTestOpen] = useState(false);
  const [testFrom, setTestFrom] = useState("+15555550123");
  const [testBody, setTestBody] = useState("Hello");

  const [viewer, setViewer] = useState<null | { userId: string; email?: string; name?: string }>(null);

  const [ownerTags, setOwnerTags] = useState<ContactTag[]>([]);
  const [accountMembers, setAccountMembers] = useState<AccountMember[]>([]);
  const [aiOutboundCallCampaigns, setAiOutboundCallCampaigns] = useState<AiOutboundCallCampaign[]>([]);
  const [nurtureCampaigns, setNurtureCampaigns] = useState<NurtureCampaign[]>([]);

  const [createTagOpen, setCreateTagOpen] = useState(false);
  const [createTagName, setCreateTagName] = useState("");
  const [createTagColor, setCreateTagColor] = useState<string>("#2563EB");
  const [createTagBusy, setCreateTagBusy] = useState(false);
  const [createTagError, setCreateTagError] = useState<string | null>(null);
  const [createTagApplyTo, setCreateTagApplyTo] = useState<null | { nodeId: string; kind: "action" | "trigger" }>(null);

  useEffect(() => {
    if (!error) return;
    const msg = String(error || "").trim();
    if (!msg) return;
    const now = Date.now();
    const prev = lastErrorToastRef.current;
    if (prev && prev.msg === msg && now - prev.at < 8000) return;
    lastErrorToastRef.current = { msg, at: now };
    toast.error(msg);
  }, [error, toast]);

  useEffect(() => {
    if (createTagError) toast.error(createTagError);
  }, [createTagError, toast]);

  const [variablePickerOpen, setVariablePickerOpen] = useState(false);
  const [variablePickerTarget, setVariablePickerTarget] = useState<
    | null
    | "sms_body"
    | "email_subject"
    | "email_body"
    | "task_title"
    | "task_description"
    | "condition_left"
    | "condition_right"
    | "test_sms_body"
    | "webhook_body"
    | "find_contact_name"
    | "find_contact_email"
    | "find_contact_phone"
    | "update_contact_name"
    | "update_contact_email"
    | "update_contact_phone"
  >(null);

  const [confirm, setConfirm] = useState<
    | null
    | { kind: "delete_node"; nodeId: string }
    | { kind: "delete_automation"; automationId: string }
  >(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const smsBodyRef = useRef<HTMLTextAreaElement | null>(null);
  const emailSubjectRef = useRef<HTMLInputElement | null>(null);
  const emailBodyRef = useRef<HTMLTextAreaElement | null>(null);
  const taskTitleRef = useRef<HTMLInputElement | null>(null);
  const taskDescriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const testSmsBodyRef = useRef<HTMLTextAreaElement | null>(null);
  const webhookBodyRef = useRef<HTMLTextAreaElement | null>(null);
  const findContactNameRef = useRef<HTMLInputElement | null>(null);
  const findContactEmailRef = useRef<HTMLInputElement | null>(null);
  const findContactPhoneRef = useRef<HTMLInputElement | null>(null);
  const updateContactNameRef = useRef<HTMLInputElement | null>(null);
  const updateContactEmailRef = useRef<HTMLInputElement | null>(null);
  const updateContactPhoneRef = useRef<HTMLInputElement | null>(null);

  const conditionLeftRef = useRef<HTMLInputElement | null>(null);
  const conditionRightRef = useRef<HTMLInputElement | null>(null);

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

  const [inspectorOpen, setInspectorOpen] = useState(true);

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

  function insertAtCursor(
    current: string,
    insert: string,
    el: HTMLInputElement | HTMLTextAreaElement | null,
  ): { next: string; caret: number } {
    const base = String(current ?? "");
    if (!el) {
      const next = base + insert;
      return { next, caret: next.length };
    }
    const start = typeof el.selectionStart === "number" ? el.selectionStart : base.length;
    const end = typeof el.selectionEnd === "number" ? el.selectionEnd : start;
    const next = base.slice(0, start) + insert + base.slice(end);
    return { next, caret: start + insert.length };
  }

  function openVariablePicker(target: NonNullable<typeof variablePickerTarget>) {
    setVariablePickerTarget(target);
    setVariablePickerOpen(true);
  }

  function applyPickedVariable(variableKey: string) {
    const token = `{${variableKey}}`;

    if (!selectedNodeId) return;

    const setCaretSoon = (el: HTMLInputElement | HTMLTextAreaElement | null, caret: number) => {
      if (!el) return;
      requestAnimationFrame(() => {
        try {
          el.focus();
          el.setSelectionRange(caret, caret);
        } catch {
          // ignore
        }
      });
    };

    if (variablePickerTarget === "sms_body") {
      const el = smsBodyRef.current;
      const current = String((selectedNode?.config as any)?.body ?? "");
      const { next, caret } = insertAtCursor(current, token, el);
      updateSelectedAutomation((a) => {
        const nodes = a.nodes.map((n) => (n.id === selectedNodeId ? { ...n, config: { ...(n.config as any), kind: "action", body: next } } : n));
        return { ...a, nodes, updatedAtIso: new Date().toISOString() } as any;
      });
      setCaretSoon(el, caret);
      return;
    }

    if (variablePickerTarget === "email_subject") {
      const el = emailSubjectRef.current;
      const current = String((selectedNode?.config as any)?.subject ?? "");
      const { next, caret } = insertAtCursor(current, token, el);
      updateSelectedAutomation((a) => {
        const nodes = a.nodes.map((n) => (n.id === selectedNodeId ? { ...n, config: { ...(n.config as any), kind: "action", subject: next } } : n));
        return { ...a, nodes, updatedAtIso: new Date().toISOString() } as any;
      });
      setCaretSoon(el, caret);
      return;
    }

    if (variablePickerTarget === "email_body") {
      const el = emailBodyRef.current;
      const current = String((selectedNode?.config as any)?.body ?? "");
      const { next, caret } = insertAtCursor(current, token, el);
      updateSelectedAutomation((a) => {
        const nodes = a.nodes.map((n) => (n.id === selectedNodeId ? { ...n, config: { ...(n.config as any), kind: "action", body: next } } : n));
        return { ...a, nodes, updatedAtIso: new Date().toISOString() } as any;
      });
      setCaretSoon(el, caret);
      return;
    }

    if (variablePickerTarget === "task_title") {
      const el = taskTitleRef.current;
      const current = String((selectedNode?.config as any)?.subject ?? "");
      const { next, caret } = insertAtCursor(current, token, el);
      updateSelectedAutomation((a) => {
        const nodes = a.nodes.map((n) => (n.id === selectedNodeId ? { ...n, config: { ...(n.config as any), kind: "action", subject: next } } : n));
        return { ...a, nodes, updatedAtIso: new Date().toISOString() } as any;
      });
      setCaretSoon(el, caret);
      return;
    }

    if (variablePickerTarget === "task_description") {
      const el = taskDescriptionRef.current;
      const current = String((selectedNode?.config as any)?.body ?? "");
      const { next, caret } = insertAtCursor(current, token, el);
      updateSelectedAutomation((a) => {
        const nodes = a.nodes.map((n) => (n.id === selectedNodeId ? { ...n, config: { ...(n.config as any), kind: "action", body: next } } : n));
        return { ...a, nodes, updatedAtIso: new Date().toISOString() } as any;
      });
      setCaretSoon(el, caret);
      return;
    }

    if (variablePickerTarget === "condition_left") {
      const el = conditionLeftRef.current;
      const current = String((selectedNode?.config as any)?.left ?? "");
      const { next, caret } = insertAtCursor(current, token, el);
      updateSelectedAutomation((a) => {
        const nodes = a.nodes.map((n) =>
          n.id === selectedNodeId
            ? {
                ...n,
                config: {
                  ...(n.config as any),
                  kind: "condition",
                  left: next,
                },
              }
            : n,
        );
        return { ...a, nodes, updatedAtIso: new Date().toISOString() } as any;
      });
      setCaretSoon(el, caret);
      return;
    }

    if (variablePickerTarget === "condition_right") {
      const el = conditionRightRef.current;
      const current = String((selectedNode?.config as any)?.right ?? "");
      const { next, caret } = insertAtCursor(current, token, el);
      updateSelectedAutomation((a) => {
        const nodes = a.nodes.map((n) =>
          n.id === selectedNodeId
            ? {
                ...n,
                config: {
                  ...(n.config as any),
                  kind: "condition",
                  right: next,
                },
              }
            : n,
        );
        return { ...a, nodes, updatedAtIso: new Date().toISOString() } as any;
      });
      setCaretSoon(el, caret);
      return;
    }

    if (variablePickerTarget === "test_sms_body") {
      const el = testSmsBodyRef.current;
      const current = String(testBody ?? "");
      const { next, caret } = insertAtCursor(current, token, el);
      setTestBody(next);
      setCaretSoon(el, caret);
    }

    if (variablePickerTarget === "webhook_body") {
      const el = webhookBodyRef.current;
      const current = String((selectedNode?.config as any)?.webhookBodyJson ?? "");
      const { next, caret } = insertAtCursor(current, token, el);
      updateSelectedAutomation((a) => {
        const nodes = a.nodes.map((n) =>
          n.id === selectedNodeId ? { ...n, config: { ...(n.config as any), kind: "action", webhookBodyJson: next } } : n,
        );
        return { ...a, nodes, updatedAtIso: new Date().toISOString() } as any;
      });
      setCaretSoon(el, caret);
      return;
    }

    if (variablePickerTarget === "find_contact_name") {
      const el = findContactNameRef.current;
      const current = String((selectedNode?.config as any)?.contactName ?? "");
      const { next, caret } = insertAtCursor(current, token, el);
      updateSelectedAutomation((a) => {
        const nodes = a.nodes.map((n) =>
          n.id === selectedNodeId ? { ...n, config: { ...(n.config as any), kind: "action", contactName: next } } : n,
        );
        return { ...a, nodes, updatedAtIso: new Date().toISOString() } as any;
      });
      setCaretSoon(el, caret);
      return;
    }

    if (variablePickerTarget === "find_contact_email") {
      const el = findContactEmailRef.current;
      const current = String((selectedNode?.config as any)?.contactEmail ?? "");
      const { next, caret } = insertAtCursor(current, token, el);
      updateSelectedAutomation((a) => {
        const nodes = a.nodes.map((n) =>
          n.id === selectedNodeId ? { ...n, config: { ...(n.config as any), kind: "action", contactEmail: next } } : n,
        );
        return { ...a, nodes, updatedAtIso: new Date().toISOString() } as any;
      });
      setCaretSoon(el, caret);
      return;
    }

    if (variablePickerTarget === "find_contact_phone") {
      const el = findContactPhoneRef.current;
      const current = String((selectedNode?.config as any)?.contactPhone ?? "");
      const { next, caret } = insertAtCursor(current, token, el);
      updateSelectedAutomation((a) => {
        const nodes = a.nodes.map((n) =>
          n.id === selectedNodeId ? { ...n, config: { ...(n.config as any), kind: "action", contactPhone: next } } : n,
        );
        return { ...a, nodes, updatedAtIso: new Date().toISOString() } as any;
      });
      setCaretSoon(el, caret);
      return;
    }

    if (variablePickerTarget === "update_contact_name") {
      const el = updateContactNameRef.current;
      const current = String((selectedNode?.config as any)?.contactName ?? "");
      const { next, caret } = insertAtCursor(current, token, el);
      updateSelectedAutomation((a) => {
        const nodes = a.nodes.map((n) =>
          n.id === selectedNodeId ? { ...n, config: { ...(n.config as any), kind: "action", contactName: next } } : n,
        );
        return { ...a, nodes, updatedAtIso: new Date().toISOString() } as any;
      });
      setCaretSoon(el, caret);
      return;
    }

    if (variablePickerTarget === "update_contact_email") {
      const el = updateContactEmailRef.current;
      const current = String((selectedNode?.config as any)?.contactEmail ?? "");
      const { next, caret } = insertAtCursor(current, token, el);
      updateSelectedAutomation((a) => {
        const nodes = a.nodes.map((n) =>
          n.id === selectedNodeId ? { ...n, config: { ...(n.config as any), kind: "action", contactEmail: next } } : n,
        );
        return { ...a, nodes, updatedAtIso: new Date().toISOString() } as any;
      });
      setCaretSoon(el, caret);
      return;
    }

    if (variablePickerTarget === "update_contact_phone") {
      const el = updateContactPhoneRef.current;
      const current = String((selectedNode?.config as any)?.contactPhone ?? "");
      const { next, caret } = insertAtCursor(current, token, el);
      updateSelectedAutomation((a) => {
        const nodes = a.nodes.map((n) =>
          n.id === selectedNodeId ? { ...n, config: { ...(n.config as any), kind: "action", contactPhone: next } } : n,
        );
        return { ...a, nodes, updatedAtIso: new Date().toISOString() } as any;
      });
      setCaretSoon(el, caret);
      return;
    }
  }

  const selectedAutomation = useMemo(() => {
    if (!selectedAutomationId) return null;
    return automations.find((a) => a.id === selectedAutomationId) ?? null;
  }, [automations, selectedAutomationId]);

  const selectedAutomationTriggerKind = useMemo((): TriggerKind | null => {
    const auto = selectedAutomation;
    if (!auto) return null;
    const t = (auto.nodes || []).find((n) => n.type === "trigger" && (n.config as any)?.kind === "trigger") as any;
    const k = t?.config?.triggerKind as TriggerKind | undefined;
    return k || null;
  }, [selectedAutomation]);

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
    try {
      lastSavedSigRef.current = JSON.stringify(list);
      setDirty(false);
      setLastSavedAtIso(new Date().toISOString());
    } catch {
      // ignore
    }

    const v = (data as any).viewer;
    if (v && typeof v === "object") {
      const nextViewer = {
        userId: String((v as any).userId || ""),
        email: typeof (v as any).email === "string" ? String((v as any).email) : undefined,
        name: typeof (v as any).name === "string" ? String((v as any).name) : undefined,
      };
      if (nextViewer.userId) setViewer(nextViewer);
    }

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
      lastSavedSigRef.current = "";
      setDirty(true);
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
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    setSaving(true);
    // Avoid clearing error on every autosave attempt (that causes toast spam).
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
      autosaveBlockedUntilRef.current = Date.now() + 6000;
      const msg = String((data as any)?.error || "Save failed.");
      setError((prev) => (prev === msg ? prev : msg));
      return;
    }

    const saved = ((data as any).automations || []) as Automation[];
    setAutomations(saved);
    try {
      lastSavedSigRef.current = JSON.stringify(saved);
      setDirty(false);
      setLastSavedAtIso(new Date().toISOString());
    } catch {
      // ignore
    }
    setSaving(false);

    const now = Date.now();
    if (now - lastSavedToastAtRef.current > 8000) {
      lastSavedToastAtRef.current = now;
      toast.success("Saved");
    }
  }

  // Autosave: when automations change, debounce a save.
  useEffect(() => {
    if (loading) return;
    if (saving) return;
    if (!automations) return;
    if (Date.now() < autosaveBlockedUntilRef.current) return;

    let sig = "";
    try {
      sig = JSON.stringify(automations);
    } catch {
      sig = "";
    }

    const isDirty = sig !== lastSavedSigRef.current;
    setDirty(isDirty);

    if (!isDirty) return;

    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      void saveAll(automations);
    }, 1200);

    return () => {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    };
  }, [automations, loading, saving]);

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
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/portal/ai-outbound-calls/campaigns", { cache: "no-store" }).catch(() => null as any);
      const data = (await res?.json?.().catch(() => null)) as any;
      if (cancelled) return;
      if (res?.ok && data?.ok && Array.isArray(data?.campaigns)) {
        setAiOutboundCallCampaigns(
          (data.campaigns as any[])
            .map((c) => ({
              id: String(c?.id || ""),
              name: String(c?.name || "").slice(0, 120) || "Campaign",
              status: String(c?.status || ""),
            }))
            .filter((c) => Boolean(c.id)),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/portal/nurture/campaigns", { cache: "no-store" }).catch(() => null as any);
      const data = (await res?.json?.().catch(() => null)) as any;
      if (cancelled) return;
      if (res?.ok && data?.ok && Array.isArray(data?.campaigns)) {
        setNurtureCampaigns(
          (data.campaigns as any[])
            .map((c) => ({
              id: String(c?.id || ""),
              name: String(c?.name || "").slice(0, 120) || "Campaign",
              status: String(c?.status || ""),
            }))
            .filter((c) => Boolean(c.id)),
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

    if (t === "trigger") {
      const alreadyHasTrigger = (selectedAutomation?.nodes || []).some((n) => n.type === "trigger");
      if (alreadyHasTrigger) {
        setNote("Only one trigger is allowed per automation.");
        window.setTimeout(() => setNote(null), 1800);
        return;
      }
    }

    const config = defaultConfigForType(t);
    const node: BuilderNode = { id: uid("n"), type: t, label: labelForConfig(t, config), x, y, config };

    updateSelectedAutomation((a) => ({
      ...a,
      nodes: [...a.nodes, node].slice(0, 250),
      updatedAtIso: new Date().toISOString(),
    }));

    setSelectedNodeId(node.id);
    setInspectorOpen(true);
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
    setConfirm({ kind: "delete_node", nodeId: selectedNodeId });
  }

  async function runConfirm() {
    if (!confirm) return;
    if (confirmBusy) return;

    setConfirmBusy(true);
    try {
      if (confirm.kind === "delete_node") {
        const nodeId = confirm.nodeId;
        updateSelectedAutomation((a) => {
          const nodes = a.nodes.filter((n) => n.id !== nodeId);
          const edges = a.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
          return { ...a, nodes, edges, updatedAtIso: new Date().toISOString() };
        });
        if (selectedNodeId === nodeId) setSelectedNodeId(null);
        setAutolabelSelectedNode(true);
      }

      if (confirm.kind === "delete_automation") {
        const nextList = automations.filter((x) => x.id !== confirm.automationId);
        setAutomations(nextList);
        setSelectedAutomation(nextList[0]?.id ?? null);
        await saveAll(nextList);
      }
    } finally {
      setConfirmBusy(false);
      setConfirm(null);
    }
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
      createdBy: viewer?.userId ? { userId: viewer.userId, email: viewer.email, name: viewer.name } : undefined,
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
    duplicateAutomationById(selectedAutomation.id);
  }

  function duplicateAutomationById(automationId: string) {
    const source = automations.find((x) => x.id === automationId);
    if (!source) return;
    const copy: Automation = {
      ...source,
      id: uid("auto"),
      name: `${source.name} (copy)`
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80),
      updatedAtIso: new Date().toISOString(),
      nodes: source.nodes.map((n) => ({ ...n, id: uid("n") })),
      edges: [],
    };

    // Re-map edges using old->new ids by index ordering
    const oldIds = source.nodes.map((n) => n.id);
    const newIds = copy.nodes.map((n) => n.id);
    const map = new Map<string, string>();
    for (let i = 0; i < Math.min(oldIds.length, newIds.length); i++) map.set(oldIds[i], newIds[i]);
    copy.edges = source.edges
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
    void deleteAutomationById(selectedAutomation.id);
  }

  async function deleteAutomationById(automationId: string) {
    setConfirm({ kind: "delete_automation", automationId });
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
      </div>

      {note ? <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{note}</div> : null}

      <PortalVariablePickerModal
        open={variablePickerOpen}
        variables={[...PORTAL_TIME_VARIABLES, ...PORTAL_MESSAGE_VARIABLES, ...PORTAL_LINK_VARIABLES]}
        onPick={applyPickedVariable}
        onClose={() => {
          setVariablePickerOpen(false);
          setVariablePickerTarget(null);
        }}
      />

      {confirm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onMouseDown={() => {
            if (confirmBusy) return;
            setConfirm(null);
          }}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-4 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Confirm delete</div>
                <div className="mt-1 text-sm text-zinc-600">
                  {confirm.kind === "delete_node"
                    ? "Delete this node? This cannot be undone."
                    : `Delete automation "${automations.find((x) => x.id === confirm.automationId)?.name ?? "(untitled)"}"? This cannot be undone.`}
                </div>
              </div>
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
                onClick={() => setConfirm(null)}
                disabled={confirmBusy}
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
                onClick={() => setConfirm(null)}
                disabled={confirmBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                onClick={() => void runConfirm()}
                disabled={confirmBusy}
              >
                {confirmBusy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-xs font-semibold text-zinc-600">Message</label>
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                      onClick={() => openVariablePicker("test_sms_body")}
                    >
                      Add variable
                    </button>
                  </div>
                <textarea
                    ref={testSmsBodyRef}
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
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
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

      {libraryOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onMouseDown={() => {
            setLibraryOpen(false);
            setLibraryMenuFor(null);
          }}
        >
          <div
            className="w-full max-w-2xl rounded-3xl border border-zinc-200 bg-white p-4 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">All automations</div>
                <div className="mt-1 text-sm text-zinc-600">Click an automation to edit it. Use the menu for edit or delete.</div>
              </div>
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
                onClick={() => {
                  setLibraryOpen(false);
                  setLibraryMenuFor(null);
                }}
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {automations.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                  No automations yet.
                </div>
              ) : (
                automations.map((a) => {
                  const isSel = a.id === selectedAutomationId;
                  const triggerNode = (a.nodes || []).find((n: any) => n?.type === "trigger" && n?.config?.kind === "trigger") as any;
                  const triggerKind = triggerNode?.config?.triggerKind as TriggerKind | undefined;
                  const canManualRun = triggerKind === "manual";
                  return (
                    <div
                      key={a.id}
                      className={
                        "flex items-center justify-between gap-3 rounded-2xl border px-3 py-3 " +
                        (isSel ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white")
                      }
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          setSelectedAutomation(a.id);
                          setLibraryOpen(false);
                          setLibraryMenuFor(null);
                        }}
                      >
                        <div className={"truncate text-sm font-semibold " + (isSel ? "text-white" : "text-zinc-900")}>
                          {a.name}
                        </div>
                        <div className={"mt-1 text-xs " + (isSel ? "text-zinc-200" : "text-zinc-600")}>
                          {(a.nodes?.length ?? 0)} nodes · {(a.edges?.length ?? 0)} connections
                        </div>
                      </button>

                      {canManualRun ? (
                        <button
                          type="button"
                          className={
                            "rounded-xl px-3 py-2 text-xs font-semibold " +
                            (isSel
                              ? "bg-white/10 text-white hover:bg-white/15"
                              : "border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50")
                          }
                          disabled={manualRunBusyFor === a.id}
                          onClick={async () => {
                            if (manualRunBusyFor) return;
                            setManualRunBusyFor(a.id);
                            const res = await fetch("/api/portal/automations/run", {
                              method: "POST",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify({ automationId: a.id }),
                            }).catch(() => null as any);
                            const data = (await res?.json?.().catch(() => null)) as any;
                            if (!res?.ok || !data?.ok) {
                              setError(String(data?.error || "Failed to trigger."));
                            } else {
                              toast.success("Triggered");
                            }
                            setManualRunBusyFor(null);
                          }}
                          title="Run this automation now"
                        >
                          {manualRunBusyFor === a.id ? "Triggering…" : "Trigger"}
                        </button>
                      ) : null}

                      <div className="relative">
                        <button
                          type="button"
                          className={
                            "rounded-xl border px-2 py-1 text-xs font-semibold hover:bg-zinc-50 " +
                            (isSel ? "border-zinc-700 bg-zinc-800 text-white hover:bg-zinc-700" : "border-zinc-200 bg-white text-zinc-700")
                          }
                          onClick={() => setLibraryMenuFor((prev) => (prev === a.id ? null : a.id))}
                          title="Actions"
                        >
                          ⋯
                        </button>

                        {libraryMenuFor === a.id ? (
                          <div
                            className="absolute right-0 z-10 mt-2 w-40 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow"
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                              onClick={() => {
                                setSelectedAutomation(a.id);
                                setLibraryOpen(false);
                                setLibraryMenuFor(null);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                              onClick={() => {
                                setSelectedAutomation(a.id);
                                setLibraryOpen(false);
                                setLibraryMenuFor(null);
                                setRenameValue(a.name);
                                setRenameOpen(true);
                              }}
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                              onClick={() => {
                                setLibraryOpen(false);
                                setLibraryMenuFor(null);
                                duplicateAutomationById(a.id);
                              }}
                            >
                              Duplicate
                            </button>
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50"
                              onClick={() => {
                                setLibraryMenuFor(null);
                                void deleteAutomationById(a.id);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
                onClick={() => {
                  setLibraryOpen(false);
                  setLibraryMenuFor(null);
                }}
              >
                Done
              </button>
              <button
                type="button"
                className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                onClick={createAutomation}
                disabled={saving}
              >
                + New
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-5 rounded-3xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
            <button
              type="button"
              className="min-w-0 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              onClick={() => {
                setLibraryOpen(true);
                setLibraryMenuFor(null);
              }}
              title="Select automation"
            >
              <span className="block max-w-[360px] truncate">{selectedAutomation ? selectedAutomation.name : "Select automation"}</span>
            </button>
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50"
              onClick={createAutomation}
              disabled={saving}
            >
              + New
            </button>
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50"
              onClick={() => {
                setLibraryOpen(true);
                setLibraryMenuFor(null);
              }}
            >
              All automations
            </button>
          </div>

          <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">
            <div className="mr-2 hidden flex-col items-end sm:flex">
              <div className="text-xs font-semibold text-zinc-700">
                {saving ? "Saving…" : dirty ? "Autosaving…" : "Saved"}
              </div>
              <div className="text-xs text-zinc-500">
                {lastSavedAtIso ? `Last saved ${new Date(lastSavedAtIso).toLocaleTimeString()}` : ""}
              </div>
            </div>
            <button
              type="button"
              className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              onClick={() => void saveAll()}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-60"
              onClick={() => openRenameModal()}
              disabled={saving || !selectedAutomation}
            >
              Rename
            </button>
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
              onClick={() => openTestModal()}
              disabled={saving || !selectedAutomation}
            >
              Test
            </button>
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
              onClick={() => duplicateAutomation()}
              disabled={saving || !selectedAutomation}
            >
              Duplicate
            </button>
            <button
              type="button"
              className="rounded-2xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              onClick={() => deleteAutomation()}
              disabled={saving || !selectedAutomation}
            >
              Delete
            </button>
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Palette</div>
              <div className="mt-1 text-sm text-zinc-600">Drag onto the canvas.</div>
            </div>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {([
              { type: "trigger" as const, title: "Trigger" },
              { type: "action" as const, title: "Action" },
              { type: "condition" as const, title: "Condition" },
              { type: "delay" as const, title: "Delay" },
              { type: "note" as const, title: "Note" },
            ] as const).map((x) => {
              const b = badgeForType(x.type);
              const disabled =
                x.type === "trigger" && Boolean(selectedAutomation && (selectedAutomation.nodes || []).some((n) => n.type === "trigger"));
              return (
                <div
                  key={x.type}
                  draggable={!disabled}
                  onDragStart={(ev) => {
                    if (disabled) {
                      ev.preventDefault();
                      return;
                    }
                    ev.dataTransfer.setData("text/plain", x.type);
                    ev.dataTransfer.effectAllowed = "copy";
                  }}
                  className={
                    "min-w-[220px] rounded-2xl border border-zinc-200 px-4 py-3 " +
                    (disabled ? "cursor-not-allowed bg-zinc-50 opacity-60" : "cursor-grab bg-zinc-50 active:cursor-grabbing")
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-zinc-900">{x.title}</div>
                    <div className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${b.cls}`}>{b.label}</div>
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">
                    {disabled ? "Trigger already set (only one allowed)." : `Drop to add a ${x.title.toLowerCase()} node.`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-4">
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
                          setInspectorOpen(true);
                          setAutolabelSelectedNode(true);
                          handleStartDragNode(ev, n.id);
                        }}
                        onDoubleClick={() => {
                          setSelectedNodeId(n.id);
                          setInspectorOpen(true);
                        }}
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
                  className="absolute right-3 top-3 z-30 flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 shadow-sm"
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

                {inspectorOpen ? (
                  <div
                    data-kind="ui"
                    className="absolute left-3 top-3 z-30 w-[360px] max-w-[calc(100%-1.5rem)] rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-lg backdrop-blur"
                    onPointerDown={(ev) => ev.stopPropagation()}
                    onWheel={(ev) => ev.stopPropagation()}
                  >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-zinc-900">Inspector</div>
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-sm font-semibold leading-none hover:bg-zinc-50 touch-manipulation"
                      onClick={() => {
                        setInspectorOpen(false);
                        setSelectedNodeId(null);
                        setAutolabelSelectedNode(true);
                      }}
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
                            <PortalListboxDropdown
                              className="mt-1"
                              value={
                                selectedNode.config?.kind === "trigger"
                                  ? selectedNode.config.triggerKind
                                  : (defaultConfigForType("trigger") as any).triggerKind
                              }
                              options={[
                                { value: "manual", label: "Manual" },
                                { value: "inbound_sms", label: "Inbound SMS" },
                                { value: "inbound_mms", label: "Inbound MMS" },
                                { value: "inbound_call", label: "Inbound Call" },
                                { value: "inbound_email", label: "Inbound Email" },
                                { value: "new_lead", label: "New Lead" },
                                { value: "lead_scraped", label: "Lead scraped" },
                                { value: "tag_added", label: "Tag added" },
                                { value: "contact_created", label: "Contact created" },
                                { value: "task_added", label: "Task added" },
                                { value: "inbound_webhook", label: "Inbound webhook" },
                                { value: "scheduled_time", label: "Scheduler / time" },
                                { value: "missed_appointment", label: "Missed appointment" },
                                { value: "appointment_booked", label: "Appointment booked" },
                                { value: "missed_call", label: "Missed call" },
                                { value: "review_received", label: "Review received" },
                                { value: "follow_up_sent", label: "Follow-up sent" },
                                { value: "outbound_sent", label: "Outbound sent" },
                              ]}
                              onChange={(nextKind) => {
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
                            />

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
                                    <PortalListboxDropdown
                                      className="mt-1"
                                      value={tagId}
                                      options={[
                                        { value: "", label: "Any tag…" },
                                        { value: CREATE_TAG_VALUE, label: "+ Create new tag…" },
                                        ...ownerTags.map((t) => ({ value: t.id, label: t.name })),
                                      ]}
                                      onChange={(next) => {
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
                                    />
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
                                const scheduleMode = ((cfg as any).scheduleMode as any) === "specific" ? "specific" : "every";
                                const everyUnit = (((cfg as any).everyUnit as any) || "minutes") as "minutes" | "days" | "weeks" | "months";
                                const everyValueRaw = (cfg as any).everyValue ?? (cfg as any).intervalMinutes ?? 60;
                                const everyValue = clampInt(Number(everyValueRaw || 60), everyUnit === "minutes" ? 5 : 1, 10_000);

                                const specificKind = (((cfg as any).specificKind as any) || "daily") as "daily" | "weekly" | "monthly";
                                const specificTime = String((cfg as any).specificTime || "09:00").slice(0, 5);
                                const specificWeekday = clampInt(Number((cfg as any).specificWeekday ?? 1), 0, 6);
                                const specificDayOfMonth = clampInt(Number((cfg as any).specificDayOfMonth ?? 1), 1, 31);

                                return (
                                  <div className="mt-2">
                                    <div className="text-xs font-semibold text-zinc-600">Schedule</div>
                                    <PortalListboxDropdown
                                      className="mt-1"
                                      value={scheduleMode}
                                      options={[
                                        { value: "every", label: "Run every X" },
                                        { value: "specific", label: "Specific day/time" },
                                      ]}
                                      onChange={(nextMode) => {
                                        updateSelectedAutomation((a) => {
                                          const nodes = a.nodes.map((n) => {
                                            if (n.id !== selectedNode.id) return n;
                                            const prev = n.config?.kind === "trigger" ? n.config : (defaultConfigForType("trigger") as any);
                                            const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "trigger", scheduleMode: nextMode } as any;
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

                                    {scheduleMode === "every" ? (
                                      <div className="mt-2">
                                        <div className="text-xs font-semibold text-zinc-600">Run every</div>
                                        <div className="mt-1 flex items-center gap-2">
                                          <input
                                            type="number"
                                            min={everyUnit === "minutes" ? 5 : 1}
                                            max={10_000}
                                            className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                            value={everyValue}
                                            onChange={(e) => {
                                              const nextVal = clampInt(Number(e.target.value || 1), everyUnit === "minutes" ? 5 : 1, 10_000);
                                              updateSelectedAutomation((a) => {
                                                const nodes = a.nodes.map((n) => {
                                                  if (n.id !== selectedNode.id) return n;
                                                  const prev = n.config?.kind === "trigger" ? n.config : (defaultConfigForType("trigger") as any);
                                                  const nextCfg: BuilderNodeConfig = {
                                                    ...(prev as any),
                                                    kind: "trigger",
                                                    scheduleMode: "every",
                                                    everyValue: nextVal,
                                                    everyUnit,
                                                    intervalMinutes: everyUnit === "minutes" ? nextVal : undefined,
                                                  } as any;
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
                                          <PortalListboxDropdown
                                            className="shrink-0"
                                            value={everyUnit}
                                            options={[
                                              { value: "minutes", label: "minutes" },
                                              { value: "days", label: "days" },
                                              { value: "weeks", label: "weeks" },
                                              { value: "months", label: "months" },
                                            ]}
                                            onChange={(nextUnit) => {
                                              updateSelectedAutomation((a) => {
                                                const nodes = a.nodes.map((n) => {
                                                  if (n.id !== selectedNode.id) return n;
                                                  const prev = n.config?.kind === "trigger" ? n.config : (defaultConfigForType("trigger") as any);
                                                  const nextCfg: BuilderNodeConfig = {
                                                    ...(prev as any),
                                                    kind: "trigger",
                                                    scheduleMode: "every",
                                                    everyUnit: nextUnit,
                                                    everyValue: clampInt(
                                                      Number((prev as any).everyValue ?? (prev as any).intervalMinutes ?? 60),
                                                      nextUnit === "minutes" ? 5 : 1,
                                                      10_000,
                                                    ),
                                                    intervalMinutes:
                                                      nextUnit === "minutes"
                                                        ? clampInt(Number((prev as any).everyValue ?? (prev as any).intervalMinutes ?? 60), 5, 43200)
                                                        : undefined,
                                                  } as any;
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
                                        </div>
                                        <div className="mt-1 text-[11px] text-zinc-600">Runs on the server when schedules are processed.</div>
                                      </div>
                                    ) : (
                                      <div className="mt-2 space-y-2">
                                        <div>
                                          <div className="text-xs font-semibold text-zinc-600">Frequency</div>
                                          <PortalListboxDropdown
                                            className="mt-1"
                                            value={specificKind}
                                            options={[
                                              { value: "daily", label: "Daily" },
                                              { value: "weekly", label: "Weekly" },
                                              { value: "monthly", label: "Monthly" },
                                            ]}
                                            onChange={(nextKind) => {
                                              updateSelectedAutomation((a) => {
                                                const nodes = a.nodes.map((n) => {
                                                  if (n.id !== selectedNode.id) return n;
                                                  const prev = n.config?.kind === "trigger" ? n.config : (defaultConfigForType("trigger") as any);
                                                  const nextCfg: BuilderNodeConfig = {
                                                    ...(prev as any),
                                                    kind: "trigger",
                                                    scheduleMode: "specific",
                                                    specificKind: nextKind,
                                                  } as any;
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
                                        </div>

                                        {specificKind === "weekly" ? (
                                          <div>
                                            <div className="text-xs font-semibold text-zinc-600">Day of week</div>
                                            <PortalListboxDropdown
                                              className="mt-1"
                                              value={String(specificWeekday) as any}
                                              options={[
                                                { value: "1", label: "Monday" },
                                                { value: "2", label: "Tuesday" },
                                                { value: "3", label: "Wednesday" },
                                                { value: "4", label: "Thursday" },
                                                { value: "5", label: "Friday" },
                                                { value: "6", label: "Saturday" },
                                                { value: "0", label: "Sunday" },
                                              ]}
                                              onChange={(nextWdStr) => {
                                                const nextWd = clampInt(Number(nextWdStr ?? 1), 0, 6);
                                                updateSelectedAutomation((a) => {
                                                  const nodes = a.nodes.map((n) => {
                                                    if (n.id !== selectedNode.id) return n;
                                                    const prev = n.config?.kind === "trigger" ? n.config : (defaultConfigForType("trigger") as any);
                                                    const nextCfg: BuilderNodeConfig = {
                                                      ...(prev as any),
                                                      kind: "trigger",
                                                      scheduleMode: "specific",
                                                      specificWeekday: nextWd,
                                                    } as any;
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
                                          </div>
                                        ) : null}

                                        {specificKind === "monthly" ? (
                                          <div>
                                            <div className="text-xs font-semibold text-zinc-600">Day of month</div>
                                            <input
                                              type="number"
                                              min={1}
                                              max={31}
                                              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                              value={specificDayOfMonth}
                                              onChange={(e) => {
                                                const nextDom = clampInt(Number(e.target.value ?? 1), 1, 31);
                                                updateSelectedAutomation((a) => {
                                                  const nodes = a.nodes.map((n) => {
                                                    if (n.id !== selectedNode.id) return n;
                                                    const prev = n.config?.kind === "trigger" ? n.config : (defaultConfigForType("trigger") as any);
                                                    const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "trigger", scheduleMode: "specific", specificDayOfMonth: nextDom } as any;
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
                                          </div>
                                        ) : null}

                                        <div>
                                          <div className="text-xs font-semibold text-zinc-600">Time (UTC)</div>
                                          <input
                                            type="time"
                                            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                            value={specificTime}
                                            onChange={(e) => {
                                              const nextTime = String(e.target.value || "09:00").slice(0, 5);
                                              updateSelectedAutomation((a) => {
                                                const nodes = a.nodes.map((n) => {
                                                  if (n.id !== selectedNode.id) return n;
                                                  const prev = n.config?.kind === "trigger" ? n.config : (defaultConfigForType("trigger") as any);
                                                  const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "trigger", scheduleMode: "specific", specificTime: nextTime } as any;
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
                                          <div className="mt-1 text-[11px] text-zinc-600">Specific schedules are evaluated in UTC.</div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              }

                              return null;
                            })()}
                          </>
                        ) : null}

                        {selectedNode.type === "action" ? (
                          <>
                            {(() => {
                              const value: ActionKind =
                                selectedNode.config?.kind === "action"
                                  ? selectedNode.config.actionKind
                                  : (defaultConfigForType("action") as any).actionKind;
                              const triggerKind = selectedAutomationTriggerKind;
                              const triggerHasContact = Boolean(triggerKind && triggerKind !== "scheduled_time" && triggerKind !== "manual");
                              const needsContact = (k: ActionKind) =>
                                k === "add_tag" ||
                                k === "update_contact" ||
                                k === "send_review_request" ||
                                k === "send_booking_link" ||
                                k === "trigger_service";

                              const opts: ActionKindOption[] = [
                                { value: "send_sms", label: "Send SMS" },
                                { value: "send_email", label: "Send Email" },
                                { value: "add_tag", label: "Add Tag", disabled: !triggerHasContact, hint: !triggerHasContact ? "Needs a contact event" : undefined },
                                { value: "create_task", label: "Create Task" },
                                { value: "assign_lead", label: "Assign Lead" },
                                { value: "find_contact", label: "Find Contact" },
                                {
                                  value: "trigger_service",
                                  label: "Trigger service",
                                  disabled: !triggerHasContact,
                                  hint: !triggerHasContact ? "Not available for Scheduler/time" : undefined,
                                },
                                { value: "send_webhook", label: "Send Webhook" },
                                {
                                  value: "send_review_request",
                                  label: "Review Request",
                                  disabled: !triggerHasContact,
                                  hint: !triggerHasContact ? "Not available for Scheduler/time" : undefined,
                                },
                                {
                                  value: "send_booking_link",
                                  label: "Book Appointment",
                                  disabled: !triggerHasContact,
                                  hint: !triggerHasContact ? "Not available for Scheduler/time" : undefined,
                                },
                                {
                                  value: "update_contact",
                                  label: "Update Contact",
                                  disabled: !triggerHasContact,
                                  hint: !triggerHasContact ? "Not available for Scheduler/time" : undefined,
                                },
                              ];

                              const isValueCompatible = triggerHasContact || !needsContact(value);

                              return (
                                <>
                                  <ActionKindDropdown
                                    value={value}
                                    options={opts}
                                    onChange={(nextKind) => {
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
                                  />
                                  {!isValueCompatible ? (
                                    <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                                      This action is not compatible with the current trigger.
                                    </div>
                                  ) : null}
                                </>
                              );
                            })()}

                            {(() => {
                              const cfg =
                                selectedNode.config?.kind === "action"
                                  ? selectedNode.config
                                  : (defaultConfigForType("action") as any);

                              if (cfg.actionKind === "trigger_service") {
                                const serviceSlug = String((cfg as any).serviceSlug || "ai-outbound-calls");
                                const serviceCampaignId = String((cfg as any).serviceCampaignId || "");

                                const supported = new Set<string>(["ai-outbound-calls", "nurture-campaigns"]);

                                const serviceOptions = PORTAL_SERVICES.filter((s) => !s.hidden && s.slug !== "automations").map((s) => ({
                                  value: s.slug,
                                  label: s.title,
                                  disabled: !supported.has(s.slug),
                                  hint: supported.has(s.slug) ? undefined : "Not supported yet",
                                }));

                                const outboundCampaignOptions = aiOutboundCallCampaigns.map((c) => ({
                                  value: c.id,
                                  label: c.status && c.status !== "ACTIVE" ? `${c.name} (${c.status})` : c.name,
                                }));

                                const nurtureCampaignOptions = nurtureCampaigns.map((c) => ({
                                  value: c.id,
                                  label: c.status && c.status !== "ACTIVE" ? `${c.name} (${c.status})` : c.name,
                                }));

                                return (
                                  <>
                                    <div className="mt-2">
                                      <div className="text-xs font-semibold text-zinc-600">Service</div>
                                      <PortalListboxDropdown
                                        className="mt-1"
                                        value={serviceSlug}
                                        options={serviceOptions}
                                        onChange={(next) => {
                                          updateSelectedAutomation((a) => {
                                            const nodes = a.nodes.map((n) => {
                                              if (n.id !== selectedNode.id) return n;
                                              const prev =
                                                n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                              const nextCfg: BuilderNodeConfig = {
                                                ...(prev as any),
                                                kind: "action",
                                                serviceSlug: next,
                                                serviceCampaignId: next === serviceSlug ? (prev as any).serviceCampaignId : "",
                                              };
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

                                    {serviceSlug === "ai-outbound-calls" ? (
                                      <div className="mt-2">
                                        <div className="text-xs font-semibold text-zinc-600">Campaign</div>
                                        <PortalListboxDropdown
                                          className="mt-1"
                                          value={serviceCampaignId}
                                          options={[
                                            { value: "", label: "(default: latest ACTIVE campaign)" },
                                            ...outboundCampaignOptions,
                                          ]}
                                          onChange={(next) => {
                                            updateSelectedAutomation((a) => {
                                              const nodes = a.nodes.map((n) => {
                                                if (n.id !== selectedNode.id) return n;
                                                const prev =
                                                  n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                                const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "action", serviceCampaignId: next };
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
                                        <div className="mt-2 text-[11px] text-zinc-600">
                                          Optional. If not set, we’ll use the most recently updated ACTIVE campaign.
                                        </div>
                                      </div>
                                    ) : null}

                                    {serviceSlug === "nurture-campaigns" ? (
                                      <div className="mt-2">
                                        <div className="text-xs font-semibold text-zinc-600">Campaign</div>
                                        <PortalListboxDropdown
                                          className="mt-1"
                                          value={serviceCampaignId}
                                          options={[
                                            { value: "", label: "(default: latest ACTIVE campaign)" },
                                            ...nurtureCampaignOptions,
                                          ]}
                                          onChange={(next) => {
                                            updateSelectedAutomation((a) => {
                                              const nodes = a.nodes.map((n) => {
                                                if (n.id !== selectedNode.id) return n;
                                                const prev =
                                                  n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                                const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "action", serviceCampaignId: next };
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
                                        <div className="mt-2 text-[11px] text-zinc-600">
                                          Optional. If not set, we’ll use the most recently updated ACTIVE campaign.
                                        </div>
                                      </div>
                                    ) : null}
                                  </>
                                );
                              }

                              if (cfg.actionKind === "send_sms") {
                                const smsTo = ((cfg as any).smsTo as MessageTarget) || "inbound_sender";
                                const smsToNumber = String((cfg as any).smsToNumber || "").slice(0, 32);
                                return (
                                  <>
                                    <div className="mt-2">
                                      <div className="text-xs font-semibold text-zinc-600">Send to</div>
                                      <PortalListboxDropdown
                                        className="mt-1"
                                        value={smsTo}
                                        options={[
                                          { value: "inbound_sender", label: "Inbound sender" },
                                          { value: "event_contact", label: "Step contact" },
                                          { value: "internal_notification", label: "Internal notification (my number)" },
                                          { value: "assigned_lead", label: "Assigned lead" },
                                          { value: "custom", label: "Custom number" },
                                        ]}
                                        onChange={(next) => {
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
                                      />
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

                                    <div className="mt-2 flex items-center justify-between gap-3">
                                      <div className="text-xs font-semibold text-zinc-600">SMS body</div>
                                      <button
                                        type="button"
                                        className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                                        onClick={() => openVariablePicker("sms_body")}
                                      >
                                        Add variable
                                      </button>
                                    </div>
                                    <textarea
                                      ref={smsBodyRef}
                                      className="mt-1 w-full resize-none rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
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

                              if (cfg.actionKind === "send_review_request" || cfg.actionKind === "send_booking_link") {
                                const smsTo = ((cfg as any).smsTo as MessageTarget) || "event_contact";
                                const smsToNumber = String((cfg as any).smsToNumber || "").slice(0, 32);
                                const defaultBody =
                                  cfg.actionKind === "send_review_request"
                                    ? "Thanks for choosing {business.name}! Leave a review: {link}"
                                    : "Book an appointment here: {link}";

                                return (
                                  <>
                                    <div className="mt-2">
                                      <div className="text-xs font-semibold text-zinc-600">Send to</div>
                                      <PortalListboxDropdown
                                        className="mt-1"
                                        value={smsTo}
                                        options={[
                                          { value: "event_contact", label: "Step contact" },
                                          { value: "inbound_sender", label: "Inbound sender" },
                                          { value: "internal_notification", label: "Internal notification (my number)" },
                                          { value: "assigned_lead", label: "Assigned lead" },
                                          { value: "custom", label: "Custom number" },
                                        ]}
                                        onChange={(next) => {
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
                                      />
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

                                    <div className="mt-2 flex items-center justify-between gap-3">
                                      <div className="text-xs font-semibold text-zinc-600">Message</div>
                                      <button
                                        type="button"
                                        className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                                        onClick={() => openVariablePicker("sms_body")}
                                      >
                                        Add variable
                                      </button>
                                    </div>
                                    <textarea
                                      ref={smsBodyRef}
                                      className="mt-1 w-full resize-none rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                      rows={3}
                                      placeholder="SMS body"
                                      value={String((cfg as any).body || "").slice(0, 1200)}
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
                                    <div className="mt-1 text-[11px] text-zinc-600">
                                      Tip: include <span className="font-semibold">{'{link}'}</span> in your template. Default: {defaultBody}
                                    </div>
                                  </>
                                );
                              }

                              if (cfg.actionKind === "send_webhook") {
                                const webhookUrl = String((cfg as any).webhookUrl || "").slice(0, 600);
                                const webhookBodyJson = String((cfg as any).webhookBodyJson || "").slice(0, 50_000);
                                return (
                                  <>
                                    <div className="mt-2">
                                      <div className="text-xs font-semibold text-zinc-600">Webhook URL</div>
                                      <input
                                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                        placeholder="https://example.com/webhook"
                                        value={webhookUrl}
                                        onChange={(e) => {
                                          const next = e.target.value.slice(0, 600);
                                          updateSelectedAutomation((a) => {
                                            const nodes = a.nodes.map((n) => {
                                              if (n.id !== selectedNode.id) return n;
                                              const prev =
                                                n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                              const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "action", webhookUrl: next };
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

                                    <div className="mt-2 flex items-center justify-between gap-3">
                                      <div className="text-xs font-semibold text-zinc-600">Body (JSON)</div>
                                      <button
                                        type="button"
                                        className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                                        onClick={() => openVariablePicker("webhook_body")}
                                      >
                                        Add variable
                                      </button>
                                    </div>

                                    <textarea
                                      ref={webhookBodyRef}
                                      className="mt-1 w-full resize-none rounded-2xl border border-zinc-200 bg-white px-3 py-2 font-mono text-[12px]"
                                      rows={6}
                                      placeholder='{"contact": {"name": "{contact.name}"}, "message": "{message.body}"}'
                                      value={webhookBodyJson}
                                      onChange={(e) => {
                                        const next = e.target.value.slice(0, 50_000);
                                        updateSelectedAutomation((a) => {
                                          const nodes = a.nodes.map((n) => {
                                            if (n.id !== selectedNode.id) return n;
                                            const prev =
                                              n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                            const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "action", webhookBodyJson: next };
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
                                    <div className="mt-1 text-[11px] text-zinc-600">If empty, the server sends a default payload.</div>
                                  </>
                                );
                              }

                              if (cfg.actionKind === "find_contact") {
                                const tagId = String((cfg as any).tagId || "").trim();
                                const tagMode = String((cfg as any).tagMode || "latest").trim();
                                const maxContactsRaw = Number((cfg as any).maxContacts || 25);
                                const maxContacts = Number.isFinite(maxContactsRaw) ? Math.max(1, Math.min(50, Math.floor(maxContactsRaw))) : 25;
                                const contactName = String((cfg as any).contactName || "").slice(0, 200);
                                const contactEmail = String((cfg as any).contactEmail || "").slice(0, 200);
                                const contactPhone = String((cfg as any).contactPhone || "").slice(0, 64);
                                return (
                                  <>
                                    <div className="mt-2">
                                      <div className="text-xs font-semibold text-zinc-600">Lookup tag (optional)</div>
                                      <div className="mt-1">
                                        <PortalListboxDropdown
                                          value={(tagId || "__none__") as any}
                                          options={[
                                            { value: "__none__", label: "No tag", hint: "Skip tag lookup" },
                                            ...ownerTags.map((t) => ({ value: t.id, label: t.name })),
                                          ]}
                                          onChange={(next) => {
                                            const nextTagId = next === "__none__" ? "" : String(next);
                                            updateSelectedAutomation((a) => {
                                              const nodes = a.nodes.map((n) => {
                                                if (n.id !== selectedNode.id) return n;
                                                const prev =
                                                  n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                                const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "action", tagId: nextTagId };
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
                                      <div className="mt-1 text-[11px] text-zinc-600">
                                        If set, you can pick the most recent contact with this tag, or fan-out and run later steps for multiple contacts.
                                      </div>
                                    </div>

                                    {tagId ? (
                                      <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                                        <div className="text-xs font-semibold text-zinc-700">Tag lookup mode</div>
                                        <div className="mt-1">
                                          <PortalListboxDropdown
                                            value={(tagMode || "latest") as any}
                                            options={[
                                              { value: "latest", label: "Most recent tagged contact" },
                                              { value: "all", label: "All tagged contacts (fan-out)" },
                                            ]}
                                            onChange={(next) => {
                                              const nextMode = String(next || "latest").trim();
                                              updateSelectedAutomation((a) => {
                                                const nodes = a.nodes.map((n) => {
                                                  if (n.id !== selectedNode.id) return n;
                                                  const prev =
                                                    n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                                  const nextCfg: BuilderNodeConfig = {
                                                    ...(prev as any),
                                                    kind: "action",
                                                    tagMode: nextMode,
                                                  };
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

                                        {tagMode === "all" ? (
                                          <div className="mt-3">
                                            <div className="text-xs font-semibold text-zinc-700">Max contacts</div>
                                            <input
                                              inputMode="numeric"
                                              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                              type="number"
                                              min={1}
                                              max={50}
                                              step={1}
                                              value={maxContacts}
                                              onChange={(e) => {
                                                const n = Math.max(1, Math.min(50, Math.floor(Number(e.target.value || 25) || 25)));
                                                updateSelectedAutomation((a) => {
                                                  const nodes = a.nodes.map((n0) => {
                                                    if (n0.id !== selectedNode.id) return n0;
                                                    const prev =
                                                      n0.config?.kind === "action" ? n0.config : (defaultConfigForType("action") as any);
                                                    const nextCfg: BuilderNodeConfig = {
                                                      ...(prev as any),
                                                      kind: "action",
                                                      maxContacts: n,
                                                    };
                                                    const nextLabel =
                                                      autolabelSelectedNode && shouldAutolabel(n0.label)
                                                        ? labelForConfig("action", nextCfg)
                                                        : n0.label;
                                                    return { ...n0, config: nextCfg, label: nextLabel };
                                                  });
                                                  return { ...a, nodes, updatedAtIso: new Date().toISOString() };
                                                });
                                              }}
                                            />
                                            <div className="mt-1 text-[11px] text-zinc-600">
                                              Fan-out runs the downstream steps once per matched contact.
                                            </div>
                                          </div>
                                        ) : null}
                                      </div>
                                    ) : null}

                                    <div className="mt-2">
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="text-xs font-semibold text-zinc-600">Lookup name</div>
                                        <button
                                          type="button"
                                          className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                                          onClick={() => openVariablePicker("find_contact_name")}
                                        >
                                          Add variable
                                        </button>
                                      </div>
                                      <input
                                        ref={findContactNameRef}
                                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                        placeholder="e.g. {contact.name}"
                                        value={contactName}
                                        onChange={(e) => {
                                          const next = e.target.value.slice(0, 200);
                                          updateSelectedAutomation((a) => {
                                            const nodes = a.nodes.map((n) => {
                                              if (n.id !== selectedNode.id) return n;
                                              const prev =
                                                n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                              const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "action", contactName: next };
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
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="text-xs font-semibold text-zinc-600">Lookup email</div>
                                        <button
                                          type="button"
                                          className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                                          onClick={() => openVariablePicker("find_contact_email")}
                                        >
                                          Add variable
                                        </button>
                                      </div>
                                      <input
                                        ref={findContactEmailRef}
                                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                        placeholder="e.g. {contact.email}"
                                        value={contactEmail}
                                        onChange={(e) => {
                                          const next = e.target.value.slice(0, 200);
                                          updateSelectedAutomation((a) => {
                                            const nodes = a.nodes.map((n) => {
                                              if (n.id !== selectedNode.id) return n;
                                              const prev =
                                                n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                              const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "action", contactEmail: next };
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
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="text-xs font-semibold text-zinc-600">Lookup phone</div>
                                        <button
                                          type="button"
                                          className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                                          onClick={() => openVariablePicker("find_contact_phone")}
                                        >
                                          Add variable
                                        </button>
                                      </div>
                                      <input
                                        ref={findContactPhoneRef}
                                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                        placeholder="e.g. {contact.phone}"
                                        value={contactPhone}
                                        onChange={(e) => {
                                          const next = e.target.value.slice(0, 64);
                                          updateSelectedAutomation((a) => {
                                            const nodes = a.nodes.map((n) => {
                                              if (n.id !== selectedNode.id) return n;
                                              const prev =
                                                n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                              const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "action", contactPhone: next };
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

                                    <div className="mt-1 text-[11px] text-zinc-600">
                                      Finds (or creates) a contact and uses it for later steps.
                                    </div>
                                  </>
                                );
                              }

                              if (cfg.actionKind === "update_contact") {
                                const contactName = String((cfg as any).contactName || "").slice(0, 200);
                                const contactEmail = String((cfg as any).contactEmail || "").slice(0, 200);
                                const contactPhone = String((cfg as any).contactPhone || "").slice(0, 64);
                                return (
                                  <>
                                    <div className="mt-2">
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="text-xs font-semibold text-zinc-600">Contact name</div>
                                        <button
                                          type="button"
                                          className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                                          onClick={() => openVariablePicker("update_contact_name")}
                                        >
                                          Add variable
                                        </button>
                                      </div>
                                      <input
                                        ref={updateContactNameRef}
                                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                        placeholder="e.g. {contact.name}"
                                        value={contactName}
                                        onChange={(e) => {
                                          const next = e.target.value.slice(0, 200);
                                          updateSelectedAutomation((a) => {
                                            const nodes = a.nodes.map((n) => {
                                              if (n.id !== selectedNode.id) return n;
                                              const prev =
                                                n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                              const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "action", contactName: next };
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
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="text-xs font-semibold text-zinc-600">Contact email</div>
                                        <button
                                          type="button"
                                          className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                                          onClick={() => openVariablePicker("update_contact_email")}
                                        >
                                          Add variable
                                        </button>
                                      </div>
                                      <input
                                        ref={updateContactEmailRef}
                                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                        placeholder="e.g. {contact.email}"
                                        value={contactEmail}
                                        onChange={(e) => {
                                          const next = e.target.value.slice(0, 200);
                                          updateSelectedAutomation((a) => {
                                            const nodes = a.nodes.map((n) => {
                                              if (n.id !== selectedNode.id) return n;
                                              const prev =
                                                n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                              const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "action", contactEmail: next };
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
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="text-xs font-semibold text-zinc-600">Contact phone</div>
                                        <button
                                          type="button"
                                          className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                                          onClick={() => openVariablePicker("update_contact_phone")}
                                        >
                                          Add variable
                                        </button>
                                      </div>
                                      <input
                                        ref={updateContactPhoneRef}
                                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                        placeholder="e.g. {contact.phone}"
                                        value={contactPhone}
                                        onChange={(e) => {
                                          const next = e.target.value.slice(0, 64);
                                          updateSelectedAutomation((a) => {
                                            const nodes = a.nodes.map((n) => {
                                              if (n.id !== selectedNode.id) return n;
                                              const prev =
                                                n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                              const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "action", contactPhone: next };
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
                                    <div className="mt-1 text-[11px] text-zinc-600">Leave a field blank to skip updating it.</div>
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
                                      <PortalListboxDropdown
                                        className="mt-1"
                                        value={emailTo}
                                        options={[
                                          { value: "internal_notification", label: "Internal notification (my email)" },
                                          { value: "assigned_lead", label: "Assigned lead" },
                                          { value: "event_contact", label: "Step contact" },
                                          { value: "custom", label: "Custom email" },
                                        ]}
                                        onChange={(next) => {
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
                                      />
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

                                    <div className="mt-2 flex items-center justify-between gap-3">
                                      <div className="text-xs font-semibold text-zinc-600">Subject</div>
                                      <button
                                        type="button"
                                        className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                                        onClick={() => openVariablePicker("email_subject")}
                                      >
                                        Add variable
                                      </button>
                                    </div>

                                    <input
                                      ref={emailSubjectRef}
                                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
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

                                    <div className="mt-2 flex items-center justify-between gap-3">
                                      <div className="text-xs font-semibold text-zinc-600">Email body</div>
                                      <button
                                        type="button"
                                        className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                                        onClick={() => openVariablePicker("email_body")}
                                      >
                                        Add variable
                                      </button>
                                    </div>
                                    <textarea
                                      ref={emailBodyRef}
                                      className="mt-1 w-full resize-none rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
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
                                    <PortalListboxDropdown
                                      value={tagId}
                                      options={[
                                        { value: "", label: "Choose a tag…" },
                                        { value: CREATE_TAG_VALUE, label: "+ Create new tag…" },
                                        ...ownerTags.map((t) => ({ value: t.id, label: t.name })),
                                      ]}
                                      onChange={(nextTagId) => {
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
                                            const nextCfg: BuilderNodeConfig = {
                                              ...(prev as any),
                                              kind: "action",
                                              tagId: nextTagId || undefined,
                                            };
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

                              if (cfg.actionKind === "assign_lead") {
                                const assignedToUserId = String((cfg as any).assignedToUserId || "");
                                const memberOptions = accountMembers
                                  .filter((m) => m.user?.active)
                                  .sort((a, b) => (a.user?.email || "").localeCompare(b.user?.email || ""));

                                return (
                                  <>
                                    <div className="mt-2">
                                      <div className="text-xs font-semibold text-zinc-600">Assign to</div>
                                      <PortalListboxDropdown
                                        className="mt-1"
                                        value={assignedToUserId}
                                        options={[
                                          { value: "", label: "Account owner" },
                                          { value: "__assigned_lead__", label: "Auto (booking calendar)" },
                                          ...memberOptions.map((m) => ({
                                            value: m.userId,
                                            label: `${m.user?.email || m.userId}${m.role === "ADMIN" ? " (admin)" : m.role === "OWNER" ? " (owner)" : ""}`,
                                          })),
                                        ]}
                                        onChange={(next) => {
                                          updateSelectedAutomation((a) => {
                                            const nodes = a.nodes.map((n) => {
                                              if (n.id !== selectedNode.id) return n;
                                              const prev =
                                                n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                              const nextCfg: BuilderNodeConfig = {
                                                ...(prev as any),
                                                kind: "action",
                                                assignedToUserId: next || undefined,
                                              };
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
                                      <div className="mt-1 text-[11px] text-zinc-600">
                                        Sets the “assigned lead” for later steps (e.g. Create Task → Assigned lead).
                                      </div>
                                    </div>
                                  </>
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
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="text-xs font-semibold text-zinc-600">Title</div>
                                        <button
                                          type="button"
                                          className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                                          onClick={() => openVariablePicker("task_title")}
                                        >
                                          Add variable
                                        </button>
                                      </div>
                                      <input
                                        ref={taskTitleRef}
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
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="text-xs font-semibold text-zinc-600">Description</div>
                                        <button
                                          type="button"
                                          className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                                          onClick={() => openVariablePicker("task_description")}
                                        >
                                          Add variable
                                        </button>
                                      </div>
                                      <textarea
                                        ref={taskDescriptionRef}
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
                                      <PortalListboxDropdown
                                        className="mt-1"
                                        value={assignedToUserId}
                                        options={[
                                          { value: "__all_users__", label: "All users" },
                                          { value: "__assigned_lead__", label: "Assigned lead" },
                                          { value: "", label: "Account owner" },
                                          ...memberOptions.map((m) => ({
                                            value: m.userId,
                                            label: `${m.user?.email || m.userId}${m.role === "ADMIN" ? " (admin)" : m.role === "OWNER" ? " (owner)" : ""}`,
                                          })),
                                        ]}
                                        onChange={(next) => {
                                          updateSelectedAutomation((a) => {
                                            const nodes = a.nodes.map((n) => {
                                              if (n.id !== selectedNode.id) return n;
                                              const prev =
                                                n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
                                              const nextCfg: BuilderNodeConfig = {
                                                ...(prev as any),
                                                kind: "action",
                                                assignedToUserId: next || undefined,
                                              };
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
                                      {assignedToUserId === "__assigned_lead__" ? (
                                        <div className="mt-1 text-[11px] text-zinc-600">
                                          Uses the booking calendar’s notification email to pick a matching portal user when available; otherwise falls back to the account owner.
                                        </div>
                                      ) : null}
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
                          (() => {
                            const cfg =
                              selectedNode.config?.kind === "delay"
                                ? selectedNode.config
                                : (defaultConfigForType("delay") as any);
                            const minutes = clamp(Math.floor(Number(cfg.minutes || 0)), 0, 43200);
                            const unit: DelayUnit = (cfg.unit as any) ?? inferDelayUnit(minutes);
                            const value = clamp(Math.floor(Number(cfg.value ?? delayValueFromMinutes(minutes, unit))), 0, 43200);

                            return (
                              <div className="mt-1 flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={43200}
                                  className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                  value={value}
                                  onChange={(e) => {
                                    const nextValue = clamp(Math.floor(Number(e.target.value || 0)), 0, 43200);
                                    const nextMinutes = clamp(delayMinutesFromValue(nextValue, unit), 0, 43200);
                                    const normalizedValue = delayValueFromMinutes(nextMinutes, unit);
                                    updateSelectedAutomation((a) => {
                                      const nodes = a.nodes.map((n) => {
                                        if (n.id !== selectedNode.id) return n;
                                        const nextCfg: BuilderNodeConfig = {
                                          kind: "delay",
                                          minutes: nextMinutes,
                                          unit,
                                          value: normalizedValue,
                                        };
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
                                <PortalListboxDropdown
                                  value={unit}
                                  options={[
                                    { value: "minutes", label: "Minutes" },
                                    { value: "hours", label: "Hours" },
                                    { value: "days", label: "Days" },
                                    { value: "weeks", label: "Weeks" },
                                    { value: "months", label: "Months" },
                                  ]}
                                  onChange={(nextUnit) => {
                                    const nextValue = delayValueFromMinutes(minutes, nextUnit);
                                    updateSelectedAutomation((a) => {
                                      const nodes = a.nodes.map((n) => {
                                        if (n.id !== selectedNode.id) return n;
                                        const nextCfg: BuilderNodeConfig = {
                                          kind: "delay",
                                          minutes,
                                          unit: nextUnit,
                                          value: nextValue,
                                        };
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
                              </div>
                            );
                          })()
                        ) : null}

                        {selectedNode.type === "condition" ? (
                          (() => {
                            const cfg =
                              selectedNode.config?.kind === "condition"
                                ? selectedNode.config
                                : (defaultConfigForType("condition") as any);
                            const left = String(cfg.left ?? "").slice(0, 60);
                            const op = (cfg.op as ConditionOp) ?? "equals";
                            const right = String(cfg.right ?? "").slice(0, 120);
                            const hidesRight = op === "is_empty" || op === "is_not_empty";
                            const leftKey = left.trim();

                            const isKnownField = CONDITION_FIELD_KEYS.includes(leftKey);
                            const fieldDropdownValue = isKnownField ? leftKey : "__custom__";
                            const numericOps: ConditionOp[] = ["gt", "gte", "lt", "lte"];
                            const expectsNumber = numericOps.includes(op) || leftKey === "now.hour" || leftKey === "now.weekday";

                            const rightQuickOptions =
                              leftKey === "now.weekday"
                                ? ([
                                    { value: "0", label: "Sunday" },
                                    { value: "1", label: "Monday" },
                                    { value: "2", label: "Tuesday" },
                                    { value: "3", label: "Wednesday" },
                                    { value: "4", label: "Thursday" },
                                    { value: "5", label: "Friday" },
                                    { value: "6", label: "Saturday" },
                                  ] as Array<{ value: string; label: string }>)
                                : leftKey === "now.hour"
                                  ? (Array.from({ length: 24 }).map((_, i) => ({ value: String(i), label: String(i).padStart(2, "0") })) as Array<{ value: string; label: string }>)
                                  : null;

                            return (
                              <div className="mt-1 space-y-2">
                                <div className="text-xs font-semibold text-zinc-600">If</div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="min-w-[240px] flex-1">
                                    <PortalListboxDropdown
                                      value={fieldDropdownValue as any}
                                      options={[
                                        { value: "__custom__", label: "Custom field…", hint: "Type any key" },
                                        ...CONDITION_FIELD_OPTIONS,
                                      ]}
                                      onChange={(next) => {
                                        const v = String(next || "");
                                        if (!v || v === "__custom__") {
                                          requestAnimationFrame(() => conditionLeftRef.current?.focus());
                                          return;
                                        }
                                        const nextLeft = v.slice(0, 60);
                                        updateSelectedAutomation((a) => {
                                          const nodes = a.nodes.map((n) => {
                                            if (n.id !== selectedNode.id) return n;
                                            const prev =
                                              n.config?.kind === "condition" ? n.config : (defaultConfigForType("condition") as any);
                                            const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "condition", left: nextLeft };
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

                                  <input
                                    ref={conditionLeftRef}
                                    list="condition_field_keys"
                                    className="min-w-[240px] flex-1 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                    placeholder="Field key (e.g. contact.email)"
                                    value={left}
                                    onChange={(e) => {
                                      const nextLeft = e.target.value.slice(0, 60);
                                      updateSelectedAutomation((a) => {
                                        const nodes = a.nodes.map((n) => {
                                          if (n.id !== selectedNode.id) return n;
                                          const prev =
                                            n.config?.kind === "condition" ? n.config : (defaultConfigForType("condition") as any);
                                          const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "condition", left: nextLeft };
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
                                  <datalist id="condition_field_keys">
                                    {CONDITION_FIELD_KEYS.map((k) => (
                                      <option key={k} value={k} />
                                    ))}
                                  </datalist>
                                  <button
                                    type="button"
                                    className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
                                    onClick={() => openVariablePicker("condition_left")}
                                  >
                                    Insert
                                  </button>
                                </div>

                                <PortalListboxDropdown
                                  value={op}
                                  options={[
                                    { value: "equals", label: "Equals" },
                                    { value: "contains", label: "Contains" },
                                    { value: "starts_with", label: "Starts with" },
                                    { value: "ends_with", label: "Ends with" },
                                    { value: "gt", label: "Greater than (>)" },
                                    { value: "gte", label: "Greater than or equal (≥)" },
                                    { value: "lt", label: "Less than (<)" },
                                    { value: "lte", label: "Less than or equal (≤)" },
                                    { value: "is_empty", label: "Is empty" },
                                    { value: "is_not_empty", label: "Is not empty" },
                                  ]}
                                  onChange={(nextOp) => {
                                    updateSelectedAutomation((a) => {
                                      const nodes = a.nodes.map((n) => {
                                        if (n.id !== selectedNode.id) return n;
                                        const prev =
                                          n.config?.kind === "condition" ? n.config : (defaultConfigForType("condition") as any);
                                        const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "condition", op: nextOp };
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

                                {!hidesRight ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      ref={conditionRightRef}
                                      className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                                      placeholder={expectsNumber ? "Number" : "Value"}
                                      inputMode={expectsNumber ? "numeric" : undefined}
                                      type={expectsNumber && !rightQuickOptions ? "number" : "text"}
                                      value={right}
                                      onChange={(e) => {
                                        const nextRight = e.target.value.slice(0, 120);
                                        updateSelectedAutomation((a) => {
                                          const nodes = a.nodes.map((n) => {
                                            if (n.id !== selectedNode.id) return n;
                                            const prev =
                                              n.config?.kind === "condition" ? n.config : (defaultConfigForType("condition") as any);
                                            const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "condition", right: nextRight };
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

                                    {rightQuickOptions ? (
                                      <div className="w-[180px]">
                                        <PortalListboxDropdown
                                          value={((rightQuickOptions as any[]).some((o) => o.value === right) ? right : "__none__") as any}
                                          options={[
                                            { value: "__none__", label: "Pick…", disabled: true },
                                            ...(rightQuickOptions as any),
                                          ]}
                                          onChange={(v) => {
                                            if (!v || v === "__none__") return;
                                            const nextRight = String(v).slice(0, 120);
                                            updateSelectedAutomation((a) => {
                                              const nodes = a.nodes.map((n) => {
                                                if (n.id !== selectedNode.id) return n;
                                                const prev =
                                                  n.config?.kind === "condition" ? n.config : (defaultConfigForType("condition") as any);
                                                const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "condition", right: nextRight };
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
                                    <button
                                      type="button"
                                      className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
                                      onClick={() => openVariablePicker("condition_right")}
                                    >
                                      Insert
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })()
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
                ) : null}

                <div className="absolute bottom-3 right-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
                  Tip: double-click a dot to remove a connection.
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
