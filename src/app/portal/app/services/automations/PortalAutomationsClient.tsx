"use client";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CreateContactTagDialog } from "@/components/CreateContactTagDialog";
import { LocalTimePicker } from "@/components/LocalDateTimePicker";
import LiquidGlassPopupSurface from "@/components/LiquidGlassPopupSurface";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { PortalVariablePickerModal } from "@/components/PortalVariablePickerModal";
import { PortalBackToOnboardingLink } from "@/components/PortalBackToOnboardingLink";
import { SuggestedSetupModalLauncher } from "@/components/SuggestedSetupModalLauncher";
import { useToast } from "@/components/ToastProvider";
import { portalGlassButtonClass } from "@/components/portalGlass";
import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { IconEdit, IconFunnel, IconRedo, IconSearch, IconUndo } from "@/app/portal/PortalIcons";
import { PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";
import { PORTAL_LINK_VARIABLES, PORTAL_MESSAGE_VARIABLES, type TemplateVariable } from "@/lib/portalTemplateVars";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function cloneAutomation(automation: Automation): Automation {
  return JSON.parse(JSON.stringify(automation)) as Automation;
}

function automationSignature(automation: Automation | null | undefined) {
  if (!automation) return "";
  try {
    return JSON.stringify(automation);
  } catch {
    return `${automation.id}:${automation.updatedAtIso ?? ""}`;
  }
}

function triggerKindLabel(kind: TriggerKind | null | undefined) {
  if (!kind) return "Manual";
  return labelForConfig("trigger", { kind: "trigger", triggerKind: kind }).replace(/^Trigger:\s*/, "");
}

function demoValueForFormField(field: { key: string; label: string }) {
  const key = String(field.key || "").toLowerCase();
  const label = String(field.label || "").toLowerCase();
  const combined = `${key} ${label}`;
  if (combined.includes("email")) return "customer@example.com";
  if (combined.includes("phone") || combined.includes("mobile")) return "+15555550123";
  if (combined.includes("name") || combined.includes("first") || combined.includes("last")) return "Taylor Demo";
  if (combined.includes("date")) return new Date().toISOString().slice(0, 10);
  if (combined.includes("time")) return "09:00";
  if (combined.includes("website") || combined.includes("url")) return "https://example.com";
  if (combined.includes("company") || combined.includes("business")) return "Demo Company";
  if (combined.includes("message") || combined.includes("notes") || combined.includes("comment")) return "Interested in learning more.";
  return "Demo response";
}

function combineDateAndTime(dateValue: string, timeValue: string) {
  const date = String(dateValue || "").trim();
  const time = String(timeValue || "").trim();
  if (!date || !time) return null;
  const iso = `${date}T${time}:00`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function BackArrowIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const PORTAL_TIME_VARIABLES: TemplateVariable[] = [
  { key: "now.hour", label: "Current hour (0-23)", group: "Custom", appliesTo: "Now" },
  { key: "now.weekday", label: "Current weekday (0=Sun…6=Sat)", group: "Custom", appliesTo: "Now" },
  { key: "now.date", label: "Today (YYYY-MM-DD)", group: "Custom", appliesTo: "Now" },
  { key: "now.iso", label: "Now (ISO timestamp)", group: "Custom", appliesTo: "Now" },
];

const PORTAL_EVENT_VARIABLES: TemplateVariable[] = [
  { key: "event.leadId", label: "Event lead ID", group: "Custom", appliesTo: "Event" },
  { key: "event.calendarId", label: "Event calendar ID", group: "Custom", appliesTo: "Event" },
  { key: "event.bookingId", label: "Event booking ID", group: "Custom", appliesTo: "Event" },
  { key: "event.tagId", label: "Event tag ID", group: "Custom", appliesTo: "Event" },
  { key: "event.webhookKey", label: "Event webhook key", group: "Custom", appliesTo: "Event" },
  { key: "event.triggerNodeId", label: "Event trigger node ID", group: "Custom", appliesTo: "Event" },

  { key: "event.formId", label: "Form ID", group: "Custom", appliesTo: "Event" },
  { key: "event.formSlug", label: "Form slug", group: "Custom", appliesTo: "Event" },
  { key: "event.formName", label: "Form name", group: "Custom", appliesTo: "Event" },
  { key: "event.submissionId", label: "Form submission ID", group: "Custom", appliesTo: "Event" },

  { key: "lead.assigneeUserId", label: "Lead assignee user ID", group: "Custom", appliesTo: "Lead" },
  { key: "lead.contactId", label: "Lead contact ID", group: "Custom", appliesTo: "Lead" },

  { key: "service.triggered.ai-outbound-calls", label: "AI outbound calls triggered", group: "Custom", appliesTo: "Contact" },
  { key: "service.triggered.nurture-campaigns", label: "Nurture campaign triggered", group: "Custom", appliesTo: "Contact" },
];

const PORTAL_BOOKING_VARIABLES: TemplateVariable[] = [
  { key: "booking.id", label: "Booking ID", group: "Custom", appliesTo: "Booking" },
  { key: "booking.status", label: "Booking status", group: "Custom", appliesTo: "Booking" },
  { key: "booking.calendarId", label: "Booking calendar ID", group: "Custom", appliesTo: "Booking" },
  { key: "booking.calendarTitle", label: "Booking calendar title", group: "Custom", appliesTo: "Booking" },
  { key: "booking.meetingLocation", label: "Booking meeting location", group: "Custom", appliesTo: "Booking" },
  { key: "booking.meetingDetails", label: "Booking meeting details", group: "Custom", appliesTo: "Booking" },
  { key: "booking.startAtIso", label: "Booking start time (ISO)", group: "Custom", appliesTo: "Booking" },
  { key: "booking.endAtIso", label: "Booking end time (ISO)", group: "Custom", appliesTo: "Booking" },
  { key: "booking.startDate", label: "Booking start date (YYYY-MM-DD)", group: "Custom", appliesTo: "Booking" },
  { key: "booking.startTime", label: "Booking start time (HH:MM)", group: "Custom", appliesTo: "Booking" },
  { key: "booking.endDate", label: "Booking end date (YYYY-MM-DD)", group: "Custom", appliesTo: "Booking" },
  { key: "booking.endTime", label: "Booking end time (HH:MM)", group: "Custom", appliesTo: "Booking" },
  { key: "booking.canceledAtIso", label: "Booking canceled at (ISO)", group: "Custom", appliesTo: "Booking" },
  { key: "booking.contactName", label: "Booking contact name", group: "Custom", appliesTo: "Booking" },
  { key: "booking.contactEmail", label: "Booking contact email", group: "Custom", appliesTo: "Booking" },
  { key: "booking.contactPhone", label: "Booking contact phone", group: "Custom", appliesTo: "Booking" },
  { key: "booking.notes", label: "Booking notes", group: "Custom", appliesTo: "Booking" },
  { key: "booking.siteSlug", label: "Booking site slug", group: "Custom", appliesTo: "Booking" },
  { key: "booking.siteTitle", label: "Booking site title", group: "Custom", appliesTo: "Booking" },
  { key: "booking.siteTimeZone", label: "Booking site timezone", group: "Custom", appliesTo: "Booking" },
];

const PORTAL_LEAD_VARIABLES: TemplateVariable[] = [
  { key: "lead.businessName", label: "Lead business name", group: "Custom", appliesTo: "Lead" },
  { key: "lead.email", label: "Lead email", group: "Custom", appliesTo: "Lead" },
  { key: "lead.phone", label: "Lead phone", group: "Custom", appliesTo: "Lead" },
  { key: "lead.website", label: "Lead website", group: "Custom", appliesTo: "Lead" },
  { key: "lead.address", label: "Lead address", group: "Custom", appliesTo: "Lead" },
  { key: "lead.niche", label: "Lead niche", group: "Custom", appliesTo: "Lead" },
  { key: "lead.source", label: "Lead source", group: "Custom", appliesTo: "Lead" },
  { key: "lead.kind", label: "Lead kind", group: "Custom", appliesTo: "Lead" },
  { key: "lead.tag", label: "Lead tag", group: "Custom", appliesTo: "Lead" },
  { key: "lead.tagColor", label: "Lead tag color", group: "Custom", appliesTo: "Lead" },
  { key: "lead.createdAtIso", label: "Lead created at (ISO)", group: "Custom", appliesTo: "Lead" },
];

const CONDITION_FIELD_KEYS = Array.from(
  new Set(
    [...PORTAL_TIME_VARIABLES, ...PORTAL_EVENT_VARIABLES, ...PORTAL_BOOKING_VARIABLES, ...PORTAL_LEAD_VARIABLES, ...PORTAL_MESSAGE_VARIABLES, ...PORTAL_LINK_VARIABLES].map(
      (v) => v.key,
    ),
  ),
);

const CONDITION_FIELD_OPTIONS: Array<{ value: string; label: string; hint?: string }> = [
  ...PORTAL_TIME_VARIABLES.map((v) => ({ value: v.key, label: v.label || v.key, hint: v.key })),
  ...PORTAL_EVENT_VARIABLES.map((v) => ({ value: v.key, label: v.label || v.key, hint: v.key })),
  ...PORTAL_BOOKING_VARIABLES.map((v) => ({ value: v.key, label: v.label || v.key, hint: v.key })),
  ...PORTAL_LEAD_VARIABLES.map((v) => ({ value: v.key, label: v.label || v.key, hint: v.key })),
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
  | "form_submitted"
  | "new_lead"
  | "lead_scraped"
  | "tag_added"
  | "contact_created"
  | "task_added"
  | "inbound_webhook"
  | "scheduled_time"
  | "missed_appointment"
  | "appointment_ended"
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
  | "create_contact"
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
  | "lte"
  | "before"
  | "after";

type MessageTarget = "inbound_sender" | "event_contact" | "internal_notification" | "assigned_lead" | "custom";

type DelayUnit = "minutes" | "hours" | "days" | "weeks" | "months";

type BuilderNodeConfig =
  | {
      kind: "trigger";
      triggerKind: TriggerKind;
      tagId?: string;
      webhookKey?: string;
      formId?: string;

      calendarId?: string;

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

type BookingCalendar = { id: string; title: string; enabled?: boolean };

type AccountMember = {
  userId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  user: { id: string; email: string; name: string; role: string; active: boolean };
  implicit?: boolean;
};

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
  paused?: boolean;
  updatedAtIso?: string;
  createdAtIso?: string;
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
      return { label: "Trigger", cls: "bg-sky-50 text-sky-700" };
    case "action":
      return { label: "Action", cls: "bg-emerald-50 text-emerald-700" };
    case "delay":
      return { label: "Delay", cls: "bg-amber-50 text-amber-700" };
    case "condition":
      return { label: "Condition", cls: "bg-violet-50 text-violet-700" };
    default:
      return { label: "Note", cls: "bg-zinc-50 text-zinc-700" };
  }
}

function badgeChipClass(type: BuilderNodeType, extra?: string) {
  const badge = badgeForType(type);
  return classNames(
    "rounded-full px-2 py-0.5 text-xs font-semibold",
    badge.cls,
    type === "note" ? "border border-zinc-200" : "",
    extra,
  );
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
        <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg">
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
                        ? "bg-brand-ink text-white"
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

function buildBlankAutomation(): Automation {
  const triggerId = uid("n");

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
    ],
    edges: [],
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
      form_submitted: "Form submitted",
      new_lead: "New Lead",
      lead_scraped: "Lead scraped",
      tag_added: "Tag added",
      contact_created: "Contact created",
      task_added: "Task added",
      inbound_webhook: "Inbound webhook",
      scheduled_time: "Scheduled time",
      missed_appointment: "Missed appointment",
      appointment_ended: "Appointment ended",
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
      create_contact: "Create Contact",
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
      before: "before",
      after: "after",
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

function serializeAutomations(list: Automation[]) {
  try {
    return JSON.stringify(list);
  } catch {
    return "";
  }
}

type TriggerNodeConfig = Extract<BuilderNodeConfig, { kind: "trigger" }>;
type ActionNodeConfig = Extract<BuilderNodeConfig, { kind: "action" }>;
type DelayNodeConfig = Extract<BuilderNodeConfig, { kind: "delay" }>;
type ConditionNodeConfig = Extract<BuilderNodeConfig, { kind: "condition" }>;
type NoteNodeConfig = Extract<BuilderNodeConfig, { kind: "note" }>;

type AutomationTemplateBlueprintNode = {
  key: string;
  type: BuilderNodeType;
  x: number;
  y: number;
  config?: BuilderNodeConfig;
  label?: string;
};

type AutomationTemplateBlueprintEdge = {
  from: string;
  to: string;
  fromPort?: EdgePort;
};

type AutomationTemplateDefinition = {
  id: string;
  name: string;
  description: string;
  nodes: AutomationTemplateBlueprintNode[];
  edges: AutomationTemplateBlueprintEdge[];
};

const BLANK_AUTOMATION_TEMPLATE_ID = "__blank__";

const triggerCfg = (triggerKind: TriggerKind, extra: Partial<Omit<TriggerNodeConfig, "kind" | "triggerKind">> = {}): TriggerNodeConfig => ({
  kind: "trigger",
  triggerKind,
  ...extra,
});

const actionCfg = (actionKind: ActionKind, extra: Partial<Omit<ActionNodeConfig, "kind" | "actionKind">> = {}): ActionNodeConfig => ({
  kind: "action",
  actionKind,
  ...extra,
});

const delayCfg = (value: number, unit: DelayUnit): DelayNodeConfig => ({
  kind: "delay",
  unit,
  value,
  minutes: delayMinutesFromValue(value, unit),
});

const conditionCfg = (left: string, op: ConditionOp, right = ""): ConditionNodeConfig => ({
  kind: "condition",
  left,
  op,
  right,
});

const noteCfg = (text: string): NoteNodeConfig => ({ kind: "note", text });

const AUTOMATION_TEMPLATE_DEFINITIONS: AutomationTemplateDefinition[] = [
  {
    id: "inbound-sms-instant-reply",
    name: "Inbound SMS instant reply",
    description: "Reply to new texts fast, then look up the contact before a team handoff.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("inbound_sms") },
      { key: "find", type: "action", x: 420, y: 120, config: actionCfg("find_contact", { contactPhone: "{{lead.phone}}" }) },
      { key: "reply", type: "action", x: 760, y: 120, config: actionCfg("send_sms", { smsTo: "inbound_sender", body: "Thanks for texting us. A team member will jump in shortly." }) },
    ],
    edges: [{ from: "trigger", to: "find" }, { from: "find", to: "reply" }],
  },
  {
    id: "inbound-mms-review-and-reply",
    name: "Inbound MMS review and reply",
    description: "Create a task to review media messages and send a quick acknowledgment.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("inbound_mms") },
      { key: "task", type: "action", x: 420, y: 120, config: actionCfg("create_task", { subject: "Review incoming MMS request", body: "Check the new media message and respond if needed." }) },
      { key: "reply", type: "action", x: 760, y: 120, config: actionCfg("send_sms", { smsTo: "inbound_sender", body: "We got your message and attachments. We will review them now." }) },
    ],
    edges: [{ from: "trigger", to: "task" }, { from: "task", to: "reply" }],
  },
  {
    id: "inbound-call-callback-queue",
    name: "Inbound call callback queue",
    description: "Queue return-call work after an inbound call and send a text follow-up.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("inbound_call") },
      { key: "task", type: "action", x: 420, y: 120, config: actionCfg("create_task", { subject: "Return inbound call", body: "Call the lead back and log the result." }) },
      { key: "sms", type: "action", x: 760, y: 120, config: actionCfg("send_sms", { smsTo: "inbound_sender", body: "Thanks for calling. If we missed you, reply here and we will call you back." }) },
    ],
    edges: [{ from: "trigger", to: "task" }, { from: "task", to: "sms" }],
  },
  {
    id: "missed-call-booking-link",
    name: "Missed call booking link",
    description: "Recover missed calls with a text response and a booking prompt.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("missed_call") },
      { key: "sms", type: "action", x: 420, y: 120, config: actionCfg("send_sms", { smsTo: "inbound_sender", body: "Sorry we missed your call. Here is the fastest way to book time with us." }) },
      { key: "booking", type: "action", x: 760, y: 120, config: actionCfg("send_booking_link", { smsTo: "inbound_sender" }) },
    ],
    edges: [{ from: "trigger", to: "sms" }, { from: "sms", to: "booking" }],
  },
  {
    id: "inbound-email-acknowledgement",
    name: "Inbound email acknowledgement",
    description: "Log a task for the inbox team and send an email confirmation back.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("inbound_email") },
      { key: "task", type: "action", x: 420, y: 120, config: actionCfg("create_task", { subject: "Review inbound email", body: "Check the new email thread and respond from the shared inbox." }) },
      { key: "email", type: "action", x: 760, y: 120, config: actionCfg("send_email", { emailTo: "event_contact", subject: "We received your email", body: "Thanks for reaching out. Our team is reviewing your message now." }) },
    ],
    edges: [{ from: "trigger", to: "task" }, { from: "task", to: "email" }],
  },
  {
    id: "form-submit-welcome-text",
    name: "Form submit welcome text",
    description: "Send a simple SMS confirmation whenever a form is submitted.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("form_submitted") },
      { key: "sms", type: "action", x: 420, y: 120, config: actionCfg("send_sms", { smsTo: "event_contact", body: "Thanks for filling out our form. We will follow up soon." }) },
    ],
    edges: [{ from: "trigger", to: "sms" }],
  },
  {
    id: "form-submit-nurture-handoff",
    name: "Form submit nurture handoff",
    description: "Tag form leads and hand them to a nurture service flow.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("form_submitted") },
      { key: "tag", type: "action", x: 420, y: 120, config: actionCfg("add_tag") },
      { key: "service", type: "action", x: 760, y: 120, config: actionCfg("trigger_service", { serviceSlug: "nurture-campaigns" }) },
    ],
    edges: [{ from: "trigger", to: "tag" }, { from: "tag", to: "service" }],
  },
  {
    id: "new-lead-assignment",
    name: "New lead assignment",
    description: "Assign a new lead and create a follow-up task for the team.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("new_lead") },
      { key: "assign", type: "action", x: 420, y: 120, config: actionCfg("assign_lead") },
      { key: "task", type: "action", x: 760, y: 120, config: actionCfg("create_task", { subject: "Review new lead", body: "Check the lead details, verify source quality, and make first contact." }) },
    ],
    edges: [{ from: "trigger", to: "assign" }, { from: "assign", to: "task" }],
  },
  {
    id: "lead-scraped-enrich-and-tag",
    name: "Lead scraped enrich and tag",
    description: "Run contact lookup on scraped leads and tag them for review.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("lead_scraped") },
      { key: "find", type: "action", x: 420, y: 120, config: actionCfg("find_contact", { contactName: "{{lead.businessName}}", contactPhone: "{{lead.phone}}", contactEmail: "{{lead.email}}" }) },
      { key: "tag", type: "action", x: 760, y: 120, config: actionCfg("add_tag") },
    ],
    edges: [{ from: "trigger", to: "find" }, { from: "find", to: "tag" }],
  },
  {
    id: "tag-added-reengagement",
    name: "Tag added re-engagement",
    description: "Wait briefly after a tag is added, then send a re-engagement text.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("tag_added") },
      { key: "delay", type: "delay", x: 420, y: 120, config: delayCfg(15, "minutes") },
      { key: "sms", type: "action", x: 760, y: 120, config: actionCfg("send_sms", { smsTo: "event_contact", body: "We noticed your status changed. Want help with the next step?" }) },
    ],
    edges: [{ from: "trigger", to: "delay" }, { from: "delay", to: "sms" }],
  },
  {
    id: "contact-created-welcome-email",
    name: "Contact created welcome email",
    description: "Delay a welcome email after a new contact record is created.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("contact_created") },
      { key: "delay", type: "delay", x: 420, y: 120, config: delayCfg(30, "minutes") },
      { key: "email", type: "action", x: 760, y: 120, config: actionCfg("send_email", { emailTo: "event_contact", subject: "Welcome to our workflow", body: "We are glad you are here. A specialist will be in touch soon." }) },
    ],
    edges: [{ from: "trigger", to: "delay" }, { from: "delay", to: "email" }],
  },
  {
    id: "task-added-client-notification",
    name: "Task added client notification",
    description: "Text the contact after a new task gets added for them.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("task_added") },
      { key: "sms", type: "action", x: 420, y: 120, config: actionCfg("send_sms", { smsTo: "event_contact", body: "Your request is in progress. We just created the next action item for our team." }) },
    ],
    edges: [{ from: "trigger", to: "sms" }],
  },
  {
    id: "inbound-webhook-intake-sync",
    name: "Inbound webhook intake sync",
    description: "Create a contact from an inbound webhook and forward the payload onward.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("inbound_webhook", { webhookKey: "lead-intake" }) },
      { key: "contact", type: "action", x: 420, y: 120, config: actionCfg("create_contact", { contactName: "Webhook lead", contactEmail: "lead@example.com", contactPhone: "+15555550123" }) },
      { key: "hook", type: "action", x: 760, y: 120, config: actionCfg("send_webhook", { webhookUrl: "https://example.com/hooks/automation", webhookBodyJson: '{"source":"portal-automation","type":"lead-intake"}' }) },
    ],
    edges: [{ from: "trigger", to: "contact" }, { from: "contact", to: "hook" }],
  },
  {
    id: "scheduled-daily-check-in",
    name: "Scheduled daily check-in",
    description: "Fire a daily outreach message from a scheduled-time trigger.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("scheduled_time", { scheduleMode: "specific", specificKind: "daily", specificTime: "09:00" }) },
      { key: "sms", type: "action", x: 420, y: 120, config: actionCfg("send_sms", { smsTo: "custom", smsToNumber: "+15555550123", body: "Daily check-in: review priority conversations and reply to anything urgent." }) },
    ],
    edges: [{ from: "trigger", to: "sms" }],
  },
  {
    id: "scheduled-weekly-recap",
    name: "Scheduled weekly recap",
    description: "Run a weekly email recap on a fixed weekday schedule.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("scheduled_time", { scheduleMode: "specific", specificKind: "weekly", specificWeekday: 1, specificTime: "10:00" }) },
      { key: "email", type: "action", x: 420, y: 120, config: actionCfg("send_email", { emailTo: "internal_notification", subject: "Weekly automation recap", body: "Review the weekly pipeline, note blockers, and route work to the right owner." }) },
    ],
    edges: [{ from: "trigger", to: "email" }],
  },
  {
    id: "appointment-booked-confirmation",
    name: "Appointment booked confirmation",
    description: "Send both SMS and email confirmations after a booking lands.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("appointment_booked") },
      { key: "sms", type: "action", x: 420, y: 120, config: actionCfg("send_sms", { smsTo: "event_contact", body: "Your appointment is booked. We will send reminders before it starts." }) },
      { key: "email", type: "action", x: 760, y: 120, config: actionCfg("send_email", { emailTo: "event_contact", subject: "Appointment confirmed", body: "Your booking is locked in. Reply if you need to reschedule." }) },
    ],
    edges: [{ from: "trigger", to: "sms" }, { from: "sms", to: "email" }],
  },
  {
    id: "appointment-ended-review-request",
    name: "Appointment ended review request",
    description: "Wait a bit after the meeting ends, then ask for a review.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("appointment_ended") },
      { key: "delay", type: "delay", x: 420, y: 120, config: delayCfg(2, "hours") },
      { key: "review", type: "action", x: 760, y: 120, config: actionCfg("send_review_request") },
    ],
    edges: [{ from: "trigger", to: "delay" }, { from: "delay", to: "review" }],
  },
  {
    id: "missed-appointment-recovery",
    name: "Missed appointment recovery",
    description: "Recover missed appointments with a text and a task for manual follow-up.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("missed_appointment") },
      { key: "sms", type: "action", x: 420, y: 120, config: actionCfg("send_sms", { smsTo: "event_contact", body: "We missed you at your appointment. Reply here and we can help you rebook." }) },
      { key: "task", type: "action", x: 760, y: 120, config: actionCfg("create_task", { subject: "Rescue missed appointment", body: "Reach out personally if there is no reply after the automated text." }) },
    ],
    edges: [{ from: "trigger", to: "sms" }, { from: "sms", to: "task" }],
  },
  {
    id: "review-received-internal-alert",
    name: "Review received internal alert",
    description: "Forward review events and create a task for response management.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("review_received") },
      { key: "hook", type: "action", x: 420, y: 120, config: actionCfg("send_webhook", { webhookUrl: "https://example.com/hooks/reviews", webhookBodyJson: '{"type":"review-received"}' }) },
      { key: "task", type: "action", x: 760, y: 120, config: actionCfg("create_task", { subject: "Review new feedback", body: "Check whether the review needs a public response or an internal escalation." }) },
    ],
    edges: [{ from: "trigger", to: "hook" }, { from: "hook", to: "task" }],
  },
  {
    id: "follow-up-sent-delayed-reminder",
    name: "Follow-up sent delayed reminder",
    description: "Wait after a follow-up and create a reminder if there is still no progress.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("follow_up_sent") },
      { key: "delay", type: "delay", x: 420, y: 120, config: delayCfg(2, "days") },
      { key: "task", type: "action", x: 760, y: 120, config: actionCfg("create_task", { subject: "Check unanswered follow-up", body: "Review the thread and decide whether to retry, call, or close the loop." }) },
    ],
    edges: [{ from: "trigger", to: "delay" }, { from: "delay", to: "task" }],
  },
  {
    id: "outbound-sent-update-contact",
    name: "Outbound sent update contact",
    description: "Update a contact record after an outbound message has had time to settle.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("outbound_sent") },
      { key: "delay", type: "delay", x: 420, y: 120, config: delayCfg(3, "days") },
      { key: "update", type: "action", x: 760, y: 120, config: actionCfg("update_contact", { contactName: "Warm follow-up", contactEmail: "lead@example.com", contactPhone: "+15555550123" }) },
    ],
    edges: [{ from: "trigger", to: "delay" }, { from: "delay", to: "update" }],
  },
  {
    id: "appointment-booked-channel-branch",
    name: "Appointment booked channel branch",
    description: "Choose SMS or email confirmation based on whether the booking includes a phone number.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("appointment_booked") },
      { key: "condition", type: "condition", x: 420, y: 120, config: conditionCfg("booking.contactPhone", "is_not_empty") },
      { key: "sms", type: "action", x: 760, y: 40, config: actionCfg("send_sms", { smsTo: "event_contact", body: "Your appointment is booked. Reply here if you need help before then." }) },
      { key: "email", type: "action", x: 760, y: 200, config: actionCfg("send_email", { emailTo: "event_contact", subject: "Your appointment is confirmed", body: "We have your booking. Email us back any time with questions." }) },
    ],
    edges: [{ from: "trigger", to: "condition" }, { from: "condition", to: "sms", fromPort: "true" }, { from: "condition", to: "email", fromPort: "false" }],
  },
  {
    id: "webhook-vip-branch",
    name: "Inbound webhook VIP branch",
    description: "Branch webhook traffic based on the webhook key to route VIP intake differently.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("inbound_webhook", { webhookKey: "customer-intake" }) },
      { key: "condition", type: "condition", x: 420, y: 120, config: conditionCfg("event.webhookKey", "contains", "vip") },
      { key: "tag", type: "action", x: 760, y: 40, config: actionCfg("add_tag") },
      { key: "assign", type: "action", x: 760, y: 200, config: actionCfg("assign_lead") },
    ],
    edges: [{ from: "trigger", to: "condition" }, { from: "condition", to: "tag", fromPort: "true" }, { from: "condition", to: "assign", fromPort: "false" }],
  },
  {
    id: "manual-ops-handoff",
    name: "Manual ops handoff",
    description: "A manual-start template for internal handoff flows and queued work.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("manual") },
      { key: "note", type: "note", x: 420, y: 120, config: noteCfg("Use this when a teammate wants to kick off the workflow manually.") },
      { key: "task", type: "action", x: 760, y: 120, config: actionCfg("create_task", { subject: "Manual handoff", body: "Review context from the handoff note and start the next action." }) },
      { key: "assign", type: "action", x: 1100, y: 120, config: actionCfg("assign_lead") },
    ],
    edges: [{ from: "trigger", to: "note" }, { from: "note", to: "task" }, { from: "task", to: "assign" }],
  },
  {
    id: "outbound-no-reply-booking-prompt",
    name: "Outbound no-reply booking prompt",
    description: "Send a booking link if an outbound message does not convert after a few days.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("outbound_sent") },
      { key: "delay", type: "delay", x: 420, y: 120, config: delayCfg(4, "days") },
      { key: "booking", type: "action", x: 760, y: 120, config: actionCfg("send_booking_link", { smsTo: "event_contact" }) },
    ],
    edges: [{ from: "trigger", to: "delay" }, { from: "delay", to: "booking" }],
  },
  {
    id: "appointment-booked-tag-and-task",
    name: "Appointment booked tag and task",
    description: "Tag new appointments, then create a prep task for the team.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("appointment_booked") },
      { key: "tag", type: "action", x: 420, y: 120, config: actionCfg("add_tag") },
      { key: "task", type: "action", x: 760, y: 120, config: actionCfg("create_task", { subject: "Prepare for upcoming appointment", body: "Review notes, confirm assigned owner, and make sure prep materials are ready." }) },
    ],
    edges: [{ from: "trigger", to: "tag" }, { from: "tag", to: "task" }],
  },
  {
    id: "follow-up-sent-review-branch",
    name: "Follow-up sent review branch",
    description: "Route long-running follow-ups based on whether a phone number is available.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("follow_up_sent") },
      { key: "condition", type: "condition", x: 420, y: 120, config: conditionCfg("lead.phone", "is_not_empty") },
      { key: "sms", type: "action", x: 760, y: 40, config: actionCfg("send_sms", { smsTo: "event_contact", body: "Still interested? Reply here and we will pick this back up with you." }) },
      { key: "email", type: "action", x: 760, y: 200, config: actionCfg("send_email", { emailTo: "event_contact", subject: "Still need anything?", body: "We wanted to check back in and see if you still need help." }) },
    ],
    edges: [{ from: "trigger", to: "condition" }, { from: "condition", to: "sms", fromPort: "true" }, { from: "condition", to: "email", fromPort: "false" }],
  },
  {
    id: "review-received-thank-you-email",
    name: "Review received thank-you email",
    description: "Thank a contact by email when positive feedback comes in.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("review_received") },
      { key: "email", type: "action", x: 420, y: 120, config: actionCfg("send_email", { emailTo: "event_contact", subject: "Thanks for the review", body: "We appreciate the feedback and are grateful you took the time to share it." }) },
    ],
    edges: [{ from: "trigger", to: "email" }],
  },
  {
    id: "contact-created-webhook-sync",
    name: "Contact created webhook sync",
    description: "Forward new contact events out to an external system right away.",
    nodes: [
      { key: "trigger", type: "trigger", x: 80, y: 120, config: triggerCfg("contact_created") },
      { key: "hook", type: "action", x: 420, y: 120, config: actionCfg("send_webhook", { webhookUrl: "https://example.com/hooks/contact-created", webhookBodyJson: '{"type":"contact-created"}' }) },
    ],
    edges: [{ from: "trigger", to: "hook" }],
  },
];

