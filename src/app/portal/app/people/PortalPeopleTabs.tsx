"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function PortalPeopleTabs() {
  const pathname = usePathname();
  const active = typeof pathname === "string" ? pathname : "";
  const basePath = active.startsWith("/credit") ? "/credit" : "/portal";

  const tabs = [
    { href: `${basePath}/app/people/contacts`, label: "Contacts/Leads" },
    { href: `${basePath}/app/people/users`, label: "Users & Invites" },
  ];

  return (
    <div className="mt-4 inline-flex overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      {tabs.map((t) => {
        const isActive = active === t.href || active.startsWith(t.href + "/");
        const activeClass =
          t.href.endsWith("/people/contacts")
            ? "bg-[color:var(--color-brand-blue)] text-white"
            : "bg-[color:var(--color-brand-pink)] text-white";
        return (
          <Link
            key={t.href}
            href={t.href}
            className={classNames(
              "px-4 py-2 text-sm font-semibold",
              isActive ? activeClass : "text-zinc-700 hover:bg-zinc-50",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
