"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";

function VerifyEmailInner() {
  const search = useSearchParams();
  const pathname = usePathname();
  const token = (search?.get("token") || "").trim();
  const portalBase = String(pathname || "").startsWith("/credit") ? "/credit" : "/portal";

  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState<string>("");

  const runVerification = useCallback(async () => {
    if (!token) {
      setStatus("error");
      setMessage("Missing verification token.");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/portal/auth/verify-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const json = (await res.json().catch(() => ({}))) as any;

      if (res.ok && json?.ok) {
        setStatus("ok");
        setMessage(json?.alreadyVerified ? "Email already verified." : "Email verified.");
        return;
      }

      setStatus("error");
      setMessage(json?.error || "This link did not verify. Retry here, head back to sign in, or return to the portal.");
    } catch {
      setStatus("error");
      setMessage("This link did not verify. Retry here, head back to sign in, or return to the portal.");
    }
  }, [token]);

  useEffect(() => {
    let alive = true;

    async function run() {
      if (!alive) return;

      await runVerification();
    }

    void run();
    return () => {
      alive = false;
    };
  }, [runVerification]);

  return (
    <div className="min-h-screen bg-brand-mist text-brand-ink">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
          <div className="text-lg font-bold text-zinc-900">{status === "ok" ? "Email verified" : "Verify email"}</div>
          <div className="mt-2 text-sm text-zinc-600">
            {status === "loading" ? "Verifying…" : message}
          </div>
          {status === "error" ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              If the link is older, it may have expired. Retry once, then return to sign in and request a fresh verification email if needed.
            </div>
          ) : null}

          <div className="mt-6 flex flex-col gap-2">
            {status === "error" ? (
              <button
                type="button"
                onClick={() => void runVerification()}
                className="rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-center text-sm font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95"
              >
                Retry verification
              </button>
            ) : null}
            <Link
              href={`${portalBase}/login`}
              className="rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-center text-sm font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95"
            >
              {status === "ok" ? "Sign in" : "Back to sign in"}
            </Link>
            <Link
              href={portalBase}
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
