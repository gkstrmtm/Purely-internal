"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

export type FunnelCartItem = {
  priceId: string;
  quantity: number;
  productName?: string;
  productDescription?: string;
};

const CART_EVENT = "credit_funnel_cart_change";

function clampInt(v: unknown, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function storageKey(pageId: string): string {
  return `credit_funnel_cart:${pageId}`;
}

function readCartRaw(pageId: string): string {
  if (typeof window === "undefined") return "";
  if (!pageId) return "";
  try {
    return window.localStorage.getItem(storageKey(pageId)) || "";
  } catch {
    return "";
  }
}

function parseCartRaw(raw: string): FunnelCartItem[] {
  const text = String(raw || "");
  if (!text) return [];

  try {
    const parsed = JSON.parse(text) as any;
    const itemsRaw = Array.isArray(parsed?.items) ? parsed.items : [];
    const items: FunnelCartItem[] = [];

    for (const it of itemsRaw) {
      if (!it || typeof it !== "object") continue;
      const priceId = typeof it.priceId === "string" ? it.priceId.trim() : "";
      if (!priceId) continue;
      const quantity = clampInt(it.quantity, 1, 20);
      const productName = typeof it.productName === "string" ? it.productName.trim().slice(0, 140) : "";
      const productDescription = typeof it.productDescription === "string" ? it.productDescription.trim().slice(0, 320) : "";
      items.push({
        priceId,
        quantity,
        ...(productName ? { productName } : {}),
        ...(productDescription ? { productDescription } : {}),
      });
    }

    return items;
  } catch {
    return [];
  }
}

function readCart(pageId: string): FunnelCartItem[] {
  return parseCartRaw(readCartRaw(pageId));
}

function writeCart(pageId: string, items: FunnelCartItem[]): void {
  if (typeof window === "undefined") return;
  if (!pageId) return;

  try {
    window.localStorage.setItem(storageKey(pageId), JSON.stringify({ v: 1, items }));
  } catch {
    // ignore (storage full, blocked, etc.)
  }

  try {
    window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: { pageId } }));
  } catch {
    // ignore
  }
}

function subscribe(pageId: string, cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onCustom = (e: Event) => {
    const any = e as any;
    const changedPageId = any?.detail?.pageId;
    if (changedPageId && changedPageId !== pageId) return;
    cb();
  };

  const onStorage = (e: StorageEvent) => {
    if (e.storageArea !== window.localStorage) return;
    if (e.key !== storageKey(pageId)) return;
    cb();
  };

  window.addEventListener(CART_EVENT, onCustom as any);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(CART_EVENT, onCustom as any);
    window.removeEventListener("storage", onStorage);
  };
}

export function useFunnelCart(pageId: string) {
  // IMPORTANT: `useSyncExternalStore` requires `getSnapshot` to return a
  // referentially-stable value when the store hasn't changed. Returning a
  // freshly-allocated array each time can trigger React's "maximum update depth"
  // error in production.
  const raw = useSyncExternalStore(
    useCallback((cb) => subscribe(pageId, cb), [pageId]),
    useCallback(() => readCartRaw(pageId), [pageId]),
    useCallback(() => "", []),
  );

  const items = useMemo(() => parseCartRaw(raw), [raw]);

  const totalQuantity = useMemo(() => items.reduce((sum, it) => sum + (it.quantity || 0), 0), [items]);

  const setItems = useCallback(
    (next: FunnelCartItem[]) => {
      // Normalize/merge by priceId
      const byId = new Map<string, FunnelCartItem>();
      for (const it of next) {
        if (!it || typeof it !== "object") continue;
        const priceId = String(it.priceId || "").trim();
        if (!priceId) continue;
        const quantity = clampInt(it.quantity, 1, 20);
        const prev = byId.get(priceId);
        const productName = typeof it.productName === "string" ? it.productName.trim().slice(0, 140) : "";
        const productDescription = typeof it.productDescription === "string" ? it.productDescription.trim().slice(0, 320) : "";

        byId.set(priceId, {
          priceId,
          quantity: clampInt((prev?.quantity || 0) + quantity, 1, 20),
          ...(productName ? { productName } : prev?.productName ? { productName: prev.productName } : {}),
          ...(productDescription
            ? { productDescription }
            : prev?.productDescription
              ? { productDescription: prev.productDescription }
              : {}),
        });
      }

      writeCart(pageId, Array.from(byId.values()));
    },
    [pageId],
  );

  const addItem = useCallback(
    (item: { priceId: string; quantity?: number; productName?: string; productDescription?: string }) => {
      const priceId = String(item.priceId || "").trim();
      if (!pageId || !priceId) return;
      const quantity = clampInt(item.quantity ?? 1, 1, 20);
      const prev = readCart(pageId);
      const existing = prev.find((p) => p.priceId === priceId);
      const nextQty = clampInt((existing?.quantity || 0) + quantity, 1, 20);

      const productName = typeof item.productName === "string" ? item.productName.trim().slice(0, 140) : "";
      const productDescription = typeof item.productDescription === "string" ? item.productDescription.trim().slice(0, 320) : "";

      const next = [
        ...prev.filter((p) => p.priceId !== priceId),
        {
          priceId,
          quantity: nextQty,
          ...(productName ? { productName } : existing?.productName ? { productName: existing.productName } : {}),
          ...(productDescription
            ? { productDescription }
            : existing?.productDescription
              ? { productDescription: existing.productDescription }
              : {}),
        },
      ];

      writeCart(pageId, next);
    },
    [pageId],
  );

  const setQuantity = useCallback(
    (priceIdRaw: string, quantityRaw: number) => {
      const priceId = String(priceIdRaw || "").trim();
      if (!pageId || !priceId) return;
      const quantity = clampInt(quantityRaw, 1, 20);
      const prev = readCart(pageId);
      const next = prev.map((p) => (p.priceId === priceId ? { ...p, quantity } : p));
      writeCart(pageId, next);
    },
    [pageId],
  );

  const removeItem = useCallback(
    (priceIdRaw: string) => {
      const priceId = String(priceIdRaw || "").trim();
      if (!pageId || !priceId) return;
      const prev = readCart(pageId);
      const next = prev.filter((p) => p.priceId !== priceId);
      writeCart(pageId, next);
    },
    [pageId],
  );

  const clear = useCallback(() => {
    if (!pageId) return;
    writeCart(pageId, []);
  }, [pageId]);

  return {
    items,
    totalQuantity,
    addItem,
    setItems,
    setQuantity,
    removeItem,
    clear,
  };
}
