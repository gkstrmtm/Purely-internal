"use client";

import { Suspense } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AppModal } from "@/components/AppModal";

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

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!sessionId) {
        router.replace(`${appBase}/billing/upgrade`);
        return;
      }

      const res = await fetch("/api/portal/billing/onboarding-confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      const json = await res.json().catch(() => null);
      if (!mounted) return;

      if (!res.ok || !json?.ok) {
        if (res.status === 401 || res.status === 403) {
          router.replace(`${portalBase}/login`);
          return;
        }
        setError(json?.error || "Unable to activate subscription");
        setLoading(false);
        return;
      }

      setLoading(false);
      setModalOpen(true);
    })();

    return () => {
      mounted = false;
    };
  }, [appBase, portalBase, router, sessionId]);

  return (
    <div className="min-h-screen bg-brand-mist text-brand-ink">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
          <div className="text-xl font-bold">Finishing upgrade…</div>
          <div className="mt-2 text-sm text-zinc-600">We&apos;re activating your monthly plan now.</div>
          <div className="mt-6 text-sm text-zinc-600">
            {loading ? "Please wait." : error ? "Something went wrong. You can close this tab or try again." : "Almost done…"}
          </div>
        </div>
      </div>

      <AppModal
        open={modalOpen}
        title="Monthly plan active"
        description="Your account is now on a monthly plan."
        onClose={() => {
          setModalOpen(false);
          router.replace(`${appBase}/billing`);
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
                router.replace(`${appBase}/billing`);
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
