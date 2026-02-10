"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function PortalPeopleTabs() {
  const pathname = usePathname();
  const active = typeof pathname === "string" ? pathname : "";

  const tabs = [
    { href: "/portal/app/people/contacts", label: "Contacts/Leads" },
    { href: "/portal/app/people/users", label: "Users & Invites" },
  ];

  return (
    <div className="mt-4 inline-flex overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      {tabs.map((t) => {
        const isActive = active === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={classNames(
              "px-4 py-2 text-sm font-semibold",
              isActive ? "bg-zinc-100 text-zinc-900" : "text-zinc-700 hover:bg-zinc-50",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
