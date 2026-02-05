import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PortalDashboardClient } from "@/app/portal/PortalDashboardClient";
import { authOptions } from "@/lib/auth";

export default async function PortalDashboardPage() {
  const session = await getServerSession(authOptions);

  const isAuthed =
    session?.user?.role === "CLIENT" || session?.user?.role === "ADMIN";

  if (!isAuthed) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-14">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-12">
          <div className="max-w-2xl">
            <div className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
              Client portal
            </div>
            <h1 className="mt-5 text-3xl font-bold tracking-tight text-brand-ink sm:text-4xl">
              Automation that pays for itself — with visibility.
            </h1>
            <p className="mt-4 text-base text-zinc-600">
              The Purely Automation client portal is where you activate the modules you purchased,
              manage billing, and track the time your automations save you each week.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/portal/get-started"
                className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-6 py-3 text-base font-semibold text-white hover:opacity-95"
              >
                Get started
              </Link>
              <Link
                href="/portal/login"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-6 py-3 text-base font-semibold text-brand-ink hover:bg-zinc-50"
              >
                Sign in
              </Link>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-zinc-200 bg-white p-6">
              <div className="text-sm font-semibold text-zinc-900">See what you paid for</div>
              <div className="mt-2 text-sm text-zinc-600">
                Modules are clearly listed — no confusion, no chasing updates.
              </div>
            </div>
            <div className="rounded-3xl border border-zinc-200 bg-white p-6">
              <div className="text-sm font-semibold text-zinc-900">Add modules instantly</div>
              <div className="mt-2 text-sm text-zinc-600">
                Upgrade from the portal when you’re ready to expand automation.
              </div>
            </div>
            <div className="rounded-3xl border border-zinc-200 bg-white p-6">
              <div className="text-sm font-semibold text-zinc-900">Track hours saved</div>
              <div className="mt-2 text-sm text-zinc-600">
                A simple metric your team actually understands.
              </div>
            </div>
          </div>

          <div className="mt-10 rounded-3xl border border-zinc-200 bg-zinc-50 p-6">
            <div className="text-sm font-semibold text-zinc-900">What’s inside</div>
            <div className="mt-3 grid grid-cols-1 gap-3 text-sm text-zinc-700 sm:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="font-semibold">Blog Automation</div>
                <div className="mt-1 text-zinc-600">
                  Consistent content without hiring a full-time writer.
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="font-semibold">Booking Automation</div>
                <div className="mt-1 text-zinc-600">
                  Reduce back-and-forth and capture more appointments.
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="font-semibold">CRM / Follow-up</div>
                <div className="mt-1 text-zinc-600">
                  Keep leads warm automatically so sales doesn’t leak.
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="font-semibold">Billing & access</div>
                <div className="mt-1 text-zinc-600">
                  Update payment methods and add modules in minutes.
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Pricing</div>
                <div className="mt-1 text-sm text-zinc-600">
                  Start lean, then add modules as you grow.
                </div>
              </div>
              <div className="text-xs text-zinc-500">
                Prices shown are examples — final pricing is set at checkout.
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-6">
                <div className="text-sm font-semibold text-zinc-900">Starter</div>
                <div className="mt-2 text-3xl font-bold text-brand-ink">$299</div>
                <div className="text-xs text-zinc-500">/ month</div>
                <div className="mt-4 text-sm text-zinc-700">
                  Best for getting your first automation live.
                </div>
                <div className="mt-4 space-y-2 text-sm text-zinc-700">
                  <div>• 1 module included</div>
                  <div>• Billing & access portal</div>
                  <div>• Basic reporting</div>
                </div>
                <div className="mt-5">
                  <Link
                    href="/portal/get-started"
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-brand-ink px-4 py-3 text-sm font-semibold text-white hover:opacity-95"
                  >
                    Get started
                  </Link>
                </div>
              </div>

              <div className="rounded-3xl border border-brand-ink bg-white p-6 shadow-sm">
                <div className="inline-flex items-center rounded-full bg-brand-ink px-3 py-1 text-xs font-semibold text-white">
                  Most popular
                </div>
                <div className="mt-3 text-sm font-semibold text-zinc-900">Growth</div>
                <div className="mt-2 text-3xl font-bold text-brand-ink">$599</div>
                <div className="text-xs text-zinc-500">/ month</div>
                <div className="mt-4 text-sm text-zinc-700">
                  For teams that want consistent leads + bookings.
                </div>
                <div className="mt-4 space-y-2 text-sm text-zinc-700">
                  <div>• 2 modules included</div>
                  <div>• Upgrade anytime</div>
                  <div>• Priority support</div>
                </div>
                <div className="mt-5">
                  <Link
                    href="/portal/get-started"
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-brand-ink px-4 py-3 text-sm font-semibold text-white hover:opacity-95"
                  >
                    Create account
                  </Link>
                </div>
              </div>

              <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-6">
                <div className="text-sm font-semibold text-zinc-900">Scale</div>
                <div className="mt-2 text-3xl font-bold text-brand-ink">$999</div>
                <div className="text-xs text-zinc-500">/ month</div>
                <div className="mt-4 text-sm text-zinc-700">
                  Full automation stack + advanced follow-up.
                </div>
                <div className="mt-4 space-y-2 text-sm text-zinc-700">
                  <div>• 3 modules included</div>
                  <div>• Advanced reporting</div>
                  <div>• White-glove onboarding</div>
                </div>
                <div className="mt-5">
                  <Link
                    href="/portal/get-started"
                    className="inline-flex w-full items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                  >
                    Talk to us
                  </Link>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600">
              You’ll always see exactly what you have access to inside the portal — and you can add modules whenever you’re ready.
            </div>
          </div>

          <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-3xl border border-zinc-200 bg-white p-6 sm:flex-row sm:items-center">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Ready to activate your automations?</div>
              <div className="mt-1 text-sm text-zinc-600">
                Create your portal account and we’ll take it from there.
              </div>
            </div>
            <Link
              href="/portal/get-started"
              className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
            >
              Create account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink">Client Portal</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Your modules, billing, and automation stats.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <PortalDashboardClient />
      </div>
    </div>
  );
}