const AUTOMATION_TEMPLATE_OPTIONS = [
  { value: BLANK_AUTOMATION_TEMPLATE_ID, label: "Start blank", hint: "Begin with a single trigger node and build the workflow yourself." },
  ...AUTOMATION_TEMPLATE_DEFINITIONS.map((template) => ({ value: template.id, label: template.name, hint: template.description })),
];

function instantiateAutomationTemplate(
  template: AutomationTemplateDefinition,
  options: { name: string; viewer: { userId: string; email?: string; name?: string } | null | undefined },
): Automation {
  const nodeIds = new Map<string, string>();
  const nodes: BuilderNode[] = template.nodes.map((node) => {
    const nextId = uid("n");
    nodeIds.set(node.key, nextId);
    const config = node.config ? (JSON.parse(JSON.stringify(node.config)) as BuilderNodeConfig) : defaultConfigForType(node.type);
    const label = node.label ?? (node.type === "note" ? safeString((config as NoteNodeConfig | undefined)?.text, "Note") : labelForConfig(node.type, config));
    return { id: nextId, type: node.type, label, x: node.x, y: node.y, config };
  });

  const edges: BuilderEdge[] = template.edges
    .map((edge) => {
      const from = nodeIds.get(edge.from);
      const to = nodeIds.get(edge.to);
      if (!from || !to) return null;
      return { id: uid("e"), from, to, fromPort: edge.fromPort };
    })
    .filter(Boolean) as BuilderEdge[];

  const nowIso = new Date().toISOString();
  return {
    id: uid("auto"),
    name: options.name,
    updatedAtIso: nowIso,
    createdAtIso: nowIso,
    createdBy: options.viewer?.userId ? { userId: options.viewer.userId, email: options.viewer.email, name: options.viewer.name } : undefined,
    nodes,
    edges,
  };
}

