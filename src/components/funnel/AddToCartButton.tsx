"use client";

import type { CSSProperties } from "react";
import { useCallback, useState } from "react";

import { useFunnelCart } from "@/components/funnel/cart/useFunnelCart";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function AddToCartButton({
  pageId,
  priceId,
  quantity,
  productName,
  productDescription,
  text,
  className,
  style,
  disabled,
}: {
  pageId: string;
  priceId: string;
  quantity?: number;
  productName?: string;
  productDescription?: string;
  text?: string;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
}) {
  const cart = useFunnelCart(pageId);
  const [added, setAdded] = useState(false);

  const onClick = useCallback(() => {
    if (disabled) return;
    if (!pageId || !priceId) return;

    cart.addItem({
      priceId,
      quantity: quantity ?? 1,
      productName,
      productDescription,
    });

    setAdded(true);
    window.setTimeout(() => setAdded(false), 1100);
  }, [cart, disabled, pageId, priceId, productDescription, productName, quantity]);

  const label = (text || "Add to cart").trim() || "Add to cart";

  return (
    <button
      type="button"
      data-funnel-editor-interactive="true"
      disabled={disabled || !pageId || !priceId}
      onClick={onClick}
      style={style}
      className={classNames(
        "inline-flex items-center justify-center rounded-xl bg-(--color-brand-blue) px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {added ? "Added" : label}
    </button>
  );
}
