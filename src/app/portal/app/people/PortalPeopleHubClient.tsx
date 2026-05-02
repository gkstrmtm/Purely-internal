"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import { IconPeopleGlyph } from "@/app/portal/PortalIcons";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type PeopleHubCard = {
  href: string;
  title: string;
  description: string;
  eyebrow: string;
  badge: string;
};

export function PortalPeopleHubClient() {
  const pathname = usePathname();
  const basePath = useMemo(() => (String(pathname || "").startsWith("/credit") ? "/credit" : "/portal"), [pathname]);

  const cards = useMemo(() => {
    return [
      {
        href: `${basePath}/app/people/contacts`,
        title: "Contacts",
        description: "Search, edit, tag, and manage everyone already in your workspace.",
        eyebrow: "Primary workspace",
        badge: "Start here",
      },
      {
        href: `${basePath}/app/people/users`,
        title: "Users",
        description: "See team members, access levels, and who can work inside this account.",
        eyebrow: "Account access",
        badge: "Team",
      },
      {
        href: `${basePath}/app/people/contacts/duplicates`,
        title: "Duplicates",
        description: "Clean up double entries before they confuse automations, reporting, and follow-up.",
        eyebrow: "Data cleanup",
        badge: "Review",
      },
    ] as PeopleHubCard[];
  }, [basePath]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="max-w-3xl">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">People</div>
        <h1 className="mt-2 text-2xl font-bold text-brand-ink sm:text-3xl">Manage contacts, users, and cleanup in one place.</h1>
        <p className="mt-2 text-sm text-zinc-600">
          This section is where you keep your workspace data clean and usable instead of bouncing between hidden subpages.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className={classNames(
              "group rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm transition-colors duration-150",
              "hover:border-zinc-300 hover:bg-zinc-50",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 text-zinc-700">
                <IconPeopleGlyph size={20} />
              </div>
              <span className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-600">
                {card.badge}
              </span>
            </div>
            <div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{card.eyebrow}</div>
            <div className="mt-2 text-lg font-semibold text-brand-ink group-hover:text-zinc-900">{card.title}</div>
            <div className="mt-2 text-sm leading-6 text-zinc-600">{card.description}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
