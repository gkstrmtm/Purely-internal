"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { PortalVariablePickerModal } from "@/components/PortalVariablePickerModal";
import { PortalMediaPickerModal, type PortalMediaPickItem } from "@/components/PortalMediaPickerModal";
import { DEFAULT_TAG_COLORS } from "@/lib/tagColors.shared";
import { PORTAL_LINK_VARIABLES, PORTAL_MESSAGE_VARIABLES } from "@/lib/portalTemplateVars";
import { NURTURE_TEMPLATES, type NurtureTemplate, type StepKind } from "@/lib/portalNurtureTemplates";

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

function bestUnit(minutes: number): { unit: "minutes" | "hours" | "days" | "weeks" | "months"; value: number } {
  const m = Math.max(0, Number(minutes) || 0);
  if (m % (60 * 24 * 30) === 0) return { unit: "months", value: m / (60 * 24 * 30) };
  if (m % (60 * 24 * 7) === 0) return { unit: "weeks", value: m / (60 * 24 * 7) };
  if (m % (60 * 24) === 0) return { unit: "days", value: m / (60 * 24) };
  if (m % 60 === 0) return { unit: "hours", value: m / 60 };
  return { unit: "minutes", value: m };
}

function toMinutes(value: number, unit: "minutes" | "hours" | "days" | "weeks" | "months") {
  const v = Math.max(0, Math.floor(Number(value) || 0));
  if (unit === "months") return v * 60 * 24 * 30;
  if (unit === "weeks") return v * 60 * 24 * 7;
  if (unit === "days") return v * 60 * 24;
  if (unit === "hours") return v * 60;
  return v;
}

