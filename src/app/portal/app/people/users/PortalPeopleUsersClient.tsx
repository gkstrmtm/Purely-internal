"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  defaultPortalPermissionsForRole,
  PORTAL_SERVICE_KEYS,
  PORTAL_SERVICE_LABELS,
  type PortalPermissions,
  type PortalServiceKey,
} from "@/lib/portalPermissions.shared";

import { PortalPeopleTabs } from "@/app/portal/app/people/PortalPeopleTabs";
import { normalizePortalPermissions } from "@/lib/portalPermissions";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { AppModal } from "@/components/AppModal";
import { useToast } from "@/components/ToastProvider";
import { toPurelyHostedUrl } from "@/lib/publicHostedOrigin";

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

function stableMemberEditorSignature(input: { role: "ADMIN" | "MEMBER"; permissions: PortalPermissions | null }) {
  const role = input.role === "ADMIN" ? "ADMIN" : "MEMBER";
  if (role === "ADMIN") return JSON.stringify({ role });

  const normalized = normalizePortalPermissions(input.permissions, "MEMBER");
  const stablePermissions = Object.fromEntries(
    PORTAL_SERVICE_KEYS.map((k) => [k, { view: !!normalized[k]?.view, edit: !!normalized[k]?.edit }] as const),
  );
  return JSON.stringify({ role, permissions: stablePermissions });
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
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const permissionsRootRef = useRef<HTMLDivElement | null>(null);
  const permissionsButtonRef = useRef<HTMLButtonElement | null>(null);
  const permissionsMenuRef = useRef<HTMLDivElement | null>(null);

  const [permissionsMenuRect, setPermissionsMenuRect] = useState<null | {
    left: number;
    top: number;
    width: number;
    placement: "down" | "up";
  }>(null);

  const [editingMember, setEditingMember] = useState<MemberRow | null>(null);
  const [memberPermissions, setMemberPermissions] = useState<PortalPermissions | null>(null);
  const [memberRole, setMemberRole] = useState<"ADMIN" | "MEMBER" | null>(null);
  const [savingMember, setSavingMember] = useState(false);
  const [removingMember, setRemovingMember] = useState(false);

  const lastSavedMemberSigRef = useRef<string>("");
  const memberEditorSig = useMemo(() => {
    const role = memberRole || (editingMember?.role === "ADMIN" ? "ADMIN" : "MEMBER");
    return stableMemberEditorSignature({ role, permissions: memberPermissions });
  }, [editingMember?.role, memberPermissions, memberRole]);
  const memberDirty = Boolean(editingMember) && memberEditorSig !== lastSavedMemberSigRef.current;

  const [demoteConfirmOpen, setDemoteConfirmOpen] = useState(false);
  const demoteContinueRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    setInvitePermissions(defaultPortalPermissionsForRole(inviteRole));
    if (inviteRole === "ADMIN") setPermissionsOpen(false);
  }, [inviteRole]);

  useEffect(() => {
    if (!permissionsOpen) return;

    function onDown(e: MouseEvent) {
      const rootEl = permissionsRootRef.current;
      const menuEl = permissionsMenuRef.current;
      const target = e.target as Node;

      if (rootEl && rootEl.contains(target)) return;
      if (menuEl && menuEl.contains(target)) return;
      setPermissionsOpen(false);
    }

    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [permissionsOpen]);

  const updatePermissionsMenuRect = useCallback(() => {
    const btn = permissionsButtonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const vw = Math.max(0, window.innerWidth || 0);
    const vh = Math.max(0, window.innerHeight || 0);

    const width = Math.min(Math.max(260, r.width), Math.max(260, vw - 16));
    const left = Math.min(Math.max(8, r.left), Math.max(8, vw - width - 8));

    const spaceBelow = vh - r.bottom;
    const placement: "down" | "up" = spaceBelow >= 360 ? "down" : "up";
    const top = placement === "down" ? Math.min(r.bottom + 8, vh - 8) : Math.max(8, r.top - 8);

    setPermissionsMenuRect({ left, top, width, placement });
  }, []);

  useEffect(() => {
    if (!permissionsOpen) return;
    updatePermissionsMenuRect();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPermissionsOpen(false);
    };
    const onResize = () => updatePermissionsMenuRect();
    const onScroll = () => updatePermissionsMenuRect();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [permissionsOpen, updatePermissionsMenuRect]);

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
      const json = (await res.json().catch(() => null)) as any;
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

  useEffect(() => {
    const onFocus = () => void load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
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
      const perms = defaultPortalPermissionsForRole("ADMIN");
      setMemberPermissions(perms);
      lastSavedMemberSigRef.current = stableMemberEditorSignature({ role, permissions: perms });
    } else {
      const perms = normalizePortalPermissions(m.permissionsJson, role);
      setMemberPermissions(perms);
      lastSavedMemberSigRef.current = stableMemberEditorSignature({ role, permissions: perms });
    }
  }

  function closeMemberEditor() {
    setEditingMember(null);
    setMemberPermissions(null);
    setMemberRole(null);
    setSavingMember(false);
    lastSavedMemberSigRef.current = "";
  }

  async function saveMember() {
    if (!editingMember || !memberPermissions || !memberRole) return;
    if (memberRole === "ADMIN" && editingMember.role === "ADMIN") {
      toast.info("Admins always have full access.");
      return;
    }
    setSavingMember(true);
    try {
      const sig = stableMemberEditorSignature({ role: memberRole, permissions: memberPermissions });
      const res = await fetch(`/api/portal/people/users/${encodeURIComponent(editingMember.userId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: memberRole, permissions: memberRole === "MEMBER" ? memberPermissions : undefined }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Update failed"));
      toast.success("Permissions updated.");
      lastSavedMemberSigRef.current = sig;
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
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to invite");

      setInviteEmail("");
      setInviteRole("MEMBER");
      setInvitePermissions(defaultPortalPermissionsForRole("MEMBER"));
      setPermissionsOpen(false);
      setInviteModalOpen(false);

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
    <div className="mx-auto w-full max-w-6xl pb-[calc(var(--pa-portal-embed-footer-offset,0px)+96px+var(--pa-portal-floating-tools-reserve,0px))]">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">People</h1>
          <p className="mt-2 text-sm text-zinc-600">Manage portal users and invites.</p>
          <PortalPeopleTabs />
        </div>
      </div>

      {loading ? (
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Loading…</div>
      ) : null}

      {data ? (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-zinc-200 bg-white p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold text-zinc-900">Members</div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Your role: {data.myRole ?? "N/A"}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-200 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 sm:px-4 sm:py-3">User</th>
                    <th className="px-3 py-2 sm:px-4 sm:py-3">Role</th>
                    <th className="px-3 py-2 sm:px-4 sm:py-3">Status</th>
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
                      <td className="px-3 py-2 sm:px-4 sm:py-3">
                        <div className="font-semibold text-zinc-900">{m.user?.name || "N/A"}</div>
                        <div className="text-xs text-zinc-500">{m.user?.email || ""}</div>
                      </td>
                      <td className="px-3 py-2 sm:px-4 sm:py-3">
                        <span
                          className={classNames(
                            "inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold",
                            m.role === "OWNER"
                              ? "bg-[rgba(29,78,216,0.12)] text-(--color-brand-blue)"
                              : m.role === "ADMIN"
                                ? "bg-zinc-200 text-zinc-800"
                                : "bg-zinc-100 text-zinc-700",
                          )}
                        >
                          {m.role}
                          {m.implicit ? " (account)" : ""}
                        </span>
                      </td>
                      <td className="px-3 py-2 sm:px-4 sm:py-3">
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

          <div className="rounded-3xl border border-zinc-200 bg-white p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold text-zinc-900">Invites</div>
              <div className="flex items-center gap-2">
                {canInvite ? (
                  <div className="hidden text-xs text-zinc-500 sm:block">Create an invite link for a teammate.</div>
                ) : (
                  <div className="text-xs text-zinc-500">Only admins can invite.</div>
                )}
              </div>
            </div>

            <AppModal
              open={inviteModalOpen}
              title="New invite"
              description="Create an invite link for a teammate."
              onClose={() => {
                setInviteModalOpen(false);
                setPermissionsOpen(false);
              }}
              widthClassName="w-[min(720px,calc(100vw-32px))]"
            >
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr,180px]">
                  <div>
                    <div className="text-xs font-semibold text-zinc-700">Email</div>
                    <input
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="teammate@company.com"
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-500 focus:border-(--color-brand-blue)"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-zinc-700">Role</div>
                    <div className="mt-1">
                      <PortalListboxDropdown<string>
                        value={inviteRole}
                        onChange={(v) => setInviteRole((v as any) || "MEMBER")}
                        options={[
                          { value: "MEMBER", label: "Member" },
                          { value: "ADMIN", label: "Admin" },
                        ]}
                        buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-xs font-semibold text-zinc-700">Service access</div>
                  {inviteRole === "ADMIN" ? (
                    <div className="mt-1 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
                      Admins have full access to all services.
                    </div>
                  ) : (
                    <div className="relative mt-1" ref={permissionsRootRef}>
                      <button
                        type="button"
                        onClick={() => setPermissionsOpen((v) => !v)}
                        ref={permissionsButtonRef}
                        className="flex w-full items-center justify-between rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
                      >
                        <span>
                          {selectedServicesCount} of {PORTAL_SERVICE_KEYS.length} enabled
                        </span>
                        <span className="text-xs text-zinc-500">{permissionsOpen ? "Hide" : "Edit"}</span>
                      </button>

                      {permissionsOpen && typeof document !== "undefined"
                        ? createPortal(
                            <div
                              ref={permissionsMenuRef}
                              className="rounded-2xl border border-zinc-200 bg-white shadow-lg"
                              style={{
                                position: "fixed",
                                zIndex: 100000,
                                left: permissionsMenuRect?.left ?? 0,
                                top: permissionsMenuRect?.top ?? 0,
                                width: permissionsMenuRect?.width ?? 320,
                                transform: permissionsMenuRect?.placement === "up" ? "translateY(-100%)" : undefined,
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2">
                                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Services</div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setAllPermissions(true)}
                                    className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
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
                                    className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                  >
                                    All view
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setAllPermissions(false)}
                                    className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                  >
                                    None
                                  </button>
                                </div>
                              </div>

                              <div className="max-h-80 overflow-auto p-2">
                                {PORTAL_SERVICE_KEYS.map((k) => (
                                  <div
                                    key={k}
                                    className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 text-sm hover:bg-zinc-50"
                                  >
                                    <span className="text-zinc-900">{PORTAL_SERVICE_LABELS[k]}</span>
                                    <PortalListboxDropdown<PermissionLevel>
                                      value={levelFor(k)}
                                      onChange={(v) => setPermissionLevel(k, v || "none")}
                                      options={[
                                        { value: "none", label: "No access" },
                                        { value: "view", label: "View only" },
                                        { value: "full", label: "Full" },
                                      ]}
                                      buttonClassName="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                                    />
                                  </div>
                                ))}
                              </div>

                              <div className="border-t border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                                Defaults: Admin = all services, Member = limited.
                              </div>
                            </div>,
                            document.body,
                          )
                        : null}
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-zinc-600">Invite link expires automatically.</div>
                  <button
                    type="button"
                    disabled={inviting || !inviteEmail.trim()}
                    onClick={() => createInvite()}
                    className={classNames(
                      "rounded-2xl px-4 py-2 text-sm font-semibold",
                      inviting || !inviteEmail.trim()
                        ? "cursor-not-allowed bg-zinc-200 text-zinc-600"
                        : "bg-(--color-brand-blue) text-white hover:opacity-95",
                    )}
                  >
                    {inviting ? "Inviting…" : "Send invite"}
                  </button>
                </div>
              </div>
            </AppModal>

            <div className="mt-4 rounded-2xl border border-zinc-200 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 sm:px-4 sm:py-3">Email</th>
                    <th className="px-3 py-2 sm:px-4 sm:py-3">Role</th>
                    <th className="px-3 py-2 sm:px-4 sm:py-3">State</th>
                    <th className="px-3 py-2 sm:px-4 sm:py-3">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invites.length ? (
                    data.invites.map((inv) => (
                      <tr key={inv.id} className="border-t border-zinc-200">
                        <td className="px-3 py-2 sm:px-4 sm:py-3">
                          <div className="font-semibold text-zinc-900">{inv.email}</div>
                          <div className="text-xs text-zinc-500">Expires {new Date(inv.expiresAt).toLocaleString()}</div>
                        </td>
                        <td className="px-3 py-2 sm:px-4 sm:py-3">
                          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700">
                            {inv.role}
                          </span>
                        </td>
                        <td className="px-3 py-2 sm:px-4 sm:py-3">
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
                        <td className="px-3 py-2 sm:px-4 sm:py-3">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const link = toPurelyHostedUrl(`/portalinvite/${inv.token}`);
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
                      <td className="px-3 py-4 text-sm text-zinc-600" colSpan={4}>
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

      {canInvite && !inviteModalOpen && !editingMember ? (
        <button
          type="button"
          className="fixed right-4 z-11001 rounded-full bg-(--color-brand-pink) px-5 py-3 text-sm font-semibold text-white shadow-xl hover:opacity-95 disabled:opacity-60"
          style={{
            bottom:
              "calc(var(--pa-portal-embed-footer-offset,0px) + 5.75rem + var(--pa-portal-floating-tools-reserve, 0px))",
          }}
          onClick={() => {
            setInviteModalOpen(true);
            setPermissionsOpen(false);
          }}
          disabled={inviting}
        >
          New Invite
        </button>
      ) : null}

      {editingMember && memberPermissions ? (
        <div className="fixed inset-0 z-9998 flex items-end justify-center bg-black/30 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center">
          <div className="w-full max-w-2xl max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-zinc-900">Edit permissions</div>
                <div className="mt-1 text-sm text-zinc-600">{editingMember.user?.email || editingMember.userId}</div>
                {(memberRole || editingMember.role) === "ADMIN" ? (
                  <div className="mt-1 text-xs font-semibold text-zinc-500">Admins always have full access.</div>
                ) : null}

                <div className="mt-3 flex items-center gap-2">
                  <div className="text-xs font-semibold text-zinc-700">Role</div>
                  <PortalListboxDropdown<"MEMBER" | "ADMIN">
                    value={(memberRole || "MEMBER") === "ADMIN" ? "ADMIN" : "MEMBER"}
                    onChange={(v) => {
                      const nextRole = v === "ADMIN" ? "ADMIN" : "MEMBER";
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
                    options={[
                      { value: "MEMBER", label: "Member" },
                      { value: "ADMIN", label: "Admin" },
                    ]}
                    buttonClassName="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                  />
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
                            className="h-4 w-4 rounded border-zinc-300 text-(--color-brand-blue)"
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
                            className="h-4 w-4 rounded border-zinc-300 text-(--color-brand-blue)"
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
                disabled={savingMember || !memberDirty}
                onClick={() => saveMember()}
                className={classNames(
                  "rounded-2xl px-4 py-2 text-sm font-semibold",
                  savingMember || !memberDirty
                    ? "cursor-not-allowed bg-zinc-200 text-zinc-600"
                    : "bg-(--color-brand-blue) text-white hover:brightness-95",
                )}
              >
                {savingMember ? "Saving…" : memberDirty ? "Save" : "Saved"}
              </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {demoteConfirmOpen ? (
        <div className="fixed inset-0 z-9999 flex items-end justify-center bg-black/30 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center">
          <div className="w-full max-w-lg max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl">
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
                className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
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
