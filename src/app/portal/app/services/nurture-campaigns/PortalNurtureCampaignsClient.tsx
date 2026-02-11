"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { PortalVariablePickerModal } from "@/components/PortalVariablePickerModal";
import { PortalMediaPickerModal, type PortalMediaPickItem } from "@/components/PortalMediaPickerModal";
import { DEFAULT_TAG_COLORS } from "@/lib/tagColors.shared";
import { PORTAL_LINK_VARIABLES, PORTAL_MESSAGE_VARIABLES } from "@/lib/portalTemplateVars";

type CampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";

type CampaignListRow = {
  id: string;
  name: string;
  status: CampaignStatus;
  createdAtIso: string;
  updatedAtIso: string;
  stepsCount: number;
  enrollments: { active: number; completed: number; stopped: number };
};

type StepKind = "SMS" | "EMAIL";

type StepRow = {
  id: string;
  ord: number;
  kind: StepKind;
  delayMinutes: number;
  subject: string | null;
  body: string;
  updatedAtIso: string;
};

type CampaignDetail = {
  id: string;
  name: string;
  status: CampaignStatus;
  audienceTagIds: string[];
  smsFooter: string;
  emailFooter: string;
  createdAtIso: string;
  updatedAtIso: string;
  steps: StepRow[];
};

type ContactTag = { id: string; name: string; color: string | null };

type TagsRes = { ok: true; tags: ContactTag[] } | { ok: false; error?: string };

type ListRes = { ok: true; campaigns: CampaignListRow[] } | { ok: false; error?: string };

type DetailRes = { ok: true; campaign: CampaignDetail } | { ok: false; error?: string };

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : "";
}

function pillStyle(color: string | null) {
  const bg = color ? `${color}20` : "#0f172a12";
  const border = color ? `${color}40` : "#0f172a22";
  const text = color || "#0f172a";
  return { backgroundColor: bg, borderColor: border, color: text } as const;
}

function bestUnit(minutes: number): { unit: "minutes" | "hours" | "days"; value: number } {
  const m = Math.max(0, Number(minutes) || 0);
  if (m % (60 * 24) === 0) return { unit: "days", value: m / (60 * 24) };
  if (m % 60 === 0) return { unit: "hours", value: m / 60 };
  return { unit: "minutes", value: m };
}

function toMinutes(value: number, unit: "minutes" | "hours" | "days") {
  const v = Math.max(0, Math.floor(Number(value) || 0));
  if (unit === "days") return v * 60 * 24;
  if (unit === "hours") return v * 60;
  return v;
}

type NurtureTemplate = {
  id: string;
  title: string;
  description: string;
  steps: Array<{ kind: StepKind; delayMinutes: number; subject?: string; body: string }>;
};

