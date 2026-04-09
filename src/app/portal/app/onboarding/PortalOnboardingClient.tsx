"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AppModal } from "@/components/AppModal";
import { SuggestedSetupModalLauncher } from "@/components/SuggestedSetupModalLauncher";

type Status = {
  businessProfileComplete: boolean;
  blogsSetupComplete: boolean;
  needsOnboarding: boolean;
};

export function PortalOnboardingClient() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const appBase = pathname.startsWith("/credit") ? "/credit/app" : "/portal/app";

  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  const creditsAdded = useMemo(() => {
    const raw = (searchParams?.get("creditsAdded") || "").trim();
    if (!raw) return 0;
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.trunc(n));
  }, [searchParams]);

  const [creditsModalOpen, setCreditsModalOpen] = useState(false);

  useEffect(() => {
    if (creditsAdded > 0) setCreditsModalOpen(true);
  }, [creditsAdded]);

  function withFromOnboarding(href: string) {
    if (!href) return href;
    return href.includes("?") ? `${href}&from=onboarding` : `${href}?from=onboarding`;
  }

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
  const blogsDone = status?.blogsSetupComplete ?? false;

  const stepRow = (opts: {
    label: string;
    status: "Done" | "Next";
    href: string;
    detail?: string;
  }) => (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm font-semibold text-zinc-900">{opts.label}</div>
        <div
          className={
            opts.status === "Done"
              ? "text-xs font-semibold text-emerald-700"
              : "text-xs font-semibold text-brand-ink"
          }
        >
          {opts.status}
        </div>
      </div>
      {opts.detail ? <div className="mt-1 text-xs text-zinc-600">{opts.detail}</div> : null}
      <div className="mt-3">
        <Link
          href={opts.href}
          className="inline-flex items-center justify-center rounded-xl bg-white px-3 py-2 text-xs font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:bg-zinc-100"
        >
          Open
        </Link>
      </div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="text-sm font-semibold text-zinc-900">Setup checklist</div>
        <div className="mt-2 text-sm text-zinc-600">
          Do these in order. Everything is editable later in Profile and service settings.
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3">
          {stepRow({
            label: "1) Fill out your Profile",
            status: businessDone ? "Done" : "Next",
            href: withFromOnboarding(`${appBase}/profile`),
            detail: "Business name, website, goals, and brand voice are used across blogs, automations, and templates.",
          })}

          {stepRow({
            label: "2) Add credits",
            status: "Next",
            href: withFromOnboarding(`${appBase}/billing`),
            detail: "Credits power usage-based actions like AI calls, scrapes, and automations. You can top up anytime.",
          })}

          {stepRow({
            label: "3) Set up Blogs automation",
            status: blogsDone ? "Done" : "Next",
            href: withFromOnboarding(`${appBase}/services/blogs`),
            detail: "Create your blog workspace, set your slug, and turn on the scheduler.",
          })}

          {stepRow({
            label: "4) Connect your Inbox (SMS/Email)",
            status: "Next",
            href: withFromOnboarding(`${appBase}/services/inbox`),
            detail: "Connect Twilio and start sending/receiving messages from one place.",
          })}

          {stepRow({
            label: "5) Turn on Reviews",
            status: "Next",
            href: withFromOnboarding(`${appBase}/services/reviews`),
            detail: "Send review requests automatically after bookings or manually from contacts.",
          })}

          {stepRow({
            label: "6) Build automations",
            status: "Next",
            href: withFromOnboarding(`${appBase}/services/automations`),
            detail: "Trigger messages, tasks, tags, and follow-ups based on real events.",
          })}

          {stepRow({
            label: "7) Funnel Builder (funnels + hosted forms)",
            status: "Next",
            href: withFromOnboarding(`${appBase}/services/funnel-builder`),
            detail: "Create funnels and forms and preview them under /portal/f and /portal/forms.",
          })}

          {stepRow({
            label: "8) Nurture campaigns",
            status: "Next",
            href: withFromOnboarding(`${appBase}/services/nurture-campaigns`),
            detail: "Schedule multi-step SMS/email sequences for leads and customers.",
          })}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href={appBase}
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50"
          >
            Back to dashboard
          </Link>

          <SuggestedSetupModalLauncher
            buttonLabel="View suggested setup"
            title="Suggested setup"
            description="Review and apply recommended actions. Nothing runs until you approve it."
            buttonClassName="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95"
          />
        </div>
      </div>

      <AppModal
        open={creditsModalOpen}
        title="Starter credits added"
        description={`We added ${creditsAdded} credits to help you get started. Welcome!`}
        onClose={() => {
          setCreditsModalOpen(false);
          router.replace(`${appBase}/onboarding`, { scroll: false });
          router.refresh();
        }}
        widthClassName="w-[min(520px,calc(100vw-32px))]"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95"
              onClick={() => {
                setCreditsModalOpen(false);
                router.replace(`${appBase}/onboarding`, { scroll: false });
              }}
            >
              Continue
            </button>
          </div>
        }
      >
        <div className="text-sm text-zinc-600">You can top up credits anytime in Billing.</div>
      </AppModal>
    </div>
  );
}
