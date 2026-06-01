"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useSetPortalSidebarOverride } from "@/app/portal/PortalSidebarOverride";
import {
  portalSidebarButtonActiveClass,
  portalSidebarButtonBaseClass,
  portalSidebarButtonInactiveClass,
  portalSidebarMetaTextClass,
  portalSidebarSectionStackClass,
  portalSidebarSectionTitleClass,
} from "@/app/portal/PortalServiceSidebarIcons";
import { portalGlassBackdropClass, portalGlassButtonClass, portalGlassPanelClass } from "@/components/portalGlass";
import { useToast } from "@/components/ToastProvider";
import { LocalDateTimePicker } from "@/components/LocalDateTimePicker";
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
  const pathname = usePathname() || "";
  const appBase = pathname.startsWith("/credit") ? "/credit/app" : "/portal/app";
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState<string>("");
  const [dueAtIso, setDueAtIso] = useState<string>("");
  const [creating, setCreating] = useState(false);

  const formatDueAt = useCallback((value: string | null) => {
    const iso = String(value || "").trim();
    if (!iso) return "";
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return "";
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, []);

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
  const pendingDeleteTask = useMemo(() => tasks.find((t) => t.id === deleteTaskId) ?? null, [deleteTaskId, tasks]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [tasksRes, assigneesRes] = await Promise.all([
        fetch("/api/portal/tasks?status=ALL", { cache: "no-store" }),
        fetch("/api/portal/tasks/assignees", { cache: "no-store" }).catch(() => null as any),
      ]);

      const tasksJson = (await tasksRes.json()) as any;
      if (!tasksRes.ok || !tasksJson?.ok) throw new Error(String(tasksJson?.error || "Tasks are still syncing. Retry here, create a new task, or ask Pura to help."));
      setTasks(Array.isArray(tasksJson.tasks) ? (tasksJson.tasks as TaskRow[]) : []);
      setViewerUserId(typeof tasksJson.viewerUserId === "string" ? tasksJson.viewerUserId : "");

      if (assigneesRes?.ok) {
        const assigneesJson = (await assigneesRes.json().catch(() => null)) as any;
        if (assigneesJson?.ok && Array.isArray(assigneesJson.members)) {
          setAssignees(assigneesJson.members as AssigneeRow[]);
        }
      }
    } catch (e: any) {
      const message = String(e?.message || "Tasks are still syncing. Retry here, create a new task, or ask Pura to help.");
      toast.error(message);
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

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
          dueAtIso: dueAtIso.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error || "Task creation did not finish. Review the task details and try again."));
      }
      setTitle("");
      setDescription("");
      setAssignedToUserId("");
      setDueAtIso("");
      setCreateOpen(false);
      toast.success("Task created.");
      await load();
    } catch (e: any) {
      toast.error(String(e?.message || "Task creation did not finish. Review the task details and try again."));
    } finally {
      setCreating(false);
    }
  }

  const setStatus = useCallback(async (taskId: string, status: "OPEN" | "DONE" | "CANCELED") => {
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
  }, [load, toast]);

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

  async function setDueDate(taskId: string, nextDueAtIso: string | null) {
    try {
      const res = await fetch(`/api/portal/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dueAtIso: nextDueAtIso || null }),
      });
      const text = await res.text();
      const json = (() => {
        try {
          return text ? JSON.parse(text) : null;
        } catch {
          return null;
        }
      })() as any;
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Update failed"));
      await load();
    } catch (e: any) {
      toast.error(String(e?.message || "Update failed"));
    }
  }

  async function deleteTask(taskId: string) {
    try {
      const res = await fetch(`/api/portal/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Delete failed"));
      toast.success("Task deleted.");
      await load();
    } catch (e: any) {
      toast.error(String(e?.message || "Delete failed"));
    }
  }

  const setSidebarOverride = useSetPortalSidebarOverride();
  const tasksSidebar = useMemo(() => {
    return (
      <div className="space-y-4">
        <div className={portalSidebarSectionStackClass}>
          <div className={`${portalSidebarButtonBaseClass} ${portalSidebarButtonActiveClass}`}>
            <div className="text-[13px] font-semibold text-zinc-900">Open tasks</div>
            <div className="mt-1 text-xs text-zinc-500">
              {openTasks.length ? `${openTasks.length} active for your team` : "Everything is wrapped up."}
            </div>
          </div>
        </div>
        <div>
          <div className={portalSidebarSectionTitleClass}>Done</div>
          <div className={portalSidebarSectionStackClass}>
            {doneTasks.length ? (
              doneTasks.slice(0, 20).map((task) => (
                <div key={task.id} className={`${portalSidebarButtonBaseClass} ${portalSidebarButtonInactiveClass}`}>
                  <div className="truncate text-[13px] font-medium text-zinc-900">{task.title}</div>
                  {task.assignedTo?.email ? <div className={portalSidebarMetaTextClass}>{task.assignedTo.email}</div> : null}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStatus(task.id, "OPEN")}
                      className="rounded-xl bg-[rgba(29,78,216,0.12)] px-2.5 py-1.5 text-[11px] font-semibold text-(--color-brand-blue) hover:bg-[rgba(29,78,216,0.18)]"
                    >
                      Reopen
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTaskId(task.id)}
                      className="rounded-xl bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-zinc-500">
                <div className="font-semibold text-zinc-900">Completed tasks have not been logged yet</div>
                <div className="mt-1 text-xs text-zinc-500">Completed work will land here. Create the next task now if you want something new to move through the list.</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="rounded-xl bg-[rgba(29,78,216,0.12)] px-2.5 py-1.5 text-[11px] font-semibold text-(--color-brand-blue) hover:bg-[rgba(29,78,216,0.18)]"
                  >
                    New task
                  </button>
                  <Link
                    href={`${appBase}/ai-chat?onboarding=1`}
                    className="rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    Ask Pura
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }, [appBase, doneTasks, openTasks.length, setStatus]);

  useEffect(() => {
    setSidebarOverride({
      desktopSidebarContent: tasksSidebar,
      mobileSidebarContent: tasksSidebar,
    });
  }, [setSidebarOverride, tasksSidebar]);

  useEffect(() => {
    return () => setSidebarOverride(null);
  }, [setSidebarOverride]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Tasks</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Keep follow-ups, handoffs, and team reminders in one place so nothing slips between inbox, booking, and daily operations.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="inline-flex rounded-full bg-[rgba(29,78,216,0.12)] px-3 py-1 text-(--color-brand-blue)">
              {openTasks.length} open
            </span>
            <span className="inline-flex rounded-full bg-zinc-100 px-3 py-1 text-zinc-600">
              {doneTasks.length} done
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-2xl bg-[rgba(29,78,216,0.12)] px-4 py-2 text-sm font-semibold text-(--color-brand-blue) hover:bg-[rgba(29,78,216,0.18)]"
          >
            New task
          </button>
        </div>
      </div>

      {loadError ? (
        <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="font-semibold text-red-900">Tasks need attention</div>
          <div className="mt-1">{loadError}</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void load();
              }}
              className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100"
            >
              New task
            </button>
            <Link
              href={`${appBase}/ai-chat?onboarding=1`}
              className="inline-flex items-center justify-center rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100"
            >
              Ask Pura
            </Link>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="h-4 w-28 animate-pulse rounded-full bg-zinc-100" aria-hidden="true" />
          <div className="mt-4 space-y-3" aria-hidden="true">
            <div className="h-24 rounded-2xl bg-zinc-50" />
            <div className="h-24 rounded-2xl bg-zinc-50" />
          </div>
          <p className="mt-4 text-sm text-zinc-600">Pulling in the latest tasks for your team.</p>
        </div>
      ) : null}

      {!loading ? (
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6">
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
                      {t.dueAtIso ? (
                        <div className="mt-2 inline-flex rounded-full bg-[rgba(29,78,216,0.12)] px-3 py-1 text-xs font-semibold text-(--color-brand-blue)">
                          Due {formatDueAt(t.dueAtIso)}
                        </div>
                      ) : null}
                      {!t.assignedToUserId ? (
                        <div className="mt-2 text-xs font-semibold text-zinc-500">Assigned to everyone</div>
                      ) : null}
                      <div className="mt-3">
                        <div className="text-xs font-semibold text-zinc-700">Assigned to</div>
                        {t.canEditAssignee === false ? (
                          <div className="mt-1 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                            {t.assignedToUserId ? (t.assignedTo?.name || t.assignedTo?.email || t.assignedToUserId) : "Everyone"}
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
                      <div className="mt-3">
                        <div className="text-xs font-semibold text-zinc-700">Due date</div>
                        <div className="mt-1 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
                          <LocalDateTimePicker
                            value={t.dueAtIso || ""}
                            onChange={(value) => void setDueDate(t.id, value || null)}
                            placeholder="No due date"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      {(!t.assignedToUserId || (viewerUserId && String(t.assignedToUserId) === String(viewerUserId))) ? (
                        <button
                          type="button"
                          onClick={() => setStatus(t.id, !t.assignedToUserId && t.viewerDoneAtIso ? "OPEN" : "DONE")}
                          className="rounded-2xl bg-[rgba(29,78,216,0.12)] px-3 py-2 text-xs font-semibold text-(--color-brand-blue) hover:bg-[rgba(29,78,216,0.18)]"
                        >
                          {!t.assignedToUserId && t.viewerDoneAtIso ? "Undo" : "Mark done"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setDeleteTaskId(t.id)}
                        className="rounded-2xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-3xl border border-dashed border-zinc-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,248,255,0.95))] px-6 py-8 text-center">
                <div className="text-base font-semibold text-zinc-900">You’re all caught up.</div>
                <div className="mt-2 text-sm text-zinc-600">Add a new task whenever you want to track a follow-up, handoff, or reminder for the team.</div>
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="mt-4 rounded-2xl bg-[rgba(29,78,216,0.12)] px-4 py-2 text-sm font-semibold text-(--color-brand-blue) hover:bg-[rgba(29,78,216,0.18)]"
                >
                  New task
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div className={classNames("fixed inset-0 z-9998 flex items-end justify-center px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center", portalGlassBackdropClass)} role="dialog" aria-modal="true" data-overlay-root="true">
          <div className={classNames("w-full max-w-2xl max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] overflow-y-auto rounded-3xl p-5 shadow-xl", portalGlassPanelClass)}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-zinc-900">Create task</div>
                <div className="mt-1 text-sm text-zinc-600">Add a task for your portal team.</div>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label="Close create task"
                className={classNames("inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/78 text-lg font-semibold text-zinc-800 shadow-[0_10px_24px_rgba(15,23,42,0.1)] hover:bg-white", portalGlassButtonClass)}
              >
                ×
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to get done?"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--color-brand-blue)"
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
                placeholder="Add any details, context, or next steps for your team (optional)"
                className="w-full resize-none rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--color-brand-blue)"
              />
              <div>
                <div className="text-xs font-semibold text-zinc-700">Due date</div>
                <div className="mt-1 rounded-2xl border border-zinc-200 bg-white px-3 py-3">
                  <LocalDateTimePicker value={dueAtIso} onChange={setDueAtIso} placeholder="Optional due date" />
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={creating || !title.trim()}
                onClick={() => createTask()}
                className={classNames(
                  "rounded-2xl px-4 py-2 text-sm font-semibold",
                  creating || !title.trim()
                    ? "cursor-not-allowed bg-zinc-200 text-zinc-600"
                    : "bg-[rgba(29,78,216,0.12)] text-(--color-brand-blue) hover:bg-[rgba(29,78,216,0.18)]",
                )}
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDeleteTask ? (
        <div className={classNames("fixed inset-0 z-9998 flex items-end justify-center px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center", portalGlassBackdropClass)} role="dialog" aria-modal="true" data-overlay-root="true">
          <div className={classNames("w-full max-w-md rounded-3xl p-5 shadow-xl", portalGlassPanelClass)}>
            <div className="text-base font-semibold text-zinc-900">Delete task?</div>
            <div className="mt-2 text-sm text-zinc-600">This removes “{pendingDeleteTask.title}” permanently.</div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTaskId(null)}
                className={classNames("rounded-2xl bg-[rgba(29,78,216,0.12)] px-4 py-2 text-sm font-semibold text-(--color-brand-blue) hover:bg-[rgba(29,78,216,0.18)]", portalGlassButtonClass)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const taskId = pendingDeleteTask.id;
                  setDeleteTaskId(null);
                  await deleteTask(taskId);
                }}
                className="rounded-2xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
