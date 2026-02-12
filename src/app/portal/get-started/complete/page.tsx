"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useToast } from "@/components/ToastProvider";

export default function PortalGetStartedCompletePage() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();

  const sessionId = useMemo(() => (params?.get("session_id") || "").trim(), [params]);
  const bypass = useMemo(() => (params?.get("bypass") || "").trim() === "1", [params]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!sessionId && !bypass) {
        toast.error("Missing checkout session");
        router.replace("/portal/get-started");
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
        toast.error(json?.error || "Unable to activate services");
        setLoading(false);
        return;
      }

      toast.success("Services activated");
      router.replace("/portal/app/services");
      router.refresh();
    })();

    return () => {
      mounted = false;
    };
  }, [router, sessionId, toast, bypass]);

  return (
    <div className="min-h-screen bg-brand-mist text-brand-ink">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
          <div className="text-xl font-bold">Finishing setup…</div>
          <div className="mt-2 text-sm text-zinc-600">
            We&apos;re activating your portal services now.
          </div>
          <div className="mt-6 text-sm text-zinc-600">{loading ? "Please wait." : "You can close this tab or try again."}</div>
        </div>
      </div>
    </div>
  );
}
