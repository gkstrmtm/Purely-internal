"use client";

import { useEffect, useMemo, useState } from "react";

type MemberRow = {
  userId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  user: { id: string; email: string; name: string; role: string; active: boolean };
  implicit?: boolean;
};

type InviteRow = {
  id: string;
  email: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  token: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt?: string;
};

type UsersPayload = {
  ok: true;
  ownerId: string;
  memberId: string;
  myRole: "OWNER" | "ADMIN" | "MEMBER" | null;
  members: MemberRow[];
  invites: InviteRow[];
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function PortalPeopleUsersClient() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<UsersPayload | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/portal/people/users", { cache: "no-store" });
      const json = (await res.json()) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load users");
      setData(json as UsersPayload);
    } catch (e: any) {
      setErr(String(e?.message || "Failed to load"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const canInvite = useMemo(() => {
    const r = data?.myRole;
    return r === "OWNER" || r === "ADMIN";
  }, [data?.myRole]);

  async function createInvite() {
    setInviteMsg(null);
    const email = inviteEmail.trim();
    if (!email) return;

    setInviting(true);
    try {
      const res = await fetch("/api/portal/people/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role: inviteRole }),
      });
      const json = (await res.json()) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to invite");

      setInviteEmail("");
      setInviteRole("MEMBER");

      const link = String(json.link || "");
      if (link) {
        try {
          await navigator.clipboard.writeText(link);
          setInviteMsg("Invite created. Link copied to clipboard.");
        } catch {
          setInviteMsg("Invite created.");
        }
      } else {
        setInviteMsg("Invite created.");
      }

      await load();
    } catch (e: any) {
      setInviteMsg(String(e?.message || "Failed to invite"));
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">People</h1>
          <p className="mt-2 text-sm text-zinc-600">Manage portal users and invites.</p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
        >
          Refresh
        </button>
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
              <div className="text-base font-semibold text-zinc-900">Members</div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Your role: {data.myRole ?? "—"}
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.members.map((m) => (
                    <tr key={m.userId} className="border-t border-zinc-200">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-zinc-900">{m.user?.name || "—"}</div>
                        <div className="text-xs text-zinc-500">{m.user?.email || ""}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={classNames(
                            "inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold",
                            m.role === "OWNER"
                              ? "bg-[color:rgba(29,78,216,0.12)] text-[color:var(--color-brand-blue)]"
                              : m.role === "ADMIN"
                                ? "bg-zinc-200 text-zinc-800"
                                : "bg-zinc-100 text-zinc-700",
                          )}
                        >
                          {m.role}
                          {m.implicit ? " (account)" : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={classNames(
                            "inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold",
                            m.user?.active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600",
                          )}
                        >
                          {m.user?.active ? "Active" : "Disabled"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-xs text-zinc-500">
              The account owner is always included as an implicit member.
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold text-zinc-900">Invites</div>
              {canInvite ? (
                <div className="text-xs text-zinc-500">Create an invite link for a teammate.</div>
              ) : (
                <div className="text-xs text-zinc-500">Only admins can invite.</div>
              )}
            </div>

            {canInvite ? (
              <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr,180px]">
                  <div>
                    <div className="text-xs font-semibold text-zinc-700">Email</div>
                    <input
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="teammate@company.com"
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--color-brand-blue)]"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-zinc-700">Role</div>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole((e.target.value as any) || "MEMBER")}
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="MEMBER">Member</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-zinc-500">Invite link expires automatically.</div>
                  <button
                    type="button"
                    disabled={inviting || !inviteEmail.trim()}
                    onClick={() => createInvite()}
                    className={classNames(
                      "rounded-2xl px-4 py-2 text-sm font-semibold",
                      inviting || !inviteEmail.trim()
                        ? "cursor-not-allowed bg-zinc-200 text-zinc-600"
                        : "bg-[color:var(--color-brand-blue)] text-white hover:brightness-95",
                    )}
                  >
                    {inviting ? "Inviting…" : "Send invite"}
                  </button>
                </div>

                {inviteMsg ? <div className="mt-3 text-sm text-zinc-700">{inviteMsg}</div> : null}
              </div>
            ) : null}

            <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">State</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invites.length ? (
                    data.invites.map((inv) => (
                      <tr key={inv.id} className="border-t border-zinc-200">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-zinc-900">{inv.email}</div>
                          <div className="text-xs text-zinc-500">Expires {new Date(inv.expiresAt).toLocaleString()}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700">
                            {inv.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {inv.acceptedAt ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                              Accepted
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                              Pending
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="border-t border-zinc-200">
                      <td className="px-4 py-5 text-sm text-zinc-600" colSpan={3}>
                        No invites yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
