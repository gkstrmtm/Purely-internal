"use client";

import { signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M10 17l-1 0c-3 0-5-2-5-5V7c0-3 2-5 5-5h1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M15 12H7m8 0l-3-3m3 3l-3 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 7h6c2 0 4 2 4 5s-2 5-4 5h-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SignOutButton(
  {
    className,
    variant = "default",
    collapsed,
  }: {
    className?: string;
    variant?: "default" | "sidebar";
    collapsed?: boolean;
  } = {},
) {
  const pathname = usePathname();
  const router = useRouter();
  const isCredit = pathname?.startsWith("/credit");
  const isPortal = pathname?.startsWith("/portal");
  const portalBase = isCredit ? "/credit" : "/portal";

  async function doSignOut() {
    if (isPortal || isCredit) {
      await fetch(`${portalBase}/api/logout`, { method: "POST" }).catch(() => null);
      router.push(isCredit ? "/credit/login" : "/login");
      router.refresh();
      return;
    }
    await signOut({ callbackUrl: "/employeelogin" });
  }

  if (variant === "sidebar") {
    const isCollapsed = Boolean(collapsed);
    return (
      <button
        type="button"
        aria-label="Sign Out"
        onClick={doSignOut}
        className={classNames(
          "group inline-flex items-center rounded-2xl border border-transparent bg-transparent text-sm font-semibold",
          "text-red-600 hover:text-red-700",
          isCollapsed ? "h-10 w-10 justify-center" : "h-10 px-2.5",
          className,
        )}
      >
        <span
          className={classNames(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl",
            "bg-red-50 text-red-600",
            "group-hover:bg-red-100 group-hover:text-red-700",
          )}
        >
          <LogoutIcon />
        </span>

        {!isCollapsed ? (
          <span
            className={classNames(
              "ml-2 overflow-hidden whitespace-nowrap text-sm font-semibold",
              "max-w-0 opacity-0 transition-[max-width,opacity] duration-200",
              "group-hover:max-w-40 group-hover:opacity-100",
            )}
          >
            Sign Out
          </span>
        ) : null}
      </button>
    );
  }

  const baseClassName = "rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50";
  const mergedClassName = className ? `${baseClassName} ${className}` : baseClassName;
  return (
    <button
      className={mergedClassName}
      onClick={doSignOut}
      type="button"
    >
      Sign out
    </button>
  );
}
