"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  defaultPortalPermissionsForRole,
  PORTAL_SERVICE_KEYS,
  PORTAL_SERVICE_LABELS,
  type PortalPermissions,
  type PortalServiceKey,
} from "@/lib/portalPermissions.shared";

import { PortalPeopleTabs } from "@/app/portal/app/people/PortalPeopleTabs";
import { normalizePortalPermissions } from "@/lib/portalPermissions";
import { useToast } from "@/components/ToastProvider";

type MemberRow = {
  userId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  user: { id: string; email: string; name: string; role: string; active: boolean };
  implicit?: boolean;
  permissionsJson?: unknown;
};

type InviteRow = {
  id: string;
  email: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  token: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt?: string;
  permissionsJson?: unknown;
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

async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
}

export function PortalPeopleUsersClient() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<UsersPayload | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [invitePermissions, setInvitePermissions] = useState<PortalPermissions>(() =>
    defaultPortalPermissionsForRole("MEMBER"),
  );
  const [inviting, setInviting] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const permissionsDropdownRef = useRef<HTMLDivElement | null>(null);

  const [editingMember, setEditingMember] = useState<MemberRow | null>(null);
  const [memberPermissions, setMemberPermissions] = useState<PortalPermissions | null>(null);
  const [memberRole, setMemberRole] = useState<"ADMIN" | "MEMBER" | null>(null);
  const [savingMember, setSavingMember] = useState(false);
  const [removingMember, setRemovingMember] = useState(false);

  const [demoteConfirmOpen, setDemoteConfirmOpen] = useState(false);
  const demoteContinueRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    setInvitePermissions(defaultPortalPermissionsForRole(inviteRole));
    if (inviteRole === "ADMIN") setPermissionsOpen(false);
  }, [inviteRole]);

  useEffect(() => {
    if (!permissionsOpen) return;

    function onDown(e: MouseEvent) {
      const el = permissionsDropdownRef.current;
      if (!el) return;
      if (el.contains(e.target as Node)) return;
      setPermissionsOpen(false);
    }

    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [permissionsOpen]);

  const selectedServicesCount = useMemo(() => {
    return PORTAL_SERVICE_KEYS.reduce((acc, k) => acc + (invitePermissions?.[k]?.view ? 1 : 0), 0);
  }, [invitePermissions]);

  function setAllPermissions(value: boolean) {
    const next = { ...invitePermissions };
    for (const k of PORTAL_SERVICE_KEYS) next[k] = { view: value, edit: value };
    setInvitePermissions(next);
  }

  type PermissionLevel = "none" | "view" | "full";

  function levelFor(k: PortalServiceKey): PermissionLevel {
    const p = invitePermissions?.[k];
    if (!p?.view && !p?.edit) return "none";
    if (p?.view && !p?.edit) return "view";
    return "full";
  }

  function setPermissionLevel(k: PortalServiceKey, level: PermissionLevel) {
    setInvitePermissions((prev) => {
      const base = prev ?? defaultPortalPermissionsForRole(inviteRole);
      const next = { ...base };
      next[k] =
        level === "none" ? { view: false, edit: false } : level === "view" ? { view: true, edit: false } : { view: true, edit: true };
      return next;
    });
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/portal/people/users", { cache: "no-store" });
      const json = (await res.json()) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load users");
      setData(json as UsersPayload);
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to load"));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const canInvite = useMemo(() => {
    const r = data?.myRole;
    return r === "OWNER" || r === "ADMIN";
  }, [data?.myRole]);

  const canEditMembers = canInvite;

  function openMemberEditor(m: MemberRow) {
    if (!canEditMembers) return;
    if (m.implicit || m.role === "OWNER") {
      toast.info("The account owner always has full access.");
      return;
    }

    const role = m.role === "ADMIN" || m.role === "MEMBER" ? m.role : "MEMBER";
    setEditingMember(m);
    setMemberRole(role);

    if (role === "ADMIN") {
      setMemberPermissions(defaultPortalPermissionsForRole("ADMIN"));
    } else {
      setMemberPermissions(normalizePortalPermissions(m.permissionsJson, role));
    }
  }

  function closeMemberEditor() {
    setEditingMember(null);
    setMemberPermissions(null);
    setMemberRole(null);
    setSavingMember(false);
  }

  async function saveMember() {
    if (!editingMember || !memberPermissions || !memberRole) return;
    if (memberRole === "ADMIN" && editingMember.role === "ADMIN") {
      toast.info("Admins always have full access.");
      return;
    }
    setSavingMember(true);
    try {
      const res = await fetch(`/api/portal/people/users/${encodeURIComponent(editingMember.userId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: memberRole, permissions: memberRole === "MEMBER" ? memberPermissions : undefined }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Update failed"));
      toast.success("Permissions updated.");
      closeMemberEditor();
      await load();
    } catch (e: any) {
      toast.error(String(e?.message || "Update failed"));
    } finally {
      setSavingMember(false);
    }
  }

  async function removeMember() {
    if (!editingMember) return;
    if (editingMember.role === "OWNER" || editingMember.implicit) return;

    const email = editingMember.user?.email || editingMember.userId;
    const ok = window.confirm(`Remove ${email} from this account?`);
    if (!ok) return;

    setRemovingMember(true);
    try {
      const res = await fetch(`/api/portal/people/users/${encodeURIComponent(editingMember.userId)}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Remove failed"));
      toast.success("User removed.");
      closeMemberEditor();
      await load();
    } catch (e: any) {
      toast.error(String(e?.message || "Remove failed"));
    } finally {
      setRemovingMember(false);
    }
  }

  async function createInvite() {
    const email = inviteEmail.trim();
    if (!email) return;

    setInviting(true);
    try {
      const res = await fetch("/api/portal/people/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role: inviteRole, permissions: invitePermissions }),
      });
      const json = (await res.json()) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to invite");

      setInviteEmail("");
      setInviteRole("MEMBER");
      setInvitePermissions(defaultPortalPermissionsForRole("MEMBER"));
      setPermissionsOpen(false);

      const link = String(json.link || "");
      if (link) {
        try {
          await navigator.clipboard.writeText(link);
          toast.success("Invite created. Link copied to clipboard.");
        } catch {
          toast.success("Invite created.");
        }
      } else {
        toast.success("Invite created.");
      }

      await load();
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to invite"));
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

      {loading ? (
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Loading…</div>
      ) : null}

      {data ? (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold text-zinc-900">Members</div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Your role: {data.myRole ?? "N/A"}
              </div>
            </div>

            <div className="mt-4 max-h-[60vh] overflow-auto rounded-2xl border border-zinc-200">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.members.map((m) => (
                    <tr
                      key={m.userId}
                      className={classNames(
                        "border-t border-zinc-200",
                        canEditMembers && !m.implicit && m.role !== "OWNER" ? "cursor-pointer hover:bg-zinc-50" : "",
                      )}
                      onClick={() => openMemberEditor(m)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-zinc-900">{m.user?.name || "N/A"}</div>
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

                <div className="mt-3">
                  <div className="text-xs font-semibold text-zinc-700">Service access</div>
                  {inviteRole === "ADMIN" ? (
                    <div className="mt-1 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
                      Admins have full access to all services.
                    </div>
                  ) : (
                  <div className="relative mt-1" ref={permissionsDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setPermissionsOpen((v) => !v)}
                      className="flex w-full items-center justify-between rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
                    >
                      <span>
                        {selectedServicesCount} of {PORTAL_SERVICE_KEYS.length} enabled
                      </span>
                      <span className="text-xs text-zinc-500">{permissionsOpen ? "Hide" : "Edit"}</span>
                    </button>

                    {permissionsOpen ? (
                      <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg">
                        <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Services</div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setAllPermissions(true)}
                              className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                            >
                              All full
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const next = { ...invitePermissions };
                                for (const k of PORTAL_SERVICE_KEYS) next[k] = { view: true, edit: false };
                                setInvitePermissions(next);
                              }}
                              className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                            >
                              All view
                            </button>
                            <button
                              type="button"
                              onClick={() => setAllPermissions(false)}
                              className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                            >
                              None
                            </button>
                          </div>
                        </div>

                        <div className="max-h-72 overflow-auto p-2">
                          {PORTAL_SERVICE_KEYS.map((k) => (
                            <div
                              key={k}
                              className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 text-sm hover:bg-zinc-50"
                            >
                              <span className="text-zinc-800">{PORTAL_SERVICE_LABELS[k]}</span>
                              <select
                                value={levelFor(k)}
                                onChange={(e) => setPermissionLevel(k, (e.target.value as PermissionLevel) || "none")}
                                className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-800"
                              >
                                <option value="none">No access</option>
                                <option value="view">View only</option>
                                <option value="full">Full</option>
                              </select>
                            </div>
                          ))}
                        </div>

                        <div className="border-t border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                          Defaults: Admin = all services, Member = limited.
                        </div>
                      </div>
                    ) : null}
                  </div>
                  )}
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
              </div>
            ) : null}

            <div className="mt-4 max-h-[60vh] overflow-auto rounded-2xl border border-zinc-200">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">State</th>
                    <th className="px-4 py-3">Link</th>
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
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const base = typeof window !== "undefined" ? window.location.origin : "https://purelyautomation.com";
                                const link = `${base}/portalinvite/${inv.token}`;
                                await copyToClipboard(link);
                                toast.success("Invite link copied to clipboard.");
                              } catch {
                                toast.error("Could not copy invite link.");
                              }
                            }}
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                          >
                            Copy
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="border-t border-zinc-200">
                      <td className="px-4 py-5 text-sm text-zinc-600" colSpan={4}>
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

      {editingMember && memberPermissions ? (
        <div className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/30 p-3 sm:items-center">
          <div className="w-full max-w-2xl rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-zinc-900">Edit permissions</div>
                <div className="mt-1 text-sm text-zinc-600">{editingMember.user?.email || editingMember.userId}</div>
                {(memberRole || editingMember.role) === "ADMIN" ? (
                  <div className="mt-1 text-xs font-semibold text-zinc-500">Admins always have full access.</div>
                ) : null}

                <div className="mt-3 flex items-center gap-2">
                  <div className="text-xs font-semibold text-zinc-700">Role</div>
                  <select
                    value={memberRole || "MEMBER"}
                    onChange={(e) => {
                      const nextRole = (e.target.value as any) === "ADMIN" ? "ADMIN" : "MEMBER";
                      const current = memberRole || "MEMBER";

                      if (current === "ADMIN" && nextRole === "MEMBER") {
                        demoteContinueRef.current = () => {
                          setMemberRole("MEMBER");
                          setMemberPermissions(defaultPortalPermissionsForRole("MEMBER"));
                        };
                        setDemoteConfirmOpen(true);
                        return;
                      }

                      setMemberRole(nextRole);
                      if (nextRole === "ADMIN") setMemberPermissions(defaultPortalPermissionsForRole("ADMIN"));
                    }}
                    disabled={savingMember || removingMember}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
              </div>
              <button
                type="button"
                onClick={() => closeMemberEditor()}
                className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                Close
              </button>
            </div>

            <div className="mt-4 max-h-[60vh] overflow-auto rounded-2xl border border-zinc-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3">View</th>
                    <th className="px-4 py-3">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {PORTAL_SERVICE_KEYS.map((k) => {
                    const p = memberPermissions[k];
                    return (
                      <tr key={k} className="border-t border-zinc-200">
                        <td className="px-4 py-3 font-semibold text-zinc-900">{PORTAL_SERVICE_LABELS[k]}</td>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={!!p?.view}
                            disabled={(memberRole || editingMember.role) === "ADMIN"}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setMemberPermissions((prev) => {
                                if (!prev) return prev;
                                const next = { ...prev };
                                const prevP = next[k];
                                next[k] = { view: checked || !!prevP?.edit, edit: !!prevP?.edit };
                                return next;
                              });
                            }}
                            className="h-4 w-4 rounded border-zinc-300 text-[color:var(--color-brand-blue)]"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={!!p?.edit}
                            disabled={(memberRole || editingMember.role) === "ADMIN"}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setMemberPermissions((prev) => {
                                if (!prev) return prev;
                                const next = { ...prev };
                                next[k] = { view: checked ? true : !!next[k]?.view, edit: checked };
                                if (checked) next[k].view = true;
                                return next;
                              });
                            }}
                            className="h-4 w-4 rounded border-zinc-300 text-[color:var(--color-brand-blue)]"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={removingMember || savingMember}
                onClick={() => removeMember()}
                className={classNames(
                  "rounded-2xl px-4 py-2 text-sm font-semibold",
                  removingMember
                    ? "cursor-not-allowed bg-zinc-200 text-zinc-600"
                    : "border border-red-200 bg-white text-red-600 hover:bg-red-50",
                )}
              >
                {removingMember ? "Removing…" : "Remove user"}
              </button>

              <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => closeMemberEditor()}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingMember}
                onClick={() => saveMember()}
                className={classNames(
                  "rounded-2xl px-4 py-2 text-sm font-semibold",
                  savingMember
                    ? "cursor-not-allowed bg-zinc-200 text-zinc-600"
                    : "bg-[color:var(--color-brand-blue)] text-white hover:brightness-95",
                )}
              >
                {savingMember ? "Saving…" : "Save"}
              </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {demoteConfirmOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/30 p-3 sm:items-center">
          <div className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl">
            <div className="text-base font-semibold text-zinc-900">Demote admin?</div>
            <div className="mt-2 text-sm text-zinc-600">
              By removing admin access, you’re demoting this admin to a user (member). Continue?
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  demoteContinueRef.current = null;
                  setDemoteConfirmOpen(false);
                }}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const fn = demoteContinueRef.current;
                  demoteContinueRef.current = null;
                  setDemoteConfirmOpen(false);
                  try {
                    fn?.();
                    toast.info("Admin access removed. Review permissions before saving.");
                  } catch {
                    // ignore
                  }
                }}
                className="rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
