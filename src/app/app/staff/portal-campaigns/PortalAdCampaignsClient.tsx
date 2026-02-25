"use client";

import { useEffect, useMemo, useState } from "react";

type Placement = "SIDEBAR_BANNER" | "BILLING_SPONSORED" | "FULLSCREEN_REWARD";

type CampaignRow = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  placement: Placement;
  startAt: string | null;
  endAt: string | null;
  targetJson: any;
  creativeJson: any;
  rewardJson: any;
  createdAt: string;
  updatedAt: string;
};

type OwnerRow = {
  id: string;
  email: string;
  name: string;
  active: boolean;
  createdAt: string;
  businessProfile: { businessName: string; industry: string | null; businessModel: string | null } | null;
};

function toIsoOrNull(v: string): string | null {
  const s = String(v || "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function splitCsv(v: string): string[] {
  return String(v || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 200);
}

function joinCsv(xs: unknown): string {
  if (!Array.isArray(xs)) return "";
  return xs.map((x) => String(x)).filter(Boolean).join(", ");
}

function placementLabel(p: Placement) {
  if (p === "SIDEBAR_BANNER") return "Sidebar banner";
  if (p === "BILLING_SPONSORED") return "Billing sponsored";
  return "Fullscreen reward";
}

export default function PortalAdCampaignsClient() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editor, setEditor] = useState<null | {
    id?: string;
    name: string;
    enabled: boolean;
    priority: number;
    placement: Placement;
    startAtIso: string;
    endAtIso: string;

    // targeting
    portalVariant: "any" | "portal" | "credit";
    billingModel: "any" | "subscription" | "credits";
    industriesCsv: string;
    businessModelsCsv: string;
    serviceSlugsAnyCsv: string;
    serviceSlugsAllCsv: string;
    pathsCsv: string;

    // creative
    headline: string;
    body: string;
    ctaText: string;
    linkUrl: string;
    mediaKind: "image" | "video";
    mediaUrl: string;

    // reward
    rewardCredits: number;
    cooldownHours: number;
    minWatchSeconds: number;
  }>(null);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignCampaignId, setAssignCampaignId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Array<{ ownerId: string; email: string; businessName: string }>>([]);

  const [ownerQuery, setOwnerQuery] = useState("");
  const [ownerResults, setOwnerResults] = useState<OwnerRow[]>([]);
  const [ownerLoading, setOwnerLoading] = useState(false);

  async function loadCampaigns() {
    setError(null);
    setLoading(true);
    const res = await fetch("/api/staff/portal/ad-campaigns", { cache: "no-store" }).catch(() => null as any);
    if (!res?.ok) {
      setError("Unable to load campaigns.");
      setLoading(false);
      return;
    }
    const json = (await res.json().catch(() => null)) as any;
    if (!json?.ok || !Array.isArray(json.campaigns)) {
      setError("Unexpected response.");
      setLoading(false);
      return;
    }
    setCampaigns(json.campaigns);
    setLoading(false);
  }

  useEffect(() => {
    void loadCampaigns();
  }, []);

  const sorted = useMemo(() => {
    const xs = [...campaigns];
    xs.sort((a, b) => {
      if ((b.enabled ? 1 : 0) !== (a.enabled ? 1 : 0)) return (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0);
      if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
      return String(b.updatedAt).localeCompare(String(a.updatedAt));
    });
    return xs;
  }, [campaigns]);

  function openCreate() {
    setEditor({
      name: "New campaign",
      enabled: true,
      priority: 0,
      placement: "SIDEBAR_BANNER",
      startAtIso: "",
      endAtIso: "",

      portalVariant: "portal",
      billingModel: "credits",
      industriesCsv: "",
      businessModelsCsv: "",
      serviceSlugsAnyCsv: "",
      serviceSlugsAllCsv: "",
      pathsCsv: "",

      headline: "Sponsored by Purely Automation",
      body: "Explore add-ons and unlock more automation.",
      ctaText: "View upgrades",
      linkUrl: "/portal/app/billing",
      mediaKind: "image",
      mediaUrl: "",

      rewardCredits: 25,
      cooldownHours: 24,
      minWatchSeconds: 15,
    });
  }

  function openEdit(row: CampaignRow) {
    const t = (row.targetJson ?? {}) as any;
    const c = (row.creativeJson ?? {}) as any;
    const r = (row.rewardJson ?? {}) as any;

    setEditor({
      id: row.id,
      name: row.name,
      enabled: Boolean(row.enabled),
      priority: typeof row.priority === "number" ? row.priority : 0,
      placement: row.placement,
      startAtIso: row.startAt ? new Date(row.startAt).toISOString() : "",
      endAtIso: row.endAt ? new Date(row.endAt).toISOString() : "",

      portalVariant: (t.portalVariant === "credit" || t.portalVariant === "portal" || t.portalVariant === "any") ? t.portalVariant : "any",
      billingModel: (t.billingModel === "subscription" || t.billingModel === "credits" || t.billingModel === "any") ? t.billingModel : "any",
      industriesCsv: joinCsv(t.industries),
      businessModelsCsv: joinCsv(t.businessModels),
      serviceSlugsAnyCsv: joinCsv(t.serviceSlugsAny),
      serviceSlugsAllCsv: joinCsv(t.serviceSlugsAll),
      pathsCsv: joinCsv(t.paths),

      headline: String(c.headline ?? ""),
      body: String(c.body ?? ""),
      ctaText: String(c.ctaText ?? ""),
      linkUrl: String(c.linkUrl ?? ""),
      mediaKind: (c.mediaKind === "video" ? "video" : "image"),
      mediaUrl: String(c.mediaUrl ?? ""),

      rewardCredits: Number.isFinite(Number(r.credits)) ? Math.max(0, Math.floor(Number(r.credits))) : 0,
      cooldownHours: Number.isFinite(Number(r.cooldownHours)) ? Math.max(0, Math.floor(Number(r.cooldownHours))) : 0,
      minWatchSeconds: Number.isFinite(Number(r.minWatchSeconds)) ? Math.max(0, Math.floor(Number(r.minWatchSeconds))) : 0,
    });
  }

  async function saveEditor() {
    if (!editor) return;
    setError(null);

    const targetJson: any = {
      portalVariant: editor.portalVariant,
      billingModel: editor.billingModel,
      industries: splitCsv(editor.industriesCsv),
      businessModels: splitCsv(editor.businessModelsCsv),
      serviceSlugsAny: splitCsv(editor.serviceSlugsAnyCsv),
      serviceSlugsAll: splitCsv(editor.serviceSlugsAllCsv),
      paths: splitCsv(editor.pathsCsv),
    };

    const creativeJson: any = {
      headline: editor.headline.trim(),
      body: editor.body.trim(),
      ctaText: editor.ctaText.trim(),
      linkUrl: editor.linkUrl.trim(),
      mediaKind: editor.mediaKind,
      mediaUrl: editor.mediaUrl.trim(),
    };

    const rewardJson: any =
      editor.placement === "FULLSCREEN_REWARD" || editor.rewardCredits > 0
        ? {
            credits: Math.max(0, Math.floor(Number(editor.rewardCredits) || 0)),
            cooldownHours: Math.max(0, Math.floor(Number(editor.cooldownHours) || 0)),
            minWatchSeconds: Math.max(0, Math.floor(Number(editor.minWatchSeconds) || 0)),
          }
        : null;

    const payload: any = {
      name: editor.name,
      enabled: editor.enabled,
      priority: editor.priority,
      placement: editor.placement,
      startAtIso: toIsoOrNull(editor.startAtIso),
      endAtIso: toIsoOrNull(editor.endAtIso),
      targetJson,
      creativeJson,
      rewardJson,
    };

    const url = "/api/staff/portal/ad-campaigns";
    const method = editor.id ? "PUT" : "POST";
    if (editor.id) payload.id = editor.id;

    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null as any);

    const body = (await res?.json().catch(() => null)) as any;

    if (!res?.ok || !body?.ok) {
      setError(body?.error || "Unable to save campaign.");
      return;
    }

    setEditor(null);
    await loadCampaigns();
  }

  async function openAssignments(campaignId: string) {
    setAssignOpen(true);
    setAssignCampaignId(campaignId);
    setAssignments([]);
    setOwnerQuery("");
    setOwnerResults([]);

    const res = await fetch(`/api/staff/portal/ad-campaigns/assign/${encodeURIComponent(campaignId)}`, { cache: "no-store" }).catch(
      () => null as any,
    );
    const json = (await res?.json().catch(() => null)) as any;
    if (!res?.ok || !json?.ok || !Array.isArray(json.assignments)) {
      setError("Unable to load assignments.");
      return;
    }

    setAssignments(
      json.assignments.map((a: any) => ({
        ownerId: String(a.ownerId),
        email: String(a?.owner?.email ?? ""),
        businessName: String(a?.owner?.businessProfile?.businessName ?? ""),
      })),
    );
  }

  async function searchOwners(q: string) {
    setOwnerLoading(true);
    const res = await fetch(`/api/staff/portal/owners?q=${encodeURIComponent(q)}&take=50`, { cache: "no-store" }).catch(() => null as any);
    const json = (await res?.json().catch(() => null)) as any;
    setOwnerLoading(false);
    if (!res?.ok || !json?.ok || !Array.isArray(json.owners)) {
      setOwnerResults([]);
      return;
    }
    setOwnerResults(json.owners);
  }

  async function assignOwner(ownerId: string) {
    if (!assignCampaignId) return;
    const res = await fetch(`/api/staff/portal/ad-campaigns/assign/${encodeURIComponent(assignCampaignId)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ownerId }),
    }).catch(() => null as any);
    if (!res?.ok) {
      setError("Unable to assign owner.");
      return;
    }
    await openAssignments(assignCampaignId);
  }

  async function unassignOwner(ownerId: string) {
    if (!assignCampaignId) return;
    const res = await fetch(
      `/api/staff/portal/ad-campaigns/assign/${encodeURIComponent(assignCampaignId)}?ownerId=${encodeURIComponent(ownerId)}`,
      { method: "DELETE" },
    ).catch(() => null as any);
    if (!res?.ok) {
      setError("Unable to unassign owner.");
      return;
    }
    await openAssignments(assignCampaignId);
  }

  if (loading) {
    return <div className="text-sm text-zinc-600">Loading campaigns…</div>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-brand-ink">Campaigns</div>
          <div className="mt-1 text-sm text-zinc-600">
            Create targeted portal ads (sidebar banners, billing sponsored cards, and fullscreen reward videos).
          </div>
        </div>
        <button
          type="button"
          className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
          onClick={openCreate}
        >
          New campaign
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-3xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Placement</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Window</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.id} className="border-t border-zinc-200">
                <td className="px-4 py-3">
                  <div className="font-semibold text-zinc-900">{c.name}</div>
                  <div className="mt-1 text-xs text-zinc-500">{c.id}</div>
                </td>
                <td className="px-4 py-3 text-zinc-700">{placementLabel(c.placement)}</td>
                <td className="px-4 py-3 text-zinc-700">{c.priority}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-semibold " +
                      (c.enabled ? "bg-emerald-100 text-emerald-900" : "bg-zinc-100 text-zinc-700")
                    }
                  >
                    {c.enabled ? "Enabled" : "Disabled"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-zinc-600">
                  {c.startAt ? new Date(c.startAt).toLocaleString() : "—"} → {c.endAt ? new Date(c.endAt).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                      onClick={() => openEdit(c)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                      onClick={() => void openAssignments(c.id)}
                    >
                      Assign users
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editor ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setEditor(null)}>
          <div
            className="w-full max-w-4xl rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-zinc-900">{editor.id ? "Edit campaign" : "New campaign"}</div>
                <div className="mt-1 text-sm text-zinc-600">Target by variant, billing model, business profile, and services.</div>
              </div>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                onClick={() => setEditor(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Basics</div>
                <div className="mt-2 grid gap-2">
                  <label className="text-xs font-semibold text-zinc-600">Name</label>
                  <input
                    className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                    value={editor.name}
                    onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-semibold text-zinc-600">Placement</label>
                      <select
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        value={editor.placement}
                        onChange={(e) => setEditor({ ...editor, placement: e.target.value as Placement })}
                      >
                        <option value="SIDEBAR_BANNER">Sidebar banner</option>
                        <option value="BILLING_SPONSORED">Billing sponsored</option>
                        <option value="FULLSCREEN_REWARD">Fullscreen reward</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-zinc-600">Priority</label>
                      <input
                        className="mt-1 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                        type="number"
                        value={editor.priority}
                        onChange={(e) => setEditor({ ...editor, priority: Math.floor(Number(e.target.value) || 0) })}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      id="enabled"
                      type="checkbox"
                      checked={editor.enabled}
                      onChange={(e) => setEditor({ ...editor, enabled: e.target.checked })}
                    />
                    <label htmlFor="enabled" className="text-sm font-semibold text-zinc-800">
                      Enabled
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <label className="text-xs font-semibold text-zinc-600">Start (ISO or any date string)</label>
                      <input
                        className="mt-1 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                        placeholder="2026-02-25T12:00:00Z"
                        value={editor.startAtIso}
                        onChange={(e) => setEditor({ ...editor, startAtIso: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-zinc-600">End (ISO or any date string)</label>
                      <input
                        className="mt-1 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                        placeholder="2026-03-01T00:00:00Z"
                        value={editor.endAtIso}
                        onChange={(e) => setEditor({ ...editor, endAtIso: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-zinc-900">Targeting</div>
                <div className="mt-2 grid gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-semibold text-zinc-600">Portal variant</label>
                      <select
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        value={editor.portalVariant}
                        onChange={(e) => setEditor({ ...editor, portalVariant: e.target.value as any })}
                      >
                        <option value="any">Any</option>
                        <option value="portal">/portal</option>
                        <option value="credit">/credit</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-zinc-600">Billing model</label>
                      <select
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        value={editor.billingModel}
                        onChange={(e) => setEditor({ ...editor, billingModel: e.target.value as any })}
                      >
                        <option value="any">Any</option>
                        <option value="subscription">Subscription</option>
                        <option value="credits">Credits-only</option>
                      </select>
                    </div>
                  </div>

                  <label className="text-xs font-semibold text-zinc-600">Industries (comma-separated exact match)</label>
                  <input
                    className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                    placeholder="Plumbing, Dentistry"
                    value={editor.industriesCsv}
                    onChange={(e) => setEditor({ ...editor, industriesCsv: e.target.value })}
                  />

                  <label className="text-xs font-semibold text-zinc-600">Business models (comma-separated exact match)</label>
                  <input
                    className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                    placeholder="Local service, SaaS"
                    value={editor.businessModelsCsv}
                    onChange={(e) => setEditor({ ...editor, businessModelsCsv: e.target.value })}
                  />

                  <label className="text-xs font-semibold text-zinc-600">Service slugs ANY (comma-separated)</label>
                  <input
                    className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                    placeholder="booking, blogs, ai-receptionist"
                    value={editor.serviceSlugsAnyCsv}
                    onChange={(e) => setEditor({ ...editor, serviceSlugsAnyCsv: e.target.value })}
                  />

                  <label className="text-xs font-semibold text-zinc-600">Service slugs ALL (comma-separated)</label>
                  <input
                    className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                    placeholder="booking, inbox"
                    value={editor.serviceSlugsAllCsv}
                    onChange={(e) => setEditor({ ...editor, serviceSlugsAllCsv: e.target.value })}
                  />

                  <label className="text-xs font-semibold text-zinc-600">Paths (comma-separated; supports prefix*)</label>
                  <input
                    className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                    placeholder="/portal/app/billing, /portal/app/services/*"
                    value={editor.pathsCsv}
                    onChange={(e) => setEditor({ ...editor, pathsCsv: e.target.value })}
                  />

                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                    Tip: Use “Assign users” to explicitly target specific owners.
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-zinc-900">Creative</div>
                <div className="mt-2 grid gap-2">
                  <label className="text-xs font-semibold text-zinc-600">Headline</label>
                  <input
                    className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                    value={editor.headline}
                    onChange={(e) => setEditor({ ...editor, headline: e.target.value })}
                  />

                  <label className="text-xs font-semibold text-zinc-600">Body</label>
                  <textarea
                    className="min-h-[90px] rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                    value={editor.body}
                    onChange={(e) => setEditor({ ...editor, body: e.target.value })}
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-semibold text-zinc-600">CTA text</label>
                      <input
                        className="mt-1 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                        value={editor.ctaText}
                        onChange={(e) => setEditor({ ...editor, ctaText: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-zinc-600">Link URL</label>
                      <input
                        className="mt-1 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                        placeholder="/portal/app/billing"
                        value={editor.linkUrl}
                        onChange={(e) => setEditor({ ...editor, linkUrl: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-semibold text-zinc-600">Media kind</label>
                      <select
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        value={editor.mediaKind}
                        onChange={(e) => setEditor({ ...editor, mediaKind: e.target.value as any })}
                      >
                        <option value="image">Image</option>
                        <option value="video">Video</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-zinc-600">Media URL</label>
                      <input
                        className="mt-1 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                        placeholder="https://…"
                        value={editor.mediaUrl}
                        onChange={(e) => setEditor({ ...editor, mediaUrl: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-zinc-900">Reward (optional)</div>
                <div className="mt-2 grid gap-2">
                  <label className="text-xs font-semibold text-zinc-600">Reward credits</label>
                  <input
                    className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                    type="number"
                    min={0}
                    value={editor.rewardCredits}
                    onChange={(e) => setEditor({ ...editor, rewardCredits: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                  />

                  <label className="text-xs font-semibold text-zinc-600">Cooldown hours</label>
                  <input
                    className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                    type="number"
                    min={0}
                    value={editor.cooldownHours}
                    onChange={(e) => setEditor({ ...editor, cooldownHours: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                  />

                  <label className="text-xs font-semibold text-zinc-600">Min watch seconds</label>
                  <input
                    className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                    type="number"
                    min={0}
                    value={editor.minWatchSeconds}
                    onChange={(e) => setEditor({ ...editor, minWatchSeconds: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                  />

                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                    Rewards are claimed in the portal (credits-only users). Cooldown enforcement is server-side.
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                onClick={() => setEditor(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                onClick={() => void saveEditor()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {assignOpen && assignCampaignId ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setAssignOpen(false)}>
          <div
            className="w-full max-w-3xl rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-zinc-900">Assign users</div>
                <div className="mt-1 text-sm text-zinc-600">Explicitly target specific portal owners for this campaign.</div>
              </div>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                onClick={() => setAssignOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Assigned</div>
                <div className="mt-2 max-h-[180px] overflow-y-auto">
                  {assignments.length ? (
                    <div className="grid gap-2">
                      {assignments.map((a) => (
                        <div key={a.ownerId} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-zinc-900">{a.email}</div>
                            <div className="truncate text-xs text-zinc-500">{a.businessName || a.ownerId}</div>
                          </div>
                          <button
                            type="button"
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                            onClick={() => void unassignOwner(a.ownerId)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-600">No explicit assignments yet.</div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="min-w-[220px] flex-1 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    placeholder="Search owners by email, business name, industry…"
                    value={ownerQuery}
                    onChange={(e) => {
                      const v = e.target.value;
                      setOwnerQuery(v);
                      void searchOwners(v);
                    }}
                  />
                  <button
                    type="button"
                    className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                    onClick={() => void searchOwners(ownerQuery)}
                    disabled={ownerLoading}
                  >
                    {ownerLoading ? "Searching…" : "Search"}
                  </button>
                </div>

                <div className="mt-3 max-h-[260px] overflow-y-auto rounded-2xl border border-zinc-200">
                  {ownerResults.length ? (
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        <tr>
                          <th className="px-3 py-2">Owner</th>
                          <th className="px-3 py-2">Business</th>
                          <th className="px-3 py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ownerResults.map((o) => (
                          <tr key={o.id} className="border-t border-zinc-200">
                            <td className="px-3 py-2">
                              <div className="font-semibold text-zinc-900">{o.email}</div>
                              <div className="text-xs text-zinc-500">{o.id}</div>
                            </td>
                            <td className="px-3 py-2 text-xs text-zinc-600">
                              <div className="font-semibold text-zinc-800">{o.businessProfile?.businessName || "—"}</div>
                              <div>{o.businessProfile?.industry || ""}{o.businessProfile?.businessModel ? ` • ${o.businessProfile.businessModel}` : ""}</div>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                className="rounded-xl bg-brand-ink px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95"
                                onClick={() => void assignOwner(o.id)}
                              >
                                Assign
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-3 text-sm text-zinc-600">Search to find portal owners.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
