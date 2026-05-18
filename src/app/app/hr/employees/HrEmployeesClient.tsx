"use client";

import { useEffect, useState } from "react";

type EmployeeRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  platformAdminGranted: boolean;
};

function fmtDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export default function HrEmployeesClient({ canManagePlatformAdmin = false }: { canManagePlatformAdmin?: boolean }) {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/hr/employees", { cache: "no-store" }).catch(() => null as any);
    const body = res ? await res.json().catch(() => ({})) : null;

    if (!res || !res.ok || !body?.ok) {
      setLoading(false);
      setError(body?.error ?? "Failed to load employees");
      return;
    }

    const normalized: EmployeeRow[] = (body.employees ?? []).map((u: any) => ({
      id: String(u.id),
      email: String(u.email || ""),
      name: String(u.name || ""),
      role: String(u.role || ""),
      createdAt: typeof u.createdAt === "string" ? u.createdAt : new Date(u.createdAt).toISOString(),
      platformAdminGranted: u.platformAdminGranted === true,
    }));

    setRows(normalized);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <div className="text-sm text-zinc-600">Loading...</div>;
  if (error) return <div className="text-sm text-red-600">{error}</div>;

  if (rows.length === 0) return <div className="text-sm text-zinc-600">No employees found.</div>;

  async function togglePlatformAdmin(user: EmployeeRow) {
    setSavingId(user.id);
    setError(null);

    const res = await fetch(`/api/hr/employees/${encodeURIComponent(user.id)}/platform-admin`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !user.platformAdminGranted }),
    }).catch(() => null as any);
    const body = res ? await res.json().catch(() => ({})) : null;

    if (!res || !res.ok || !body?.ok) {
      setSavingId(null);
      setError(body?.error ?? "Failed to update platform-admin access");
      return;
    }

    setRows((current) =>
      current.map((row) =>
        row.id === user.id
          ? { ...row, platformAdminGranted: body.employee?.platformAdminGranted === true }
          : row,
      ),
    );
    setSavingId(null);
  }

  return (
    <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
      {rows.map((u) => (
        <div key={u.id} className="px-4 py-3 text-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium text-zinc-900">{u.name}</div>
              <div className="text-sm text-zinc-600">{u.email}</div>
            </div>
            <div className="flex flex-col items-start gap-2 text-sm text-zinc-600 sm:items-end">
              <div>
                {u.role}
                {u.platformAdminGranted ? " • Platform admin" : ""}
                {" • "}
                {fmtDate(u.createdAt)}
              </div>
              {canManagePlatformAdmin && u.role !== "ADMIN" ? (
                <button
                  type="button"
                  disabled={savingId === u.id}
                  onClick={() => void togglePlatformAdmin(u)}
                  className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink transition hover:bg-zinc-50 disabled:opacity-60"
                >
                  {savingId === u.id
                    ? "Saving…"
                    : u.platformAdminGranted
                      ? "Revoke platform admin"
                      : "Grant platform admin"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
