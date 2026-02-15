"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AppSidebarNav } from "@/components/AppTopNav";
import { SignOutButton } from "@/components/SignOutButton";

type Props = {
  role?: string;
  email?: string;
  children: React.ReactNode;
};

const STORAGE_KEY = "pa_app_nav_collapsed_v1";

export function AppShell({ role, email, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === "1") setCollapsed(true);
      if (raw === "0") setCollapsed(false);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [collapsed]);

  const sidebarWidthClass = collapsed ? "w-16" : "w-64";

  const Sidebar = useMemo(() => {
    return (
      <aside
        className={
          "hidden shrink-0 border-r border-zinc-200 bg-white sm:flex sm:flex-col sm:sticky sm:top-0 sm:h-screen " +
          sidebarWidthClass
        }
      >
        <div className={"flex items-center gap-3 border-b border-zinc-200 px-3 py-3 " + (collapsed ? "justify-center" : "")}
        >
          <Link href="/app" className="flex items-center gap-2">
            <Image
              src="/brand/purity-5.png"
              alt="Purely Automation"
              width={40}
              height={40}
              className="h-9 w-9 object-contain"
              priority
            />
            {!collapsed ? (
              <span className="text-sm font-semibold text-zinc-900">Employee</span>
            ) : null}
          </Link>

          <div className="flex-1" />

          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={
              "grid h-9 w-9 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 " +
              (collapsed ? "hidden" : "")
            }
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
              className="grid h-9 w-9 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <AppSidebarNav role={role} collapsed={collapsed} onNavigate={() => setMobileOpen(false)} />
        </div>

        <div className={"border-t border-zinc-200 p-3 " + (collapsed ? "px-2" : "")}
        >
          {!collapsed && email ? (
            <div className="mb-2 truncate text-xs font-medium text-zinc-500">{email}</div>
          ) : null}
          <div className={collapsed ? "flex justify-center" : ""}>
            <SignOutButton />
          </div>
        </div>
      </aside>
    );
  }, [collapsed, email, role, sidebarWidthClass]);

  return (
    <div className="min-h-screen bg-brand-mist text-brand-ink">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/80 backdrop-blur sm:hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="grid h-10 w-10 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-700"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>

          <Link href="/app" className="flex items-center gap-2">
            <Image
              src="/brand/purity-5.png"
              alt="Purely Automation"
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
              priority
            />
            <span className="text-sm font-semibold text-zinc-900">Employee</span>
          </Link>

          <div className="flex-1" />

          <SignOutButton />
        </div>
      </header>

      {/* Mobile sidebar overlay */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-30 sm:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-72 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <Link href="/app" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
                <Image
                  src="/brand/purity-5.png"
                  alt="Purely Automation"
                  width={36}
                  height={36}
                  className="h-9 w-9 object-contain"
                  priority
                />
                <span className="text-sm font-semibold text-zinc-900">Employee</span>
              </Link>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-700"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="h-[calc(100%-60px)] overflow-y-auto p-2">
              <AppSidebarNav role={role} collapsed={false} onNavigate={() => setMobileOpen(false)} />
              <div className="mt-4 border-t border-zinc-200 pt-4">
                {email ? <div className="mb-2 truncate px-2 text-xs font-medium text-zinc-500">{email}</div> : null}
                <div className="px-2">
                  <SignOutButton />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex">
        {Sidebar}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
