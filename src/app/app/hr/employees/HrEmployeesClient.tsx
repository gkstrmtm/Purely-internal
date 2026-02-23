"use client";

import { useEffect, useState } from "react";

type EmployeeRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
};

function fmtDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export default function HrEmployeesClient() {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
      {rows.map((u) => (
        <div key={u.id} className="px-4 py-3 text-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium text-zinc-900">{u.name}</div>
              <div className="text-sm text-zinc-600">{u.email}</div>
            </div>
            <div className="text-sm text-zinc-600">{u.role} • {fmtDate(u.createdAt)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
