"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PortalPeopleTabs } from "@/app/portal/app/people/PortalPeopleTabs";
import { useToast } from "@/components/ToastProvider";

type DuplicateGroup = {
  phoneKey: string;
  phone: string | null;
  count: number;
  distinctEmails: string[];
  needsEmailChoice: boolean;
  contacts: Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    createdAtIso: string;
    updatedAtIso: string;
  }>;
};

async function readJsonBody(res: Response): Promise<any | null> {
  if (res.status === 204) return null;
  const text = await res.text().catch(() => "");
  if (!text || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function PortalPeopleContactDuplicatesClient() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // For conflict resolution UI
  const [primaryByPhoneKey, setPrimaryByPhoneKey] = useState<Record<string, string>>({});
  const [primaryEmailByPhoneKey, setPrimaryEmailByPhoneKey] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/people/contacts/duplicates?limit=200", { cache: "no-store" });
      const body = await readJsonBody(res);
      if (!res.ok || !body?.ok) throw new Error(body?.error || "Failed to load duplicates");
      setGroups(Array.isArray(body.groups) ? body.groups : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e ?? "Unknown error"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const safeGroups = useMemo(() => groups.filter((g) => !g.needsEmailChoice), [groups]);
  const conflictGroups = useMemo(() => groups.filter((g) => g.needsEmailChoice), [groups]);

  const mergeGroup = useCallback(
    async (g: DuplicateGroup) => {
      const phoneKey = g.phoneKey;
      if (!phoneKey) return;

      const sorted = [...(g.contacts || [])].sort((a, b) => (b.updatedAtIso || "").localeCompare(a.updatedAtIso || ""));
      const primaryContactId = primaryByPhoneKey[phoneKey] || sorted[0]?.id;
      if (!primaryContactId) return;

      const mergeContactIds = (g.contacts || []).map((c) => c.id).filter((id) => id && id !== primaryContactId);
      if (!mergeContactIds.length) return;

      const primaryEmail = g.needsEmailChoice ? primaryEmailByPhoneKey[phoneKey] || "" : "";
      if (g.needsEmailChoice && !primaryEmail) {
        toast.error("Pick a primary email for this phone number.");
        return;
      }

      setBusyKey(phoneKey);
      try {
        const res = await fetch("/api/portal/people/contacts/merge", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            primaryContactId,
            mergeContactIds,
            primaryEmail: primaryEmail || null,
          }),
        });
        const body = await readJsonBody(res);
        if (!res.ok || !body?.ok) {
          if (body?.code === "EMAIL_CONFLICT") {
            toast.error("Multiple emails exist. Choose the primary email.");
          } else {
            toast.error(body?.error || "Merge failed");
          }
          return;
        }
        toast.success("Merged duplicates.");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Merge failed");
      } finally {
        setBusyKey(null);
      }
    },
    [load, primaryByPhoneKey, primaryEmailByPhoneKey, toast],
  );

  const mergeAllSafe = useCallback(async () => {
    const list = safeGroups.slice(0, 50);
    for (const g of list) {
      await mergeGroup(g);
    }
  }, [mergeGroup, safeGroups]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">People</h1>
          <p className="mt-2 text-sm text-zinc-600">Consolidate duplicate contacts by phone number.</p>
          <PortalPeopleTabs />
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/portal/app/people/contacts"
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
          >
            Back to contacts
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <div className="text-base font-semibold text-zinc-900">Duplicate groups</div>
            <div className="mt-1 text-sm text-zinc-600">
              Safe to auto-merge: {safeGroups.length} • Needs email choice: {conflictGroups.length}
            </div>
          </div>
          <button
            type="button"
            disabled={!safeGroups.length || Boolean(busyKey)}
            onClick={() => void mergeAllSafe()}
            className="rounded-2xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Merge all safe
          </button>
        </div>

        {loading ? <div className="mt-4 text-sm text-zinc-600">Loading…</div> : null}
        {error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}

        {!loading && !groups.length ? <div className="mt-4 text-sm text-zinc-600">No duplicates found.</div> : null}

        {groups.length ? (
          <div className="mt-4 space-y-4">
            {groups.map((g) => {
              const phoneKey = g.phoneKey;
              const sorted = [...(g.contacts || [])].sort((a, b) => (b.updatedAtIso || "").localeCompare(a.updatedAtIso || ""));
              const primaryContactId = primaryByPhoneKey[phoneKey] || sorted[0]?.id || "";

              const emailChoices = Array.from(
                new Set((g.contacts || []).map((c) => (c.email || "").trim()).filter((x) => x && x.includes("@"))),
              ).slice(0, 10);

              return (
                <div key={phoneKey} className="rounded-3xl border border-zinc-200 p-4">
                  <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">
                        {g.phone || g.phoneKey} <span className="ml-2 text-xs font-semibold text-zinc-500">({g.contacts.length} contacts)</span>
                      </div>
                      {g.needsEmailChoice ? (
                        <div className="mt-1 text-xs font-semibold text-amber-700">Same phone, different emails. Choose a primary email.</div>
                      ) : (
                        <div className="mt-1 text-xs font-semibold text-emerald-700">Safe to merge automatically.</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void mergeGroup(g)}
                      disabled={busyKey === phoneKey}
                      className="rounded-2xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {busyKey === phoneKey ? "Merging…" : "Merge"}
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div className="rounded-2xl border border-zinc-200 p-3">
                      <div className="text-xs font-semibold text-zinc-700">Pick primary contact</div>
                      <div className="mt-2 space-y-2">
                        {sorted.map((c) => (
                          <label key={c.id} className="flex cursor-pointer items-start gap-2 rounded-xl border border-zinc-200 p-2 hover:bg-zinc-50">
                            <input
                              type="radio"
                              name={`primary-${phoneKey}`}
                              checked={primaryContactId === c.id}
                              onChange={() => setPrimaryByPhoneKey((s) => ({ ...s, [phoneKey]: c.id }))}
                              className="mt-1"
                            />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-zinc-900">{c.name}</div>
                              <div className="mt-0.5 truncate text-xs text-zinc-600">{c.email || "(no email)"}</div>
                              <div className="mt-0.5 truncate text-[11px] text-zinc-500">Updated: {new Date(c.updatedAtIso).toLocaleString()}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 p-3">
                      <div className="text-xs font-semibold text-zinc-700">Primary email</div>
                      {!g.needsEmailChoice ? (
                        <div className="mt-2 text-sm text-zinc-600">No conflicts detected.</div>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {emailChoices.map((email) => (
                            <label key={email} className="flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 p-2 hover:bg-zinc-50">
                              <input
                                type="radio"
                                name={`email-${phoneKey}`}
                                checked={(primaryEmailByPhoneKey[phoneKey] || "") === email}
                                onChange={() => setPrimaryEmailByPhoneKey((s) => ({ ...s, [phoneKey]: email }))}
                              />
                              <span className="truncate text-sm text-zinc-800">{email}</span>
                            </label>
                          ))}
                          {!emailChoices.length ? (
                            <div className="text-sm text-zinc-600">No valid emails found in this group.</div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
