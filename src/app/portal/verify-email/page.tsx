"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function VerifyEmailInner() {
  const search = useSearchParams();
  const token = (search?.get("token") || "").trim();

  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    let alive = true;

    async function run() {
      if (!token) {
        setStatus("error");
        setMessage("Missing verification token.");
        return;
      }

      const res = await fetch("/api/portal/auth/verify-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const json = (await res.json().catch(() => ({}))) as any;
      if (!alive) return;

      if (res.ok && json?.ok) {
        setStatus("ok");
        setMessage(json?.alreadyVerified ? "Email already verified." : "Email verified.");
        return;
      }

      setStatus("error");
      setMessage(json?.error || "Unable to verify this link.");
    }

    void run();
    return () => {
      alive = false;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-brand-mist text-brand-ink">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
          <div className="text-lg font-bold text-zinc-900">{status === "ok" ? "Email verified" : "Verify email"}</div>
          <div className="mt-2 text-sm text-zinc-600">
            {status === "loading" ? "Verifying…" : message}
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <Link
              href="/portal/login"
              className="rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-center text-sm font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95"
            >
              Sign in
            </Link>
            <Link
              href="/portal"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-center text-sm font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50"
            >
              Back to portal
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-brand-mist text-brand-ink">
          <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12" />
        </div>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}
