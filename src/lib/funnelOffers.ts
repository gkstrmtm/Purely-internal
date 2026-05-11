export type FunnelOffer = {
  id: string;
  label: string;
  stripeProductId: string | null;
  priceId: string | null;
  productName: string | null;
  productDescription: string | null;
  displayPrice: string | null;
  billingPeriod: string | null;
  currency: string | null;
  unitAmountCents: number | null;
  active: boolean;
};

function coerceString(value: unknown, maxLen: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLen) : "";
}

function coerceOptionalString(value: unknown, maxLen: number) {
  const next = coerceString(value, maxLen);
  return next || null;
}

function coerceAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  const rounded = Math.round(amount);
  if (rounded < 0 || rounded > 99_999_999) return null;
  return rounded;
}

export function normalizeFunnelOfferId(value: unknown) {
  const next = coerceString(value, 80);
  return next || null;
}

export function normalizeFunnelOffer(value: unknown): FunnelOffer | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;

  const id = normalizeFunnelOfferId(record.id);
  const label = coerceString(record.label, 120);
  const priceId = coerceOptionalString(record.priceId, 140);

  if (!id || !label || !priceId) return null;

  return {
    id,
    label,
    stripeProductId: coerceOptionalString(record.stripeProductId, 140),
    priceId,
    productName: coerceOptionalString(record.productName, 160),
    productDescription: coerceOptionalString(record.productDescription, 320),
    displayPrice: coerceOptionalString(record.displayPrice, 80),
    billingPeriod: coerceOptionalString(record.billingPeriod, 80),
    currency: coerceOptionalString(record.currency, 12)?.toLowerCase() ?? null,
    unitAmountCents: coerceAmount(record.unitAmountCents),
    active: record.active !== false,
  };
}

export function normalizeFunnelOffers(value: unknown): FunnelOffer[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const offers: FunnelOffer[] = [];
  for (const entry of value) {
    const next = normalizeFunnelOffer(entry);
    if (!next || seen.has(next.id)) continue;
    seen.add(next.id);
    offers.push(next);
    if (offers.length >= 100) break;
  }
  return offers;
}

export function readFunnelOffers(settingsJson: unknown, funnelId: string): FunnelOffer[] {
  if (!settingsJson || typeof settingsJson !== "object" || Array.isArray(settingsJson)) return [];
  const raw = (settingsJson as Record<string, unknown>).funnelOffers;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return normalizeFunnelOffers((raw as Record<string, unknown>)[funnelId]);
}

export function writeFunnelOffers(settingsJson: unknown, funnelId: string, offers: FunnelOffer[] | null) {
  const base = settingsJson && typeof settingsJson === "object" && !Array.isArray(settingsJson)
    ? { ...(settingsJson as Record<string, unknown>) }
    : {};
  const funnelOffers =
    base.funnelOffers && typeof base.funnelOffers === "object" && !Array.isArray(base.funnelOffers)
      ? { ...(base.funnelOffers as Record<string, unknown>) }
      : {};

  const normalized = normalizeFunnelOffers(offers ?? []);
  if (normalized.length) funnelOffers[funnelId] = normalized;
  else delete funnelOffers[funnelId];

  base.funnelOffers = funnelOffers;
  return base;
}

export function resolveFunnelOffer(offers: FunnelOffer[] | null | undefined, offerId: unknown): FunnelOffer | null {
  const normalizedId = normalizeFunnelOfferId(offerId);
  if (!normalizedId || !Array.isArray(offers)) return null;
  return offers.find((offer) => offer.id === normalizedId && offer.active !== false) ?? null;
}