export function PortalNurtureCampaignsClient() {
  const toast = useToast();

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const sessionId = params.get("session_id") || "";
    const campaignId = params.get("campaignId") || "";
    if (!sessionId || !campaignId) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/portal/nurture/campaigns/${encodeURIComponent(campaignId)}/confirm-checkout`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const json = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Billing confirmation failed"));
        if (!cancelled) toast.success("Billing confirmed");

        // Clean up URL params.
        const next = new URL(window.location.href);
        next.searchParams.delete("session_id");
        next.searchParams.delete("billing");
        window.history.replaceState({}, "", next.toString());
      } catch (e: any) {
        if (!cancelled) toast.error(String(e?.message || "Billing confirmation failed"));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [toast]);

  const [loadingList, setLoadingList] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignListRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);

  const [ownerTags, setOwnerTags] = useState<ContactTag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [createTagBusy, setCreateTagBusy] = useState(false);
  const [createTagOpen, setCreateTagOpen] = useState(false);
  const [createTagName, setCreateTagName] = useState("");
  const [createTagColor, setCreateTagColor] = useState<(typeof DEFAULT_TAG_COLORS)[number]>("#2563EB");
  const createTagNameRef = useRef<HTMLInputElement | null>(null);

  const [campaignDirty, setCampaignDirty] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);

  const [addTagValue, setAddTagValue] = useState<string>("__none__");
  const [tagSearch, setTagSearch] = useState("");

  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);

  type NurtureConfirm =
    | { kind: "deleteCampaign"; campaignId: string; name: string }
    | { kind: "deleteStep"; stepId: string }
    | { kind: "applyTemplate"; template: NurtureTemplate }
    | null;

  const [confirm, setConfirm] = useState<NurtureConfirm>(null);

  const selected = useMemo(() => campaigns.find((c) => c.id === selectedId) ?? null, [campaigns, selectedId]);
  const selectedTagIds = useMemo(() => new Set(detail?.audienceTagIds || []), [detail?.audienceTagIds]);

  const addTagOptions = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    const filtered = q ? ownerTags.filter((t) => t.name.toLowerCase().includes(q)) : ownerTags;
    return [
      { value: "__none__", label: "Add tag…", disabled: true },
      ...filtered.slice(0, 120).map((t) => ({
        value: t.id,
        label: t.name,
        disabled: selectedTagIds.has(t.id),
        hint: selectedTagIds.has(t.id) ? "Already added" : undefined,
      })),
      { value: "__create__", label: "Create new tag…" },
    ] as any;
  }, [ownerTags, selectedTagIds, tagSearch]);

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

  const deleteCampaignNow = useCallback(async (campaignId: string) => {
    try {
      const res = await fetch(`/api/portal/nurture/campaigns/${encodeURIComponent(campaignId)}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Failed to delete"));
      toast.success("Campaign deleted");
      setDetail((prev) => (prev?.id === campaignId ? null : prev));
      setSelectedId((prev) => (prev === campaignId ? null : prev));
      await refreshList();
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to delete campaign"));
    }
  }, [refreshList, toast]);

  const requestDeleteCampaign = useCallback(() => {
    if (!detail) return;
    setConfirm({ kind: "deleteCampaign", campaignId: detail.id, name: detail.name });
  }, [detail]);

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

      if (res.status === 402 && json?.url) {
        window.location.href = String(json.url);
        return;
      }

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

  const deleteStepNow = useCallback(
    async (stepId: string) => {
      if (!detail) return;
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

  const requestDeleteStep = useCallback((stepId: string) => {
    setConfirm({ kind: "deleteStep", stepId });
  }, []);

  const applyTemplateNow = useCallback(
    async (t: NurtureTemplate) => {
      if (!detail) return;
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
            className="inline-flex items-center gap-2 rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
            onClick={() => void createCampaign()}
            disabled={loadingList}
          >
            <span className="text-base leading-none">+</span>
            <span>New campaign</span>
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
                      active
                        ? "border-(--color-brand-blue) bg-brand-blue/5 text-zinc-900 ring-2 ring-brand-blue/15"
                        : "border-zinc-200 bg-white hover:bg-zinc-50",
                    )}
                    onClick={() => setSelectedId(c.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className={classNames("min-w-0", active ? "text-zinc-900" : "text-zinc-900")}>
                        <div className="truncate text-sm font-semibold">{c.name}</div>
                        <div className={classNames("mt-1 text-xs", active ? "text-(--color-brand-blue)" : "text-zinc-500")}>
                          {c.status} · {c.stepsCount} step{c.stepsCount === 1 ? "" : "s"}
                        </div>
                      </div>
                      <div className={classNames("shrink-0 text-right text-xs", active ? "text-zinc-600" : "text-zinc-500")}>
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
                      campaignDirty
                        ? "bg-(--color-brand-blue) text-white shadow-sm hover:opacity-90"
                        : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
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
                    onClick={requestDeleteCampaign}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-zinc-600">Name</label>
                  <input
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-(--color-brand-blue)"
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

              <div className="mt-5 rounded-3xl border border-zinc-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Audience tags</div>
                    <div className="mt-1 text-sm text-zinc-600">Contacts with any selected tag will be enrolled.</div>
                  </div>
                  {loadingTags ? <div className="text-xs font-semibold text-zinc-500">Refreshing…</div> : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedTags.length ? (
                    selectedTags.map((t) => (
                      <span
                        key={t.id}
                        className="inline-flex max-w-full items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700"
                      >
                        <span
                          className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: t.color || "#a1a1aa" }}
                        />
                        <span className="min-w-0 truncate">{t.name}</span>
                        <button
                          type="button"
                          className="shrink-0 rounded-full px-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                          onClick={() => {
                            setDetail((p) => {
                              if (!p) return p;
                              return { ...p, audienceTagIds: p.audienceTagIds.filter((id) => id !== t.id) };
                            });
                            setCampaignDirty(true);
                          }}
                          aria-label={`Remove ${t.name}`}
                          title="Remove"
                        >
                          ×
                        </button>
                      </span>
                    ))
                  ) : (
                    <div className="text-xs text-zinc-500">No tags selected.</div>
                  )}
                </div>

                <div
                  className={classNames(
                    "mt-4 grid grid-cols-1 gap-3",
                    createTagOpen ? "lg:grid-cols-2" : "lg:grid-cols-1",
                  )}
                >
                  <div>
                    <label className="text-xs font-semibold text-zinc-600">Add tags</label>
                    <div className="mt-2 max-w-sm">
                      <input
                        value={tagSearch}
                        onChange={(e) => setTagSearch(e.target.value)}
                        placeholder="Search tags…"
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                      />
                      <div className="mt-2">
                        <PortalListboxDropdown
                          value={addTagValue}
                          options={addTagOptions}
                          onChange={(tagId) => {
                            if (tagId === "__create__") {
                              setAddTagValue("__none__");
                              setCreateTagOpen(true);
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
                          placeholder="Add tag…"
                        />
                      </div>
                    </div>
                  </div>

                  {createTagOpen ? (
                    <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-zinc-600">Create new tag</div>
                        <button
                          type="button"
                          className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                          onClick={() => setCreateTagOpen(false)}
                          disabled={createTagBusy}
                        >
                          Close
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input
                          ref={createTagNameRef}
                          className="min-w-55 flex-1 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
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
                          className="rounded-2xl bg-(--color-brand-blue) px-3 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
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
                                setCreateTagOpen(false);
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
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-zinc-600">SMS footer</label>
                  <textarea
                    className="mt-1 min-h-22.5 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-(--color-brand-blue)"
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
                    className="mt-1 min-h-22.5 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-(--color-brand-blue)"
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
                      className="rounded-2xl bg-(--color-brand-blue) px-3 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
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
                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                      onClick={() => void addStep("TAG")}
                    >
                      + Tag step
                    </button>
                  </div>
                </div>

                {templateOpen ? (
                  <div className="fixed inset-0 z-9998 flex items-end justify-center bg-black/30 p-3 sm:items-center">
                    <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl sm:max-h-[calc(100vh-2rem)]">
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

                      <div className="mt-4 flex-1 space-y-2 overflow-auto pr-1">
                        {NURTURE_TEMPLATES.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            disabled={templateBusy}
                            className="w-full rounded-3xl border border-zinc-200 bg-white p-4 text-left hover:bg-zinc-50 disabled:opacity-60"
                            onClick={() => {
                              if (!detail) return;
                              setConfirm({ kind: "applyTemplate", template: t });
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
                          ownerTags={ownerTags}
                          campaignName={detail.name}
                          index={idx}
                          total={detail.steps.length}
                          onSave={(patch) => void updateStep(s.id, patch)}
                          onMoveUp={() => void moveStep(s, -1)}
                          onMoveDown={() => void moveStep(s, 1)}
                          onDelete={() => requestDeleteStep(s.id)}
                        />
                      ))
                  ) : (
                    <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">No steps yet.</div>
                  )}
                </div>
              </div>

              {confirm ? (
                <div
                  className="fixed inset-0 z-9999 flex items-start justify-center bg-black/20 px-4 pt-8"
                  role="dialog"
                  aria-modal="true"
                  onMouseDown={() => setConfirm(null)}
                >
                  <div
                    className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <div className="text-sm font-semibold text-zinc-900">
                      {confirm.kind === "deleteCampaign"
                        ? "Delete campaign permanently?"
                        : confirm.kind === "deleteStep"
                          ? "Delete this step?"
                          : "Replace steps with template?"}
                    </div>
                    <div className="mt-2 text-sm text-zinc-600">
                      {confirm.kind === "deleteCampaign"
                        ? `This will permanently delete “${confirm.name}”.`
                        : confirm.kind === "deleteStep"
                          ? "This cannot be undone."
                          : `This will delete your existing steps and replace them with “${confirm.template.title}”.`}
                    </div>

                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                        onClick={() => setConfirm(null)}
                        disabled={templateBusy}
                      >
                        Cancel
                      </button>

                      {confirm.kind === "deleteCampaign" ? (
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                          onClick={() => {
                            const campaignId = confirm.campaignId;
                            setConfirm(null);
                            void deleteCampaignNow(campaignId);
                          }}
                          disabled={templateBusy}
                        >
                          Delete
                        </button>
                      ) : confirm.kind === "deleteStep" ? (
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                          onClick={() => {
                            const stepId = confirm.stepId;
                            setConfirm(null);
                            void deleteStepNow(stepId);
                          }}
                          disabled={templateBusy}
                        >
                          Delete
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
                          onClick={() => {
                            const t = confirm.template;
                            setConfirm(null);
                            void applyTemplateNow(t);
                          }}
                          disabled={templateBusy}
                        >
                          Replace steps
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

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
                      className="rounded-2xl bg-(--color-brand-blue) px-3 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90"
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
  ownerTags: ContactTag[];
  campaignName: string;
  index: number;
  total: number;
  onSave: (patch: Partial<{ kind: StepKind; delayMinutes: number; subject: string | null; body: string }>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const { step, ownerTags, campaignName, index, total, onSave, onMoveUp, onMoveDown, onDelete } = props;

  const toast = useToast();

  const delay = useMemo(() => bestUnit(step.delayMinutes), [step.delayMinutes]);
  const [kind, setKind] = useState<StepKind>(step.kind);
  const [delayValue, setDelayValue] = useState<number>(delay.value);
  const [delayUnit, setDelayUnit] = useState<typeof delay.unit>(delay.unit);
  const [subject, setSubject] = useState<string>(step.subject ?? "");
  const [body, setBody] = useState<string>(step.body);
  const [dirty, setDirty] = useState(false);

  const parseTagId = useCallback((raw: string) => {
    const s = String(raw || "");
    if (!s.startsWith("TAG:")) return "";
    return s.slice("TAG:".length).trim();
  }, []);

  const [tagId, setTagId] = useState<string>(() => (step.kind === "TAG" ? parseTagId(step.body) : ""));

  const [varPickerOpen, setVarPickerOpen] = useState(false);
  const [varPickerTarget, setVarPickerTarget] = useState<"subject" | "body">("body");
  const [mediaOpen, setMediaOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiError, setAiError] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

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
    setTagId(step.kind === "TAG" ? parseTagId(step.body) : "");
    setDirty(false);
  }, [parseTagId, step.body, step.delayMinutes, step.kind, step.subject, step.updatedAtIso]);

  const save = useCallback(() => {
    const nextDelayMinutes = toMinutes(delayValue, delayUnit);
    const nextBody = kind === "TAG" ? `TAG:${String(tagId || "").trim()}` : body.slice(0, 8000);
    onSave({
      kind,
      delayMinutes: nextDelayMinutes,
      subject: kind === "EMAIL" ? subject.slice(0, 200) : null,
      body: nextBody,
    });
    setDirty(false);
  }, [body, delayUnit, delayValue, kind, onSave, subject, tagId]);

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
                { value: "TAG", label: "Tag" },
              ]}
              onChange={(next) => {
                setKind(next);
                if (next === "TAG") {
                  const fallbackTagId = tagId || ownerTags[0]?.id || "";
                  setTagId(fallbackTagId);
                  setSubject("");
                }
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
                  { value: "weeks", label: "weeks after" },
                  { value: "months", label: "months after" },
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
              dirty
                ? "bg-(--color-brand-blue) text-white shadow-sm hover:opacity-90"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
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

      {kind === "TAG" ? (
        <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="text-xs font-semibold text-zinc-700">Tag to apply</div>
          <div className="mt-1 text-xs text-zinc-500">This step applies a tag to the contact (no message is sent).</div>
          <div className="mt-3 max-w-sm">
            <PortalListboxDropdown
              value={tagId || "__none__"}
              options={[
                { value: "__none__", label: ownerTags.length ? "Select a tag…" : "No tags available", disabled: true },
                ...ownerTags.slice(0, 200).map((t) => ({ value: t.id, label: t.name })),
              ]}
              onChange={(next) => {
                if (!next || next === "__none__") return;
                setTagId(next);
                setDirty(true);
              }}
              className="w-full"
              placeholder="Select a tag…"
            />
          </div>
        </div>
      ) : null}

      {kind === "TAG" ? null : (
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
            <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
              {uploadBusy ? "Uploading…" : "Upload"}
              <input
                type="file"
                className="hidden"
                disabled={uploadBusy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploadBusy(true);
                  try {
                    const fd = new FormData();
                    fd.set("file", file);
                    const up = await fetch("/api/uploads", { method: "POST", body: fd });
                    const upBody = (await up.json().catch(() => ({}))) as any;
                    if (!up.ok || !upBody.url) {
                      toast.error(String(upBody.error || "Upload failed"));
                      return;
                    }

                    const token = String(upBody.url);
                    const el = bodyRef.current;
                    const withSpace = body && !/\s$/.test(body) ? ` ${token}` : token;
                    const { next, caret } = insertAtCursor(body, withSpace, el);
                    setBody(next);
                    setDirty(true);
                    setCaretSoon(el, caret);
                  } finally {
                    setUploadBusy(false);
                    if (e.target) e.target.value = "";
                  }
                }}
              />
            </label>
            <button
              type="button"
              disabled={aiBusy}
              onClick={() => {
                if (aiBusy) return;
                setAiError(null);
                setAiModalOpen(true);
              }}
              className={
                "inline-flex items-center gap-2 rounded-xl px-2 py-1 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60 " +
                "bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink)"
              }
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z" />
                <path d="M19 14l.8 2.6L22 17l-2.2.4L19 20l-.8-2.6L16 17l2.2-.4L19 14z" />
              </svg>
              <span>{aiBusy ? "Drafting…" : "AI draft"}</span>
            </button>
          </div>
        </div>
        <textarea
          ref={(el) => {
            bodyRef.current = el;
          }}
          className="mt-1 min-h-30 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setDirty(true);
          }}
          placeholder={kind === "EMAIL" ? "Hi {contact.name},\n\n…" : "Hey {contact.name}, …"}
        />
        <div className="mt-1 text-xs text-zinc-500">
          Supports templates like <span className="font-mono">{"{contact.name}"}</span> and <span className="font-mono">{"{business.name}"}</span>.
        </div>
      </div>
      )}

      {aiModalOpen ? (
        <div className="fixed inset-0 z-9999 flex items-end justify-center bg-black/40 p-3 sm:items-center" onMouseDown={() => !aiBusy && setAiModalOpen(false)}>
          <div
            className="w-full max-w-xl rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 text-base font-semibold text-zinc-900">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-2xl bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink) text-white">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z" />
                      <path d="M19 14l.8 2.6L22 17l-2.2.4L19 20l-.8-2.6L16 17l2.2-.4L19 14z" />
                    </svg>
                  </span>
                  <span>AI draft</span>
                </div>
                <div className="mt-1 text-sm text-zinc-600">Optional: add an instruction for tone, CTA, or details to include.</div>
              </div>
              <button
                type="button"
                className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                onClick={() => setAiModalOpen(false)}
                disabled={aiBusy}
              >
                Close
              </button>
            </div>

            <div className="mt-4">
              <label className="text-xs font-semibold text-zinc-600">Instruction (optional)</label>
              <textarea
                className="mt-1 min-h-22.5 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm"
                value={aiInstruction}
                onChange={(e) => setAiInstruction(e.target.value)}
                placeholder="Example: keep it friendly, ask for a quick reply, mention scheduling a 10-minute call"
                disabled={aiBusy}
              />
              {aiError ? <div className="mt-2 text-sm font-semibold text-red-600">{aiError}</div> : null}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                onClick={() => {
                  setAiModalOpen(false);
                  setAiError(null);
                }}
                disabled={aiBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={aiBusy}
                className={
                  "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60 " +
                  "bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink)"
                }
                onClick={() => {
                  if (aiBusy) return;
                  setAiError(null);
                  void (async () => {
                    setAiBusy(true);
                    try {
                      const res = await fetch("/api/portal/nurture/ai/generate-step", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                          kind,
                          campaignName,
                          prompt: aiInstruction.trim() || undefined,
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
                      setAiModalOpen(false);
                    } catch (e: any) {
                      setAiError(String(e?.message || "AI draft failed"));
                    } finally {
                      setAiBusy(false);
                    }
                  })();
                }}
              >
                {aiBusy ? "Drafting…" : "Generate"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
