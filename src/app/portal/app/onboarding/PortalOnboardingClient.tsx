"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BusinessProfileForm } from "@/app/portal/profile/BusinessProfileForm";

type Status = {
  businessProfileComplete: boolean;
  blogsSetupComplete: boolean;
  needsOnboarding: boolean;
};

export function PortalOnboardingClient() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const res = await fetch("/api/portal/onboarding/status", { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as Partial<Status>;
    setStatus({
      businessProfileComplete: Boolean(json.businessProfileComplete),
      blogsSetupComplete: Boolean(json.blogsSetupComplete),
      needsOnboarding: Boolean(json.needsOnboarding),
    });
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  if (loading && !status) {
    return (
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
        Loading onboarding…
      </div>
    );
  }

  const businessDone = status?.businessProfileComplete ?? false;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="text-sm font-semibold text-zinc-900">Setup checklist</div>
        <div className="mt-2 text-sm text-zinc-600">
          Complete these once, and your portal becomes much more useful.
        </div>

        <div className="mt-5 space-y-3 text-sm">
          <div className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
            <span>Business profile</span>
            <span className={businessDone ? "text-emerald-700 font-semibold" : "text-zinc-500 font-semibold"}>
              {businessDone ? "Done" : "Needed"}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
            <span>Blogs setup</span>
            <span className={(status?.blogsSetupComplete ?? false) ? "text-emerald-700 font-semibold" : "text-zinc-500 font-semibold"}>
              {(status?.blogsSetupComplete ?? false) ? "Started" : "Next"}
            </span>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-600">
            Tip: you can always come back here from Profile.
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <Link
            href="/portal/app/services/blogs"
            className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
          >
            Open Blogs
          </Link>
          <Link
            href="/portal/app"
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          >
            Back to dashboard
          </Link>
        </div>
      </div>

      <div className="lg:col-span-2">
        <BusinessProfileForm
          title="Business profile"
          description="Tell us what you do so your blog drafts and onboarding steps are tailored to you."
          onSaved={() => {
            void refresh();
          }}
        />

        <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">Next: connect your blog</div>
          <div className="mt-2 text-sm text-zinc-600">
            After your profile is saved, set up your blog workspace and (optionally) verify a custom domain.
          </div>
          <div className="mt-4">
            <Link
              href="/portal/app/services/blogs"
              className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
            >
              Set up Blogs
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
