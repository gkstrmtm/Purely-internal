"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { useToast } from "@/components/ToastProvider";

type CampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";

type Campaign = {
  id: string;
  name: string;
  status: CampaignStatus;
  script: string;
  audienceTagIds: string[];
  createdAtIso: string;
  updatedAtIso: string;
  enrollQueued: number;
  enrollCompleted: number;
};

type ContactTag = { id: string; name: string; color: string | null };

type ApiGetCampaignsResponse =
  | { ok: true; campaigns: Campaign[] }
  | { ok: false; error: string };

type ApiCreateCampaignResponse =
  | { ok: true; id: string }
  | { ok: false; error: string };

type ApiCreateTagResponse =
  | { ok: true; tag: ContactTag }
  | { ok: false; error: string };

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function PortalAiOutboundCallsClient() {
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tags, setTags] = useState<ContactTag[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => campaigns.find((c) => c.id === selectedId) ?? null, [campaigns, selectedId]);

  const [createName, setCreateName] = useState("");
  const [addTagValue, setAddTagValue] = useState<string>("");

  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("");
  const [tagSearch, setTagSearch] = useState("");

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);

    try {
      const [cRes, tRes] = await Promise.all([
        fetch("/api/portal/ai-outbound-calls/campaigns", { cache: "no-store" }),
        fetch("/api/portal/contact-tags", { cache: "no-store" }),
      ]);

      const cJson = (await cRes.json().catch(() => null)) as ApiGetCampaignsResponse | null;
      if (!cRes.ok || !cJson || !cJson.ok) {
        throw new Error((cJson as any)?.error || "Failed to load campaigns");
      }

      const tJson = (await tRes.json().catch(() => null)) as any;
      const nextTags: ContactTag[] = Array.isArray(tJson?.tags)
        ? tJson.tags
            .map((x: any) => ({
              id: String(x?.id || ""),
              name: String(x?.name || ""),
              color: x?.color ? String(x.color) : null,
            }))
            .filter((x: ContactTag) => Boolean(x.id && x.name))
        : [];

      if (!mountedRef.current) return;
      setCampaigns(cJson.campaigns);
      setTags(nextTags);
      if (!selectedId && cJson.campaigns[0]?.id) setSelectedId(cJson.campaigns[0].id);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (!mountedRef.current) return;
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  async function createCampaign() {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/portal/ai-outbound-calls/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: createName.trim() || undefined }),
      });

      const json = (await res.json().catch(() => null)) as ApiCreateCampaignResponse | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error((json as any)?.error || "Failed to create");
      }

      setCreateName("");
      await loadAll();
      setSelectedId(json.id);
      toast.success("Campaign created");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setBusy(false);
    }
  }

  async function createTagAndMaybeAdd() {
    const name = newTagName.trim();
    if (!name) return;
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/portal/contact-tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          color: newTagColor.trim() || undefined,
        }),
      });

      const json = (await res.json().catch(() => null)) as ApiCreateTagResponse | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error((json as any)?.error || "Failed to create tag");
      }

      setNewTagName("");
      setNewTagColor("");

      // Refresh tags + campaigns to keep everything in sync.
      await loadAll();

      // Convenience: add to the selected campaign if present.
      if (selected?.id && json.tag?.id) {
        addAudienceTag(json.tag.id);
      }

      toast.success("Tag created");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create tag");
    } finally {
      setBusy(false);
    }
  }

  async function updateCampaign(patch: Partial<Pick<Campaign, "name" | "status" | "script" | "audienceTagIds">>) {
    if (!selected) return;
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(`/api/portal/ai-outbound-calls/campaigns/${encodeURIComponent(selected.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        },
      );

      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) {
        throw new Error(json?.error || "Failed to update");
      }

      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  }

  const statusOptions = useMemo(
    () =>
      ([
        { value: "DRAFT", label: "Draft" },
        { value: "ACTIVE", label: "Active" },
        { value: "PAUSED", label: "Paused" },
        { value: "ARCHIVED", label: "Archived" },
      ] as const),
    [],
  );

  const addTagOptions = useMemo(() => {
    const selectedTagSet = new Set(selected?.audienceTagIds ?? []);
    const usable = tags.filter((t) => !selectedTagSet.has(t.id));
    return [
      { value: "", label: "Add existing tag…" },
      ...usable.map((t) => ({ value: t.id, label: t.name })),
    ];
  }, [tags, selected]);

  const allTagsFiltered = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    const xs = [...tags].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return xs;
    return xs.filter((t) => t.name.toLowerCase().includes(q));
  }, [tags, tagSearch]);

  function addAudienceTag(tagId: string) {
    if (!selected) return;
    const id = String(tagId || "").trim();
    if (!id) return;
    if (selected.audienceTagIds.includes(id)) return;
    const next = [...selected.audienceTagIds, id].slice(0, 50);
    updateCampaign({ audienceTagIds: next });
  }

  function removeAudienceTag(tagId: string) {
    if (!selected) return;
    const id = String(tagId || "").trim();
    if (!id) return;
    const next = selected.audienceTagIds.filter((x) => x !== id);
    updateCampaign({ audienceTagIds: next });
  }

  const selectedTags = useMemo(() => {
    const map = new Map(tags.map((t) => [t.id, t] as const));
    return (selected?.audienceTagIds ?? []).map((id) => map.get(id)).filter(Boolean) as ContactTag[];
  }, [tags, selected]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">AI Outbound Calls</h1>
          <p className="mt-1 text-sm text-zinc-600">Call a contact when they get a tag.</p>
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <div className="text-sm font-semibold text-zinc-800">New campaign</div>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Name (optional)"
              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={createCampaign}
            className={classNames(
              "inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold",
              busy ? "bg-zinc-200 text-zinc-600" : "bg-brand-ink text-white hover:opacity-95",
            )}
          >
            Create
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[320px,1fr]">
        <div className="rounded-3xl border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-zinc-800">Campaigns</div>
          <div className="mt-3 space-y-2">
            {loading ? (
              <div className="text-sm text-zinc-500">Loading…</div>
            ) : campaigns.length === 0 ? (
              <div className="text-sm text-zinc-500">No campaigns yet.</div>
            ) : (
              campaigns.map((c) => {
                const active = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={classNames(
                      "w-full rounded-2xl border px-3 py-3 text-left",
                      active ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 hover:bg-zinc-50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-semibold text-zinc-900">{c.name}</div>
                      <div className="shrink-0 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-700">
                        {c.status}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      Queued: {c.enrollQueued} • Completed: {c.enrollCompleted}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-4">
          {!selected ? (
            <div className="text-sm text-zinc-500">Select a campaign.</div>
          ) : (
            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1">
                  <div className="text-sm font-semibold text-zinc-800">Campaign name</div>
                  <input
                    value={selected.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setCampaigns((prev) => prev.map((c) => (c.id === selected.id ? { ...c, name } : c)));
                    }}
                    onBlur={() => updateCampaign({ name: selected.name })}
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div className="w-full sm:w-[220px]">
                  <div className="text-sm font-semibold text-zinc-800">Status</div>
                  <div className="mt-1">
                    <PortalListboxDropdown
                      value={selected.status}
                      options={statusOptions as any}
                      onChange={(v) => updateCampaign({ status: v as CampaignStatus })}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <div className="text-sm font-semibold text-zinc-800">Call script</div>
                <p className="mt-1 text-xs text-zinc-500">
                  This is read aloud when the call connects.
                </p>
                <textarea
                  value={selected.script}
                  onChange={(e) => {
                    const script = e.target.value;
                    setCampaigns((prev) => prev.map((c) => (c.id === selected.id ? { ...c, script } : c)));
                  }}
                  onBlur={() => updateCampaign({ script: selected.script })}
                  rows={7}
                  className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                />
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-800">Audience tags</div>
                    <p className="mt-1 text-xs text-zinc-500">When a contact gets one of these tags, they’ll be queued for a call.</p>
                  </div>
                </div>

                <div className="mt-2 max-w-sm">
                  <PortalListboxDropdown
                    value={addTagValue}
                    options={addTagOptions as any}
                    onChange={(v) => {
                      const id = String(v || "");
                      if (!id) {
                        setAddTagValue("");
                        return;
                      }
                      setAddTagValue("");
                      addAudienceTag(id);
                    }}
                  />
                </div>

                <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-xs font-semibold text-zinc-700">Create a tag</div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr,140px,120px]">
                    <input
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      placeholder="Tag name"
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                    <input
                      value={newTagColor}
                      onChange={(e) => setNewTagColor(e.target.value)}
                      placeholder="#64748B (optional)"
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      disabled={busy || !newTagName.trim()}
                      onClick={createTagAndMaybeAdd}
                      className={classNames(
                        "inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold",
                        busy || !newTagName.trim()
                          ? "bg-zinc-200 text-zinc-600"
                          : "bg-brand-ink text-white hover:opacity-95",
                      )}
                    >
                      Create
                    </button>
                  </div>
                  <div className="mt-2 text-[11px] text-zinc-500">
                    Tip: created tags show up immediately, and clicking a tag adds it to this campaign.
                  </div>
                </div>

                {selectedTags.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedTags.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => removeAudienceTag(t.id)}
                        className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                        title="Remove"
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color || "#64748B" }} />
                        <span className="max-w-[180px] truncate">{t.name}</span>
                        <span className="text-zinc-400">×</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-zinc-500">No tags selected.</div>
                )}

                <div className="mt-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-zinc-800">All tags</div>
                    <div className="text-xs font-semibold text-zinc-500">{tags.length.toLocaleString()} total</div>
                  </div>

                  <div className="mt-2 max-w-sm">
                    <input
                      value={tagSearch}
                      onChange={(e) => setTagSearch(e.target.value)}
                      placeholder="Search tags…"
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                  </div>

                  {allTagsFiltered.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {allTagsFiltered.map((t) => {
                        const already = !!selected?.audienceTagIds?.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            disabled={already}
                            onClick={() => addAudienceTag(t.id)}
                            className={classNames(
                              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
                              already
                                ? "border-zinc-200 bg-zinc-100 text-zinc-500"
                                : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                            )}
                            title={already ? "Already selected" : "Add to campaign"}
                          >
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color || "#64748B" }} />
                            <span className="max-w-[220px] truncate">{t.name}</span>
                            {already ? <span className="text-zinc-400">✓</span> : <span className="text-zinc-400">+</span>}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-3 text-xs text-zinc-500">No tags found.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
