"use client";

import { useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import { PortalListboxDropdown, type PortalListboxOption } from "@/components/PortalListboxDropdown";

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: "OPEN" | "DONE" | "CANCELED" | string;
  assignedToUserId: string | null;
  assignedTo: { userId: string; email: string; name: string } | null;
  viewerDoneAtIso?: string | null;
  createdByUserId?: string | null;
  canEditAssignee?: boolean;
  dueAtIso: string | null;
  createdAtIso: string | null;
  updatedAtIso: string | null;
};

type AssigneeRow = {
  userId: string;
  role: string;
  user: { id: string; email: string; name: string; active: boolean };
  implicit?: boolean;
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function PortalTasksClient() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [viewerUserId, setViewerUserId] = useState<string>("");

  const [assignees, setAssignees] = useState<AssigneeRow[]>([]);

  const assigneeOptions = useMemo((): Array<PortalListboxOption<string>> => {
    const opts: Array<PortalListboxOption<string>> = [{ value: "", label: "Everyone" }];
    for (const a of assignees) {
      const u = a?.user;
      if (!u?.id) continue;
      const label = (u.name || u.email || "").trim() || u.id;
      opts.push({
        value: String(a.userId),
        label,
        disabled: !u.active,
        hint: u.active ? undefined : "Inactive",
      });
    }
    return opts;
  }, [assignees]);

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState<string>("");
  const [creating, setCreating] = useState(false);

  const openTasks = useMemo(() => {
    const rows = tasks.filter((t) => String(t.status) === "OPEN");
    // For everyone-assigned tasks (assignedToUserId null), sort unfinished first.
    return rows.sort((a, b) => {
      const aEveryone = !a.assignedToUserId;
      const bEveryone = !b.assignedToUserId;
      if (aEveryone && bEveryone) {
        const aDone = Boolean(a.viewerDoneAtIso);
        const bDone = Boolean(b.viewerDoneAtIso);
        if (aDone !== bDone) return aDone ? 1 : -1;
      }
      return 0;
    });
  }, [tasks]);
  const doneTasks = useMemo(() => tasks.filter((t) => String(t.status) === "DONE"), [tasks]);

  async function load() {
    setLoading(true);
    try {
      const [tasksRes, assigneesRes] = await Promise.all([
        fetch("/api/portal/tasks?status=ALL", { cache: "no-store" }),
        fetch("/api/portal/tasks/assignees", { cache: "no-store" }).catch(() => null as any),
      ]);

      const tasksJson = (await tasksRes.json()) as any;
      if (!tasksRes.ok || !tasksJson?.ok) throw new Error(String(tasksJson?.error || "Failed to load tasks"));
      setTasks(Array.isArray(tasksJson.tasks) ? (tasksJson.tasks as TaskRow[]) : []);
      setViewerUserId(typeof tasksJson.viewerUserId === "string" ? tasksJson.viewerUserId : "");

      if (assigneesRes?.ok) {
        const assigneesJson = (await assigneesRes.json().catch(() => null)) as any;
        if (assigneesJson?.ok && Array.isArray(assigneesJson.members)) {
          setAssignees(assigneesJson.members as AssigneeRow[]);
        }
      }
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to load"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createTask() {
    const t = title.trim();
    if (!t) return;

    setCreating(true);
    try {
      const res = await fetch("/api/portal/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: t,
          description: description.trim() || undefined,
          assignedToUserId: assignedToUserId.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Failed to create"));
      setTitle("");
      setDescription("");
      setAssignedToUserId("");
      setCreateOpen(false);
      toast.success("Task created.");
      await load();
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to create"));
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(taskId: string, status: "OPEN" | "DONE" | "CANCELED") {
    try {
      const res = await fetch(`/api/portal/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const text = await res.text();
      const json = ((): any => {
        try {
          return text ? JSON.parse(text) : null;
        } catch {
          return null;
        }
      })();
      if (!res.ok || !json?.ok) {
        const msg = String(json?.error || text || `HTTP ${res.status}` || "Update failed").trim();
        throw new Error(msg || "Update failed");
      }
      await load();
    } catch (e: any) {
      toast.error(String(e?.message || "Update failed"));
    }
  }

  async function setAssignee(taskId: string, userId: string) {
    try {
      const res = await fetch(`/api/portal/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignedToUserId: userId.trim() || null }),
      });
      const text = await res.text();
      const json = ((): any => {
        try {
          return text ? JSON.parse(text) : null;
        } catch {
          return null;
        }
      })();
      if (!res.ok || !json?.ok) {
        const msg = String(json?.error || text || `HTTP ${res.status}` || "Update failed").trim();
        throw new Error(msg || "Update failed");
      }
      toast.success("Assignee updated.");
      await load();
    } catch (e: any) {
      toast.error(String(e?.message || "Update failed"));
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Tasks</h1>
          <p className="mt-2 text-sm text-zinc-600">Internal tasks for your portal team.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
          >
            + Task
          </button>
          <button
            type="button"
            onClick={() => load()}
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Loading…</div>
      ) : null}

      {!loading ? (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="text-base font-semibold text-zinc-900">Open ({openTasks.length})</div>
            <div className="mt-4 space-y-3">
              {openTasks.length ? (
                openTasks.map((t) => (
                  <div key={t.id} className="rounded-2xl border border-zinc-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div
                          className={classNames(
                            "font-semibold",
                            !t.assignedToUserId && t.viewerDoneAtIso ? "text-zinc-500 line-through" : "text-zinc-900",
                          )}
                        >
                          {t.title}
                        </div>
                        {t.description ? <div className="mt-1 text-sm text-zinc-600">{t.description}</div> : null}
                        {!t.assignedToUserId ? (
                          <div className="mt-2 text-xs font-semibold text-zinc-500">Assigned to everyone</div>
                        ) : null}
                        <div className="mt-3">
                          <div className="text-xs font-semibold text-zinc-700">Assigned to</div>
                          {t.canEditAssignee === false ? (
                            <div className="mt-1 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                              {t.assignedToUserId
                                ? (t.assignedTo?.name || t.assignedTo?.email || t.assignedToUserId)
                                : "Everyone"}
                            </div>
                          ) : (
                            <div className="mt-1">
                              <PortalListboxDropdown
                                value={t.assignedToUserId || ""}
                                options={assigneeOptions}
                                onChange={(v) => void setAssignee(t.id, v)}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      {(!t.assignedToUserId || (viewerUserId && String(t.assignedToUserId) === String(viewerUserId))) ? (
                        <button
                          type="button"
                          onClick={() => setStatus(t.id, !t.assignedToUserId && t.viewerDoneAtIso ? "OPEN" : "DONE")}
                          className={classNames(
                            "rounded-2xl px-3 py-2 text-xs font-semibold hover:brightness-95",
                            !t.assignedToUserId && t.viewerDoneAtIso
                              ? "border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
                              : "bg-[color:var(--color-brand-blue)] text-white",
                          )}
                        >
                          {!t.assignedToUserId && t.viewerDoneAtIso ? "Undo" : "Mark done"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-zinc-600">No open tasks.</div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="text-base font-semibold text-zinc-900">Done ({doneTasks.length})</div>
            <div className="mt-4 space-y-3">
              {doneTasks.length ? (
                doneTasks.slice(0, 50).map((t) => (
                  <div key={t.id} className="rounded-2xl border border-zinc-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-zinc-900">{t.title}</div>
                        {t.description ? <div className="mt-1 text-sm text-zinc-600">{t.description}</div> : null}
                        {t.assignedTo?.email ? <div className="mt-2 text-xs text-zinc-500">Assigned to {t.assignedTo.email}</div> : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => setStatus(t.id, "OPEN")}
                        className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                      >
                        Reopen
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-zinc-600">No done tasks.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/30 p-3 sm:items-center">
          <div className="w-full max-w-2xl rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-zinc-900">Create task</div>
                <div className="mt-1 text-sm text-zinc-600">Add a task for your portal team.</div>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--color-brand-blue)]"
              />
              <div>
                <div className="text-xs font-semibold text-zinc-700">Assignee</div>
                <div className="mt-1">
                  <PortalListboxDropdown value={assignedToUserId} options={assigneeOptions} onChange={setAssignedToUserId} />
                </div>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Description (optional)"
                className="w-full resize-none rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--color-brand-blue)]"
              />
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={creating || !title.trim()}
                onClick={() => createTask()}
                className={classNames(
                  "rounded-2xl px-4 py-2 text-sm font-semibold",
                  creating || !title.trim()
                    ? "cursor-not-allowed bg-zinc-200 text-zinc-600"
                    : "bg-[color:var(--color-brand-blue)] text-white hover:brightness-95",
                )}
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setCreateOpen(true)}
        className="fixed bottom-4 right-4 z-[9997] rounded-full bg-[color:var(--color-brand-blue)] px-4 py-3 text-base font-semibold text-white shadow-lg hover:brightness-95 sm:hidden"
        aria-label="Create task"
      >
        +
      </button>
    </div>
  );
}
