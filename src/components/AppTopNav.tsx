"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { canAccessTeamOpsWorkspace, hasPlatformAdminCapability } from "@/lib/internalCapabilities";

type Role = "DIALER" | "CLOSER" | "MANAGER" | "HR" | "ADMIN";

type NavItem = {
  href: string;
  label: string;
  shortLabel?: string;
};

function isActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  if (href === "/app/manager") return pathname === "/app/manager";
  if (href === "/app/hr") return pathname === "/app/hr";
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
        const label = collapsed ? (item.shortLabel ?? item.label.slice(0, 2)) : item.label;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed ? item.label : undefined}
            onClick={() => onNavigate?.()}
            className={
              "flex h-10 items-center rounded-2xl px-3 text-sm font-semibold transition " +
              (active
                ? "bg-brand-ink text-white"
                : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900")
            }
          >
            <span className={collapsed ? "mx-auto truncate text-xs font-bold uppercase tracking-wide" : "truncate"}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function StaffViewSwitcher() {
  const pathname = usePathname();

  const active = pathname.startsWith("/app/dialer")
    ? "dialer"
    : pathname.startsWith("/app/closer")
      ? "closer"
      : pathname.startsWith("/app/hr")
        ? "hr"
        : "dashboard";

  const items: NavItem[] = [
    { href: "/app/manager", label: "Manager" },
    { href: "/app/hr", label: "HR" },
    { href: "/app/dialer", label: "Dialer view" },
    { href: "/app/closer", label: "Closer view" },
  ];

  return (
    <div className="flex flex-nowrap items-center gap-1 overflow-x-auto whitespace-nowrap rounded-2xl border border-zinc-200 bg-white p-1">
      {items.map((i) => {
        const isOn =
          (active === "dashboard" && i.href === "/app/manager") ||
          (active === "hr" && i.href === "/app/hr") ||
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

function StaffViewSwitcherVertical({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();

  const active = pathname.startsWith("/app/dialer")
    ? "dialer"
    : pathname.startsWith("/app/closer")
      ? "closer"
      : pathname.startsWith("/app/hr")
        ? "hr"
        : "dashboard";

  const items: Array<{ href: string; label: string; short: string }> = [
    { href: "/app/manager", label: "Manager", short: "M" },
    { href: "/app/hr", label: "HR", short: "HR" },
    { href: "/app/dialer", label: "Dialer", short: "D" },
    { href: "/app/closer", label: "Closer", short: "C" },
  ];

  return (
    <div className="grid gap-1">
      {items.map((i) => {
        const isOn =
          (active === "dashboard" && i.href === "/app/manager") ||
          (active === "hr" && i.href === "/app/hr") ||
          (active === "dialer" && i.href === "/app/dialer") ||
          (active === "closer" && i.href === "/app/closer");
        return (
          <Link
            key={i.href}
            href={i.href}
            title={collapsed ? i.label : undefined}
            onClick={() => onNavigate?.()}
            className={
              "flex h-10 items-center rounded-2xl px-3 text-sm font-semibold transition " +
              (isOn
                ? "bg-brand-ink text-white"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
            }
          >
            <span className={collapsed ? "mx-auto truncate text-xs font-bold uppercase tracking-wide" : "truncate"}>
              {collapsed ? i.short : i.label}
            </span>
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
  if (role === "HR") return "HR";
  if (role === "ADMIN") return "ADMIN";
  return undefined;
}

export function AppTopNav({ role, platformAdminGranted }: { role?: string; platformAdminGranted?: boolean }) {
  const pathname = usePathname();
  const effectiveRole: Role | undefined = toRole(role);
  const canUsePlatformAdmin = hasPlatformAdminCapability(effectiveRole, platformAdminGranted);
  const platformAdminItems: NavItem[] = canUsePlatformAdmin
    ? [
        { href: "/app/manager/admin", label: "Platform admin" },
        { href: "/app/manager/portal-overrides", label: "Portal overrides" },
      ]
    : [];

  const dialerItems: NavItem[] = [
    { href: "/app/dialer/leads", label: "Leads" },
    { href: "/app/dialer/calls", label: "Calls" },
    { href: "/app/dialer/appointments", label: "Appointments" },
    ...platformAdminItems,
  ];

  const closerItems: NavItem[] = [
    { href: "/app/closer/appointments", label: "Meetings" },
    { href: "/app/closer/availability", label: "Availability" },
    ...platformAdminItems,
  ];

  const managerItemsFull: NavItem[] = [
    { href: "/app/manager", label: "Dashboard" },
    ...platformAdminItems,
    { href: "/app/manager/invites", label: "Employee invites" },
    { href: "/app/manager/blogs", label: "Blogs" },
    { href: "/app/manager/campaigns", label: "Campaigns" },
    { href: "/app/manager/ads-approvals", label: "Ad approvals" },
    { href: "/app/manager/leads", label: "Leads" },
    { href: "/app/manager/calls", label: "Calls" },
    { href: "/app/manager/appointments", label: "Appointments" },
  ];

  const managerItemsStaff: NavItem[] = [
    { href: "/app/manager", label: "Dashboard" },
    ...platformAdminItems,
    { href: "/app/manager/invites", label: "Employee invites" },
    { href: "/app/manager/leads", label: "Leads" },
    { href: "/app/manager/calls", label: "Calls" },
    { href: "/app/manager/appointments", label: "Appointments" },
  ];

  const hrItems: NavItem[] = [
    { href: "/app/hr", label: "Candidates" },
    { href: "/app/hr/interviews", label: "Interviews" },
    { href: "/app/hr/employees", label: "Employees" },
    { href: "/app/hr/campaigns", label: "Campaigns" },
    { href: "/app/hr/leads", label: "Leads" },
    { href: "/app/hr/calls", label: "Calls" },
    { href: "/app/hr/appointments", label: "Appointments" },
    { href: "/app/hr/invites", label: "Employee invites" },
    { href: "/app/hr/availability", label: "Availability" },
    ...platformAdminItems,
  ];


  if (canAccessTeamOpsWorkspace(effectiveRole)) {
    const managerItems = effectiveRole === "HR" ? managerItemsStaff : managerItemsFull;
    const sectionItems = pathname.startsWith("/app/dialer")
      ? dialerItems
      : pathname.startsWith("/app/closer")
        ? closerItems
        : pathname.startsWith("/app/hr")
          ? hrItems
        : managerItems;

    return (
      <div className="flex min-w-0 items-center gap-3">
        <StaffViewSwitcher />
        <NavLinks items={sectionItems} />
      </div>
    );
  }

  if (effectiveRole === "CLOSER") return <NavLinks items={closerItems} />;
  return <NavLinks items={dialerItems} />;
}

export function AppSidebarNav({
  role,
  platformAdminGranted,
  collapsed,
  onNavigate,
}: {
  role?: string;
  platformAdminGranted?: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const effectiveRole: Role | undefined = toRole(role);
  const canUsePlatformAdmin = hasPlatformAdminCapability(effectiveRole, platformAdminGranted);
  const platformAdminItems: NavItem[] = canUsePlatformAdmin
    ? [
        { href: "/app/manager/admin", label: "Platform admin", shortLabel: "Pa" },
        { href: "/app/manager/portal-overrides", label: "Portal overrides", shortLabel: "Po" },
      ]
    : [];

  const dialerItems: NavItem[] = [
    { href: "/app/dialer/leads", label: "Leads" },
    { href: "/app/dialer/calls", label: "Calls" },
    { href: "/app/dialer/appointments", label: "Appointments", shortLabel: "Ap" },
    ...platformAdminItems,
  ];

  const closerItems: NavItem[] = [
    { href: "/app/closer/appointments", label: "Meetings", shortLabel: "Mt" },
    { href: "/app/closer/availability", label: "Availability", shortLabel: "Av" },
    ...platformAdminItems,
  ];

  const managerItemsFull: NavItem[] = [
    { href: "/app/manager", label: "Dashboard", shortLabel: "Db" },
    ...platformAdminItems,
    { href: "/app/manager/invites", label: "Employee invites", shortLabel: "In" },
    { href: "/app/manager/blogs", label: "Blogs", shortLabel: "Bl" },
    { href: "/app/manager/campaigns", label: "Campaigns", shortLabel: "Cp" },
    { href: "/app/manager/leads", label: "Leads" },
    { href: "/app/manager/calls", label: "Calls" },
    { href: "/app/manager/appointments", label: "Appointments", shortLabel: "Ap" },
  ];

  const managerItemsStaff: NavItem[] = [
    { href: "/app/manager", label: "Dashboard", shortLabel: "Db" },
    ...platformAdminItems,
    { href: "/app/manager/invites", label: "Employee invites", shortLabel: "In" },
    { href: "/app/manager/leads", label: "Leads" },
    { href: "/app/manager/calls", label: "Calls" },
    { href: "/app/manager/appointments", label: "Appointments", shortLabel: "Ap" },
  ];

  const hrItems: NavItem[] = [
    { href: "/app/hr", label: "Candidates", shortLabel: "Ca" },
    { href: "/app/hr/interviews", label: "Interviews", shortLabel: "Iv" },
    { href: "/app/hr/employees", label: "Employees", shortLabel: "Em" },
    { href: "/app/hr/campaigns", label: "Campaigns", shortLabel: "Cp" },
    { href: "/app/hr/leads", label: "Leads", shortLabel: "Le" },
    { href: "/app/hr/calls", label: "Calls", shortLabel: "Cl" },
    { href: "/app/hr/appointments", label: "Appointments", shortLabel: "Ap" },
    { href: "/app/hr/invites", label: "Employee invites", shortLabel: "In" },
    { href: "/app/hr/availability", label: "Availability", shortLabel: "Av" },
    ...platformAdminItems,
  ];

  if (canAccessTeamOpsWorkspace(effectiveRole)) {
    const managerItems = effectiveRole === "HR" ? managerItemsStaff : managerItemsFull;
    const sectionItems = pathname.startsWith("/app/dialer")
      ? dialerItems
      : pathname.startsWith("/app/closer")
        ? closerItems
        : pathname.startsWith("/app/hr")
          ? hrItems
        : managerItems;

    return (
      <div className="grid gap-3">
        <StaffViewSwitcherVertical collapsed={collapsed} onNavigate={onNavigate} />
        <NavLinksVertical items={sectionItems} collapsed={collapsed} onNavigate={onNavigate} />
      </div>
    );
  }

  if (effectiveRole === "CLOSER") {
    return <NavLinksVertical items={closerItems} collapsed={collapsed} onNavigate={onNavigate} />;
  }

  return <NavLinksVertical items={dialerItems} collapsed={collapsed} onNavigate={onNavigate} />;
}