const NURTURE_TEMPLATES: NurtureTemplate[] = [
  {
    id: "quick-checkin",
    title: "Quick check-in (3 steps)",
    description: "Short follow-up sequence: day 0, day 2, day 5.",
    steps: [
      {
        kind: "SMS",
        delayMinutes: 0,
        body: "Hey {contact.firstName} — quick question. Want help getting this set up? – {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 2,
        body: "Just bumping this, {contact.firstName}. Should I send details or hop on a quick call?",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 5,
        subject: "Quick question",
        body: "Hi {contact.name},\n\nJust checking in — do you want help getting this set up?\n\nIf it’s easier, reply with the best time today/tomorrow.\n\n– {business.name}",
      },
    ],
  },
  {
    id: "welcome-onboarding",
    title: "Welcome + onboarding (5 steps)",
    description: "Welcomes the lead, sets expectations, and nudges to reply.",
    steps: [
      {
        kind: "EMAIL",
        delayMinutes: 0,
        subject: "Welcome — next steps",
        body: "Hi {contact.firstName},\n\nWelcome — excited to help. Here’s what happens next:\n\n1) We confirm your goals\n2) We set up the workflow\n3) You get results and reporting\n\nReply with your top priority and we’ll start there.\n\n– {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 6,
        body: "Hey {contact.firstName} — I emailed next steps. What’s your #1 goal right now?",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24,
        body: "Quick ping {contact.firstName} — want me to set this up for you this week?",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 3,
        subject: "Should I close this out?",
        body: "Hi {contact.firstName},\n\nTotally fine if now isn’t the right time — should I close this out for now?\n\nIf you still want help, reply with ‘yes’ and I’ll send 2–3 quick questions.\n\n– {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 7,
        body: "Last one from me, {contact.firstName}. Still want help with this or should I close it out?",
      },
    ],
  },
  {
    id: "appointment-push",
    title: "Book an appointment (4 steps)",
    description: "Drives toward scheduling a quick call.",
    steps: [
      {
        kind: "SMS",
        delayMinutes: 0,
        body: "Hey {contact.firstName} — want to book 10 minutes so I can set this up for you?",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24,
        subject: "10 minutes this week?",
        body: "Hi {contact.firstName},\n\nDo you have 10 minutes this week for a quick setup call?\n\nReply with two times that work and I’ll confirm.\n\n– {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 2,
        body: "What’s better — today or tomorrow? I can make time, {contact.firstName}.",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 5,
        body: "Still want to book a quick call, {contact.firstName}, or should I pause?",
      },
    ],
  },
  {
    id: "email-only",
    title: "Email follow-ups only (3 steps)",
    description: "Simple email-only cadence.",
    steps: [
      {
        kind: "EMAIL",
        delayMinutes: 0,
        subject: "Quick question",
        body: "Hi {contact.firstName},\n\nQuick question — what are you trying to accomplish right now?\n\n– {business.name}",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 2,
        subject: "Bumping this",
        body: "Hi {contact.firstName},\n\nJust bumping this — do you want help getting this set up?\n\n– {business.name}",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24 * 7,
        subject: "Close the loop?",
        body: "Hi {contact.firstName},\n\nShould I close this out for now? If you still want help, reply with ‘yes’.\n\n– {business.name}",
      },
    ],
  },
  {
    id: "reactivation",
    title: "Reactivation (4 steps)",
    description: "For older leads that went quiet.",
    steps: [
      {
        kind: "SMS",
        delayMinutes: 0,
        body: "Hey {contact.firstName} — circling back. Still want help with this?",
      },
      {
        kind: "EMAIL",
        delayMinutes: 60 * 24,
        subject: "Still want help?",
        body: "Hi {contact.firstName},\n\nJust checking in — do you still want help getting this set up?\n\nIf not, no worries — just reply ‘stop’.\n\n– {business.name}",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 3,
        body: "Last check-in, {contact.firstName}. Want me to help or should I close it out?",
      },
      {
        kind: "SMS",
        delayMinutes: 60 * 24 * 10,
        body: "Closing the loop — if you want help later, just reply here anytime.",
      },
    ],
  },
];

