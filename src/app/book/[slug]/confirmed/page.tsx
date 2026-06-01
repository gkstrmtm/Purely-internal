import Link from "next/link";
import { headers } from "next/headers";

import {
  buildExternalBookingConfirmationPath,
  captureExternalBookingRedirectConfirmation,
} from "@/lib/externalBookingConfirmation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function appendSearchParams(url: URL, searchParams: Record<string, string | string[] | undefined>) {
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") url.searchParams.append(key, item);
      }
      continue;
    }
    if (typeof value === "string") url.searchParams.set(key, value);
  }
}

export default async function ExternalBookingConfirmedPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const headerList = await headers();

  const url = new URL(`https://purelyautomation.com${buildExternalBookingConfirmationPath(slug)}`);
  appendSearchParams(url, resolvedSearchParams);

  const result = await captureExternalBookingRedirectConfirmation({
    slug,
    url,
    headers: headerList,
  });

  const bookingHref = `/book/${encodeURIComponent(slug)}`;
  const offerLabel = result.offerName || "booking";
  const statusTitle = result.ok
    ? "Booking return recorded"
    : result.reason === "expired"
      ? "Booking return link expired"
      : result.reason === "invalid"
        ? "Booking return link is invalid"
        : "Booking return link unavailable";

  const statusDetail = result.ok
    ? result.deduped
      ? result.duplicateReason || `Purely already recorded this recent return from ${result.providerLabel}. Reloading the page did not create a second confirmation.`
      : `Purely recorded a redirect return from ${result.providerLabel}. This is stronger than a click, but it still depends on the provider sending someone back here rather than a direct API or webhook confirmation.`
    : result.detail;

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="mx-auto max-w-2xl rounded-4xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/30 backdrop-blur">
        <div className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
          Purely-hosted confirmation
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white">{statusTitle}</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-300">{statusDetail}</p>

        {result.ok ? (
          <div className="mt-6 grid gap-3 rounded-3xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-200 sm:grid-cols-2">
            <div>
              <div className="text-[11px] font-medium text-zinc-400">Offer</div>
              <div className="mt-1 font-medium text-white">{offerLabel}</div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-zinc-400">Recorded at</div>
              <div className="mt-1 font-medium text-white">{new Date(result.confirmedAt).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-zinc-400">Linked handoff</div>
              <div className="mt-1 font-medium text-white">{result.handoffEventId ? "Matched" : "Not linked"}</div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-zinc-400">Linked contact</div>
              <div className="mt-1 font-medium text-white">{result.contactId ? "Matched" : "Not linked"}</div>
            </div>
          </div>
        ) : null}

        <div className="mt-6 rounded-3xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
          Purely does not claim provider completion from a click alone. This page records only a return to the hosted confirmation route.
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href={bookingHref}
            className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition-opacity hover:opacity-90"
          >
            Back to booking page
          </Link>
          <Link
            href="https://purelyautomation.com"
            className="inline-flex items-center justify-center rounded-2xl border border-white/15 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/5"
          >
            Purely Automation
          </Link>
        </div>
      </div>
    </main>
  );
}