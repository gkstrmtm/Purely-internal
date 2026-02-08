import React from "react";

export function PortalSettingsSection({
  title,
  description,
  accent,
  defaultOpen,
  children,
}: {
  title: string;
  description?: string;
  accent: "blue" | "pink" | "amber" | "emerald" | "slate";
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const accentDotClass =
    accent === "blue"
      ? "bg-[color:var(--color-brand-blue)]"
      : accent === "pink"
        ? "bg-[color:var(--color-brand-pink)]"
        : accent === "amber"
          ? "bg-amber-500"
          : accent === "emerald"
            ? "bg-emerald-500"
            : "bg-slate-500";

  return (
    <details className="group rounded-3xl border border-zinc-200 bg-zinc-50" open={defaultOpen ? true : undefined}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-3xl px-5 py-4 select-none hover:bg-zinc-100 [&::-webkit-details-marker]:hidden [&::marker]:content-none">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className={"h-2.5 w-2.5 shrink-0 rounded-full " + accentDotClass} />
            <div className="text-sm font-semibold text-zinc-900">{title}</div>
          </div>
          {description ? <div className="mt-1 text-sm text-zinc-600">{description}</div> : null}
        </div>
        <div className="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700">
          <span className="hidden group-open:inline">Hide</span>
          <span className="group-open:hidden">Show</span>
        </div>
      </summary>

      <div className="px-5 pb-5">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">{children}</div>
      </div>
    </details>
  );
}
