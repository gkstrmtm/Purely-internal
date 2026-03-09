"use client";

import { Suspense } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AppModal } from "@/components/AppModal";

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

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!sessionId && !bypass) {
        router.replace(`${portalBase}/get-started`);
        return;
      }

      const res = await fetch("/api/portal/billing/onboarding-confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bypass ? { bypass: true } : { sessionId }),
      });

      const json = await res.json().catch(() => null);
      if (!mounted) return;

      if (!res.ok || !json?.ok) {
        if (res.status === 401 || res.status === 403) {
          router.replace(`${portalBase}/login`);
          return;
        }
        setError(json?.error || "Unable to activate services");
        setLoading(false);
        return;
      }

      const credits = typeof json?.bonusCredits === "number" ? Math.max(0, Math.trunc(json.bonusCredits)) : 0;
      setBonusCredits(credits);
      setLoading(false);
      setModalOpen(true);
    })();

    return () => {
      mounted = false;
    };
  }, [router, sessionId, bypass, portalBase]);

  return (
    <div className="min-h-screen bg-brand-mist text-brand-ink">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
          <div className="text-xl font-bold">Finishing setup…</div>
          <div className="mt-2 text-sm text-zinc-600">
            We&apos;re activating your portal services now.
          </div>
          <div className="mt-6 text-sm text-zinc-600">
            {loading ? "Please wait." : error ? "Something went wrong. You can close this tab or try again." : "Almost done…"}
          </div>
        </div>
      </div>

      <AppModal
        open={modalOpen}
        title={bonusCredits > 0 ? "Starter credits added" : "You're all set"}
        description={bonusCredits > 0 ? `We gave you ${bonusCredits} credits to get started.` : "Your services are active."}
        onClose={() => {
          setModalOpen(false);
          router.replace(`${portalBase}/app/onboarding`);
          router.refresh();
        }}
        widthClassName="w-[min(520px,calc(100vw-32px))]"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
              onClick={() => {
                setModalOpen(false);
                router.replace(`${portalBase}/app/onboarding`);
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
