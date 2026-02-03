"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Role = "DIALER" | "CLOSER" | "MANAGER" | "ADMIN";

type NavItem = {
  href: string;
  label: string;
};

function isActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  if (href === "/app/manager") return pathname === "/app/manager";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap text-sm sm:text-base">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              "rounded-xl px-3 py-2 font-medium transition " +
              (active
                ? "bg-brand-ink text-white"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900")
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ManagerViewSwitcher() {
  const pathname = usePathname();

  const active = pathname.startsWith("/app/dialer")
    ? "dialer"
    : pathname.startsWith("/app/closer")
      ? "closer"
      : "manager";

  const items: NavItem[] = [
    { href: "/app/manager", label: "Manager" },
    { href: "/app/dialer", label: "Dialer view" },
    { href: "/app/closer", label: "Closer view" },
  ];

  return (
    <div className="flex flex-nowrap items-center gap-1 overflow-x-auto whitespace-nowrap rounded-2xl border border-zinc-200 bg-white p-1">
      {items.map((i) => {
        const isOn =
          (active === "manager" && i.href === "/app/manager") ||
          (active === "dialer" && i.href === "/app/dialer") ||
          (active === "closer" && i.href === "/app/closer");

        return (
          <Link
            key={i.href}
            href={i.href}
            className={
              "rounded-xl px-3 py-2 text-sm font-semibold transition " +
              (isOn
                ? "bg-brand-ink text-white"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900")
            }
          >
            {i.label}
          </Link>
        );
      })}
    </div>
  );
}

function toRole(role?: string): Role | undefined {
  if (role === "DIALER") return "DIALER";
  if (role === "CLOSER") return "CLOSER";
  if (role === "MANAGER") return "MANAGER";
  if (role === "ADMIN") return "ADMIN";
  return undefined;
}

export function AppTopNav({ role }: { role?: string }) {
  const pathname = usePathname();
  const effectiveRole: Role | undefined = toRole(role);

  const dialerItems: NavItem[] = [
    { href: "/app/dialer/leads", label: "Leads" },
    { href: "/app/dialer/calls", label: "Calls" },
    { href: "/app/dialer/appointments", label: "Appointments" },
  ];

  const closerItems: NavItem[] = [
    { href: "/app/closer/appointments", label: "Meetings" },
    { href: "/app/closer/availability", label: "Availability" },
  ];

  const managerItems: NavItem[] = [
    { href: "/app/manager", label: "Dashboard" },
    { href: "/app/manager/blogs", label: "Blogs" },
    { href: "/app/manager/leads", label: "Leads" },
    { href: "/app/manager/calls", label: "Calls" },
    { href: "/app/manager/appointments", label: "Appointments" },
  ];

  if (effectiveRole === "MANAGER" || effectiveRole === "ADMIN") {
    const sectionItems = pathname.startsWith("/app/dialer")
      ? dialerItems
      : pathname.startsWith("/app/closer")
        ? closerItems
        : managerItems;

    return (
      <div className="flex min-w-0 items-center gap-3">
        <ManagerViewSwitcher />
        <NavLinks items={sectionItems} />
      </div>
    );
  }

  if (effectiveRole === "CLOSER") return <NavLinks items={closerItems} />;
  return <NavLinks items={dialerItems} />;
}