export function PortalAutomationsClient(props: { mode?: "list" | "editor" }) {
  const mode = props.mode ?? "editor";
  const pathname = usePathname();
  const toast = useToast();
  const portalVariant = String(pathname || "").startsWith("/credit") ? "credit" : "portal";
  const variantHeaders = useMemo(() => ({ [PORTAL_VARIANT_HEADER]: portalVariant }), [portalVariant]);
  const isMobileApp = useMemo(() => {
    if (typeof window === "undefined") return false;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("pa_mobileapp") === "1") return true;
    return (window.location.host || "").includes("purely-mobile");
  }, []);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const [, setRefreshing] = useState(false);
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
  const automationsRef = useRef<Automation[]>([]);
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);

  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryMenuFor, setLibraryMenuFor] = useState<null | { automationId: string; left: number; top: number; maxHeight: number }>(null);
  const [manualRunBusyFor, setManualRunBusyFor] = useState<string | null>(null);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [testOpen, setTestOpen] = useState(false);
  const [testFrom, setTestFrom] = useState("+15555550123");
  const [testBody, setTestBody] = useState("Hello");
  const [testing, setTesting] = useState(false);
  const [testTagId, setTestTagId] = useState("");
  const [testFormId, setTestFormId] = useState("");
  const [testFormResponses, setTestFormResponses] = useState<Record<string, string>>({});
  const [testWebhookKey, setTestWebhookKey] = useState("test-webhook");
  const [testCalendarId, setTestCalendarId] = useState("");
  const [testScheduleMode, setTestScheduleMode] = useState<"trigger" | "custom">("trigger");
  const [testScheduleDate, setTestScheduleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [testScheduleTime, setTestScheduleTime] = useState("09:00");

  const [listQuery, setListQuery] = useState("");
  const [listStatus, setListStatus] = useState<"all" | "active" | "paused">("all");
  const [listTrigger, setListTrigger] = useState<"all" | TriggerKind>("all");
  const [listDateRange, setListDateRange] = useState<"all" | "7d" | "30d" | "90d" | "365d">("all");
  const [listPage, setListPage] = useState(1);
  const [openListFilters, setOpenListFilters] = useState<null | { left: number; top: number; maxHeight: number }>(null);

  const [openListMenu, setOpenListMenu] = useState<null | { automationId: string; left: number; top: number; maxHeight: number }>(null);

  useEffect(() => {
    if (!openListMenu) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenListMenu(null);
    };

    const onScrollOrResize = () => setOpenListMenu(null);

    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [openListMenu]);

  useEffect(() => {
    if (mode !== "editor" || typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("pa.portal.topbar.intent", { detail: { hidden: true } }));
    return () => {
      window.dispatchEvent(new CustomEvent("pa.portal.topbar.intent", { detail: { hidden: false } }));
    };
  }, [mode]);

  useEffect(() => {
    setListPage(1);
  }, [listQuery, listStatus, listTrigger, listDateRange]);

  useEffect(() => {
    if (!libraryMenuFor) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLibraryMenuFor(null);
    };

    const onScrollOrResize = () => setLibraryMenuFor(null);

    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [libraryMenuFor]);

  function toggleListMenu(automationId: string, el: HTMLElement) {
    setOpenListMenu((prev) => {
      if (prev?.automationId === automationId) return null;
      const rect = el.getBoundingClientRect();
      const menuWidth = 220;
      const VIEWPORT_PAD = 12;
      const GAP = 8;
      const EST_HEIGHT = 280;

      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;

      const left = Math.max(VIEWPORT_PAD, Math.min(viewportW - menuWidth - VIEWPORT_PAD, rect.right - menuWidth));

      const spaceBelow = viewportH - rect.bottom - GAP - VIEWPORT_PAD;
      const spaceAbove = rect.top - GAP - VIEWPORT_PAD;
      const placeDown = spaceBelow >= Math.min(EST_HEIGHT, 240) || spaceBelow >= spaceAbove;

      const available = placeDown ? spaceBelow : spaceAbove;
      const maxHeight = Math.max(120, Math.min(EST_HEIGHT, available));
      const usedHeight = Math.min(EST_HEIGHT, maxHeight);

      const rawTop = placeDown ? rect.bottom + GAP : rect.top - GAP - usedHeight;
      const top = Math.max(VIEWPORT_PAD, Math.min(viewportH - VIEWPORT_PAD - usedHeight, rawTop));

      return { automationId, left, top, maxHeight };
    });
  }

  function toggleLibraryMenu(automationId: string, el: HTMLElement) {
    setLibraryMenuFor((prev) => {
      if (prev?.automationId === automationId) return null;
      const rect = el.getBoundingClientRect();
      const menuWidth = 160; // w-40
      const VIEWPORT_PAD = 12;
      const GAP = 8;
      const EST_HEIGHT = 220;

      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;

      const left = Math.max(VIEWPORT_PAD, Math.min(viewportW - menuWidth - VIEWPORT_PAD, rect.right - menuWidth));

      const spaceBelow = viewportH - rect.bottom - GAP - VIEWPORT_PAD;
      const spaceAbove = rect.top - GAP - VIEWPORT_PAD;
      const placeDown = spaceBelow >= Math.min(EST_HEIGHT, 200) || spaceBelow >= spaceAbove;

      const available = placeDown ? spaceBelow : spaceAbove;
      const maxHeight = Math.max(120, Math.min(EST_HEIGHT, available));
      const usedHeight = Math.min(EST_HEIGHT, maxHeight);

      const rawTop = placeDown ? rect.bottom + GAP : rect.top - GAP - usedHeight;
      const top = Math.max(VIEWPORT_PAD, Math.min(viewportH - VIEWPORT_PAD - usedHeight, rawTop));

      return { automationId, left, top, maxHeight };
    });
  }

  function toggleListFilters(el: HTMLElement) {
    setOpenListFilters((prev) => {
      if (prev) return null;
      const rect = el.getBoundingClientRect();
      const menuWidth = 320;
      const VIEWPORT_PAD = 12;
      const GAP = 8;
      const EST_HEIGHT = 360;

      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;

      const left = Math.max(VIEWPORT_PAD, Math.min(viewportW - menuWidth - VIEWPORT_PAD, rect.right - menuWidth));
      const spaceBelow = viewportH - rect.bottom - GAP - VIEWPORT_PAD;
      const spaceAbove = rect.top - GAP - VIEWPORT_PAD;
      const placeDown = spaceBelow >= Math.min(EST_HEIGHT, 240) || spaceBelow >= spaceAbove;
      const available = placeDown ? spaceBelow : spaceAbove;
      const maxHeight = Math.max(160, Math.min(EST_HEIGHT, available));
      const usedHeight = Math.min(EST_HEIGHT, maxHeight);
      const rawTop = placeDown ? rect.bottom + GAP : rect.top - GAP - usedHeight;
      const top = Math.max(VIEWPORT_PAD, Math.min(viewportH - VIEWPORT_PAD - usedHeight, rawTop));

      return { left, top, maxHeight };
    });
  }

  function DotsIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
        <circle cx="12" cy="5" r="1.8" />
        <circle cx="12" cy="12" r="1.8" />
        <circle cx="12" cy="19" r="1.8" />
      </svg>
    );
  }

  const [inlineRenameId, setInlineRenameId] = useState<string | null>(null);
  const [inlineRenameValue, setInlineRenameValue] = useState("");
  const inlineRenameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!inlineRenameId) return;
    window.setTimeout(() => inlineRenameInputRef.current?.focus(), 0);
  }, [inlineRenameId]);

  const [viewer, setViewer] = useState<null | { userId: string; email?: string; name?: string }>(null);

  const [ownerTags, setOwnerTags] = useState<ContactTag[]>([]);
  const [accountMembers, setAccountMembers] = useState<AccountMember[]>([]);
  const [aiOutboundCallCampaigns, setAiOutboundCallCampaigns] = useState<AiOutboundCallCampaign[]>([]);
  const [nurtureCampaigns, setNurtureCampaigns] = useState<NurtureCampaign[]>([]);
  const [bookingCalendars, setBookingCalendars] = useState<BookingCalendar[]>([]);

  const [createTagOpen, setCreateTagOpen] = useState(false);
  const [createTagApplyTo, setCreateTagApplyTo] = useState<null | { nodeId: string; kind: "action" | "trigger" }>(null);
  const [createAutomationOpen, setCreateAutomationOpen] = useState(false);
  const [createAutomationName, setCreateAutomationName] = useState("");
  const [createAutomationTemplateId, setCreateAutomationTemplateId] = useState<string>(BLANK_AUTOMATION_TEMPLATE_ID);

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

  const [knownContactCustomVarKeys, setKnownContactCustomVarKeys] = useState<string[]>([]);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const res = await fetch("/api/portal/people/contacts/custom-variable-keys", {
          cache: "no-store",
          headers: variantHeaders,
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json?.ok || !Array.isArray(json.keys)) return;
        const keys = json.keys.map((k: any) => String(k || "").trim()).filter(Boolean).slice(0, 50);
        if (!canceled) setKnownContactCustomVarKeys(keys);
      } catch {
        // ignore
      }
    })();

    return () => {
      canceled = true;
    };
  }, [variantHeaders]);

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
  const TEST_ANY_TAG_VALUE = "__any_tag__";

  const [automations, setAutomations] = useState<Automation[]>([]);
  const [selectedAutomationId, setSelectedAutomationId] = useState<string | null>(null);

  useEffect(() => {
    automationsRef.current = automations;
  }, [automations]);

  const [ownerFormFields, setOwnerFormFields] = useState<
    Array<{ key: string; label: string; formId: string; formSlug: string; formName: string }>
  >([]);

  const [ownerForms, setOwnerForms] = useState<Array<{ id: string; slug: string; name: string; status: string }>>([]);

  const formTemplateVariables = useMemo((): TemplateVariable[] => {
    return ownerFormFields
      .map((f) => {
        const key = String(f.key || "").trim();
        if (!key) return null;
        const label = String(f.label || f.key).trim() || key;
        const formName = String(f.formName || f.formSlug || "").trim();
        return {
          key: `form.${key}`,
          label: formName ? `${label} (${formName})` : label,
          group: "Custom",
          appliesTo: "Event",
        } as TemplateVariable;
      })
      .filter(Boolean) as TemplateVariable[];
  }, [ownerFormFields]);

  const automationVariablePickerVariables = useMemo((): TemplateVariable[] => {
    const base: TemplateVariable[] = [
      ...PORTAL_TIME_VARIABLES,
      ...PORTAL_EVENT_VARIABLES,
      ...PORTAL_BOOKING_VARIABLES,
      ...PORTAL_LEAD_VARIABLES,
      ...PORTAL_MESSAGE_VARIABLES,
      ...PORTAL_LINK_VARIABLES,
      ...formTemplateVariables,
    ];

    const keys = Array.isArray(knownContactCustomVarKeys) ? knownContactCustomVarKeys : [];
    for (const k of keys) {
      base.push({
        key: `contact.custom.${k}`,
        label: `Contact custom: ${k}`,
        group: "Custom",
        appliesTo: "Lead/contact",
      });
    }

    const seen = new Set<string>();
    return base.filter((v) => {
      const key = `${v.group}:${v.key}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [formTemplateVariables, knownContactCustomVarKeys]);

  const formConditionFieldOptions = useMemo((): Array<{ value: string; label: string; hint?: string }> => {
    return formTemplateVariables.map((v) => ({
      value: v.key,
      label: v.label || v.key,
      hint: v.key,
    }));
  }, [formTemplateVariables]);

  const allConditionFieldKeys = useMemo(() => {
    return Array.from(new Set([...CONDITION_FIELD_KEYS, ...formTemplateVariables.map((v) => v.key)]));
  }, [formTemplateVariables]);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const activePointersRef = useRef(new Map<number, { clientX: number; clientY: number }>());
  const pinchRef = useRef<
    | null
    | {
        startDist: number;
        startZoom: number;
        startPanX: number;
        startPanY: number;
        startMidClientX: number;
        startMidClientY: number;
      }
  >(null);

  const gestureRef = useRef<
    | null
    | {
        startZoom: number;
        worldX: number;
        worldY: number;
      }
  >(null);

  const [view, setView] = useState<{ panX: number; panY: number; zoom: number }>({
    panX: mode === "editor" ? 420 : 80,
    panY: 80,
    zoom: 1,
  });

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
  const automationHistoryRef = useRef<Record<string, { past: Automation[]; future: Automation[] }>>({});
  const [, setHistoryVersion] = useState(0);
  const dragHistoryBaselineRef = useRef<Automation | null>(null);

  // Default to palette-first UX; open inspector only when a node is selected.
  const [inspectorOpen, setInspectorOpen] = useState(false);

  useEffect(() => {
    if (mode !== "editor") return;
    if (!inspectorOpen) return;
    if (selectedNodeId) return;
    setInspectorOpen(false);
  }, [inspectorOpen, mode, selectedNodeId]);

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

  function ensureAutomationHistory(automationId: string) {
    const existing = automationHistoryRef.current[automationId];
    if (existing) return existing;
    const created = { past: [] as Automation[], future: [] as Automation[] };
    automationHistoryRef.current[automationId] = created;
    return created;
  }

  const pushHistorySnapshot = useCallback((snapshot: Automation | null | undefined) => {
    if (!snapshot?.id) return;
    const history = ensureAutomationHistory(snapshot.id);
    const nextSnapshot = cloneAutomation(snapshot);
    const prevSnapshot = history.past[history.past.length - 1] ?? null;
    if (prevSnapshot && automationSignature(prevSnapshot) === automationSignature(nextSnapshot)) return;
    history.past.push(nextSnapshot);
    if (history.past.length > 100) history.past.shift();
    history.future = [];
    setHistoryVersion((value) => value + 1);
  }, []);

  function replaceAutomationInState(nextAutomation: Automation) {
    setAutomations((prev) => prev.map((automation) => (automation.id === nextAutomation.id ? nextAutomation : automation)));
  }

  const updateSelectedAutomation = useCallback(
    (mutator: (a: Automation) => Automation, opts?: { recordHistory?: boolean; historySnapshot?: Automation | null }) => {
      if (!selectedAutomationId) return;
      setAutomations((prev) => {
        const current = prev.find((automation) => automation.id === selectedAutomationId) ?? null;
        if (!current) return prev;
        const next = mutator(current);
        if (automationSignature(next) === automationSignature(current)) return prev;
        if (opts?.recordHistory !== false) {
          pushHistorySnapshot(opts?.historySnapshot ?? current);
        }
        return prev.map((automation) => (automation.id === next.id ? next : automation));
      });
    },
    [pushHistorySnapshot, selectedAutomationId]
  );

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

  useEffect(() => {
    if (!selectedNodeId) return;
    if (!selectedAutomation?.nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
      setAutolabelSelectedNode(true);
    }
  }, [selectedAutomation, selectedNodeId]);

  const selectedAutomationTriggerKind = useMemo((): TriggerKind | null => {
    const auto = selectedAutomation;
    if (!auto) return null;
    const t = (auto.nodes || []).find((n) => n.type === "trigger" && (n.config as any)?.kind === "trigger") as any;
    const k = t?.config?.triggerKind as TriggerKind | undefined;
    return k || null;
  }, [selectedAutomation]);

  const selectedTriggerNode = useMemo(() => {
    if (!selectedAutomation) return null;
    return selectedAutomation.nodes.find((node) => node.type === "trigger" && (node.config as any)?.kind === "trigger") ?? null;
  }, [selectedAutomation]);

  const selectedTriggerConfig = useMemo(() => {
    const cfg = selectedTriggerNode?.config;
    return cfg && cfg.kind === "trigger" ? cfg : null;
  }, [selectedTriggerNode]);

  const selectedTestFormFields = useMemo(() => {
    if (!testFormId) return [] as Array<{ key: string; label: string; formId: string; formSlug: string; formName: string }>;
    return ownerFormFields.filter((field) => field.formId === testFormId);
  }, [ownerFormFields, testFormId]);

  useEffect(() => {
    if (!testOpen || !testFormId) return;
    setTestFormResponses((prev) => {
      const next: Record<string, string> = {};
      for (const field of selectedTestFormFields) {
        const key = String(field.key || "").trim();
        if (!key) continue;
        next[key] = typeof prev[key] === "string" && prev[key].trim() ? prev[key] : demoValueForFormField(field);
      }
      return next;
    });
  }, [selectedTestFormFields, testFormId, testOpen]);

  const canUndo = useMemo(() => {
    if (!selectedAutomationId) return false;
    return (automationHistoryRef.current[selectedAutomationId]?.past.length ?? 0) > 0;
  }, [selectedAutomationId]);

  const canRedo = useMemo(() => {
    if (!selectedAutomationId) return false;
    return (automationHistoryRef.current[selectedAutomationId]?.future.length ?? 0) > 0;
  }, [selectedAutomationId]);

  const testTriggerMeta = useMemo(() => {
    const triggerKind = selectedAutomationTriggerKind ?? "manual";
    const label = triggerKindLabel(triggerKind);
    if (triggerKind === "manual") {
      return {
        title: `Test ${label}`,
        description: "Runs this automation immediately as a manual trigger.",
        fromLabel: "",
        fromPlaceholder: "",
        bodyLabel: "",
        bodyPlaceholder: "",
        showFrom: false,
        showBody: false,
      };
    }
    if (triggerKind === "tag_added") {
      return {
        title: `Test ${label}`,
        description: "Simulates the selected tag being added so tag-specific automations only fire when the right tag is chosen.",
        fromLabel: "Sample contact",
        fromPlaceholder: "+15555550123",
        bodyLabel: "",
        bodyPlaceholder: "",
        showFrom: true,
        showBody: false,
      };
    }
    if (triggerKind === "form_submitted") {
      return {
        title: `Test ${label}`,
        description: "Submits a demo response payload for the selected form so form variables resolve correctly during the test.",
        fromLabel: "Submitter contact",
        fromPlaceholder: "customer@example.com",
        bodyLabel: "",
        bodyPlaceholder: "",
        showFrom: true,
        showBody: false,
      };
    }
    if (triggerKind === "scheduled_time") {
      return {
        title: `Test ${label}`,
        description: "Runs the automation at either the configured trigger time or a custom test time so time-based variables match your selection.",
        fromLabel: "",
        fromPlaceholder: "",
        bodyLabel: "",
        bodyPlaceholder: "",
        showFrom: false,
        showBody: false,
      };
    }
    if (triggerKind === "inbound_webhook") {
      return {
        title: `Test ${label}`,
        description: "Uses a webhook key that matches the trigger so only the intended webhook automation path runs.",
        fromLabel: "Sample contact",
        fromPlaceholder: "+15555550123",
        bodyLabel: "Webhook payload note",
        bodyPlaceholder: "Webhook test payload",
        showFrom: true,
        showBody: true,
      };
    }
    if (triggerKind === "appointment_booked" || triggerKind === "appointment_ended" || triggerKind === "missed_appointment") {
      return {
        title: `Test ${label}`,
        description: "Builds a test booking event against the selected calendar so calendar-scoped automations fire correctly.",
        fromLabel: "Attendee contact",
        fromPlaceholder: "customer@example.com",
        bodyLabel: "Booking notes",
        bodyPlaceholder: "Customer asked about availability",
        showFrom: true,
        showBody: true,
      };
    }
    if (triggerKind === "inbound_email") {
      return {
        title: `Test ${label}`,
        description: `Simulates ${label.toLowerCase()} so variables resolve against a realistic email event.`,
        fromLabel: "From email",
        fromPlaceholder: "customer@example.com",
        bodyLabel: "Email body",
        bodyPlaceholder: "Hello there",
        showFrom: true,
        showBody: true,
      };
    }
    if (triggerKind === "inbound_call") {
      return {
        title: `Test ${label}`,
        description: `Simulates ${label.toLowerCase()} so this automation runs against a sample caller event.`,
        fromLabel: "Caller number (E.164)",
        fromPlaceholder: "+15555550123",
        bodyLabel: "Call notes",
        bodyPlaceholder: "Caller asked about pricing",
        showFrom: true,
        showBody: true,
      };
    }
    if (triggerKind === "follow_up_sent") {
      return {
        title: `Test ${label}`,
        description: "Choose the exact follow-up message content to simulate what was sent during this automation test.",
        fromLabel: "Recipient",
        fromPlaceholder: "+15555550123",
        bodyLabel: "Follow-up message",
        bodyPlaceholder: "Just checking back in after our last conversation.",
        showFrom: true,
        showBody: true,
      };
    }
    if (triggerKind === "review_received") {
      return {
        title: `Test ${label}`,
        description: "Simulates an incoming review so you can test the exact review text that should flow through the automation.",
        fromLabel: "Reviewer contact",
        fromPlaceholder: "customer@example.com",
        bodyLabel: "Review text",
        bodyPlaceholder: "Amazing service and super fast response.",
        showFrom: true,
        showBody: true,
      };
    }
    if (triggerKind === "outbound_sent") {
      return {
        title: `Test ${label}`,
        description: "Simulates the outbound message that was sent so follow-on automations can evaluate the actual content.",
        fromLabel: "Recipient",
        fromPlaceholder: "+15555550123",
        bodyLabel: "Outbound message",
        bodyPlaceholder: "Here is the update we promised.",
        showFrom: true,
        showBody: true,
      };
    }
    if (triggerKind === "inbound_sms" || triggerKind === "inbound_mms") {
      return {
        title: `Test ${label}`,
        description: `Simulates ${label.toLowerCase()} so this automation runs against a sample message event.`,
        fromLabel: "From number (E.164)",
        fromPlaceholder: "+15555550123",
        bodyLabel: triggerKind === "inbound_mms" ? "Message / media notes" : "Message",
        bodyPlaceholder: "Hello",
        showFrom: true,
        showBody: true,
      };
    }
    return {
      title: `Test ${label}`,
      description: `Simulates ${label.toLowerCase()} with trigger-specific sample data for this automation.`,
      fromLabel: "Sample contact",
      fromPlaceholder: "+15555550123",
      bodyLabel: "Sample context",
      bodyPlaceholder: "Demo trigger context",
      showFrom: true,
      showBody: true,
    };
  }, [selectedAutomationTriggerKind]);

  const selectedNode = useMemo(() => {
    if (!selectedAutomation || !selectedNodeId) return null;
    return selectedAutomation.nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [selectedAutomation, selectedNodeId]);

  function clampZoom(z: number) {
    return clamp(z, 0.3, 2.5);
  }

  const load = useCallback(async () => {
    const isFirstLoad = !hasLoadedOnceRef.current;
    if (isFirstLoad) setLoading(true);
    else setRefreshing(true);

    setError(null);
    setNote(null);

    let didLoad = false;
    try {
      const res = await fetch("/api/portal/automations/settings", { cache: "no-store", headers: variantHeaders }).catch(() => null as any);
      if (!res?.ok) {
        setError("Failed to load.");
        return;
      }

      const data = (await res.json().catch(() => null)) as ApiPayload | null;
      if (!data || (data as any).error) {
        setError((data as any)?.error || "Failed to load.");
        return;
      }

      const list = Array.isArray((data as any).automations) ? ((data as any).automations as Automation[]) : [];
      setAutomations(list);
      automationHistoryRef.current = {};
      setHistoryVersion((value) => value + 1);
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

      if (!selected && mode === "editor") {
        const starter = buildBlankAutomation();
        setAutomations([starter]);
        lastSavedSigRef.current = "";
        setDirty(true);
        selected = starter.id;
      }

      setSelectedAutomationId(selected);
      didLoad = true;

      fetch("/api/portal/funnel-builder/form-field-keys", { cache: "no-store", headers: variantHeaders })
        .then(async (r) => {
          if (!r?.ok) return null;
          return (await r.json().catch(() => null)) as any;
        })
        .then((json) => {
          const list = Array.isArray(json?.fields) ? (json.fields as any[]) : [];
          const next = list
            .filter((x) => x && typeof x === "object")
            .map((x) => ({
              key: String((x as any).key || "").trim(),
              label: String((x as any).label || "").trim(),
              formId: String((x as any).formId || "").trim(),
              formSlug: String((x as any).formSlug || "").trim(),
              formName: String((x as any).formName || "").trim(),
            }))
            .filter((x) => x.key && x.formId);
          setOwnerFormFields(next);
        })
        .catch(() => null);

      fetch("/api/portal/funnel-builder/forms", { cache: "no-store", headers: variantHeaders })
        .then(async (r) => {
          if (!r?.ok) return null;
          return (await r.json().catch(() => null)) as any;
        })
        .then((json) => {
          const list = Array.isArray(json?.forms) ? (json.forms as any[]) : [];
          const next = list
            .filter((x) => x && typeof x === "object")
            .map((x) => ({
              id: String((x as any).id || "").trim(),
              slug: String((x as any).slug || "").trim(),
              name: String((x as any).name || "").trim(),
              status: String((x as any).status || "").trim(),
            }))
            .filter((x) => x.id);
          setOwnerForms(next);
        })
        .catch(() => null);
    } finally {
      if (didLoad) hasLoadedOnceRef.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, [mode, variantHeaders]);

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

  const saveAll = useCallback(async (next?: Automation[]) => {
    const snapshot = (next ?? automationsRef.current).map((automation) => cloneAutomation(automation));
    const snapshotSig = serializeAutomations(snapshot);

    if (!snapshot.length) {
      lastSavedSigRef.current = snapshotSig;
      setDirty(false);
      return true;
    }

    if (saveInFlightRef.current) {
      await saveInFlightRef.current;
      const latest = automationsRef.current.map((automation) => cloneAutomation(automation));
      const latestSig = serializeAutomations(latest);
      if (!latest.length || latestSig === lastSavedSigRef.current) {
        setDirty(false);
        return true;
      }
      return saveAll(latest);
    }

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    setSaving(true);
    setNote(null);

    const run = (async () => {
      const res = await fetch("/api/portal/automations/settings", {
        method: "PUT",
        headers: { "content-type": "application/json", ...variantHeaders },
        body: JSON.stringify({ automations: snapshot }),
      }).catch(() => null as any);

      const data = (await res?.json?.().catch(() => null)) as ApiPayload | null;
      if (!res?.ok || !data || (data as any).error) {
        autosaveBlockedUntilRef.current = Date.now() + 6000;
        const msg = String((data as any)?.error || "Save failed.");
        setError((prev) => (prev === msg ? prev : msg));
        return false;
      }

      const saved = ((data as any).automations || []) as Automation[];
      const currentSig = serializeAutomations(automationsRef.current);
      const shouldApplySavedState = currentSig === snapshotSig;

      if (shouldApplySavedState) {
        automationsRef.current = saved;
        setAutomations(saved);
        lastSavedSigRef.current = serializeAutomations(saved);
        setDirty(false);
      } else {
        setDirty(true);
      }

      setLastSavedAtIso(new Date().toISOString());

      if (shouldApplySavedState) {
        const now = Date.now();
        if (now - lastSavedToastAtRef.current > 8000) {
          lastSavedToastAtRef.current = now;
          toast.success("Saved");
        }
      }

      return true;
    })();

    saveInFlightRef.current = run;
    try {
      return await run;
    } finally {
      if (saveInFlightRef.current === run) saveInFlightRef.current = null;
      setSaving(false);
    }
  }, [toast, variantHeaders]);

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
  }, [automations, loading, saveAll, saving]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/portal/people/users", { cache: "no-store", headers: variantHeaders }).catch(() => null as any);
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
  }, [variantHeaders]);

  async function createOwnerTag(name: string, color?: string | null) {
    const clean = String(name || "").trim().slice(0, 60);
    if (!clean) throw new Error("Tag name is required.");

    const safeColor = typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color.trim()) ? color.trim() : null;

    const res = await fetch("/api/portal/contact-tags", {
      method: "POST",
      headers: { "content-type": "application/json", ...variantHeaders },
      body: JSON.stringify(safeColor ? { name: clean, color: safeColor } : { name: clean }),
    }).catch(() => null as any);

    const data = (await res?.json?.().catch(() => null)) as any;
    if (!res?.ok || !data?.ok || !data?.tag?.id) {
      throw new Error(String(data?.error || "Failed to create tag."));
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

    return created;
  }

  const applyCreatedTagToSelection = useCallback(
    (created: ContactTag) => {
      if (!createTagApplyTo || !selectedAutomationId) return;
      updateSelectedAutomation((a) => {
        const nodes = a.nodes.map((n) => {
          if (n.id !== createTagApplyTo.nodeId) return n;
          if (createTagApplyTo.kind === "action") {
            const prev = n.config?.kind === "action" ? n.config : (defaultConfigForType("action") as any);
            const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "action", tagId: created.id };
            const nextLabel = autolabelSelectedNode && shouldAutolabel(n.label) ? labelForConfig("action", nextCfg) : n.label;
            return { ...n, config: nextCfg, label: nextLabel };
          }
          const prev = n.config?.kind === "trigger" ? n.config : (defaultConfigForType("trigger") as any);
          const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "trigger", tagId: created.id };
          const nextLabel = autolabelSelectedNode && shouldAutolabel(n.label) ? labelForConfig("trigger", nextCfg) : n.label;
          return { ...n, config: nextCfg, label: nextLabel };
        });
        return { ...a, nodes, updatedAtIso: new Date().toISOString() };
      });
    },
    [autolabelSelectedNode, createTagApplyTo, selectedAutomationId, updateSelectedAutomation],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/portal/contact-tags", { cache: "no-store", headers: variantHeaders }).catch(() => null as any);
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
  }, [variantHeaders]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/portal/ai-outbound-calls/campaigns", { cache: "no-store", headers: variantHeaders }).catch(() => null as any);
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
  }, [variantHeaders]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/portal/nurture/campaigns", { cache: "no-store", headers: variantHeaders }).catch(() => null as any);
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
  }, [variantHeaders]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/portal/booking/calendars", { cache: "no-store", headers: variantHeaders }).catch(() => null as any);
      const data = (await res?.json?.().catch(() => null)) as any;
      if (cancelled) return;
      const calendars = Array.isArray(data?.config?.calendars) ? (data.config.calendars as any[]) : [];
      if (res?.ok && data?.ok && calendars.length) {
        setBookingCalendars(
          calendars
            .map((c) => ({
              id: String(c?.id || "").trim(),
              title: String(c?.title || "").trim().slice(0, 80) || "Calendar",
              enabled: Boolean(c?.enabled ?? true),
            }))
            .filter((c) => Boolean(c.id))
            .sort((a, b) => a.title.localeCompare(b.title)),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [variantHeaders]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (ev: WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      const v = viewRef.current;

      // Default: allow normal page scroll even when hovering the canvas.
      // Only capture wheel for zoom (pinch/ctrl/meta), or for canvas pan in editor mode.
      const wantsZoom = ev.ctrlKey || ev.metaKey;
      const wantsPan = !wantsZoom && mode === "editor";
      if (!wantsZoom && !wantsPan) return;

      ev.preventDefault();
      ev.stopPropagation();

      if (wantsZoom) {
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

      // In the dedicated editor window, two-finger scroll pans the canvas.
      if (wantsPan) {
        setView((prev) => ({
          ...prev,
          panX: clamp(prev.panX - ev.deltaX, -6000, 6000),
          panY: clamp(prev.panY - ev.deltaY, -6000, 6000),
        }));
      }
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });

    // Safari (macOS + iOS) supports `gesture*` events for pinch.
    // We prevent page zoom and instead map pinch -> canvas zoom.
    const onGesture = (ev: any) => {
      ev.preventDefault?.();
      ev.stopPropagation?.();

      const rect = canvas.getBoundingClientRect();
      const v = viewRef.current;
      const clientX = typeof ev?.clientX === "number" ? ev.clientX : rect.left + rect.width / 2;
      const clientY = typeof ev?.clientY === "number" ? ev.clientY : rect.top + rect.height / 2;

      if (ev?.type === "gesturestart") {
        const worldX = (clientX - rect.left - v.panX) / v.zoom;
        const worldY = (clientY - rect.top - v.panY) / v.zoom;
        gestureRef.current = { startZoom: v.zoom, worldX, worldY };
        return;
      }

      if (ev?.type === "gestureend") {
        gestureRef.current = null;
        return;
      }

      if (ev?.type === "gesturechange") {
        const init = gestureRef.current;
        const scale = typeof ev?.scale === "number" ? ev.scale : null;
        if (!init || !scale) return;

        const nextZoom = clampZoom(init.startZoom * scale);
        const nextPanX = clientX - rect.left - init.worldX * nextZoom;
        const nextPanY = clientY - rect.top - init.worldY * nextZoom;
        setView({
          zoom: nextZoom,
          panX: clamp(nextPanX, -6000, 6000),
          panY: clamp(nextPanY, -6000, 6000),
        });
      }
    };
    (canvas as any).addEventListener?.("gesturestart", onGesture, { passive: false });
    (canvas as any).addEventListener?.("gesturechange", onGesture, { passive: false });
    (canvas as any).addEventListener?.("gestureend", onGesture, { passive: false });

    return () => {
      canvas.removeEventListener("wheel", onWheel as any);
      (canvas as any).removeEventListener?.("gesturestart", onGesture as any);
      (canvas as any).removeEventListener?.("gesturechange", onGesture as any);
      (canvas as any).removeEventListener?.("gestureend", onGesture as any);
    };
  }, [mode]);

  useEffect(() => {
    const onMove = (ev: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();

      // Touch pinch-to-zoom (two fingers) on the canvas background
      if (activePointersRef.current.has(ev.pointerId)) {
        activePointersRef.current.set(ev.pointerId, { clientX: ev.clientX, clientY: ev.clientY });

        if (activePointersRef.current.size === 2) {
          const pts = Array.from(activePointersRef.current.values());
          const p1 = pts[0];
          const p2 = pts[1];
          const dx = p2.clientX - p1.clientX;
          const dy = p2.clientY - p1.clientY;
          const dist = Math.max(1, Math.hypot(dx, dy));
          const midClientX = (p1.clientX + p2.clientX) / 2;
          const midClientY = (p1.clientY + p2.clientY) / 2;

          const init = pinchRef.current;
          if (!init) {
            const v = viewRef.current;
            pinchRef.current = {
              startDist: dist,
              startZoom: v.zoom,
              startPanX: v.panX,
              startPanY: v.panY,
              startMidClientX: midClientX,
              startMidClientY: midClientY,
            };
            return;
          }

          if (dragging) setDragging(null);
          if (connecting) setConnecting(null);
          if (panning) setPanning(null);

          const scale = dist / init.startDist;
          const nextZoom = clampZoom(init.startZoom * scale);
          const anchorX = (init.startMidClientX - rect.left - init.startPanX) / init.startZoom;
          const anchorY = (init.startMidClientY - rect.top - init.startPanY) / init.startZoom;
          const nextPanX = clamp((midClientX - rect.left) - anchorX * nextZoom, -6000, 6000);
          const nextPanY = clamp((midClientY - rect.top) - anchorY * nextZoom, -6000, 6000);
          setView({ panX: nextPanX, panY: nextPanY, zoom: nextZoom });
          return;
        }
      }

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
        }, { recordHistory: false });
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

    const onUp = (ev: PointerEvent) => {
      if (activePointersRef.current.has(ev.pointerId)) {
        activePointersRef.current.delete(ev.pointerId);
        if (activePointersRef.current.size < 2) pinchRef.current = null;
      }
      if (dragging && dragHistoryBaselineRef.current && selectedAutomation) {
        if (automationSignature(dragHistoryBaselineRef.current) !== automationSignature(selectedAutomation)) {
          pushHistorySnapshot(dragHistoryBaselineRef.current);
        }
        dragHistoryBaselineRef.current = null;
      }
      if (dragging) setDragging(null);
      if (connecting) setConnecting(null);
      if (panning) setPanning(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [connecting, dragging, panning, pushHistorySnapshot, selectedAutomation, selectedAutomationId, updateSelectedAutomation, view.panX, view.panY, view.zoom]);

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
    dragHistoryBaselineRef.current = cloneAutomation(selectedAutomation);
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

  const selectedCreateAutomationTemplate = useMemo(
    () => AUTOMATION_TEMPLATE_DEFINITIONS.find((template) => template.id === createAutomationTemplateId) ?? null,
    [createAutomationTemplateId],
  );

  function openCreateAutomationModal() {
    setCreateAutomationName("");
    setCreateAutomationTemplateId(BLANK_AUTOMATION_TEMPLATE_ID);
    setLibraryMenuFor(null);
    setOpenListMenu(null);
    setCreateAutomationOpen(true);
  }

  function createAutomationFromSelection() {
    const nextName =
      String(createAutomationName || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80) || "New automation";

    const next =
      createAutomationTemplateId === BLANK_AUTOMATION_TEMPLATE_ID || !selectedCreateAutomationTemplate
        ? (() => {
            const base = buildBlankAutomation();
            const nowIso = new Date().toISOString();
            return {
              ...base,
              name: nextName,
              updatedAtIso: nowIso,
              createdAtIso: nowIso,
              createdBy: viewer?.userId ? { userId: viewer.userId, email: viewer.email, name: viewer.name } : undefined,
            } satisfies Automation;
          })()
        : instantiateAutomationTemplate(selectedCreateAutomationTemplate, { name: nextName, viewer });

    const list = [next, ...automations].slice(0, 50);
    setAutomations(list);
    setSelectedAutomation(next.id);
    setCreateAutomationOpen(false);
    setLibraryOpen(false);
    void saveAll(list);
    openAutomationEditorWindow(next.id);
  }

  function openRenameModal() {
    if (!selectedAutomation || saving) return;
    setRenameValue(selectedAutomation.name);
    setRenameOpen(true);
  }

  function applyRenameById(automationId: string, nextNameRaw: string) {
    const trimmed = String(nextNameRaw || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    if (!trimmed) return;

    if (selectedAutomation?.id === automationId) {
      updateSelectedAutomation((automation) => ({ ...automation, name: trimmed, updatedAtIso: new Date().toISOString() }));
      return;
    }

    const nextList = automations.map((a) =>
      a.id === automationId ? { ...a, name: trimmed, updatedAtIso: new Date().toISOString() } : a,
    );
    setAutomations(nextList);
    void saveAll(nextList);
  }

  function applyRename(nextNameRaw: string) {
    if (!selectedAutomation) return;
    applyRenameById(selectedAutomation.id, nextNameRaw);
  }

  function openAutomationEditorWindow(automationId: string) {
    const appBase = String(pathname || "").startsWith("/credit") ? "/credit/app" : "/portal/app";
    const url = `${appBase}/services/automations/editor?automation=${encodeURIComponent(automationId)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function startInlineRename(automationId: string) {
    const a = automations.find((x) => x.id === automationId);
    if (!a) return;
    setInlineRenameId(automationId);
    setInlineRenameValue(a.name);
  }

  function commitInlineRename(automationId: string) {
    const trimmed = String(inlineRenameValue || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);

    setInlineRenameId(null);
    setInlineRenameValue("");
    if (!trimmed) return;
    applyRenameById(automationId, trimmed);
  }

  function togglePausedById(automationId: string) {
    const nextList = automations.map((a) =>
      a.id === automationId ? { ...a, paused: !Boolean(a.paused), updatedAtIso: new Date().toISOString() } : a,
    );
    setAutomations(nextList);
    void saveAll(nextList);
  }

  function deleteAutomationFromList(automationId: string) {
    const a = automations.find((x) => x.id === automationId);
    const ok = window.confirm(`Delete automation "${a?.name || "(untitled)"}"? This cannot be undone.`);
    if (!ok) return;
    const nextList = automations.filter((x) => x.id !== automationId);
    setAutomations(nextList);
    void saveAll(nextList);
  }

  function duplicateAutomation() {
    if (!selectedAutomation) return;
    duplicateAutomationById(selectedAutomation.id);
  }

  function duplicateAutomationById(automationId: string): string | null {
    const source = automations.find((x) => x.id === automationId);
    if (!source) return null;

    const proposed = `${source.name} (copy)`
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    const nameRaw = window.prompt("Duplicate automation name", proposed);
    if (nameRaw == null) return null;
    const name = String(nameRaw || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    if (!name) return null;

    const copy: Automation = {
      ...source,
      id: uid("auto"),
      name,
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
    return copy.id;
  }

  function deleteAutomation() {
    if (!selectedAutomation) return;
    void deleteAutomationById(selectedAutomation.id);
  }

  async function deleteAutomationById(automationId: string) {
    setConfirm({ kind: "delete_automation", automationId });
  }

  function openTestModal() {
    if (!selectedAutomation) return;
    const triggerKind = selectedAutomationTriggerKind ?? "manual";
    const triggerCfg = selectedTriggerConfig;
    const configuredFormId = String(triggerCfg?.formId || "").trim();
    const configuredTagId = String(triggerCfg?.tagId || "").trim();
    const configuredWebhookKey = String(triggerCfg?.webhookKey || "").trim();
    const configuredCalendarId = String(triggerCfg?.calendarId || "").trim();
    const configuredSpecificTime = String((triggerCfg as any)?.specificTime || "09:00").slice(0, 5) || "09:00";
    const defaultFormId = configuredFormId || ownerForms[0]?.id || "";

    if (selectedAutomationTriggerKind === "manual") {
      setTestFrom("");
      setTestBody("");
    } else if (
      selectedAutomationTriggerKind === "inbound_email" ||
      selectedAutomationTriggerKind === "form_submitted" ||
      selectedAutomationTriggerKind === "appointment_booked" ||
      selectedAutomationTriggerKind === "appointment_ended" ||
      selectedAutomationTriggerKind === "missed_appointment" ||
      selectedAutomationTriggerKind === "review_received"
    ) {
      setTestFrom("customer@example.com");
      setTestBody("Hello");
    } else {
      setTestFrom("+15555550123");
      setTestBody("Hello");
    }

    if (triggerKind === "tag_added") {
      setTestTagId(configuredTagId || TEST_ANY_TAG_VALUE);
    } else {
      setTestTagId("");
    }

    if (triggerKind === "form_submitted") {
      setTestFormId(defaultFormId);
      const fields = ownerFormFields.filter((field) => field.formId === defaultFormId);
      const nextResponses: Record<string, string> = {};
      for (const field of fields) {
        const key = String(field.key || "").trim();
        if (!key) continue;
        nextResponses[key] = demoValueForFormField(field);
      }
      setTestFormResponses(nextResponses);
      if (!testFrom) setTestFrom("customer@example.com");
    } else {
      setTestFormId("");
      setTestFormResponses({});
    }

    setTestWebhookKey(configuredWebhookKey || "test-webhook");
    setTestCalendarId(configuredCalendarId || bookingCalendars[0]?.id || "");
    setTestScheduleMode(triggerKind === "scheduled_time" && String((triggerCfg as any)?.specificTime || "").trim() ? "trigger" : "custom");
    setTestScheduleDate(new Date().toISOString().slice(0, 10));
    setTestScheduleTime(configuredSpecificTime);
    setTestOpen(true);
  }

  async function runTestAutomation() {
    if (!selectedAutomation) return;

    if (saving || dirty) {
      const ok = await saveAll(automationsRef.current);
      if (!ok) {
        setError("Save failed. Fix that first, then run the test again.");
        return;
      }
    }

    const from = String(testFrom || "").trim().slice(0, 64);
    const body = String(testBody ?? "").slice(0, 2000);
    const triggerKind = selectedAutomationTriggerKind ?? "manual";
    const triggerCfg = (selectedTriggerNode?.config as Extract<BuilderNodeConfig, { kind: "trigger" }> | undefined) ?? undefined;
    const phoneLikeTriggers = new Set<TriggerKind>(["inbound_sms", "inbound_mms", "inbound_call", "missed_call", "outbound_sent", "follow_up_sent"]);
    const emailLikeTriggers = new Set<TriggerKind>(["inbound_email", "review_received", "appointment_booked", "appointment_ended", "missed_appointment", "form_submitted"]);
    if (triggerKind !== "manual" && !from) return;

    const testNowIso =
      triggerKind === "scheduled_time"
        ? testScheduleMode === "trigger"
          ? combineDateAndTime(new Date().toISOString().slice(0, 10), String((triggerCfg as any)?.specificTime || testScheduleTime || "09:00"))
          : combineDateAndTime(testScheduleDate, testScheduleTime)
        : null;

    const selectedForm = ownerForms.find((form) => form.id === testFormId) ?? null;

    const event =
      triggerKind === "tag_added"
        ? {
            tagId:
              testTagId === TEST_ANY_TAG_VALUE
                ? undefined
                : String(testTagId || triggerCfg?.tagId || "").trim() || undefined,
          }
        : triggerKind === "inbound_webhook"
          ? { webhookKey: testWebhookKey || triggerCfg?.webhookKey || "test-webhook" }
          : triggerKind === "form_submitted"
            ? {
                formId: testFormId || triggerCfg?.formId || "test-form",
                formSlug: selectedForm?.slug || "test-form",
                formName: selectedForm?.name || "Test Form",
                submissionId: uid("submission"),
                formData: testFormResponses,
              }
            : triggerKind === "appointment_booked" || triggerKind === "appointment_ended" || triggerKind === "missed_appointment"
              ? { bookingId: uid("booking"), calendarId: testCalendarId || triggerCfg?.calendarId || "test-calendar" }
              : undefined;

    setTesting(true);
    setError(null);
    setNote(null);

    try {
      const res = await fetch("/api/portal/automations/test-trigger", {
        method: "POST",
        headers: { "content-type": "application/json", ...variantHeaders },
        body: JSON.stringify({
          automationId: selectedAutomation.id,
          triggerKind,
          from,
          body,
          nowIso: testNowIso || undefined,
          event,
          contact:
            triggerKind === "manual"
              ? undefined
              : phoneLikeTriggers.has(triggerKind)
                ? { phone: from, name: from }
                : emailLikeTriggers.has(triggerKind)
                  ? { email: from, name: from }
                  : { phone: from, email: from.includes("@") ? from : undefined, name: from },
        }),
      }).catch(() => null as any);

      const data = (await res?.json?.().catch(() => null)) as any;
      if (!res?.ok || !data?.ok) {
        setTesting(false);
        setError(data?.error || "Test failed.");
        return;
      }

      setTesting(false);
      setNote("Test started.");
      window.setTimeout(() => setNote(null), 1400);
      setTestOpen(false);
    } catch {
      setTesting(false);
      setError("Test failed.");
    }
  }

  function undoSelectedAutomation() {
    if (!selectedAutomationId || !selectedAutomation) return;
    const history = ensureAutomationHistory(selectedAutomationId);
    const previous = history.past.pop();
    if (!previous) return;
    history.future.push(cloneAutomation(selectedAutomation));
    replaceAutomationInState(previous);
    setHistoryVersion((value) => value + 1);
  }

  function redoSelectedAutomation() {
    if (!selectedAutomationId || !selectedAutomation) return;
    const history = ensureAutomationHistory(selectedAutomationId);
    const next = history.future.pop();
    if (!next) return;
    history.past.push(cloneAutomation(selectedAutomation));
    replaceAutomationInState(next);
    setHistoryVersion((value) => value + 1);
  }

  const nodesById = useMemo(() => {
    const m = new Map<string, BuilderNode>();
    for (const n of selectedAutomation?.nodes ?? []) m.set(n.id, n);
    return m;
  }, [selectedAutomation]);

  if (loading) {
    return (
      <div className={mode === "editor" ? "flex min-h-[320px] items-center justify-center" : "p-6"}>
        {mode === "editor" ? null : <PortalBackToOnboardingLink />}
        <div className="text-sm text-zinc-600">Loading…</div>
      </div>
    );
  }

  if (mode === "list") {
    const normalizedQuery = listQuery.trim().toLowerCase();
    const uniqueTriggers = Array.from(
      new Set(
        automations
          .map((a) => {
            const triggerNode = (a.nodes || []).find((n) => n.type === "trigger");
            const cfg = triggerNode?.config;
            return cfg && cfg.kind === "trigger" ? cfg.triggerKind : null;
          })
          .filter((x): x is TriggerKind => Boolean(x)),
      ),
    );

    const filtered = automations
      .filter((a) => {
        if (listStatus === "active" && Boolean(a.paused)) return false;
        if (listStatus === "paused" && !Boolean(a.paused)) return false;
        const triggerNode = (a.nodes || []).find((n: any) => n?.type === "trigger" && n?.config?.kind === "trigger") as any;
        const triggerKind = triggerNode?.config?.triggerKind as TriggerKind | undefined;
        if (listTrigger !== "all" && triggerKind !== listTrigger) return false;
        if (listDateRange !== "all") {
          const sourceIso = String(a.updatedAtIso || (a as any).createdAtIso || "").trim();
          const sourceTs = sourceIso ? new Date(sourceIso).getTime() : Number.NaN;
          if (!Number.isFinite(sourceTs)) return false;
          const dayWindow = listDateRange === "7d" ? 7 : listDateRange === "30d" ? 30 : listDateRange === "90d" ? 90 : 365;
          if (Date.now() - sourceTs > dayWindow * 24 * 60 * 60 * 1000) return false;
        }
        if (!normalizedQuery) return true;
        return (
          String(a.name || "").toLowerCase().includes(normalizedQuery) ||
          String(a.id || "").toLowerCase().includes(normalizedQuery)
        );
      })
      .sort((a, b) => (String(b.updatedAtIso || "") || "").localeCompare(String(a.updatedAtIso || "") || ""));

    const listStatusOptions: Array<{ value: "all" | "active" | "paused"; label: string }> = [
      { value: "all", label: "All" },
      { value: "active", label: "Active" },
      { value: "paused", label: "Paused" },
    ];

    const listTriggerOptions: Array<{ value: "all" | TriggerKind; label: string; hint?: string }> = [
      { value: "all", label: "All" },
      ...uniqueTriggers
        .slice()
        .sort((a, b) => String(a).localeCompare(String(b)))
        .map((t) => ({ value: t, label: String(t).replace(/_/g, " "), hint: t })),
    ];

    const listDateOptions: Array<{ value: "all" | "7d" | "30d" | "90d" | "365d"; label: string }> = [
      { value: "all", label: "Any time" },
      { value: "7d", label: "Last 7 days" },
      { value: "30d", label: "Last 30 days" },
      { value: "90d", label: "Last 90 days" },
      { value: "365d", label: "Last year" },
    ];

    const pageSize = 20;
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const currentPage = Math.min(listPage, totalPages);
    const pageStart = (currentPage - 1) * pageSize;
    const pagedAutomations = filtered.slice(pageStart, pageStart + pageSize);

    const formatUpdatedShort = (iso: string | null | undefined) => {
      if (!iso) return "-";
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "-";
      return d.toLocaleString(undefined, { month: "numeric", day: "numeric", year: "2-digit", hour: "numeric", minute: "2-digit" });
    };

    const hasListFiltersActive =
      listStatus !== "all" || listTrigger !== "all" || listDateRange !== "all" || listQuery.trim().length > 0;

    const automationZeroState = automations.length === 0 ? (
      <div className="rounded-3xl border border-dashed border-zinc-200 bg-zinc-50 px-5 py-10 text-center">
        <div className="text-base font-semibold text-zinc-900">Create your first automation</div>
        <div className="mt-2 mx-auto max-w-xl text-sm text-zinc-600">
          Start with a blank workflow or pick a template for common jobs like missed-call follow-up, inbound replies, and nurture handoffs.
        </div>
        <div className="mt-4 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <button
            type="button"
            className="rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
            onClick={openCreateAutomationModal}
          >
            + New automation
          </button>
          <div className="text-xs text-zinc-500">Templates are available in the create flow.</div>
        </div>
      </div>
    ) : (
      <div className="rounded-3xl border border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-600">
        {hasListFiltersActive ? "No automations match your search or filters." : "No automations available."}
      </div>
    );

    return (
      <>
      <div className="px-6 pt-4 pb-6">
        <PortalBackToOnboardingLink wrapperClassName="mb-2" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">My Automations</h1>
            <div className="mt-1 text-sm text-zinc-600">Create fully custom automations from scratch and manage every workflow in one place.</div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
            <SuggestedSetupModalLauncher serviceSlugs={["automations"]} buttonLabel="Suggested setup" />
            <button
              type="button"
              className="rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-60"
              onClick={openCreateAutomationModal}
            >
              + New automation
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block h-11 w-full">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
              <IconSearch size={16} />
            </span>
            <input
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder="Search automations"
              className="h-11 w-full rounded-2xl border border-zinc-200 bg-white pl-10 pr-14 text-sm text-zinc-900 placeholder:text-zinc-500"
            />
            <button
              type="button"
              className={classNames(
                portalGlassButtonClass,
                "absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-zinc-500 transition-colors duration-150 hover:bg-white/80 hover:text-zinc-900",
                listStatus !== "all" || listTrigger !== "all" || listDateRange !== "all" ? "text-(--color-brand-blue)" : "",
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleListFilters(e.currentTarget);
              }}
              aria-label="Open filters"
              title="Filters"
            >
              <IconFunnel size={18} />
            </button>
          </label>
        </div>

        {openListFilters ? (
          <>
            <div className="fixed inset-0 z-30" onMouseDown={() => setOpenListFilters(null)} onTouchStart={() => setOpenListFilters(null)} />
            <div
              className="fixed z-40 w-80"
              style={{ left: openListFilters.left, top: openListFilters.top, maxHeight: openListFilters.maxHeight }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <LiquidGlassPopupSurface
                className="w-full p-2 shadow-xl"
                contentClassName="space-y-3"
                overlayClassName="border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.34))] shadow-[0_24px_64px_rgba(15,23,42,0.16)] backdrop-blur-[22px]"
              >
                <div className="flex items-center justify-end gap-3 px-2 pt-1">
                  {(listStatus !== "all" || listTrigger !== "all" || listDateRange !== "all") ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-(--color-brand-blue) hover:underline"
                      onClick={() => {
                        setListStatus("all");
                        setListTrigger("all");
                        setListDateRange("all");
                      }}
                    >
                      Clear
                    </button>
                  ) : null}
                </div>

                <div className="max-h-80 space-y-3 overflow-auto px-1 pb-1">
                  <div>
                    <div className="px-2 text-sm font-medium text-zinc-700">Status</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {listStatusOptions.map((option) => {
                        const active = listStatus === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            className={classNames(
                              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                              active ? "bg-brand-blue/10 text-(--color-brand-blue)" : "bg-transparent text-zinc-700 hover:bg-brand-blue/5",
                            )}
                            onClick={() => setListStatus(option.value)}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="px-2 text-sm font-medium text-zinc-700">Trigger</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {listTriggerOptions.map((option) => {
                        const active = listTrigger === option.value;
                        return (
                          <button
                            key={String(option.value)}
                            type="button"
                            className={classNames(
                              "rounded-full px-3 py-1.5 text-sm font-medium capitalize transition-colors duration-150",
                              active ? "bg-brand-blue/10 text-(--color-brand-blue)" : "bg-transparent text-zinc-700 hover:bg-brand-blue/5",
                            )}
                            onClick={() => setListTrigger(option.value as "all" | TriggerKind)}
                            title={option.hint}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="px-2 text-sm font-medium text-zinc-700">Date</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {listDateOptions.map((option) => {
                        const active = listDateRange === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            className={classNames(
                              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                              active ? "bg-brand-blue/10 text-(--color-brand-blue)" : "bg-transparent text-zinc-700 hover:bg-brand-blue/5",
                            )}
                            onClick={() => setListDateRange(option.value)}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </LiquidGlassPopupSurface>
            </div>
          </>
        ) : null}

        {isMobileApp ? (
          <div className="mt-6 space-y-3">
            {filtered.length === 0 ? (
              automationZeroState
            ) : (
              pagedAutomations.map((a) => {
                const triggerNode = (a.nodes || []).find((n: any) => n?.type === "trigger" && n?.config?.kind === "trigger") as any;
                const triggerKind = triggerNode?.config?.triggerKind as TriggerKind | undefined;
                const triggerLabel = triggerKind
                  ? triggerKind === "manual"
                    ? "Manual"
                    : String(triggerKind).replace(/_/g, " ")
                  : "-";
                const updatedLabel = formatUpdatedShort(a.updatedAtIso);
                const createdLabel = (a as any).createdAtIso ? new Date((a as any).createdAtIso).toLocaleDateString() : "-";
                return (
                  <div
                    key={a.id}
                    className="rounded-3xl border border-zinc-200 bg-white p-4 hover:bg-zinc-50"
                    onClick={() => openAutomationEditorWindow(a.id)}
                    role="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-zinc-900">{a.name}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                          <span
                            className={
                              "inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold " +
                              (a.paused
                                ? "bg-amber-50 text-amber-800"
                                : "bg-emerald-50 text-emerald-800")
                            }
                          >
                            {a.paused ? "Paused" : "Active"}
                          </span>
                          <span className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-800">
                            {triggerLabel}
                          </span>
                          <span className="text-[11px] text-zinc-500">Updated {updatedLabel}</span>
                          <span className="text-[11px] text-zinc-500">Created {createdLabel}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        className={classNames(
                          portalGlassButtonClass,
                          "inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-700 transition-all duration-150 hover:-translate-y-0.5 hover:bg-white/80",
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleListMenu(a.id, e.currentTarget);
                        }}
                        title="Actions"
                      >
                        <DotsIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-3xl border border-zinc-200 bg-white">
            <div className="grid grid-cols-12 gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
              <div className="col-span-6 md:col-span-4">Name</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-3 md:col-span-2 lg:col-span-2">Trigger</div>
              <div className="hidden md:block md:col-span-2">Updated</div>
              <div className="hidden lg:block lg:col-span-1">Created</div>
              <div className="col-span-1 md:col-span-2 lg:col-span-1 text-right">Actions</div>
            </div>

            <div className="divide-y divide-zinc-100">
              {filtered.length === 0 ? (
                <div className="p-4">{automationZeroState}</div>
              ) : (
                pagedAutomations.map((a) => {
                  const triggerNode = (a.nodes || []).find((n: any) => n?.type === "trigger" && n?.config?.kind === "trigger") as any;
                  const triggerKind = triggerNode?.config?.triggerKind as TriggerKind | undefined;
                  const triggerLabel = triggerKind
                    ? triggerKind === "manual"
                      ? "Manual"
                      : String(triggerKind).replace(/_/g, " ")
                    : "-";
                  const updatedLabel = formatUpdatedShort(a.updatedAtIso);
                  const createdLabel = (a as any).createdAtIso ? new Date((a as any).createdAtIso).toLocaleDateString() : "-";
                  return (
                    <div
                      key={a.id}
                      className="grid cursor-pointer grid-cols-12 items-center gap-3 px-4 py-3 hover:bg-zinc-50"
                      onClick={() => openAutomationEditorWindow(a.id)}
                    >
                      <div className="col-span-6 md:col-span-4 min-w-0">
                        {inlineRenameId === a.id ? (
                          <input
                            ref={inlineRenameInputRef}
                            value={inlineRenameValue}
                            onChange={(e) => setInlineRenameValue(e.target.value)}
                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-300"
                            onClick={(e) => e.stopPropagation()}
                            onBlur={() => commitInlineRename(a.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                commitInlineRename(a.id);
                              }
                              if (e.key === "Escape") {
                                e.preventDefault();
                                setInlineRenameId(null);
                                setInlineRenameValue("");
                              }
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            className="group block w-full rounded-xl border border-zinc-200/0 bg-transparent px-3 py-2 text-left text-sm font-semibold text-zinc-900 hover:border-zinc-300 hover:bg-white focus-visible:border-zinc-300 focus-visible:ring-2 focus-visible:ring-blue-200"
                            onClick={(e) => {
                              e.stopPropagation();
                              startInlineRename(a.id);
                            }}
                            title="Click to rename"
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span className="truncate">{a.name}</span>
                            </span>
                          </button>
                        )}
                      </div>

                      <div className="col-span-2">
                        <span
                          className={
                            "inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold " +
                            (a.paused ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800")
                          }
                        >
                          {a.paused ? "Paused" : "Active"}
                        </span>
                      </div>

                      <div className="col-span-3 md:col-span-2 lg:col-span-2 min-w-0">
                        {triggerKind === "manual" ? (
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-flex items-center rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800"
                              title="This automation can be triggered manually"
                            >
                              Manual
                            </span>
                            <button
                              type="button"
                              className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                              disabled={manualRunBusyFor === a.id}
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (manualRunBusyFor) return;
                                setManualRunBusyFor(a.id);
                                const res = await fetch("/api/portal/automations/run", {
                                  method: "POST",
                                  headers: { "content-type": "application/json", ...variantHeaders },
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
                          </div>
                        ) : (
                          <div className="truncate text-sm text-zinc-700" title={triggerLabel}>
                            {triggerLabel}
                          </div>
                        )}
                      </div>

                      <div className="hidden md:block md:col-span-2 min-w-0 truncate text-sm text-zinc-700" title={updatedLabel}>
                        {updatedLabel}
                      </div>

                      <div className="hidden lg:block lg:col-span-1 min-w-0 truncate text-sm text-zinc-700" title={createdLabel}>
                        {createdLabel}
                      </div>

                      <div className="col-span-1 md:col-span-2 lg:col-span-1 flex justify-end">
                        <button
                          type="button"
                          className={classNames(
                            portalGlassButtonClass,
                            "inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-700 transition-all duration-150 hover:-translate-y-0.5 hover:bg-white/80",
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleListMenu(a.id, e.currentTarget);
                          }}
                          title="Actions"
                        >
                          <DotsIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {filtered.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-start gap-3 text-sm text-zinc-600">
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              onClick={() => setListPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage <= 1}
            >
              Back
            </button>
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              onClick={() => setListPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages}
            >
              Next
            </button>
            <div>
              Page {currentPage} of {totalPages} · Showing {pageStart + 1}-{Math.min(pageStart + pageSize, filtered.length)} of {filtered.length}
            </div>
          </div>
        ) : null}

        {openListMenu ? (
          <>
            <div className="fixed inset-0 z-30" onMouseDown={() => setOpenListMenu(null)} onTouchStart={() => setOpenListMenu(null)} />
            <div
              className="fixed z-40 w-[220px]"
              style={{ left: openListMenu.left, top: openListMenu.top, maxHeight: openListMenu.maxHeight }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              {(() => {
                const a = filtered.find((x) => x.id === openListMenu.automationId);
                if (!a) return null;
                const triggerNode = (a.nodes || []).find((n: any) => n?.type === "trigger" && n?.config?.kind === "trigger") as any;
                const triggerKind = triggerNode?.config?.triggerKind as TriggerKind | undefined;
                const canManualRun = triggerKind === "manual";
                return (
                  <LiquidGlassPopupSurface
                    className="w-full p-1.5 shadow-xl"
                    overlayClassName="border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.34))] shadow-[0_24px_64px_rgba(15,23,42,0.16)] backdrop-blur-[22px]"
                  >
                    <button
                      type="button"
                      className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-zinc-900 transition-colors duration-150 hover:bg-white/16"
                      onClick={() => {
                        setOpenListMenu(null);
                        openAutomationEditorWindow(a.id);
                      }}
                    >
                      Open
                    </button>

                    <button
                      type="button"
                      className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-zinc-900 transition-colors duration-150 hover:bg-white/16"
                      onClick={() => {
                        setOpenListMenu(null);
                        togglePausedById(a.id);
                      }}
                    >
                      {a.paused ? "Resume" : "Pause"}
                    </button>

                    {canManualRun ? (
                      <button
                        type="button"
                        className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-zinc-900 transition-colors duration-150 hover:bg-white/16"
                        disabled={manualRunBusyFor === a.id}
                        onClick={async () => {
                          if (manualRunBusyFor) return;
                          setOpenListMenu(null);
                          setManualRunBusyFor(a.id);
                          const res = await fetch("/api/portal/automations/run", {
                            method: "POST",
                            headers: { "content-type": "application/json", ...variantHeaders },
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

                    <button
                      type="button"
                      className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-zinc-900 transition-colors duration-150 hover:bg-white/16"
                      onClick={() => {
                        setOpenListMenu(null);
                        const nextId = duplicateAutomationById(a.id);
                        if (nextId) openAutomationEditorWindow(nextId);
                      }}
                    >
                      Duplicate
                    </button>

                    <button
                      type="button"
                      className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-700 transition-colors duration-150 hover:bg-red-500/10"
                      onClick={() => {
                        setOpenListMenu(null);
                        deleteAutomationFromList(a.id);
                      }}
                    >
                      Delete
                    </button>
                  </LiquidGlassPopupSurface>
                );
              })()}
            </div>
          </>
        ) : null}
      </div>

      {createAutomationOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)]" onMouseDown={() => setCreateAutomationOpen(false)}>
          <LiquidGlassPopupSurface
            className="relative w-full max-w-xl overflow-hidden rounded-4xl p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
            overlayClassName="border-transparent bg-[rgba(255,255,255,0.54)] shadow-[0_24px_64px_rgba(15,23,42,0.16)] backdrop-blur-[28px]"
            showGlass={false}
            showTopGlow={false}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Create automation</div>
                <div className="mt-1 text-sm text-zinc-600">Name it now or leave it blank to default to New automation, then choose Start blank or any template.</div>
              </div>
              <button
                type="button"
                className={classNames(
                  portalGlassButtonClass,
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-full border border-white/70 bg-white/75 text-zinc-500 shadow-[0_10px_24px_rgba(15,23,42,0.1)] hover:bg-white hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/30",
                )}
                onClick={() => setCreateAutomationOpen(false)}
                aria-label="Close"
                title="Close"
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  ×
                </span>
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4">
              <div>
                <label className="text-xs font-semibold text-zinc-600">Automation name</label>
                <input
                  value={createAutomationName}
                  autoFocus
                  onChange={(e) => setCreateAutomationName(e.target.value.slice(0, 80))}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setCreateAutomationOpen(false);
                    if (e.key === "Enter") {
                      e.preventDefault();
                      createAutomationFromSelection();
                    }
                  }}
                  className="mt-1 w-full rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-300"
                  placeholder="New automation"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-600">Template</label>
                <PortalListboxDropdown
                  className="mt-1"
                  value={createAutomationTemplateId}
                  options={AUTOMATION_TEMPLATE_OPTIONS}
                  onChange={(next) => setCreateAutomationTemplateId(next)}
                  placeholder="Start blank"
                />
                {selectedCreateAutomationTemplate ? (
                  <div className="mt-2 rounded-3xl border border-white/60 bg-white/35 px-3 py-3 text-sm text-zinc-600">
                    {selectedCreateAutomationTemplate.description}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end">
              <button
                type="button"
                className="rounded-full bg-brand-blue/10 px-4 py-2 text-sm font-semibold text-(--color-brand-blue) transition hover:bg-brand-blue/15 disabled:opacity-60"
                onClick={createAutomationFromSelection}
                disabled={saving}
              >
                {selectedCreateAutomationTemplate ? "Create from template" : "Create automation"}
              </button>
            </div>
          </LiquidGlassPopupSurface>
        </div>
      ) : null}
      </>
    );
  }

  return (
    <div className={mode === "editor" ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-100/70" : "p-6"}>
      {mode === "editor" ? null : <PortalBackToOnboardingLink />}
      {mode === "editor" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/70 bg-white/80 px-4 py-3 backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className={classNames(
                portalGlassButtonClass,
                "inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-800 transition-all duration-150 hover:-translate-y-0.5 hover:bg-white/80",
              )}
              onClick={() => {
                window.location.href = String(pathname || "").startsWith("/credit")
                  ? "/credit/app/services/automations"
                  : "/portal/app/services/automations";
              }}
              aria-label="Back"
              title="Back"
            >
              <BackArrowIcon className="h-5 w-5" />
            </button>

            <div className="min-w-0">
              {selectedAutomation && inlineRenameId === selectedAutomation.id ? (
                <input
                  ref={inlineRenameInputRef}
                  value={inlineRenameValue}
                  onChange={(e) => setInlineRenameValue(e.target.value)}
                  className="w-full max-w-[520px] rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-300"
                  onBlur={() => commitInlineRename(selectedAutomation.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitInlineRename(selectedAutomation.id);
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setInlineRenameId(null);
                      setInlineRenameValue("");
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="block max-w-[520px] truncate rounded-xl border border-zinc-200/0 px-2 py-1 text-left text-lg font-bold text-brand-ink hover:border-zinc-300 hover:bg-white focus-visible:border-zinc-300 focus-visible:ring-2 focus-visible:ring-blue-200"
                  onClick={() => {
                    if (!selectedAutomation) return;
                    startInlineRename(selectedAutomation.id);
                  }}
                  title="Click to rename"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate">{selectedAutomation?.name ?? "Automation"}</span>
                  </span>
                </button>
              )}
            </div>

            <div className="ml-1 flex items-center gap-1">
              <button
                type="button"
                className={classNames(
                  portalGlassButtonClass,
                  "inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 transition-all duration-150 hover:-translate-y-0.5 hover:bg-white/80 hover:text-zinc-900 disabled:opacity-40",
                )}
                onClick={() => undoSelectedAutomation()}
                disabled={!canUndo || saving || !selectedAutomation}
                aria-label="Undo"
                title="Undo"
              >
                <IconUndo size={16} />
              </button>
              <button
                type="button"
                className={classNames(
                  portalGlassButtonClass,
                  "inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 transition-all duration-150 hover:-translate-y-0.5 hover:bg-white/80 hover:text-zinc-900 disabled:opacity-40",
                )}
                onClick={() => redoSelectedAutomation()}
                disabled={!canRedo || saving || !selectedAutomation}
                aria-label="Redo"
                title="Redo"
              >
                <IconRedo size={16} />
              </button>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <div className="mr-2 hidden flex-col items-end sm:flex">
              <div className="text-xs font-semibold text-zinc-700">{saving ? "Saving…" : dirty ? "Autosaving…" : "Saved"}</div>
              <div className="text-xs text-zinc-500">{lastSavedAtIso ? `Last saved ${new Date(lastSavedAtIso).toLocaleTimeString()}` : ""}</div>
            </div>
            <button
              type="button"
              className={classNames(
                portalGlassButtonClass,
                "rounded-2xl px-3 py-2 text-sm font-semibold text-zinc-700 transition-all duration-150 hover:-translate-y-0.5 hover:bg-white/80 disabled:opacity-60",
              )}
              onClick={() => openTestModal()}
              disabled={testing || !selectedAutomation}
            >
              Test
            </button>
            {selectedAutomation ? (
              <button
                type="button"
                className={
                  "rounded-2xl px-3 py-2 text-sm font-semibold transition disabled:opacity-60 " +
                  (selectedAutomation.paused
                    ? "bg-amber-50 text-amber-800 hover:bg-amber-100"
                    : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100")
                }
                onClick={() => {
                  const nextPaused = !Boolean(selectedAutomation.paused);
                  updateSelectedAutomation((a) => ({ ...a, paused: nextPaused, updatedAtIso: new Date().toISOString() }));
                  setDirty(true);
                }}
                disabled={saving}
                title={selectedAutomation.paused ? "Resume this automation" : "Pause this automation"}
              >
                {selectedAutomation.paused ? "Paused" : "Active"}
              </button>
            ) : null}
            <button
              type="button"
              className="ml-1 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              onClick={() => void saveAll()}
              disabled={saving || !dirty}
            >
              {saving ? "Saving…" : dirty ? "Save" : "Saved"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Automation Builder</h1>
            <div className="mt-1 text-sm text-zinc-600">Drag triggers + steps, connect them, and save multiple automations.</div>
          </div>
        </div>
      )}

      {note ? <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{note}</div> : null}

      <PortalVariablePickerModal
        open={variablePickerOpen}
        variables={automationVariablePickerVariables}
        createCustom={{ enabled: true, existingKeys: knownContactCustomVarKeys, allowContactPick: true }}
        onPick={applyPickedVariable}
        onClose={() => {
          setVariablePickerOpen(false);
          setVariablePickerTarget(null);
        }}
      />

      {confirm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)]"
          onMouseDown={() => {
            if (confirmBusy) return;
            setConfirm(null);
          }}
        >
          <LiquidGlassPopupSurface
            className="relative w-full max-w-lg max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] overflow-y-auto rounded-[2rem] p-4 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
            overlayClassName="border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.76),rgba(255,255,255,0.42))] shadow-[0_24px_64px_rgba(15,23,42,0.16)] backdrop-blur-[24px]"
            showTopGlow={false}
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
                className={classNames(
                  portalGlassButtonClass,
                  "inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/75 text-zinc-500 shadow-[0_10px_24px_rgba(15,23,42,0.1)] hover:bg-white hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/30 disabled:pointer-events-none disabled:opacity-60",
                )}
                onClick={() => setConfirm(null)}
                disabled={confirmBusy}
                aria-label="Close"
                title="Close"
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  ×
                </span>
              </button>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                onClick={() => void runConfirm()}
                disabled={confirmBusy}
              >
                {confirmBusy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </LiquidGlassPopupSurface>
        </div>
      ) : null}

      {renameOpen && selectedAutomation ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)]" onMouseDown={() => setRenameOpen(false)}>
          <LiquidGlassPopupSurface
            className="relative w-full max-w-lg max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] overflow-y-auto rounded-[2rem] p-4 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
            overlayClassName="border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.76),rgba(255,255,255,0.42))] shadow-[0_24px_64px_rgba(15,23,42,0.16)] backdrop-blur-[24px]"
            showTopGlow={false}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Rename automation</div>
                <div className="mt-1 text-sm text-zinc-600">Update the name shown in the left panel.</div>
              </div>
              <button
                type="button"
                className={classNames(
                  portalGlassButtonClass,
                  "inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/75 text-zinc-500 shadow-[0_10px_24px_rgba(15,23,42,0.1)] hover:bg-white hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/30",
                )}
                onClick={() => setRenameOpen(false)}
                aria-label="Close"
                title="Close"
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  ×
                </span>
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
                className="rounded-full bg-brand-blue/10 px-4 py-2 text-sm font-semibold text-(--color-brand-blue) transition hover:bg-brand-blue/15 disabled:opacity-60"
                onClick={() => {
                  applyRename(renameValue);
                  setRenameOpen(false);
                }}
                disabled={!String(renameValue || "").trim() || saving}
              >
                Save
              </button>
            </div>
          </LiquidGlassPopupSurface>
        </div>
      ) : null}

      {testOpen && selectedAutomation ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)]" onMouseDown={() => setTestOpen(false)}>
          <LiquidGlassPopupSurface
            className="relative max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] w-full max-w-lg overflow-hidden rounded-4xl p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
            overlayClassName="border-transparent bg-[rgba(255,255,255,0.54)] shadow-[0_24px_64px_rgba(15,23,42,0.16)] backdrop-blur-[28px]"
            showGlass={false}
            showTopGlow={false}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">{testTriggerMeta.title}</div>
                <div className="mt-1 text-sm text-zinc-600">{testTriggerMeta.description}</div>
              </div>
              <button
                type="button"
                className={classNames(
                  portalGlassButtonClass,
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-full border border-white/70 bg-white/75 text-zinc-500 shadow-[0_10px_24px_rgba(15,23,42,0.1)] hover:bg-white hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/30",
                )}
                onClick={() => setTestOpen(false)}
                aria-label="Close"
                title="Close"
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  ×
                </span>
              </button>
            </div>

            <div className="mt-4 grid max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-12rem)] grid-cols-1 gap-3 overflow-y-auto pr-1">
              {selectedAutomationTriggerKind === "tag_added" ? (
                <div>
                  <label className="text-xs font-semibold text-zinc-600">Added tag</label>
                  <PortalListboxDropdown
                    className="mt-1"
                    value={testTagId as string}
                    options={[
                      { value: TEST_ANY_TAG_VALUE, label: "Any tag added" },
                      ...ownerTags.map((tag) => ({ value: tag.id, label: tag.name })),
                    ]}
                    onChange={(next) => setTestTagId(next)}
                    placeholder="Any tag added"
                  />
                </div>
              ) : null}

              {selectedAutomationTriggerKind === "form_submitted" ? (
                <>
                  <div>
                    <label className="text-xs font-semibold text-zinc-600">Submitted form</label>
                    <PortalListboxDropdown
                      className="mt-1"
                      value={testFormId as string}
                      options={ownerForms.map((form) => ({ value: form.id, label: form.name ? `${form.name} (${form.slug})` : form.slug || form.id }))}
                      onChange={(next) => setTestFormId(next)}
                      placeholder="Select a form"
                    />
                  </div>
                  {selectedTestFormFields.length ? (
                    <div className="space-y-3 rounded-3xl border border-white/60 bg-white/35 p-3">
                      <div className="text-xs font-semibold text-zinc-600">Demo responses</div>
                      {selectedTestFormFields.map((field) => (
                        <div key={field.key}>
                          <label className="text-xs font-semibold text-zinc-600">{field.label || field.key}</label>
                          <input
                            value={testFormResponses[field.key] || ""}
                            onChange={(e) => setTestFormResponses((prev) => ({ ...prev, [field.key]: e.target.value }))}
                            className="mt-1 w-full rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-300"
                            placeholder={demoValueForFormField(field)}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-dashed border-white/60 bg-white/30 px-3 py-3 text-sm text-zinc-600">
                      No saved demo fields found for this form yet.
                    </div>
                  )}
                </>
              ) : null}

              {selectedAutomationTriggerKind === "scheduled_time" ? (
                <div className="space-y-3 rounded-3xl border border-white/60 bg-white/35 p-3">
                  <div>
                    <label className="text-xs font-semibold text-zinc-600">Test time</label>
                    <PortalListboxDropdown
                      className="mt-1"
                      value={testScheduleMode}
                      options={[
                        { value: "trigger", label: "Use trigger time" },
                        { value: "custom", label: "Choose another time" },
                      ]}
                      onChange={(next) => setTestScheduleMode(next as "trigger" | "custom")}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-600">Date</label>
                    <input
                      type="date"
                      value={testScheduleDate}
                      onChange={(e) => setTestScheduleDate(e.target.value)}
                      className="mt-1 w-full rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-300"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-600">Time</label>
                    <LocalTimePicker value={testScheduleMode === "trigger" ? String((selectedTriggerConfig as any)?.specificTime || testScheduleTime || "09:00") : testScheduleTime} onChange={setTestScheduleTime} />
                  </div>
                </div>
              ) : null}

              {selectedAutomationTriggerKind === "inbound_webhook" ? (
                <div>
                  <label className="text-xs font-semibold text-zinc-600">Webhook key</label>
                  <input
                    value={testWebhookKey}
                    onChange={(e) => setTestWebhookKey(e.target.value.slice(0, 200))}
                    className="mt-1 w-full rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-300"
                    placeholder="test-webhook"
                  />
                </div>
              ) : null}

              {(selectedAutomationTriggerKind === "appointment_booked" || selectedAutomationTriggerKind === "appointment_ended" || selectedAutomationTriggerKind === "missed_appointment") ? (
                <div>
                  <label className="text-xs font-semibold text-zinc-600">Calendar</label>
                  <PortalListboxDropdown
                    className="mt-1"
                    value={testCalendarId as string}
                    options={bookingCalendars.map((calendar) => ({ value: calendar.id, label: calendar.title }))}
                    onChange={(next) => setTestCalendarId(next)}
                    placeholder="Select a calendar"
                  />
                </div>
              ) : null}

              {testTriggerMeta.showFrom ? (
                <div>
                  <label className="text-xs font-semibold text-zinc-600">{testTriggerMeta.fromLabel}</label>
                  <input
                    value={testFrom}
                    autoFocus
                    onChange={(e) => setTestFrom(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setTestOpen(false);
                    }}
                    className="mt-1 w-full rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-300"
                    placeholder={testTriggerMeta.fromPlaceholder}
                  />
                </div>
              ) : null}
              {testTriggerMeta.showBody ? (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-xs font-semibold text-zinc-600">{testTriggerMeta.bodyLabel}</label>
                    <button
                      type="button"
                      className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-white/90"
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
                    className="mt-1 min-h-[110px] w-full resize-y rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-300"
                    placeholder={testTriggerMeta.bodyPlaceholder}
                  />
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex items-center justify-end">
              <button
                type="button"
                className="rounded-full bg-brand-blue/10 px-4 py-2 text-sm font-semibold text-(--color-brand-blue) transition hover:bg-brand-blue/15 disabled:opacity-60"
                onClick={() => void runTestAutomation()}
                disabled={
                  (testTriggerMeta.showFrom && !String(testFrom || "").trim()) ||
                  (selectedAutomationTriggerKind === "tag_added" && !String(testTagId || "").trim()) ||
                  (selectedAutomationTriggerKind === "form_submitted" && !testFormId) ||
                  (selectedAutomationTriggerKind === "inbound_webhook" && !String(testWebhookKey || "").trim()) ||
                  ((selectedAutomationTriggerKind === "appointment_booked" || selectedAutomationTriggerKind === "appointment_ended" || selectedAutomationTriggerKind === "missed_appointment") && !testCalendarId) ||
                  (selectedAutomationTriggerKind === "scheduled_time" && !(testScheduleMode === "trigger" ? String((selectedTriggerConfig as any)?.specificTime || testScheduleTime || "").trim() : combineDateAndTime(testScheduleDate, testScheduleTime))) ||
                  testing
                }
              >
                {testing ? "Running…" : "Run test"}
              </button>
            </div>
          </LiquidGlassPopupSurface>
        </div>
      ) : null}

      {createAutomationOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)]" onMouseDown={() => setCreateAutomationOpen(false)}>
          <LiquidGlassPopupSurface
            className="relative w-full max-w-xl overflow-hidden rounded-4xl p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
            overlayClassName="border-transparent bg-[rgba(255,255,255,0.54)] shadow-[0_24px_64px_rgba(15,23,42,0.16)] backdrop-blur-[28px]"
            showGlass={false}
            showTopGlow={false}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Create automation</div>
                <div className="mt-1 text-sm text-zinc-600">Name it now or leave it blank to default to New automation, then choose Start blank or any template.</div>
              </div>
              <button
                type="button"
                className={classNames(
                  portalGlassButtonClass,
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-full border border-white/70 bg-white/75 text-zinc-500 shadow-[0_10px_24px_rgba(15,23,42,0.1)] hover:bg-white hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/30",
                )}
                onClick={() => setCreateAutomationOpen(false)}
                aria-label="Close"
                title="Close"
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  ×
                </span>
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4">
              <div>
                <label className="text-xs font-semibold text-zinc-600">Automation name</label>
                <input
                  value={createAutomationName}
                  autoFocus
                  onChange={(e) => setCreateAutomationName(e.target.value.slice(0, 80))}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setCreateAutomationOpen(false);
                    if (e.key === "Enter") {
                      e.preventDefault();
                      createAutomationFromSelection();
                    }
                  }}
                  className="mt-1 w-full rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-300"
                  placeholder="New automation"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-600">Template</label>
                <PortalListboxDropdown
                  className="mt-1"
                  value={createAutomationTemplateId}
                  options={AUTOMATION_TEMPLATE_OPTIONS}
                  onChange={(next) => setCreateAutomationTemplateId(next)}
                  placeholder="Start blank"
                />
                {selectedCreateAutomationTemplate ? (
                  <div className="mt-2 rounded-3xl border border-white/60 bg-white/35 px-3 py-3 text-sm text-zinc-600">
                    {selectedCreateAutomationTemplate.description}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end">
              <button
                type="button"
                className="rounded-full bg-brand-blue/10 px-4 py-2 text-sm font-semibold text-(--color-brand-blue) transition hover:bg-brand-blue/15 disabled:opacity-60"
                onClick={createAutomationFromSelection}
                disabled={saving}
              >
                {selectedCreateAutomationTemplate ? "Create from template" : "Create automation"}
              </button>
            </div>
          </LiquidGlassPopupSurface>
        </div>
      ) : null}

      <CreateContactTagDialog
        open={createTagOpen}
        onClose={() => {
          setCreateTagOpen(false);
          setCreateTagApplyTo(null);
        }}
        onCreate={createOwnerTag}
        onCreated={async (created) => {
          applyCreatedTagToSelection(created);
          setCreateTagApplyTo(null);
        }}
      />

      {libraryOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)]"
          onMouseDown={() => {
            setLibraryOpen(false);
            setLibraryMenuFor(null);
          }}
        >
          <LiquidGlassPopupSurface
            className="relative w-full max-w-2xl max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] overflow-y-auto rounded-4xl p-4 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
            overlayClassName="border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.76),rgba(255,255,255,0.42))] shadow-[0_24px_64px_rgba(15,23,42,0.16)] backdrop-blur-[24px]"
            showTopGlow={false}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">All automations</div>
                <div className="mt-1 text-sm text-zinc-600">Click an automation to edit it. Use the menu for edit or delete.</div>
              </div>
              <button
                type="button"
                className={classNames(
                  portalGlassButtonClass,
                  "inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/75 text-zinc-500 shadow-[0_10px_24px_rgba(15,23,42,0.1)] hover:bg-white hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/30",
                )}
                onClick={() => {
                  setLibraryOpen(false);
                  setLibraryMenuFor(null);
                }}
                aria-label="Close"
                title="Close"
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  ×
                </span>
              </button>
            </div>

            {libraryMenuFor ? (
              <div
                className="fixed inset-0 z-40"
                onMouseDown={() => setLibraryMenuFor(null)}
                onTouchStart={() => setLibraryMenuFor(null)}
              />
            ) : null}

            <div className="mt-4 space-y-2">
              {automations.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                  No automations yet.
                </div>
              ) : (
                automations.map((a) => {
                  const isSel = a.id === selectedAutomationId;
                  const isPaused = Boolean((a as any).paused);
                  const triggerNode = (a.nodes || []).find((n: any) => n?.type === "trigger" && n?.config?.kind === "trigger") as any;
                  const triggerKind = triggerNode?.config?.triggerKind as TriggerKind | undefined;
                  const canManualRun = triggerKind === "manual";
                  return (
                    <div
                      key={a.id}
                      className={
                        "flex items-center justify-between gap-3 rounded-2xl border px-3 py-3 " +
                        (isSel ? "border-brand-ink bg-brand-ink text-white" : "border-zinc-200 bg-white")
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
                          {isPaused ? " · Paused" : ""}
                        </div>
                      </button>

                      <button
                        type="button"
                        className={
                          "rounded-xl px-3 py-2 text-xs font-semibold " +
                          (isSel
                            ? "bg-white/10 text-white hover:bg-white/15"
                            : "border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50")
                        }
                        onClick={() => {
                          setAutomations((prev) =>
                            prev.map((x) =>
                              x.id !== a.id
                                ? x
                                : {
                                    ...x,
                                    paused: !Boolean((x as any).paused),
                                    updatedAtIso: new Date().toISOString(),
                                  },
                            ),
                          );
                          setDirty(true);
                        }}
                        title={isPaused ? "Resume this automation" : "Pause this automation"}
                      >
                        {isPaused ? "Resume" : "Pause"}
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
                              headers: { "content-type": "application/json", ...variantHeaders },
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
                          className={classNames(
                            portalGlassButtonClass,
                            "rounded-xl px-2 py-1 text-xs font-semibold text-zinc-700 transition-all duration-150 hover:-translate-y-0.5 hover:bg-white/80",
                            libraryMenuFor?.automationId === a.id ? "bg-[rgba(191,219,254,0.8)] text-brand-blue" : "",
                            isSel && libraryMenuFor?.automationId !== a.id ? "text-zinc-900" : "",
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLibraryMenu(a.id, e.currentTarget);
                          }}
                          title="Actions"
                        >
                          ⋯
                        </button>

                        {libraryMenuFor?.automationId === a.id ? (
                          <LiquidGlassPopupSurface
                            className="fixed z-40 w-40 p-1.5 shadow-xl"
                            style={{ left: libraryMenuFor.left, top: libraryMenuFor.top, maxHeight: libraryMenuFor.maxHeight }}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-zinc-900 transition-colors duration-150 hover:bg-white/16"
                              onClick={() => {
                                setSelectedAutomation(a.id);
                                setLibraryOpen(false);
                                setLibraryMenuFor(null);
                              }}
                              aria-label="Edit"
                              title="Edit"
                            >
                              <span className="inline-flex items-center" aria-hidden="true">
                                <IconEdit size={16} />
                              </span>
                              <span className="sr-only">Edit</span>
                            </button>
                            <button
                              type="button"
                              className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-zinc-900 transition-colors duration-150 hover:bg-white/16"
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
                              className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-zinc-900 transition-colors duration-150 hover:bg-white/16"
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
                              className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-700 transition-colors duration-150 hover:bg-red-500/10"
                              onClick={() => {
                                setLibraryMenuFor(null);
                                void deleteAutomationById(a.id);
                              }}
                            >
                              Delete
                            </button>
                          </LiquidGlassPopupSurface>
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
                onClick={openCreateAutomationModal}
              >
                + New
              </button>
            </div>
          </LiquidGlassPopupSurface>
        </div>
      ) : null}

  {mode === "editor" ? null : (
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
              onClick={openCreateAutomationModal}
            >
              + New
            </button>

            {selectedAutomation ? (
              <button
                type="button"
                className={
                  "rounded-2xl px-3 py-2 text-sm font-semibold " +
                  (selectedAutomation.paused
                    ? "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                    : "bg-amber-50 text-amber-800 hover:bg-amber-100")
                }
                onClick={() => {
                  const nextPaused = !Boolean(selectedAutomation.paused);
                  updateSelectedAutomation((a) => ({ ...a, paused: nextPaused, updatedAtIso: new Date().toISOString() }));
                  setDirty(true);
                }}
                title={selectedAutomation.paused ? "Resume this automation" : "Pause this automation"}
              >
                {selectedAutomation.paused ? "Paused (click to resume)" : "Active (click to pause)"}
              </button>
            ) : null}
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
              disabled={saving || !dirty}
            >
              {saving ? "Saving…" : dirty ? "Save" : "Saved"}
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
              disabled={!selectedAutomation}
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
                    <div className={badgeChipClass(x.type)}>{b.label}</div>
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
      )}

      <div className={mode === "editor" ? "flex min-h-0 flex-1 flex-col" : "mt-4"}>
        <div className={mode === "editor" ? "flex min-h-0 flex-1 flex-col" : "rounded-3xl border border-zinc-200 bg-white p-4"}>
            {mode === "editor" ? null : (
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Canvas</div>
                <div className="mt-1 text-sm text-zinc-600">Connect nodes by dragging from the right handle to the left handle.</div>
              </div>
            </div>
            )}

            {!selectedAutomation ? (
              <div className={classNames("text-sm text-zinc-600", mode === "editor" ? "m-6 rounded-3xl border border-dashed border-zinc-200 bg-white/80 p-6" : "mt-4 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4")}>
                Create an automation to start.
              </div>
            ) : (
              <div
                ref={canvasRef}
                className={classNames(
                  "relative w-full overflow-hidden",
                  mode === "editor"
                    ? "flex-1 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(244,244,245,0.92))]"
                    : "mt-4 h-[660px] rounded-2xl border border-zinc-200 bg-white",
                )}
                style={{
                  backgroundImage: "radial-gradient(#0f172a12 1px, transparent 1px)",
                  backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`,
                  backgroundPosition: `${view.panX}px ${view.panY}px`,
                  overscrollBehavior: "auto",
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

                  if (ev.pointerType === "touch") {
                    activePointersRef.current.set(ev.pointerId, { clientX: ev.clientX, clientY: ev.clientY });
                    if (activePointersRef.current.size === 2) pinchRef.current = null;
                  }
                  setSelectedNodeId(null);
                  if (mode === "editor") setInspectorOpen(false);

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
                            <div className={badgeChipClass(n.type)}>{n.type}</div>
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
                  className="absolute right-3 top-3 z-30 flex items-center gap-2 rounded-2xl bg-white/80 px-2 py-1 text-xs text-zinc-700 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl"
                  onPointerDown={(ev) => ev.stopPropagation()}
                >
                  <button
                    type="button"
                    className={classNames(portalGlassButtonClass, "rounded-xl px-2 py-1 font-semibold text-zinc-800 hover:bg-white/80")}
                    onClick={() => setView((prev) => ({ ...prev, zoom: clampZoom(prev.zoom / 1.1) }))}
                    title="Zoom out"
                  >
                    −
                  </button>
                  <div className="min-w-[52px] text-center font-semibold">{Math.round(view.zoom * 100)}%</div>
                  <button
                    type="button"
                    className={classNames(portalGlassButtonClass, "rounded-xl px-2 py-1 font-semibold text-zinc-800 hover:bg-white/80")}
                    onClick={() => setView((prev) => ({ ...prev, zoom: clampZoom(prev.zoom * 1.1) }))}
                    title="Zoom in"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className={classNames(portalGlassButtonClass, "ml-1 rounded-xl px-2 py-1 font-semibold text-zinc-800 hover:bg-white/80")}
                    onClick={() => setView({ panX: mode === "editor" ? 420 : 80, panY: 80, zoom: 1 })}
                    title="Reset view"
                  >
                    Reset
                  </button>
                </div>

                {mode === "editor" && !inspectorOpen ? (
                  <div
                    data-kind="ui"
                    className="absolute left-0 top-0 z-30 h-full w-[360px] overflow-auto bg-white/82 p-3 shadow-[0_24px_80px_rgba(15,23,42,0.14)] backdrop-blur-xl"
                    onPointerDown={(ev) => ev.stopPropagation()}
                    onWheel={(ev) => ev.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-zinc-900">Palette</div>
                        <div className="mt-0.5 text-xs text-zinc-600">Drag onto the canvas.</div>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2">
                      {([
                        { type: "trigger" as const, title: "Trigger" },
                        { type: "action" as const, title: "Action" },
                        { type: "condition" as const, title: "Condition" },
                        { type: "delay" as const, title: "Delay" },
                        { type: "note" as const, title: "Note" },
                      ] as const).map((x) => {
                        const b = badgeForType(x.type);
                        const disabled =
                          x.type === "trigger" &&
                          Boolean(selectedAutomation && (selectedAutomation.nodes || []).some((n) => n.type === "trigger"));
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
                              "rounded-2xl border border-zinc-200 px-3 py-2 " +
                              (disabled
                                ? "cursor-not-allowed bg-zinc-50 opacity-60"
                                : "cursor-grab bg-zinc-50 hover:bg-zinc-100 active:cursor-grabbing")
                            }
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-semibold text-zinc-900">{x.title}</div>
                              <div className={badgeChipClass(x.type)}>{b.label}</div>
                            </div>
                            <div className="mt-0.5 text-xs text-zinc-600">
                              {disabled ? "Trigger already set (only one allowed)." : `Drop to add a ${x.title.toLowerCase()} node.`}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {inspectorOpen ? (
                  <div
                    data-kind="ui"
                    className={
                      mode === "editor"
                        ? "absolute left-0 top-0 z-30 h-full w-[360px] overflow-auto bg-white/82 p-3 shadow-[0_24px_80px_rgba(15,23,42,0.14)] backdrop-blur-xl"
                        : "absolute left-3 top-3 z-30 w-[360px] max-w-[calc(100%-1.5rem)] rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-lg backdrop-blur"
                    }
                    onPointerDown={(ev) => ev.stopPropagation()}
                    onWheel={(ev) => ev.stopPropagation()}
                  >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-zinc-900">Inspector</div>
                    </div>
                    <button
                      type="button"
                      className={classNames(
                        portalGlassButtonClass,
                        "inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold leading-none text-zinc-700 hover:bg-white/80 touch-manipulation",
                      )}
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

                  {!selectedNode ? null : (
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
                                { value: "form_submitted", label: "Form submitted" },
                                { value: "new_lead", label: "New Lead" },
                                { value: "lead_scraped", label: "Lead scraped" },
                                { value: "tag_added", label: "Tag added" },
                                { value: "contact_created", label: "Contact created" },
                                { value: "task_added", label: "Task added" },
                                { value: "inbound_webhook", label: "Inbound webhook" },
                                { value: "scheduled_time", label: "Scheduler / time" },
                                { value: "missed_appointment", label: "Missed appointment" },
                                { value: "appointment_ended", label: "Appointment ended" },
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

                              if (cfg.triggerKind === "form_submitted") {
                                const formId = String((cfg as any).formId || "");
                                const options = [
                                  { value: "", label: "Any form…" },
                                  ...ownerForms.map((f) => ({
                                    value: f.id,
                                    label: f.name ? `${f.name} (${f.slug})` : f.slug || f.id,
                                  })),
                                ];

                                return (
                                  <div className="mt-2">
                                    <div className="text-xs font-semibold text-zinc-600">Only when form is</div>
                                    <PortalListboxDropdown
                                      className="mt-1"
                                      value={formId}
                                      options={options}
                                      onChange={(next) => {
                                        updateSelectedAutomation((a) => {
                                          const nodes = a.nodes.map((n) => {
                                            if (n.id !== selectedNode.id) return n;
                                            const prev = n.config?.kind === "trigger" ? n.config : (defaultConfigForType("trigger") as any);
                                            const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "trigger", formId: next || undefined };
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

                              if (
                                cfg.triggerKind === "appointment_booked" ||
                                cfg.triggerKind === "appointment_ended" ||
                                cfg.triggerKind === "missed_appointment"
                              ) {
                                const calendarId = String((cfg as any).calendarId || "").trim();
                                const options = [
                                  { value: "", label: "Any calendar…" },
                                  ...bookingCalendars.map((c) => ({
                                    value: c.id,
                                    label: c.enabled === false ? `${c.title} (disabled)` : c.title,
                                  })),
                                ];

                                return (
                                  <div className="mt-2">
                                    <div className="text-xs font-semibold text-zinc-600">Only when calendar is</div>
                                    <PortalListboxDropdown
                                      className="mt-1"
                                      value={calendarId}
                                      options={options}
                                      onChange={(next) => {
                                        updateSelectedAutomation((a) => {
                                          const nodes = a.nodes.map((n) => {
                                            if (n.id !== selectedNode.id) return n;
                                            const prev = n.config?.kind === "trigger" ? n.config : (defaultConfigForType("trigger") as any);
                                            const nextCfg: BuilderNodeConfig = { ...(prev as any), kind: "trigger", calendarId: next || undefined };
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
                                    {!bookingCalendars.length ? (
                                      <div className="mt-1 text-[11px] text-zinc-600">
                                        No calendars found yet. Create one in Booking → Calendars.
                                      </div>
                                    ) : null}
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
                                          <LocalTimePicker
                                            value={specificTime}
                                            onChange={(v) => {
                                              const nextTime = String(v || "09:00").slice(0, 5);
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
                                            buttonClassName="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-left text-sm hover:bg-zinc-50"
                                            placeholder="Select time"
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
                                { value: "create_contact", label: "Create Contact" },
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
                                const tagMode = String((cfg as any).tagMode || (tagId ? "all" : "latest")).trim();
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

                              if (cfg.actionKind === "update_contact" || cfg.actionKind === "create_contact") {
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

                                      <div className="mt-1 text-[11px] text-zinc-600">
                                        {cfg.actionKind === "create_contact"
                                          ? "Creates (or reuses) a contact. Phone number de-dupes contacts."
                                          : "Updates the current event contact."}
                                      </div>
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

                            const isKnownField = allConditionFieldKeys.includes(leftKey);
                            const fieldDropdownValue = isKnownField ? leftKey : "__custom__";
                            const numericOps: ConditionOp[] = ["gt", "gte", "lt", "lte"];
                            const dateOps: ConditionOp[] = ["before", "after"];
                            const expectsNumber = numericOps.includes(op) || leftKey === "now.hour" || leftKey === "now.weekday";
                            const expectsDate =
                              dateOps.includes(op) ||
                              leftKey.endsWith("AtIso") ||
                              leftKey.endsWith("createdAtIso") ||
                              leftKey.endsWith("now.iso") ||
                              leftKey.endsWith("now.date") ||
                              leftKey.endsWith("Date");

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
                                        ...formConditionFieldOptions,
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
                                    {allConditionFieldKeys.map((k) => (
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
                                    { value: "before", label: "Before (date/time)" },
                                    { value: "after", label: "After (date/time)" },
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
                                      placeholder={expectsNumber ? "Number" : expectsDate ? "YYYY-MM-DD or ISO timestamp" : "Value"}
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
                          className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                          onClick={deleteSelectedNode}
                        >
                          Delete node
                        </button>
                      </div>
                    </div>
                  )}
                  </div>
                ) : null}

                <div className="absolute bottom-20 right-3 rounded-2xl bg-white/82 px-3 py-2 text-xs text-zinc-600 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:bottom-24">
                  Tip: double-click a dot to remove a connection.
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
