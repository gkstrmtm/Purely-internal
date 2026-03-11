"use client";

import { useCallback, useState } from "react";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function SalesCheckoutButton({
  pageId,
  priceId,
  quantity,
  text,
  className,
  disabled,
}: {
  pageId: string;
  priceId: string;
  quantity?: number;
  text?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = useCallback(async () => {
    if (disabled) return;
    if (!pageId || !priceId) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/public/funnel-builder/checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pageId, priceId, quantity: quantity ?? 1 }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true || typeof json.url !== "string") {
        const msg = (json && typeof json.error === "string" && json.error) || "Unable to start checkout";
        setError(msg);
        return;
      }

      const nextUrl = json.url.trim();
      if (!nextUrl) {
        setError("Stripe did not return a checkout URL");
        return;
      }

      window.location.href = nextUrl;
    } catch (e) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as any).message) : "Network error";
      setError(msg || "Network error");
    } finally {
      setBusy(false);
    }
  }, [disabled, pageId, priceId, quantity]);

  const label = (text || "Buy now").trim() || "Buy now";

  return (
    <div>
      <button
        type="button"
        data-funnel-editor-interactive="true"
        disabled={disabled || busy || !pageId || !priceId}
        onClick={() => void onClick()}
        className={classNames(
          "inline-flex items-center justify-center rounded-xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        {busy ? "Redirecting…" : label}
      </button>
      {error ? <div className="mt-2 text-xs text-red-700">{error}</div> : null}
    </div>
  );
}
