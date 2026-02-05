"use client";

import { useEffect, useState } from "react";

type Me = {
  user: { email: string; name: string; role: string };
};

export function PortalProfileClient() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await fetch("/api/customer/me", { cache: "no-store" });
      if (!mounted) return;
      if (res.ok) setMe((await res.json()) as Me);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Profile</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Account details and security.
      </p>

      {loading ? (
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
          Loading…
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
            <div className="text-sm font-semibold text-zinc-900">Contact</div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs text-zinc-500">Name</div>
                <div className="mt-1 text-sm font-semibold text-brand-ink">
                  {me?.user?.name || ""}
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs text-zinc-500">Email</div>
                <div className="mt-1 text-sm font-semibold text-brand-ink">
                  {me?.user?.email || ""}
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              Editing contact info and password reset can be enabled next.
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
                disabled
              >
                Reset password
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                disabled
              >
                Change email
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="text-sm font-semibold text-zinc-900">Security</div>
            <div className="mt-2 text-sm text-zinc-600">
              Keep your account secure.
            </div>
            <div className="mt-5 space-y-2 text-sm text-zinc-700">
              <div>• Use a strong password</div>
              <div>• Don’t share logins</div>
              <div>• Sign out on shared devices</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
