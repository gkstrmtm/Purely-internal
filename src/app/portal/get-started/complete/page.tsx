"use client";

import { Suspense } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AppModal } from "@/components/AppModal";
import { PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

export default function PortalGetStartedCompletePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-brand-mist text-brand-ink">
          <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12" />
        </div>
      }
    >
      <PortalGetStartedCompleteInner />
    </Suspense>
  );
}

function PortalGetStartedCompleteInner() {
  const router = useRouter();
  const pathname = usePathname() || "";
  const params = useSearchParams();

  const portalBase = pathname.startsWith("/credit") ? "/credit" : "/portal";

  const sessionId = useMemo(() => (params?.get("session_id") || "").trim(), [params]);
  const bypass = useMemo(() => (params?.get("bypass") || "").trim() === "1", [params]);
  const [loading, setLoading] = useState(true);
  const [bonusCredits, setBonusCredits] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmOnboarding = useCallback(async () => {
    if (!sessionId && !bypass) {
      router.replace(`${portalBase}/get-started`, { scroll: false });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/portal/billing/onboarding-confirm", {
        method: "POST",
        headers: { "content-type": "application/json", [PORTAL_VARIANT_HEADER]: portalBase === "/credit" ? "credit" : "portal" },
        body: JSON.stringify(bypass ? { bypass: true } : { sessionId }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        if (res.status === 401 || res.status === 403) {
          router.replace(`${portalBase}/login`, { scroll: false });
          return;
        }
        setError(json?.error || "Your services did not activate yet. Retry here, jump back into setup, or open onboarding.");
        setLoading(false);
        return;
      }

      const credits = typeof json?.bonusCredits === "number" ? Math.max(0, Math.trunc(json.bonusCredits)) : 0;
      setBonusCredits(credits);
      setLoading(false);
      setModalOpen(true);
    } catch {
      setError("Your services did not finish activating. Retry here, jump back into setup, or open onboarding.");
      setLoading(false);
    }
  }, [bypass, portalBase, router, sessionId]);

  useEffect(() => {
    void confirmOnboarding();
  }, [confirmOnboarding]);

  return (
    <div className="min-h-screen bg-brand-mist text-brand-ink">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
          <div className="text-xl font-bold">Finishing setup…</div>
          <div className="mt-2 text-sm text-zinc-600">
            We&apos;re activating your portal services now.
          </div>
          <div className="mt-6 text-sm text-zinc-600">
            {loading ? "Please wait." : error ? "Activation paused. Retry here or jump back into setup." : "Almost done…"}
          </div>
          {error ? (
            <>
              <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void confirmOnboarding()}
                  className="inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
                >
                  Retry activation
                </button>
                <button
                  type="button"
                  onClick={() => router.replace(`${portalBase}/get-started`, { scroll: false })}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  Back to setup
                </button>
                <button
                  type="button"
                  onClick={() => router.replace(`${portalBase}/app/onboarding`, { scroll: false })}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  Open onboarding
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <AppModal
        open={modalOpen}
        title={bonusCredits > 0 ? "Starter credits added" : "You're all set"}
        description={bonusCredits > 0 ? `We gave you ${bonusCredits} credits to get started.` : "Your services are active."}
        onClose={() => {
          setModalOpen(false);
          router.replace(`${portalBase}/app/onboarding`, { scroll: false });
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
                router.replace(`${portalBase}/app/onboarding`, { scroll: false });
                router.refresh();
              }}
            >
              Continue
            </button>
          </div>
        }
      >
        <div className="text-sm text-zinc-600">
          {bonusCredits > 0 ? "You can top up credits anytime in Billing." : "You can adjust services anytime in Billing."}
        </div>
      </AppModal>
    </div>
  );
}