export function PortalNurtureCampaignsClient() {
  const toast = useToast();

  const [loadingList, setLoadingList] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignListRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);

  const [ownerTags, setOwnerTags] = useState<ContactTag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [createTagBusy, setCreateTagBusy] = useState(false);
  const [createTagName, setCreateTagName] = useState("");
  const [createTagColor, setCreateTagColor] = useState<(typeof DEFAULT_TAG_COLORS)[number]>("#2563EB");
  const createTagNameRef = useRef<HTMLInputElement | null>(null);

  const [campaignDirty, setCampaignDirty] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);

  const [addTagValue, setAddTagValue] = useState<string>("__none__");

  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);

  const selected = useMemo(() => campaigns.find((c) => c.id === selectedId) ?? null, [campaigns, selectedId]);
  const selectedTagIds = useMemo(() => new Set(detail?.audienceTagIds || []), [detail?.audienceTagIds]);

  const refreshList = useCallback(async (opts?: { keepSelected?: boolean }) => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/portal/nurture/campaigns", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as ListRes;
      if (!res.ok || !json.ok || !Array.isArray((json as any).campaigns)) {
        throw new Error(String((json as any).error || "Failed to load campaigns"));
      }
      const next = (json as any).campaigns as CampaignListRow[];
      setCampaigns(next);
      if (!opts?.keepSelected) {
        setSelectedId(next[0]?.id ?? null);
      } else if (selectedId && !next.some((c) => c.id === selectedId)) {
        setSelectedId(next[0]?.id ?? null);
      }
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to load campaigns"));
      setCampaigns([]);
      if (!opts?.keepSelected) setSelectedId(null);
    } finally {
      setLoadingList(false);
    }
  }, [selectedId, toast]);

  const refreshTags = useCallback(async () => {
    setLoadingTags(true);
    try {
      const res = await fetch("/api/portal/contact-tags", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as TagsRes;
      if (!res.ok || !json.ok || !Array.isArray((json as any).tags)) {
        throw new Error(String((json as any).error || "Failed to load tags"));
      }
      const next = (json as any).tags
        .map((t: any) => ({ id: String(t?.id || ""), name: String(t?.name || "").slice(0, 60), color: typeof t?.color === "string" ? String(t.color) : null }))
        .filter((t: ContactTag) => t.id && t.name);
      next.sort((a: ContactTag, b: ContactTag) => a.name.localeCompare(b.name));
      setOwnerTags(next);
    } catch {
      setOwnerTags([]);
    } finally {
      setLoadingTags(false);
    }
  }, []);

  const refreshDetail = useCallback(async (campaignId: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/portal/nurture/campaigns/${encodeURIComponent(campaignId)}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as DetailRes;
      if (!res.ok || !json.ok || !(json as any).campaign?.id) {
        throw new Error(String((json as any).error || "Failed to load campaign"));
      }
      setDetail((json as any).campaign);
      setCampaignDirty(false);
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to load campaign"));
      setDetail(null);
      setCampaignDirty(false);
    } finally {
      setLoadingDetail(false);
    }
  }, [toast]);

  useEffect(() => {
    void refreshList();
    void refreshTags();
  }, [refreshList, refreshTags]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setCampaignDirty(false);
      return;
    }
    void refreshDetail(selectedId);
  }, [refreshDetail, selectedId]);

  const createCampaign = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/nurture/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok || !json?.id) {
        throw new Error(String(json?.error || "Failed to create campaign"));
      }
      toast.success("Campaign created");
      await refreshList({ keepSelected: true });
      setSelectedId(String(json.id));
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to create campaign"));
    }
  }, [refreshList, toast]);

  const deleteCampaign = useCallback(async () => {
    if (!detail) return;
    const ok = window.confirm("Delete this campaign? This cannot be undone.");
    if (!ok) return;

    try {
      const res = await fetch(`/api/portal/nurture/campaigns/${encodeURIComponent(detail.id)}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Failed to delete"));
      toast.success("Campaign deleted");
      setDetail(null);
      setSelectedId(null);
      await refreshList();
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to delete campaign"));
    }
  }, [detail, refreshList, toast]);

  const saveCampaign = useCallback(async () => {
    if (!detail) return;

    setSavingCampaign(true);
    try {
      const res = await fetch(`/api/portal/nurture/campaigns/${encodeURIComponent(detail.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: detail.name,
          status: detail.status,
          audienceTagIds: detail.audienceTagIds,
          smsFooter: detail.smsFooter,
          emailFooter: detail.emailFooter,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Failed to save"));
      toast.success("Saved");
      setCampaignDirty(false);
      await refreshList({ keepSelected: true });
      await refreshDetail(detail.id);
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to save"));
    } finally {
      setSavingCampaign(false);
    }
  }, [detail, refreshDetail, refreshList, toast]);

  const addStep = useCallback(
    async (kind: StepKind) => {
      if (!detail) return;
      try {
        const res = await fetch(`/api/portal/nurture/campaigns/${encodeURIComponent(detail.id)}/steps`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind }),
        });
        const json = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || !json?.ok || !json?.id) throw new Error(String(json?.error || "Failed to add step"));
        toast.success("Step added");
        await refreshDetail(detail.id);
        await refreshList({ keepSelected: true });
      } catch (e: any) {
        toast.error(String(e?.message || "Failed to add step"));
      }
    },
    [detail, refreshDetail, refreshList, toast],
  );

  const updateStep = useCallback(
    async (stepId: string, patch: Partial<{ ord: number; kind: StepKind; delayMinutes: number; subject: string | null; body: string }>) => {
      if (!detail) return;
      try {
        const res = await fetch(`/api/portal/nurture/steps/${encodeURIComponent(stepId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        const json = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Failed to update step"));
        await refreshDetail(detail.id);
        await refreshList({ keepSelected: true });
        toast.success("Step saved");
      } catch (e: any) {
        toast.error(String(e?.message || "Failed to update step"));
      }
    },
    [detail, refreshDetail, refreshList, toast],
  );

  const deleteStep = useCallback(
    async (stepId: string) => {
      if (!detail) return;
      const ok = window.confirm("Delete this step?");
      if (!ok) return;

      try {
        const res = await fetch(`/api/portal/nurture/steps/${encodeURIComponent(stepId)}`, { method: "DELETE" });
        const json = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Failed to delete"));
        toast.success("Step deleted");
        await refreshDetail(detail.id);
        await refreshList({ keepSelected: true });
      } catch (e: any) {
        toast.error(String(e?.message || "Failed to delete step"));
      }
    },
    [detail, refreshDetail, refreshList, toast],
  );

  const enroll = useCallback(
    async (dryRun: boolean) => {
      if (!detail) return;
      try {
        const res = await fetch(`/api/portal/nurture/campaigns/${encodeURIComponent(detail.id)}/enroll`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ dryRun, tagIds: detail.audienceTagIds }),
        });
        const json = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Enroll failed"));
        if (dryRun) toast.success(`Would enroll ${Number(json?.wouldEnroll || 0)} contacts`);
        else toast.success(`Enrolled ${Number(json?.enrolled || 0)} contacts`);
        await refreshList({ keepSelected: true });
      } catch (e: any) {
        toast.error(String(e?.message || "Enroll failed"));
      }
    },
    [detail, refreshList, toast],
  );

  const selectedTags = useMemo(() => ownerTags.filter((t) => selectedTagIds.has(t.id)), [ownerTags, selectedTagIds]);

  const moveStep = useCallback(
    async (step: StepRow, delta: -1 | 1) => {
      if (!detail) return;
      const steps = [...detail.steps].sort((a, b) => a.ord - b.ord);
      const idx = steps.findIndex((s) => s.id === step.id);
      if (idx < 0) return;
      const next = idx + delta;
      if (next < 0 || next >= steps.length) return;
      await updateStep(step.id, { ord: next });
    },
    [detail, updateStep],
  );

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Nurture Campaigns</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Build simple multi-step SMS/email sequences, pick an audience by tags, then enroll contacts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
            onClick={() => void createCampaign()}
            disabled={loadingList}
          >
            New campaign
          </button>
          <button
            type="button"
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
            onClick={() => void refreshList({ keepSelected: true })}
            disabled={loadingList}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <div className="rounded-3xl border border-zinc-200 bg-white p-3">
          <div className="px-2 pb-2 text-xs font-semibold text-zinc-600">Your campaigns</div>
          {loadingList ? (
            <div className="p-2 text-sm text-zinc-600">Loading…</div>
          ) : campaigns.length ? (
            <div className="space-y-2">
              {campaigns.map((c) => {
                const active = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={classNames(
                      "w-full rounded-2xl border px-3 py-3 text-left transition",
                      active ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white hover:bg-zinc-50",
                    )}
                    onClick={() => setSelectedId(c.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className={classNames("min-w-0", active ? "text-white" : "text-zinc-900")}
                        >
                        <div className="truncate text-sm font-semibold">{c.name}</div>
                        <div className={classNames("mt-1 text-xs", active ? "text-white/80" : "text-zinc-500")}>
                          {c.status} · {c.stepsCount} step{c.stepsCount === 1 ? "" : "s"}
                        </div>
                      </div>
                      <div className={classNames("shrink-0 text-right text-xs", active ? "text-white/80" : "text-zinc-500")}>
                        <div title="Active enrollments">{c.enrollments.active} active</div>
                        <div title="Completed enrollments">{c.enrollments.completed} done</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-2 text-sm text-zinc-600">No campaigns yet. Create one to get started.</div>
          )}
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-5">
          {!selectedId ? (
            <div className="text-sm text-zinc-600">Select a campaign to edit.</div>
          ) : loadingDetail ? (
            <div className="text-sm text-zinc-600">Loading campaign…</div>
          ) : !detail ? (
            <div className="text-sm text-zinc-600">Campaign not found.</div>
          ) : (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-zinc-500">Campaign</div>
                  <div className="mt-1 text-lg font-bold text-zinc-900">{detail.name}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    Updated {formatDate(detail.updatedAtIso)}
                    {selected?.stepsCount !== undefined ? ` · ${selected.stepsCount} steps` : ""}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={classNames(
                      "rounded-2xl px-4 py-2 text-sm font-semibold disabled:opacity-60",
                      campaignDirty ? "bg-zinc-900 text-white hover:bg-zinc-800" : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                    )}
                    onClick={() => void saveCampaign()}
                    disabled={!campaignDirty || savingCampaign}
                  >
                    {savingCampaign ? "Saving…" : campaignDirty ? "Save changes" : "Saved"}
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                    onClick={() => void refreshDetail(detail.id)}
                  >
                    Reload
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                    onClick={() => void deleteCampaign()}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-zinc-600">Name</label>
                  <input
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-[color:var(--color-brand-blue)]"
                    value={detail.name}
                    onChange={(e) => {
                      setDetail((p) => (p ? { ...p, name: e.target.value.slice(0, 80) } : p));
                      setCampaignDirty(true);
                    }}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-600">Status</label>
                  <div className="mt-1">
                    <PortalListboxDropdown
                      value={detail.status}
                      options={[
                        { value: "DRAFT", label: "DRAFT", hint: "Not sending" },
                        { value: "ACTIVE", label: "ACTIVE", hint: "Can enroll + send" },
                        { value: "PAUSED", label: "PAUSED", hint: "Enrolled contacts wait" },
                        { value: "ARCHIVED", label: "ARCHIVED" },
                      ]}
                      onChange={(next) => {
                        setDetail((p) => (p ? { ...p, status: next } : p));
                        setCampaignDirty(true);
                      }}
                      className="w-full"
                    />
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">Only ACTIVE campaigns can enroll contacts and send steps.</div>
                </div>
              </div>

              <div className="mt-5 rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Audience tags</div>
                    <div className="mt-1 text-sm text-zinc-600">Contacts with any selected tag will be enrolled.</div>
                  </div>

                  <button
                    type="button"
                    className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                    onClick={() => void refreshTags()}
                    disabled={loadingTags}
                  >
                    {loadingTags ? "Loading…" : "Refresh tags"}
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {selectedTags.length ? (
                    selectedTags.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold"
                        style={pillStyle(t.color)}
                        title="Remove"
                        onClick={() => {
                          setDetail((p) => {
                            if (!p) return p;
                            return { ...p, audienceTagIds: p.audienceTagIds.filter((id) => id !== t.id) };
                          });
                          setCampaignDirty(true);
                        }}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color || "#e4e4e7" }} />
                        {t.name}
                        <span className="text-zinc-400">×</span>
                      </button>
                    ))
                  ) : (
                    <div className="text-sm text-zinc-600">No tags selected.</div>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-zinc-600">Add existing tag</label>
                    <div className="mt-1">
                      <PortalListboxDropdown
                        value={addTagValue}
                        options={[
                          { value: "__none__", label: "Select a tag…", disabled: true },
                          { value: "__create__", label: "Create new tag…" },
                          ...ownerTags
                            .filter((t) => !selectedTagIds.has(t.id))
                            .map((t) => ({ value: t.id, label: t.name })),
                        ]}
                        onChange={(tagId) => {
                          if (tagId === "__create__") {
                            setAddTagValue("__none__");
                            requestAnimationFrame(() => createTagNameRef.current?.focus());
                            return;
                          }
                          if (!tagId || tagId === "__none__") return;
                          setDetail((p) => {
                            if (!p) return p;
                            const set = new Set(p.audienceTagIds);
                            set.add(tagId);
                            return { ...p, audienceTagIds: Array.from(set).slice(0, 100) };
                          });
                          setCampaignDirty(true);
                          setAddTagValue("__none__");
                        }}
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                    <div className="text-xs font-semibold text-zinc-600">Create new tag</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        ref={createTagNameRef}
                        className="min-w-[220px] flex-1 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        placeholder="Tag name (e.g., Hot lead)"
                        value={createTagName}
                        onChange={(e) => setCreateTagName(e.target.value)}
                      />
                      <div className="flex items-center gap-1.5">
                        {DEFAULT_TAG_COLORS.slice(0, 10).map((c) => {
                          const selected = c === createTagColor;
                          return (
                            <button
                              key={c}
                              type="button"
                              className={classNames(
                                "h-7 w-7 rounded-full border",
                                selected ? "border-zinc-900 ring-2 ring-zinc-900/20" : "border-zinc-200",
                              )}
                              style={{ backgroundColor: c }}
                              onClick={() => setCreateTagColor(c)}
                              title={c}
                            />
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        className="rounded-2xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                        disabled={createTagBusy}
                        onClick={() => {
                          const name = createTagName.trim().slice(0, 60);
                          if (!name) return;
                          void (async () => {
                            setCreateTagBusy(true);
                            try {
                              const res = await fetch("/api/portal/contact-tags", {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({ name, color: createTagColor }),
                              });
                              const json = (await res.json().catch(() => ({}))) as any;
                              if (!res.ok || !json?.ok || !json?.tag?.id) {
                                throw new Error(String(json?.error || "Failed to create tag"));
                              }
                              const tagId = String(json.tag.id);
                              setCreateTagName("");
                              await refreshTags();
                              setDetail((p) => {
                                if (!p) return p;
                                const set = new Set(p.audienceTagIds);
                                set.add(tagId);
                                return { ...p, audienceTagIds: Array.from(set).slice(0, 100) };
                              });
                              setCampaignDirty(true);
                              toast.success("Tag created");
                            } catch (e: any) {
                              toast.error(String(e?.message || "Failed to create tag"));
                            } finally {
                              setCreateTagBusy(false);
                            }
                          })();
                        }}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-zinc-600">SMS footer</label>
                  <textarea
                    className="mt-1 min-h-[90px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-[color:var(--color-brand-blue)]"
                    value={detail.smsFooter}
                    onChange={(e) => {
                      setDetail((p) => (p ? { ...p, smsFooter: e.target.value.slice(0, 300) } : p));
                      setCampaignDirty(true);
                    }}
                  />
                  <div className="mt-1 text-xs text-zinc-500">Appended to every SMS step.</div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-600">Email footer</label>
                  <textarea
                    className="mt-1 min-h-[90px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-[color:var(--color-brand-blue)]"
                    value={detail.emailFooter}
                    onChange={(e) => {
                      setDetail((p) => (p ? { ...p, emailFooter: e.target.value.slice(0, 2000) } : p));
                      setCampaignDirty(true);
                    }}
                  />
                  <div className="mt-1 text-xs text-zinc-500">Appended to every email step.</div>
                </div>
              </div>

              <div className="mt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Steps</div>
                    <div className="mt-1 text-sm text-zinc-600">Each step waits its delay after the previous step is sent.</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                      onClick={() => setTemplateOpen(true)}
                      disabled={templateBusy}
                    >
                      Load template
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                      onClick={() => void addStep("SMS")}
                    >
                      + SMS step
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                      onClick={() => void addStep("EMAIL")}
                    >
                      + Email step
                    </button>
                  </div>
                </div>

                {templateOpen ? (
                  <div className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/30 p-3 sm:items-center">
                    <div className="w-full max-w-2xl rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-semibold text-zinc-900">Load a template</div>
                          <div className="mt-1 text-sm text-zinc-600">Replaces your current steps.</div>
                        </div>
                        <button
                          type="button"
                          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                          onClick={() => setTemplateOpen(false)}
                          disabled={templateBusy}
                        >
                          Close
                        </button>
                      </div>

                      <div className="mt-4 space-y-2">
                        {NURTURE_TEMPLATES.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            disabled={templateBusy}
                            className="w-full rounded-3xl border border-zinc-200 bg-white p-4 text-left hover:bg-zinc-50 disabled:opacity-60"
                            onClick={() => {
                              if (!detail) return;
                              const ok = window.confirm("Replace your current steps with this template? This will delete existing steps.");
                              if (!ok) return;

                              void (async () => {
                                setTemplateBusy(true);
                                try {
                                  const campaignId = detail.id;

                                  // Delete existing steps.
                                  for (const s of detail.steps.slice().sort((a, b) => a.ord - b.ord)) {
                                    await fetch(`/api/portal/nurture/steps/${encodeURIComponent(s.id)}`, { method: "DELETE" });
                                  }

                                  // Create new steps then patch contents.
                                  for (const s of t.steps) {
                                    const res = await fetch(`/api/portal/nurture/campaigns/${encodeURIComponent(campaignId)}/steps`, {
                                      method: "POST",
                                      headers: { "content-type": "application/json" },
                                      body: JSON.stringify({ kind: s.kind }),
                                    });
                                    const json = (await res.json().catch(() => ({}))) as any;
                                    if (!res.ok || !json?.ok || !json?.id) throw new Error(String(json?.error || "Failed to create step"));
                                    const stepId = String(json.id);

                                    await fetch(`/api/portal/nurture/steps/${encodeURIComponent(stepId)}`, {
                                      method: "PATCH",
                                      headers: { "content-type": "application/json" },
                                      body: JSON.stringify({
                                        delayMinutes: s.delayMinutes,
                                        subject: s.kind === "EMAIL" ? String(s.subject || "Quick question") : null,
                                        body: String(s.body || "").slice(0, 8000),
                                      }),
                                    });
                                  }

                                  toast.success("Template applied");
                                  await refreshDetail(campaignId);
                                  await refreshList({ keepSelected: true });
                                  setTemplateOpen(false);
                                } catch (e: any) {
                                  toast.error(String(e?.message || "Failed to apply template"));
                                } finally {
                                  setTemplateBusy(false);
                                }
                              })();
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-zinc-900">{t.title}</div>
                                <div className="mt-1 text-sm text-zinc-600">{t.description}</div>
                              </div>
                              <div className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-semibold text-zinc-700">
                                {t.steps.length} step{t.steps.length === 1 ? "" : "s"}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>

                      <div className="mt-4 text-xs text-zinc-500">
                        Tip: after loading a template, customize the copy and click Save on each step.
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-3 space-y-3">
                  {detail.steps.length ? (
                    detail.steps
                      .slice()
                      .sort((a, b) => a.ord - b.ord)
                      .map((s, idx) => (
                        <StepCard
                          key={s.id}
                          step={s}
                          campaignName={detail.name}
                          index={idx}
                          total={detail.steps.length}
                          onSave={(patch) => void updateStep(s.id, patch)}
                          onMoveUp={() => void moveStep(s, -1)}
                          onMoveDown={() => void moveStep(s, 1)}
                          onDelete={() => void deleteStep(s.id)}
                        />
                      ))
                  ) : (
                    <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">No steps yet.</div>
                  )}
                </div>
              </div>

              <div className="mt-6 rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Enroll</div>
                    <div className="mt-1 text-sm text-zinc-600">Enroll contacts with selected tags. Existing enrollments are updated idempotently.</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                      onClick={() => void enroll(true)}
                    >
                      Dry run
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
                      onClick={() => void enroll(false)}
                    >
                      Enroll now
                    </button>
                  </div>
                </div>

                <div className="mt-2 text-xs text-zinc-500">
                  Tip: Set status to ACTIVE, select at least one tag, then Enroll.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepCard(props: {
  step: StepRow;
  campaignName: string;
  index: number;
  total: number;
  onSave: (patch: Partial<{ kind: StepKind; delayMinutes: number; subject: string | null; body: string }>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const { step, campaignName, index, total, onSave, onMoveUp, onMoveDown, onDelete } = props;

  const toast = useToast();

  const delay = useMemo(() => bestUnit(step.delayMinutes), [step.delayMinutes]);
  const [kind, setKind] = useState<StepKind>(step.kind);
  const [delayValue, setDelayValue] = useState<number>(delay.value);
  const [delayUnit, setDelayUnit] = useState<typeof delay.unit>(delay.unit);
  const [subject, setSubject] = useState<string>(step.subject ?? "");
  const [body, setBody] = useState<string>(step.body);
  const [dirty, setDirty] = useState(false);

  const [varPickerOpen, setVarPickerOpen] = useState(false);
  const [varPickerTarget, setVarPickerTarget] = useState<"subject" | "body">("body");
  const [mediaOpen, setMediaOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const subjectRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

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

  useEffect(() => {
    const delay2 = bestUnit(step.delayMinutes);
    setKind(step.kind);
    setDelayValue(delay2.value);
    setDelayUnit(delay2.unit);
    setSubject(step.subject ?? "");
    setBody(step.body);
    setDirty(false);
  }, [step.body, step.delayMinutes, step.kind, step.subject, step.updatedAtIso]);

  const save = useCallback(() => {
    const nextDelayMinutes = toMinutes(delayValue, delayUnit);
    onSave({
      kind,
      delayMinutes: nextDelayMinutes,
      subject: kind === "EMAIL" ? subject.slice(0, 200) : null,
      body: body.slice(0, 8000),
    });
    setDirty(false);
  }, [body, delayUnit, delayValue, kind, onSave, subject]);

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-4">
      <PortalVariablePickerModal
        open={varPickerOpen}
        title="Insert variable"
        variables={[...PORTAL_MESSAGE_VARIABLES, ...PORTAL_LINK_VARIABLES]}
        onPick={(key) => {
          const token = `{${key}}`;
          if (varPickerTarget === "subject") {
            const el = subjectRef.current;
            const { next, caret } = insertAtCursor(subject, token, el);
            setSubject(next);
            setDirty(true);
            setCaretSoon(el, caret);
            return;
          }
          const el = bodyRef.current;
          const { next, caret } = insertAtCursor(body, token, el);
          setBody(next);
          setDirty(true);
          setCaretSoon(el, caret);
        }}
        onClose={() => setVarPickerOpen(false)}
      />

      <PortalMediaPickerModal
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        confirmLabel="Insert link"
        onPick={(it: PortalMediaPickItem) => {
          const token = it.shareUrl || it.downloadUrl;
          const el = bodyRef.current;
          const withSpace = body && !/\s$/.test(body) ? ` ${token}` : token;
          const { next, caret } = insertAtCursor(body, withSpace, el);
          setBody(next);
          setDirty(true);
          setCaretSoon(el, caret);
          setMediaOpen(false);
        }}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-zinc-500">Step {index + 1}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <PortalListboxDropdown
              value={kind}
              options={[
                { value: "SMS", label: "SMS" },
                { value: "EMAIL", label: "Email" },
              ]}
              onChange={(next) => {
                setKind(next);
                setDirty(true);
              }}
            />

            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                className="w-24 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={delayValue}
                onChange={(e) => {
                  setDelayValue(Number(e.target.value || 0));
                  setDirty(true);
                }}
              />
              <PortalListboxDropdown
                value={delayUnit}
                options={[
                  { value: "minutes", label: "minutes after" },
                  { value: "hours", label: "hours after" },
                  { value: "days", label: "days after" },
                ]}
                onChange={(next) => {
                  setDelayUnit(next);
                  setDirty(true);
                }}
              />
              <span className="text-sm text-zinc-600">previous step</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
            onClick={onMoveUp}
            disabled={index === 0}
            title="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
            onClick={onMoveDown}
            disabled={index >= total - 1}
            title="Move down"
          >
            ↓
          </button>
          <button
            type="button"
            className={classNames(
              "rounded-2xl px-3 py-2 text-xs font-semibold",
              dirty ? "bg-zinc-900 text-white hover:bg-zinc-800" : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
            )}
            onClick={save}
            disabled={!dirty}
          >
            {dirty ? "Save" : "Saved"}
          </button>
          <button
            type="button"
            className="rounded-2xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
      </div>

      {kind === "EMAIL" ? (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-3">
            <label className="text-xs font-semibold text-zinc-600">Subject</label>
            <button
              type="button"
              className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              onClick={() => {
                setVarPickerTarget("subject");
                setVarPickerOpen(true);
              }}
            >
              Insert variable
            </button>
          </div>
          <input
            ref={(el) => {
              subjectRef.current = el;
            }}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm"
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setDirty(true);
            }}
            placeholder="Quick question"
          />
        </div>
      ) : null}

      <div className="mt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-xs font-semibold text-zinc-600">Message</label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              onClick={() => {
                setVarPickerTarget("body");
                setVarPickerOpen(true);
              }}
            >
              Insert variable
            </button>
            <button
              type="button"
              className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              onClick={() => setMediaOpen(true)}
            >
              Insert media
            </button>
            <button
              type="button"
              disabled={aiBusy}
              className="rounded-xl bg-zinc-900 px-2 py-1 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
              onClick={() => {
                if (aiBusy) return;
                const extra = window.prompt("Optional: add an instruction for the AI draft (tone, CTA, etc)", "") || "";
                void (async () => {
                  setAiBusy(true);
                  try {
                    const res = await fetch("/api/portal/nurture/ai/generate-step", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({
                        kind,
                        campaignName,
                        prompt: extra.trim() || undefined,
                        existingSubject: kind === "EMAIL" ? subject : undefined,
                        existingBody: body,
                      }),
                    });
                    const json = (await res.json().catch(() => ({}))) as any;
                    if (!res.ok || !json?.ok) throw new Error(String(json?.error || "AI draft failed"));
                    if (kind === "EMAIL" && typeof json.subject === "string" && json.subject.trim()) {
                      setSubject(String(json.subject).slice(0, 200));
                    }
                    if (typeof json.body === "string") {
                      setBody(String(json.body).slice(0, 8000));
                      setDirty(true);
                    }
                    toast.success("Draft generated");
                  } catch (e: any) {
                    toast.error(String(e?.message || "AI draft failed"));
                  } finally {
                    setAiBusy(false);
                  }
                })();
              }}
            >
              {aiBusy ? "Drafting…" : "AI draft"}
            </button>
          </div>
        </div>
        <textarea
          ref={(el) => {
            bodyRef.current = el;
          }}
          className="mt-1 min-h-[120px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setDirty(true);
          }}
          placeholder={kind === "EMAIL" ? "Hi {contact.name},\n\n…" : "Hey {contact.name} — …"}
        />
        <div className="mt-1 text-xs text-zinc-500">
          Supports templates like <span className="font-mono">{"{contact.name}"}</span> and <span className="font-mono">{"{business.name}"}</span>.
        </div>
      </div>
    </div>
  );
}
