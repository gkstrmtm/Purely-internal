"use client";

import type { CSSProperties } from "react";
import { useCallback, useMemo, useState } from "react";

import { AppModal } from "@/components/AppModal";
import { useFunnelCart } from "@/components/funnel/cart/useFunnelCart";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function CartButton({
  pageId,
  text,
  className,
  style,
  disabled,
}: {
  pageId: string;
  text?: string;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
}) {
  const cart = useFunnelCart(pageId);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasItems = cart.items.length > 0;
  const label = (text || "Cart").trim() || "Cart";

  const checkoutItems = useMemo(
    () => cart.items.map((it) => ({ priceId: it.priceId, quantity: it.quantity })),
    [cart.items],
  );

  const startCheckout = useCallback(async () => {
    if (disabled) return;
    if (!pageId) return;
    if (!checkoutItems.length) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/public/funnel-builder/checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pageId, items: checkoutItems }),
      });

      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      const isJson = contentType.includes("application/json");
      const json = isJson ? (((await res.json().catch(() => null)) as any) ?? null) : null;

      if (!res.ok || !json || json.ok !== true || typeof json.url !== "string") {
        const fallbackText = !isJson ? (await res.text().catch(() => "")) : "";
        const msg =
          (json && typeof json.error === "string" && json.error) ||
          (fallbackText.trim() ? fallbackText.trim().slice(0, 240) : "Unable to start checkout");
        setError(msg);
        return;
      }

      const nextUrl = String(json.url || "").trim();
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
  }, [checkoutItems, disabled, pageId]);

  return (
    <>
      <button
        type="button"
        data-funnel-editor-interactive="true"
        disabled={disabled || !pageId}
        onClick={() => {
          if (disabled) return;
          setError(null);
          setOpen(true);
        }}
        style={style}
        className={classNames(
          "inline-flex items-center justify-center gap-2 rounded-xl bg-(--color-brand-blue) px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        <span>{label}</span>
        <span
          className={classNames(
            "inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-white/20 px-2 text-xs font-bold",
            cart.totalQuantity ? "" : "opacity-70",
          )}
          aria-label={`${cart.totalQuantity} items in cart`}
        >
          {cart.totalQuantity}
        </span>
      </button>

      <AppModal
        open={open}
        onClose={() => {
          if (busy) return;
          setOpen(false);
        }}
        title="Your cart"
        description={hasItems ? "Review items and checkout." : "Your cart is empty."}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              disabled={busy || !hasItems}
              onClick={() => cart.clear()}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
            >
              Clear cart
            </button>
            <button
              type="button"
              disabled={busy || !hasItems}
              onClick={() => void startCheckout()}
              className={classNames(
                "rounded-2xl px-4 py-2 text-sm font-semibold text-white",
                busy || !hasItems ? "bg-zinc-400" : "bg-brand-ink hover:opacity-95",
              )}
            >
              {busy ? "Redirecting…" : "Checkout"}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          {cart.items.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">No items yet.</div>
          ) : (
            <div className="space-y-2">
              {cart.items.map((it) => (
                <div key={it.priceId} className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900">{it.productName || it.priceId}</div>
                      {it.productDescription ? (
                        <div className="mt-1 text-xs text-zinc-600">{it.productDescription}</div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => cart.removeItem(it.priceId)}
                      className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Qty</div>
                    <button
                      type="button"
                      disabled={busy || it.quantity <= 1}
                      onClick={() => cart.setQuantity(it.priceId, Math.max(1, it.quantity - 1))}
                      className="h-9 w-9 rounded-xl border border-zinc-200 bg-white text-sm font-bold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={String(it.quantity)}
                      onChange={(e) => cart.setQuantity(it.priceId, Number(e.target.value) || 1)}
                      className="h-9 w-20 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      disabled={busy || it.quantity >= 20}
                      onClick={() => cart.setQuantity(it.priceId, Math.min(20, it.quantity + 1))}
                      className="h-9 w-9 rounded-xl border border-zinc-200 bg-white text-sm font-bold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
        </div>
      </AppModal>
    </>
  );
}
