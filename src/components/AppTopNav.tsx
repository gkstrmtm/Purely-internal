"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Role = "DIALER" | "CLOSER" | "MANAGER" | "ADMIN";

type NavItem = {
  href: string;
  label: string;
  shortLabel?: string;
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

function NavLinksVertical({
  items,
  collapsed,
  onNavigate,
}: {
  items: NavItem[];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="grid gap-1">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const label = collapsed ? (item.shortLabel ?? item.label.slice(0, 1)) : item.label;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed ? item.label : undefined}
            onClick={() => onNavigate?.()}
            className={
              "flex h-10 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition " +
              (active
                ? "bg-brand-ink text-white"
                : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900")
            }
          >
            <span
              className={
                "grid h-7 w-7 place-items-center rounded-xl " +
                (active ? "bg-white/15" : "bg-brand-ink/5")
              }
              aria-hidden
            >
              <span className={"text-xs font-extrabold " + (active ? "text-white" : "text-brand-ink")}>{label.slice(0, 2)}</span>
            </span>
            {collapsed ? null : <span className="truncate">{item.label}</span>}
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

function ManagerViewSwitcherVertical({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();

  const active = pathname.startsWith("/app/dialer")
    ? "dialer"
    : pathname.startsWith("/app/closer")
      ? "closer"
      : "manager";

  const items: Array<{ href: string; label: string; short: string }> = [
    { href: "/app/manager", label: "Manager", short: "M" },
    { href: "/app/dialer", label: "Dialer", short: "D" },
    { href: "/app/closer", label: "Closer", short: "C" },
  ];

  return (
    <div className="grid gap-1">
      {items.map((i) => {
        const isOn =
          (active === "manager" && i.href === "/app/manager") ||
          (active === "dialer" && i.href === "/app/dialer") ||
          (active === "closer" && i.href === "/app/closer");
        return (
          <Link
            key={i.href}
            href={i.href}
            title={collapsed ? i.label : undefined}
            onClick={() => onNavigate?.()}
            className={
              "flex h-10 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition " +
              (isOn
                ? "bg-brand-ink text-white"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
            }
          >
            <span className={"grid h-7 w-7 place-items-center rounded-xl " + (isOn ? "bg-white/15" : "bg-brand-ink/5")}>
              <span className={"text-xs font-extrabold " + (isOn ? "text-white" : "text-brand-ink")}>{i.short}</span>
            </span>
            {collapsed ? null : <span className="truncate">{i.label}</span>}
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
    { href: "/app/manager/admin", label: "Admin" },
    { href: "/app/manager/invites", label: "Employee invites" },
    { href: "/app/manager/blogs", label: "Blogs" },
    { href: "/app/manager/leads", label: "Leads" },
    { href: "/app/manager/calls", label: "Calls" },
    { href: "/app/manager/appointments", label: "Appointments" },
    { href: "/app/manager/portal-overrides", label: "Portal overrides" },
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

export function AppSidebarNav({
  role,
  collapsed,
  onNavigate,
}: {
  role?: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const effectiveRole: Role | undefined = toRole(role);

  const dialerItems: NavItem[] = [
    { href: "/app/dialer/leads", label: "Leads" },
    { href: "/app/dialer/calls", label: "Calls" },
    { href: "/app/dialer/appointments", label: "Appointments", shortLabel: "Ap" },
  ];

  const closerItems: NavItem[] = [
    { href: "/app/closer/appointments", label: "Meetings", shortLabel: "Mt" },
    { href: "/app/closer/availability", label: "Availability", shortLabel: "Av" },
  ];

  const managerItems: NavItem[] = [
    { href: "/app/manager", label: "Dashboard", shortLabel: "Db" },
    { href: "/app/manager/admin", label: "Admin", shortLabel: "Ad" },
    { href: "/app/manager/invites", label: "Employee invites", shortLabel: "In" },
    { href: "/app/manager/blogs", label: "Blogs" },
    { href: "/app/manager/leads", label: "Leads" },
    { href: "/app/manager/calls", label: "Calls" },
    { href: "/app/manager/appointments", label: "Appointments", shortLabel: "Ap" },
    { href: "/app/manager/portal-overrides", label: "Portal overrides", shortLabel: "Po" },
  ];

  if (effectiveRole === "MANAGER" || effectiveRole === "ADMIN") {
    const sectionItems = pathname.startsWith("/app/dialer")
      ? dialerItems
      : pathname.startsWith("/app/closer")
        ? closerItems
        : managerItems;

    return (
      <div className="grid gap-3">
        <ManagerViewSwitcherVertical collapsed={collapsed} onNavigate={onNavigate} />
        <NavLinksVertical items={sectionItems} collapsed={collapsed} onNavigate={onNavigate} />
      </div>
    );
  }

  if (effectiveRole === "CLOSER") {
    return <NavLinksVertical items={closerItems} collapsed={collapsed} onNavigate={onNavigate} />;
  }

  return <NavLinksVertical items={dialerItems} collapsed={collapsed} onNavigate={onNavigate} />;
}
