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
        d="M16 17L21 12M21 12L16 7M21 12H9M9 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21H9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
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
          "group inline-flex items-center rounded-2xl bg-transparent text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5",
          "text-[#dc2626] hover:text-[#b91c1c]",
          isCollapsed ? "h-10 w-10 justify-center" : "h-10 px-2.5",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fecaca]",
          className,
        )}
      >
        <span
          className={classNames(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl",
            "text-[#dc2626]",
            "group-hover:scale-110 group-hover:bg-[rgba(220,38,38,0.10)] group-hover:text-[#b91c1c] transition-all duration-150",
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

  const baseClassName =
    "rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-[#dc2626] transition-transform duration-150 hover:-translate-y-0.5 hover:bg-[rgba(220,38,38,0.08)] hover:text-[#b91c1c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fecaca]";
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
