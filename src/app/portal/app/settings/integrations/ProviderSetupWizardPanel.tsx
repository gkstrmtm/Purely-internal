"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import type { PortalMetaProviderReadiness } from "@/lib/portalMetaProviderReadiness";

type MetaReadinessResponse =
  | { ok: true; readiness: PortalMetaProviderReadiness }
  | { ok: false; error?: string };

function socialStatusLabel(status: PortalMetaProviderReadiness["status"]) {
  switch (status) {
    case "connected":
      return "Connected";
    case "needs_permissions":
      return "Needs permissions";
    case "reconnect_required":
      return "Reconnect required";
    case "not_connected":
      return "Not connected";
    case "disabled":
      return "Disabled";
    default:
      return "Coming soon";
  }
}

function socialStatusClasses(status: PortalMetaProviderReadiness["status"]) {
  switch (status) {
    case "connected":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "needs_permissions":
    case "reconnect_required":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "not_connected":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "disabled":
      return "border-zinc-200 bg-zinc-100 text-zinc-700";
    default:
      return "border-sky-200 bg-sky-50 text-sky-800";
  }
}

export function ProviderSetupWizardPanel() {
  const searchParams = useSearchParams();
  const focusedKey = (searchParams?.get("setup") || "").trim();
  const fallbackBase: "/portal" | "/credit" = typeof window !== "undefined" && window.location.pathname.startsWith("/credit") ? "/credit" : "/portal";
  const [metaReadiness, setMetaReadiness] = useState<PortalMetaProviderReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const metaRes = await fetch("/api/portal/media/providers/meta/readiness", { cache: "no-store" });
        const metaJson = (await metaRes.json().catch(() => null)) as MetaReadinessResponse | null;

        if (!cancelled) {
          if (metaRes.ok && metaJson && metaJson.ok === true) {
            setMetaReadiness(metaJson.readiness);
          } else {
            setMetaReadiness(null);
            setError(typeof (metaJson as any)?.error === "string" ? (metaJson as any).error : "Unable to load social publishing readiness.");
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load social publishing readiness.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const mediaLibraryHref = `${fallbackBase}/app/services/media-library`;
  const metaTargetCards = metaReadiness?.targetAccounts ?? [];
  const metaConnectCtaLabel = metaReadiness?.status === "reconnect_required"
    ? "Reconnect Meta and return to Media Library"
    : "Connect Meta and return to Media Library";
  const metaIssueText = useMemo(() => {
    if (!metaReadiness) return null;
    if (metaReadiness.targetAccountBlockers.length) return metaReadiness.targetAccountBlockers[0];
    if (metaReadiness.permissionGaps.length) return `Missing: ${metaReadiness.permissionGaps.join(", ")}`;
    return metaReadiness.setupMessage;
  }, [metaReadiness]);

  return (
    <section id="provider-setup-wizard" className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-blue">Social accounts</div>
          <h2 className="mt-2 text-2xl font-semibold text-brand-ink">Connect Instagram and Facebook once</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Connect Meta here, make sure the right business account is attached, then go back to Media Library and choose the destination you want to post into.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={mediaLibraryHref} className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-100">
            Open Media Library
          </Link>
          <a href="#provider-setup-controls" className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-100">
            Open all integration controls
          </a>
        </div>
      </div>

      <section
        id="provider-setup-meta"
        className={[
          "mt-6 rounded-3xl border bg-[linear-gradient(180deg,#ffffff,rgba(244,244,245,0.72))] p-5 shadow-sm",
          focusedKey === "meta" ? "border-brand-blue ring-2 ring-[rgba(29,78,216,0.14)]" : "border-zinc-200",
        ].join(" ")}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-blue">Meta</div>
            <h3 className="mt-2 text-xl font-semibold text-brand-ink">Instagram and Facebook</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Sign into the Facebook account that manages your business Page and linked Instagram professional account. After that, go back to Media Library and pick the destination there.
            </p>
          </div>
          {metaReadiness ? (
            <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${socialStatusClasses(metaReadiness.status)}`}>
              {socialStatusLabel(metaReadiness.status)}
            </span>
          ) : (
            <span className="inline-flex rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-700">
              {loading ? "Checking" : "Unavailable"}
            </span>
          )}
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div>
        ) : loading ? (
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">Checking Meta connection…</div>
        ) : metaReadiness ? (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)]">
            <div className="rounded-2xl bg-zinc-50 px-4 py-4 text-sm text-zinc-700">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Connected account</div>
              <div className="mt-2 text-base font-semibold text-zinc-900">{metaReadiness.connectedAccountLabel || "No Meta account connected yet"}</div>
              <div className="mt-1 text-xs leading-5 text-zinc-500">{metaReadiness.setupMessage}</div>

              <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Available destinations</div>
              {metaTargetCards.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {metaTargetCards.map((account) => (
                    <div key={account.key} className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
                      <span className="font-semibold text-zinc-900">{account.label}</span>
                      {account.username ? <span className="text-zinc-500"> {`@${account.username}`}</span> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-xs leading-5 text-zinc-500">No Instagram professional account or Facebook Page is available yet.</div>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-700">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Next step</div>
              <div className="mt-2 text-base font-semibold text-zinc-900">
                {metaReadiness.actionHref ? metaConnectCtaLabel : "Go back to Media Library"}
              </div>
              <div className="mt-1 text-xs leading-5 text-zinc-500">{metaIssueText || "Once Meta is connected, choose the destination in Media Library and keep posting there."}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                {metaReadiness.actionHref ? (
                  <a href={metaReadiness.actionHref} className="inline-flex items-center justify-center rounded-2xl bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-95">
                    {metaConnectCtaLabel}
                  </a>
                ) : null}
                <Link href={mediaLibraryHref} className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-100">
                  Open Media Library
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">Social account setup is unavailable right now.</div>
        )}
      </section>
    </section>
  );
}