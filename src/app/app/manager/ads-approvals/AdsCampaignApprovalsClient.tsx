"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  name: string;
  enabled: boolean;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  reviewedAt: string | null;
  reviewNotes: string | null;
  placement: string;
  startAt: string | null;
  endAt: string | null;
  targetJson: any;
  creativeJson: any;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; email: string; name: string | null } | null;
};

function usd(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function AdsCampaignApprovalsClient() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [reasonById, setReasonById] = useState<
    Record<
      string,
      "MISLEADING_OR_FALSE" | "INAPPROPRIATE_CONTENT" | "PROHIBITED_PRODUCTS" | "SPAM_OR_LOW_QUALITY" | "BROKEN_OR_MISMATCHED_LINK"
    >
  >({});

  async function load() {
    setError(null);
    const res = await fetch("/api/manager/ads/campaign-approvals", { cache: "no-store" }).catch(() => null as any);
    const json = (await res?.json().catch(() => null)) as any;
    if (!res?.ok || !json?.ok) {
      setError(String(json?.error || "Unable to load pending campaigns."));
      setRows([]);
      return;
    }
    setRows(Array.isArray(json.campaigns) ? (json.campaigns as Row[]) : []);
  }

  useEffect(() => {
    void load();
  }, []);

  const pending = useMemo(() => (rows || []).filter((r) => r.reviewStatus === "PENDING"), [rows]);

  async function decide(id: string, decision: "approve" | "reject") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/manager/ads/campaign-approvals/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision,
          reason:
            decision === "reject" ? (reasonById[id] ?? "MISLEADING_OR_FALSE") : null,
          notes: (notesById[id] ?? "").trim() || null,
        }),
      }).catch(() => null as any);
      const json = (await res?.json().catch(() => null)) as any;
      if (!res?.ok || !json?.ok) throw new Error(String(json?.error || "Update failed"));
      await load();
    } catch (err: any) {
      setError(String(err?.message || "Update failed"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Manager</div>
          <div className="mt-1 text-2xl font-bold text-zinc-900">Ad campaign approvals</div>
          <div className="mt-1 text-sm text-zinc-600">New Ads Manager campaigns stay offline until approved.</div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          Refresh
        </button>
      </div>

      {error ? <div className="text-sm font-semibold text-red-600">{error}</div> : null}

      <div className="rounded-3xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-6 py-4">
          <div className="text-sm font-semibold text-zinc-900">Pending ({pending.length})</div>
          <div className="mt-1 text-sm text-zinc-600">Approve to allow serving when enabled + scheduled.</div>
        </div>

        {rows === null ? <div className="px-6 py-10 text-sm text-zinc-600">Loading…</div> : null}

        {rows !== null && pending.length === 0 ? (
          <div className="px-6 py-10 text-sm text-zinc-600">No campaigns are waiting for approval.</div>
        ) : null}

        <div className="divide-y divide-zinc-100">
          {pending.map((c) => {
            const billing = c?.targetJson?.billing;
            const dailyBudgetCents = Number(billing?.dailyBudgetCents || 0);

            const creative = c.creativeJson ?? {};
            const headline = String(creative?.headline || "").trim();
            const body = String(creative?.body || "").trim();
            const ctaText = String(creative?.ctaText || "").trim();
            const linkUrl = String(creative?.linkUrl || "").trim();
            const mediaUrl = String(creative?.mediaUrl || "").trim();
            const mediaKind = String(creative?.mediaKind || "").trim();
            const mediaFit = String(creative?.mediaFit || "cover").trim() || "cover";
            const mediaPosition = String(creative?.mediaPosition || "50% 50%").trim() || "50% 50%";

            return (
              <div key={c.id} className="px-6 py-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-base font-semibold text-zinc-900">{c.name}</div>
                      <div className="rounded-full border border-[color:var(--color-brand-blue)]/20 bg-[color:var(--color-brand-blue)]/10 px-3 py-1 text-xs font-semibold text-[color:var(--color-brand-blue)]">
                        Pending
                      </div>
                    </div>

                    <div className="mt-1 text-sm text-zinc-600">
                      {c.placement}
                      {dailyBudgetCents ? ` · ${usd(dailyBudgetCents)}/day` : ""}
                      {c.createdBy?.email ? ` · ${c.createdBy.email}` : ""}
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white">
                        {mediaUrl ? (
                          <div className="relative h-44 w-full bg-zinc-50">
                            {mediaKind === "video" ? (
                              <video
                                src={mediaUrl}
                                muted
                                playsInline
                                controls
                                className="h-full w-full"
                                style={{ objectFit: mediaFit as any, objectPosition: mediaPosition }}
                              />
                            ) : (
                              <Image
                                src={mediaUrl}
                                alt="Creative"
                                fill
                                sizes="(max-width: 1024px) 100vw, 800px"
                                className="h-full w-full"
                                style={{ objectFit: mediaFit as any, objectPosition: mediaPosition }}
                                unoptimized
                              />
                            )}
                          </div>
                        ) : (
                          <div className="flex h-44 items-center justify-center bg-zinc-50 text-sm text-zinc-500">No media</div>
                        )}
                        <div className="p-4">
                          <div className="text-sm font-semibold text-zinc-900">{headline || "(No headline)"}</div>
                          {body ? <div className="mt-2 text-sm text-zinc-600">{body}</div> : null}
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            {linkUrl ? <div className="truncate text-xs font-semibold text-zinc-700">{linkUrl}</div> : <div className="text-xs text-zinc-500">No link URL</div>}
                            {ctaText ? (
                              <div className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-3 py-2 text-xs font-semibold text-white">
                                {ctaText}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-3xl border border-zinc-200 bg-white p-4">
                        <div className="text-sm font-semibold text-zinc-900">Review</div>
                        <div className="mt-1 text-sm text-zinc-600">Add optional notes (shown to the advertiser if rejected).</div>

                        <div className="mt-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Rejection reason</div>
                          <select
                            value={reasonById[c.id] ?? "MISLEADING_OR_FALSE"}
                            onChange={(e) =>
                              setReasonById((cur) => ({
                                ...cur,
                                [c.id]: e.target.value as any,
                              }))
                            }
                            className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                          >
                            <option value="MISLEADING_OR_FALSE">Misleading or false</option>
                            <option value="INAPPROPRIATE_CONTENT">Inappropriate content</option>
                            <option value="PROHIBITED_PRODUCTS">Prohibited products/services</option>
                            <option value="SPAM_OR_LOW_QUALITY">Spam / low quality</option>
                            <option value="BROKEN_OR_MISMATCHED_LINK">Broken or mismatched link</option>
                          </select>
                          <div className="mt-2 text-xs text-zinc-500">Required when you request changes.</div>
                        </div>

                        <textarea
                          value={notesById[c.id] ?? ""}
                          onChange={(e) => setNotesById((cur) => ({ ...cur, [c.id]: e.target.value }))}
                          rows={5}
                          className="mt-3 w-full resize-none rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                          placeholder="Notes (optional)"
                        />

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void decide(c.id, "approve")}
                            disabled={busyId === c.id}
                            className="rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                          >
                            {busyId === c.id ? "Saving…" : "Approve"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void decide(c.id, "reject")}
                            disabled={busyId === c.id}
                            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                          >
                            {busyId === c.id ? "Saving…" : "Request changes"}
                          </button>
                        </div>

                        <div className="mt-3 text-xs text-zinc-500">Created {new Date(c.createdAt).toLocaleString()}</div>
                        <div className="mt-1 text-xs text-zinc-500">Enabled: {c.enabled ? "Yes" : "No"}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
