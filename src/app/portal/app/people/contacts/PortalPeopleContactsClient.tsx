"use client";

import { useEffect, useMemo, useState } from "react";

import { PortalPeopleTabs } from "@/app/portal/app/people/PortalPeopleTabs";

type ContactRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAtIso: string | null;
  updatedAtIso: string | null;
};

type LeadRow = {
  id: string;
  businessName: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  createdAtIso: string | null;
  assignedToUserId: string | null;
};

type ContactsPayload = {
  ok: true;
  contacts: ContactRow[];
  unlinkedLeads: LeadRow[];
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function PortalPeopleContactsClient() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ContactsPayload | null>(null);
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/portal/people/contacts", { cache: "no-store" });
      const json = (await res.json()) as any;
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Failed to load"));
      setData(json as ContactsPayload);
    } catch (e: any) {
      setErr(String(e?.message || "Failed to load"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredContacts = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = data?.contacts || [];
    if (!needle) return rows;
    return rows.filter((c) => {
      const hay = `${c.name || ""} ${c.email || ""} ${c.phone || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [data?.contacts, q]);

  const filteredLeads = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = data?.unlinkedLeads || [];
    if (!needle) return rows;
    return rows.filter((l) => {
      const hay = `${l.businessName || ""} ${l.email || ""} ${l.phone || ""} ${l.website || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [data?.unlinkedLeads, q]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">People</h1>
          <p className="mt-2 text-sm text-zinc-600">Contacts and leads across your portal.</p>
          <PortalPeopleTabs />
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
        >
          Refresh
        </button>
      </div>

      <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-4">
        <div className="text-xs font-semibold text-zinc-700">Search</div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, email, phone, website…"
          className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--color-brand-blue)]"
        />
      </div>

      {loading ? (
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Loading…</div>
      ) : err ? (
        <div className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">{err}</div>
      ) : null}

      {data ? (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold text-zinc-900">Contacts ({filteredContacts.length})</div>
              <div className="text-xs text-zinc-500">Normalized people records</div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.length ? (
                    filteredContacts.slice(0, 250).map((c) => (
                      <tr key={c.id} className="border-t border-zinc-200">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-zinc-900">{c.name || "—"}</div>
                        </td>
                        <td className="px-4 py-3">{c.email || "—"}</td>
                        <td className="px-4 py-3">{c.phone || "—"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr className="border-t border-zinc-200">
                      <td className="px-4 py-5 text-sm text-zinc-600" colSpan={3}>
                        No contacts yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-xs text-zinc-500">Showing up to 250 rows.</div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold text-zinc-900">Unlinked leads ({filteredLeads.length})</div>
              <div className="text-xs text-zinc-500">Leads without a contact</div>
            </div>

            <div className="mt-4 space-y-3">
              {filteredLeads.length ? (
                filteredLeads.slice(0, 200).map((l) => (
                  <div key={l.id} className="rounded-2xl border border-zinc-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-zinc-900">{l.businessName || "—"}</div>
                        <div className="mt-1 text-sm text-zinc-600">
                          {l.email || "—"} {l.phone ? `• ${l.phone}` : ""}
                        </div>
                        {l.website ? <div className="mt-1 text-xs text-zinc-500">{l.website}</div> : null}
                      </div>
                      <span
                        className={classNames(
                          "inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold",
                          l.assignedToUserId ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600",
                        )}
                      >
                        {l.assignedToUserId ? "Assigned" : "Unassigned"}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-zinc-600">No unlinked leads.</div>
              )}
            </div>

            <div className="mt-3 text-xs text-zinc-500">Showing up to 200 cards.</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
