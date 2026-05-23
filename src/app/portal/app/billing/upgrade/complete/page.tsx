"use client";

import { Suspense } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AppModal } from "@/components/AppModal";
import { PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

export default function PortalBillingUpgradeCompletePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-brand-mist text-brand-ink">
          <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12" />
        </div>
      }
    >
      <PortalBillingUpgradeCompleteInner />
    </Suspense>
  );
}

function PortalBillingUpgradeCompleteInner() {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const portalBase = String(pathname || "").startsWith("/credit") ? "/credit" : "/portal";
  const appBase = `${portalBase}/app`;

  const sessionId = useMemo(() => (params?.get("session_id") || "").trim(), [params]);

  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmUpgrade = useCallback(async () => {
    if (!sessionId) {
      router.replace(`${appBase}/billing/upgrade`, { scroll: false });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/portal/billing/onboarding-confirm", {
        method: "POST",
        headers: { "content-type": "application/json", [PORTAL_VARIANT_HEADER]: portalBase === "/credit" ? "credit" : "portal" },
        body: JSON.stringify({ sessionId }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        if (res.status === 401 || res.status === 403) {
          router.replace(`${portalBase}/login`, { scroll: false });
          return;
        }
        setError(json?.error || "Your monthly plan did not activate yet. Retry here, head back to upgrade, or open billing.");
        setLoading(false);
        return;
      }

      setLoading(false);
      setModalOpen(true);
    } catch {
      setError("Your monthly plan did not finish activating. Retry here, head back to upgrade, or open billing.");
      setLoading(false);
    }
  }, [appBase, portalBase, router, sessionId]);

  useEffect(() => {
    void confirmUpgrade();
  }, [confirmUpgrade]);

  return (
    <div className="min-h-screen bg-brand-mist text-brand-ink">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
          <div className="text-xl font-bold">Finishing upgrade…</div>
          <div className="mt-2 text-sm text-zinc-600">We&apos;re activating your monthly plan now.</div>
          <div className="mt-6 text-sm text-zinc-600">
            {loading ? "Please wait." : error ? "Upgrade confirmation paused. Retry here or head back to billing." : "Almost done…"}
          </div>
          {error ? (
            <>
              <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void confirmUpgrade()}
                  className="inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
                >
                  Retry upgrade
                </button>
                <button
                  type="button"
                  onClick={() => router.replace(`${appBase}/billing/upgrade`, { scroll: false })}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  Back to upgrade
                </button>
                <button
                  type="button"
                  onClick={() => router.replace(`${appBase}/billing`, { scroll: false })}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  Open billing
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <AppModal
        open={modalOpen}
        title="Monthly plan active"
        description="Your account is now on a monthly plan."
        onClose={() => {
          setModalOpen(false);
          router.replace(`${appBase}/billing`, { scroll: false });
          router.refresh();
        }}
        widthClassName="w-[min(520px,calc(100vw-32px))]"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
              onClick={() => {
                setModalOpen(false);
                router.replace(`${appBase}/billing`, { scroll: false });
                router.refresh();
              }}
            >
              Back to Billing
            </button>
          </div>
        }
      >
        <div className="text-sm text-zinc-600">You can manage your plan and invoices in Billing.</div>
      </AppModal>
    </div>
  );
}
