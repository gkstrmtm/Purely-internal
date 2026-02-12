export const CREDIT_USD_VALUE = 0.1;

export function creditsToUsd(credits: number): number {
  const c = typeof credits === "number" && Number.isFinite(credits) ? credits : 0;
  return Math.max(0, c) * CREDIT_USD_VALUE;
}

export function formatUsd(amount: number, opts?: { maximumFractionDigits?: number }): string {
  const v = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: opts?.maximumFractionDigits ?? 2,
  }).format(v);
}
