"use client";

import { signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";

export function SignOutButton() {
  const pathname = usePathname();
  const router = useRouter();
  const isCredit = pathname?.startsWith("/credit");
  const isPortal = pathname?.startsWith("/portal");
  const portalBase = isCredit ? "/credit" : "/portal";
  return (
    <button
      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50"
      onClick={async () => {
        if (isPortal || isCredit) {
          await fetch(`${portalBase}/api/logout`, { method: "POST" }).catch(() => null);
          router.push(isCredit ? "/credit/login" : "/login");
          router.refresh();
          return;
        }
        await signOut({ callbackUrl: "/employeelogin" });
      }}
      type="button"
    >
      Sign out
    </button>
  );
}
