"use client";

import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

export function SignOutButton() {
  const pathname = usePathname();
  const callbackUrl = pathname?.startsWith("/portal") ? "/portal" : "/employeelogin";
  return (
    <button
      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50"
      onClick={() => signOut({ callbackUrl })}
      type="button"
    >
      Sign out
    </button>
  );
}
