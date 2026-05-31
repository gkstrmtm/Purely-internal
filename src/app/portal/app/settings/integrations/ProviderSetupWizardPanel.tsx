"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import type { PortalMetaProviderReadiness } from "@/lib/portalMetaProviderReadiness";
import { buildMetaConnectRequestHref, buildProviderSetupWizardHref } from "@/lib/providerSetupWizard";

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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const focusedKey = (searchParams?.get("setup") || "").trim();
  const fallbackBase: "/portal" | "/credit" = pathname?.startsWith("/credit") ? "/credit" : "/portal";
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
  const metaSetupHref = useMemo(() => buildProviderSetupWizardHref(fallbackBase, "meta"), [fallbackBase]);
  const metaMode = metaReadiness?.integrationMode || "instagram_login";
  const usesInstagramLogin = metaMode === "instagram_login";
  const metaActionHref = useMemo(() => {
    if (!metaReadiness?.canStartOAuth) return null;
    return buildMetaConnectRequestHref(metaSetupHref, metaMode);
  }, [metaMode, metaReadiness?.canStartOAuth, metaSetupHref]);
  const metaTargetCards = metaReadiness?.targetAccounts ?? [];
  const metaConnectCtaLabel = metaReadiness?.status === "reconnect_required"
    ? (usesInstagramLogin ? "Reconnect Instagram and continue setup" : "Reconnect Meta and continue setup")
    : (usesInstagramLogin ? "Connect Instagram and continue setup" : "Connect Meta and continue setup");
  const metaIssueText = useMemo(() => {
    if (!metaReadiness) return null;
    if (metaReadiness.primaryDiagnostic) return metaReadiness.primaryDiagnostic.message;
    if (metaReadiness.targetAccountBlockers.length) return metaReadiness.targetAccountBlockers[0];
    if (metaReadiness.permissionGaps.length) return `Missing: ${metaReadiness.permissionGaps.join(", ")}`;
    return metaReadiness.setupMessage;
  }, [metaReadiness]);

  return (
    <section id="provider-setup-wizard" className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-blue">Social accounts</div>
          <h2 className="mt-2 text-2xl font-semibold text-brand-ink">Connect Instagram professional account</h2>
          <p className="mt-2 text-sm text-zinc-600">Connect it, come back to Media Library, and pick the destination.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={mediaLibraryHref} className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-100">
            Open Media Library
          </Link>
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
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-blue">{usesInstagramLogin ? "Instagram Login" : "Meta"}</div>
            <h3 className="mt-2 text-xl font-semibold text-brand-ink">{usesInstagramLogin ? "Instagram professional account" : "Instagram and Facebook"}</h3>
            <p className="mt-2 text-sm text-zinc-600">{usesInstagramLogin ? "Use a Business or Creator Instagram account." : "Use the Facebook account that owns the Page and linked Instagram account."}</p>
            {usesInstagramLogin ? (
              <p className="mt-2 text-xs text-zinc-500">Facebook Page linking is only needed for the older Page-linked setup.</p>
            ) : null}
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
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">Checking Meta connection</div>
        ) : metaReadiness ? (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)]">
            <div className="rounded-2xl bg-zinc-50 px-4 py-4 text-sm text-zinc-700">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Connected account</div>
              <div className="mt-2 text-base font-semibold text-zinc-900">{metaReadiness.connectedAccountLabel || (usesInstagramLogin ? "No Instagram professional account connected yet" : "No Meta account connected yet")}</div>
              <div className="mt-2 grid gap-2 text-xs leading-5 text-zinc-600">
                <div>1. Connect the account.</div>
                <div>2. Come back here.</div>
                <div>3. Pick it in Media Library.</div>
              </div>
              {metaReadiness.primaryDiagnostic ? (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-900">
                  <div className="font-semibold text-amber-950">{metaReadiness.primaryDiagnostic.message}</div>
                  <div className="mt-1">{metaReadiness.primaryDiagnostic.detail}</div>
                </div>
              ) : null}

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
                <div className="mt-2 text-xs leading-5 text-zinc-500">
                  {usesInstagramLogin
                    ? "No Instagram professional account is available yet."
                    : "No Instagram professional account or Facebook Page is available yet."}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-700">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Do this</div>
              <div className="mt-2 text-base font-semibold text-zinc-900">
                {metaActionHref ? metaConnectCtaLabel : "Go back to Media Library"}
              </div>
              <div className="mt-1 text-xs leading-5 text-zinc-500">{metaIssueText || "When the account is connected, return to Media Library and choose it."}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                {metaActionHref ? (
                  <a href={metaActionHref} className="inline-flex items-center justify-center rounded-2xl bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-95">
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