"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  email: string;
  emailVerificationEmailSentAt: string | null;
};

function formatSentAt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString();
}

export function PortalVerifyEmailGate(props: Props) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [sentAtOverride, setSentAtOverride] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      router.refresh();
    }, 4000);
    return () => window.clearInterval(id);
  }, [router]);

  const sentAtLabel = useMemo(
    () => formatSentAt(sentAtOverride ?? props.emailVerificationEmailSentAt),
    [props.emailVerificationEmailSentAt, sentAtOverride],
  );

  const resend = useCallback(async () => {
    setSending(true);
    setMessage("");
    try {
      const res = await fetch("/api/portal/auth/resend-verification", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as any;

      if (res.ok && json?.ok) {
        setMessage("Verification email sent. Check your inbox (and spam). The link expires quickly.");
        setSentAtOverride(new Date().toISOString());
        router.refresh();
        return;
      }

      if (res.ok && json?.alreadyVerified) {
        router.refresh();
        return;
      }

      setMessage(json?.error || "Unable to resend verification email.");
    } finally {
      setSending(false);
    }
  }, [router]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 sm:p-8">
        <div className="text-sm font-semibold text-zinc-900">Verify your email</div>
        <div className="mt-2 text-sm text-zinc-600">
          Before you continue onboarding, verify the email address <span className="font-semibold text-zinc-900">{props.email}</span>.
        </div>

        <div className="mt-3 text-xs text-zinc-500">
          {sentAtLabel ? `Last sent: ${sentAtLabel}` : "We’ll send you a verification email now. If you don’t see it, tap resend."}
        </div>

        {message ? <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">{message}</div> : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => void resend()}
            disabled={sending}
            className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? "Sending…" : "Resend verification email"}
          </button>
        </div>

        <div className="mt-6 text-xs text-zinc-500">
          Tip: if you clicked an old link, request a new one. Resending invalidates older links.
        </div>
      </div>
    </div>
  );
}
