import Link from "next/link";

import { MarketingBookingWidget } from "@/components/marketing/MarketingBookingWidget";

export default async function BookACallPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const r = sp.r;
  const requestId = typeof r === "string" ? r : Array.isArray(r) ? r[0] ?? null : null;

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-brand-blue hover:underline">
            ← back to home
          </Link>
          <div className="text-xs text-zinc-500">Purely Automation</div>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-start">
          <section>
            <h1 className="font-brand text-4xl text-brand-blue">book a call</h1>
            <p className="mt-3 text-base text-zinc-700">
              Pick a time and we’ll walk through your workflow, show what’s possible, and map an automation plan.
            </p>

            <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
              <div className="text-sm font-semibold text-zinc-900">What we can automate</div>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-700">
                <li>Inbound calls, SMS, and email routing</li>
                <li>Lead follow-up sequences</li>
                <li>Scheduling + reminders</li>
                <li>Dispatching teams and contractors</li>
                <li>Dashboards, reporting, and marketing workflows</li>
              </ul>
            </div>

            {!requestId ? (
              <div className="mt-6 text-sm text-zinc-700">
                If you haven’t requested a demo yet, you can still book. We’ll ask for your details after you select a time.
              </div>
            ) : null}
          </section>

          <MarketingBookingWidget initialRequestId={requestId} />
        </div>
      </div>
    </main>
  );
}
