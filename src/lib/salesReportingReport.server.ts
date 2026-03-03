import { getStripeSecretKeyForOwner } from "@/lib/stripeIntegration.server";
import { stripeGetWithKey } from "@/lib/stripeFetchWithKey.server";
import { getProviderCredentials, getSalesReportingStatus } from "@/lib/salesReportingIntegration.server";
import { providerLabel, type SalesReportingProviderKey } from "@/lib/salesReportingProviders";

async function requireBraintree() {
  try {
    return await import("braintree");
  } catch {
    throw new Error("Braintree integration is temporarily unavailable.");
  }
}

async function requireAuthorizeNet() {
  try {
    return await import("authorizenet");
  } catch {
    throw new Error("Authorize.Net integration is temporarily unavailable.");
  }
}

export type SalesRangeKey = "7d" | "30d";

export function clampSalesRangeKey(value: string | null): SalesRangeKey {
  switch ((value ?? "").toLowerCase().trim()) {
    case "7d":
    case "7":
      return "7d";
    case "30d":
    case "30":
    default:
      return "30d";
  }
}

function startForRange(range: SalesRangeKey, now: Date): Date {
  const days = range === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function dayKeyUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function safeNum(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function safeStr(s: unknown): string {
  return typeof s === "string" ? s : "";
}

function maskSecret(raw: string, keepStart = 6, keepEnd = 4): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s.length <= keepStart + keepEnd) return `${s.slice(0, 2)}…${s.slice(-2)}`;
  return `${s.slice(0, keepStart)}…${s.slice(-keepEnd)}`;
}

function toCentsFromDecimalString(value: string, currency: string): number {
  const cur = (currency || "usd").toLowerCase();
  // Most providers here use 2-decimal currencies in common cases.
  // Keep it simple; if parsing fails return 0.
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const factor = cur === "jpy" ? 1 : 100;
  return Math.round(n * factor);
}

export type SalesReportPayload =
  | {
      ok: true;
      provider: SalesReportingProviderKey;
      providerLabel: string;
      range: SalesRangeKey;
      startIso: string;
      endIso: string;
      currency: string;
      totals: { chargeCount: number; grossCents: number; refundedCents: number; netCents: number };
      daily: Array<{ day: string; count: number; grossCents: number; refundedCents: number; netCents: number }>;
      recent: Array<{ id: string; createdIso: string; amountCents: number; refundedCents: number; currency: string; email: string | null; name: string | null; receiptUrl: string | null }>;
      note?: string;
    }
  | { ok: false; error?: string };

async function fetchStripeReport(ownerId: string, range: SalesRangeKey): Promise<SalesReportPayload> {
  const secretKey = await getStripeSecretKeyForOwner(ownerId);
  if (!secretKey) return { ok: false, error: "Stripe is not connected" };

  const now = new Date();
  const start = startForRange(range, now);
  const createdGte = Math.floor(start.getTime() / 1000);

  type StripeCharge = {
    id: string;
    amount: number;
    amount_refunded: number;
    created: number;
    currency: string;
    paid: boolean;
    status: string;
    billing_details?: { email?: string | null; name?: string | null };
    receipt_url?: string | null;
  };

  type StripeList<T> = { data: T[] };

  let charges: StripeCharge[] = [];
  try {
    const list = await stripeGetWithKey<StripeList<StripeCharge>>(secretKey, "/v1/charges", {
      limit: 100,
      "created[gte]": createdGte,
    });
    charges = Array.isArray(list?.data) ? list.data : [];
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String((e as any).message) : "Stripe request failed";
    return { ok: false, error: msg };
  }

  const paidCharges = charges.filter((c) => Boolean(c?.paid) && String(c?.status || "").toLowerCase() === "succeeded");

  let grossCents = 0;
  let refundedCents = 0;
  const currency = paidCharges.find((c) => typeof c.currency === "string")?.currency ?? "usd";

  const daily: Record<string, { grossCents: number; refundedCents: number; count: number }> = {};

  for (const c of paidCharges) {
    const amount = safeNum(c.amount);
    const refunded = safeNum(c.amount_refunded);
    grossCents += amount;
    refundedCents += refunded;

    const createdMs = safeNum(c.created) * 1000;
    const day = dayKeyUtc(new Date(createdMs || now.getTime()));
    daily[day] = daily[day] ?? { grossCents: 0, refundedCents: 0, count: 0 };
    daily[day].grossCents += amount;
    daily[day].refundedCents += refunded;
    daily[day].count += 1;
  }

  const dailyRows = Object.entries(daily)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, v]) => ({
      day,
      count: v.count,
      grossCents: v.grossCents,
      refundedCents: v.refundedCents,
      netCents: v.grossCents - v.refundedCents,
    }));

  const recent = paidCharges
    .slice()
    .sort((a, b) => safeNum(b.created) - safeNum(a.created))
    .slice(0, 20)
    .map((c) => ({
      id: safeStr(c.id) || "charge",
      createdIso: new Date(safeNum(c.created) * 1000).toISOString(),
      amountCents: safeNum(c.amount),
      refundedCents: safeNum(c.amount_refunded),
      currency: safeStr(c.currency) || "usd",
      email: c.billing_details?.email ?? null,
      name: c.billing_details?.name ?? null,
      receiptUrl: c.receipt_url ?? null,
    }));

  return {
    ok: true,
    provider: "stripe",
    providerLabel: "Stripe",
    range,
    startIso: start.toISOString(),
    endIso: now.toISOString(),
    currency,
    totals: {
      chargeCount: paidCharges.length,
      grossCents,
      refundedCents,
      netCents: grossCents - refundedCents,
    },
    daily: dailyRows,
    recent,
    note: charges.length >= 100 ? "Limited to the most recent 100 charges in the selected range." : undefined,
  };
}

async function jsonFetch<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    const msg = body && typeof body === "object" && "message" in body ? String(body.message) : body?.error || `Request failed: ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}

async function fetchRazorpayReport(creds: { keyId: string; keySecret: string }, range: SalesRangeKey): Promise<SalesReportPayload> {
  const now = new Date();
  const start = startForRange(range, now);
  const from = Math.floor(start.getTime() / 1000);
  const to = Math.floor(now.getTime() / 1000);

  const auth = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64");

  type RazorpayPayment = {
    id: string;
    amount: number;
    currency: string;
    status: string;
    captured: boolean;
    created_at: number;
    amount_refunded?: number;
    email?: string | null;
    contact?: string | null;
  };

  type RazorpayList<T> = { items: T[]; count: number };

  const payments: RazorpayPayment[] = [];

  const pageSize = 100;
  const max = 1000;
  for (let skip = 0; skip < max; skip += pageSize) {
    const url = `https://api.razorpay.com/v1/payments?from=${from}&to=${to}&count=${pageSize}&skip=${skip}`;
    const list = await jsonFetch<RazorpayList<RazorpayPayment>>(url, {
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store",
    });

    const items = Array.isArray(list?.items) ? list.items : [];
    payments.push(...items);
    if (items.length < pageSize) break;
  }

  const captured = payments.filter((p) => Boolean(p?.captured) && safeStr(p.status).toLowerCase() === "captured");

  const currency = safeStr(captured.find((p) => p.currency)?.currency) || "INR";

  let grossCents = 0;
  let refundedCents = 0;
  const daily: Record<string, { grossCents: number; refundedCents: number; count: number }> = {};

  for (const p of captured) {
    const amount = safeNum(p.amount); // already in smallest unit (paise)
    const refunded = safeNum(p.amount_refunded);
    grossCents += amount;
    refundedCents += refunded;

    const createdMs = safeNum(p.created_at) * 1000;
    const day = dayKeyUtc(new Date(createdMs || now.getTime()));
    daily[day] = daily[day] ?? { grossCents: 0, refundedCents: 0, count: 0 };
    daily[day].grossCents += amount;
    daily[day].refundedCents += refunded;
    daily[day].count += 1;
  }

  const dailyRows = Object.entries(daily)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, v]) => ({ day, count: v.count, grossCents: v.grossCents, refundedCents: v.refundedCents, netCents: v.grossCents - v.refundedCents }));

  const recent = captured
    .slice()
    .sort((a, b) => safeNum(b.created_at) - safeNum(a.created_at))
    .slice(0, 20)
    .map((p) => ({
      id: safeStr(p.id) || "payment",
      createdIso: new Date(safeNum(p.created_at) * 1000).toISOString(),
      amountCents: safeNum(p.amount),
      refundedCents: safeNum(p.amount_refunded),
      currency: safeStr(p.currency) || currency,
      email: p.email ?? null,
      name: null,
      receiptUrl: null,
    }));

  return {
    ok: true,
    provider: "razorpay",
    providerLabel: "Razorpay",
    range,
    startIso: start.toISOString(),
    endIso: now.toISOString(),
    currency: currency.toLowerCase(),
    totals: { chargeCount: captured.length, grossCents, refundedCents, netCents: grossCents - refundedCents },
    daily: dailyRows,
    recent,
    note: payments.length >= 1000 ? "Limited to the most recent 1,000 payments in the selected range." : undefined,
  };
}

async function fetchPaystackReport(creds: { secretKey: string }, range: SalesRangeKey): Promise<SalesReportPayload> {
  const now = new Date();
  const start = startForRange(range, now);
  const fromIso = start.toISOString();
  const toIso = now.toISOString();

  type PaystackTx = {
    id: number;
    reference: string;
    amount: number; // kobo
    currency: string;
    status: string;
    paid_at?: string | null;
    created_at?: string | null;
    customer?: { email?: string | null; first_name?: string | null; last_name?: string | null };
  };

  type PaystackListRes = { status: boolean; message?: string; data?: PaystackTx[]; meta?: { page?: number; pageCount?: number } };

  const txs: PaystackTx[] = [];
  for (let page = 1; page <= 10; page++) {
    const url = `https://api.paystack.co/transaction?perPage=100&page=${page}&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
    const body = await jsonFetch<PaystackListRes>(url, {
      headers: { Authorization: `Bearer ${creds.secretKey}` },
      cache: "no-store",
    });
    const items = Array.isArray(body?.data) ? body.data : [];
    txs.push(...items);
    const pageCount = safeNum(body?.meta?.pageCount);
    if (pageCount && page >= pageCount) break;
    if (items.length < 100) break;
  }

  const successful = txs.filter((t) => safeStr(t.status).toLowerCase() === "success");
  const currency = safeStr(successful.find((t) => t.currency)?.currency) || "NGN";

  let grossCents = 0;
  const daily: Record<string, { grossCents: number; refundedCents: number; count: number }> = {};

  for (const t of successful) {
    const amount = safeNum(t.amount);
    grossCents += amount;

    const created = safeStr(t.paid_at || t.created_at);
    const createdMs = created ? new Date(created).getTime() : now.getTime();
    const day = dayKeyUtc(new Date(createdMs));
    daily[day] = daily[day] ?? { grossCents: 0, refundedCents: 0, count: 0 };
    daily[day].grossCents += amount;
    daily[day].count += 1;
  }

  let refundedCents = 0;
  try {
    type PaystackRefund = { amount: number; currency: string; status: string; createdAt?: string; transaction?: { reference?: string } };
    type PaystackRefundRes = { status: boolean; data?: PaystackRefund[]; meta?: { pageCount?: number } };
    const refunds: PaystackRefund[] = [];
    for (let page = 1; page <= 10; page++) {
      const url = `https://api.paystack.co/refund?perPage=100&page=${page}&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
      const body = await jsonFetch<PaystackRefundRes>(url, {
        headers: { Authorization: `Bearer ${creds.secretKey}` },
        cache: "no-store",
      });
      const items = Array.isArray(body?.data) ? body.data : [];
      refunds.push(...items);
      const pageCount = safeNum(body?.meta?.pageCount);
      if (pageCount && page >= pageCount) break;
      if (items.length < 100) break;
    }
    for (const r of refunds) {
      if (safeStr(r.status).toLowerCase() !== "processed") continue;
      refundedCents += safeNum(r.amount);
      const created = safeStr((r as any).createdAt || (r as any).created_at);
      if (created) {
        const day = dayKeyUtc(new Date(created));
        daily[day] = daily[day] ?? { grossCents: 0, refundedCents: 0, count: 0 };
        daily[day].refundedCents += safeNum(r.amount);
      }
    }
  } catch {
    // Refunds are best-effort; keep reporting functional.
  }

  const dailyRows = Object.entries(daily)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, v]) => ({ day, count: v.count, grossCents: v.grossCents, refundedCents: v.refundedCents, netCents: v.grossCents - v.refundedCents }));

  const recent = successful
    .slice()
    .sort((a, b) => {
      const ad = new Date(safeStr(a.paid_at || a.created_at) || 0).getTime();
      const bd = new Date(safeStr(b.paid_at || b.created_at) || 0).getTime();
      return bd - ad;
    })
    .slice(0, 20)
    .map((t) => {
      const created = safeStr(t.paid_at || t.created_at) || now.toISOString();
      const email = t.customer?.email ?? null;
      const name = [t.customer?.first_name, t.customer?.last_name].filter(Boolean).join(" ") || null;
      return {
        id: safeStr(t.reference) || String(t.id),
        createdIso: new Date(created).toISOString(),
        amountCents: safeNum(t.amount),
        refundedCents: 0,
        currency: safeStr(t.currency) || currency,
        email,
        name,
        receiptUrl: null,
      };
    });

  return {
    ok: true,
    provider: "paystack",
    providerLabel: "Paystack",
    range,
    startIso: start.toISOString(),
    endIso: now.toISOString(),
    currency: currency.toLowerCase(),
    totals: { chargeCount: successful.length, grossCents, refundedCents, netCents: grossCents - refundedCents },
    daily: dailyRows,
    recent,
    note: txs.length >= 1000 ? "Limited to the most recent 1,000 transactions in the selected range." : undefined,
  };
}

async function fetchFlutterwaveReport(creds: { secretKey: string }, range: SalesRangeKey): Promise<SalesReportPayload> {
  const now = new Date();
  const start = startForRange(range, now);
  const from = start.toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);

  type FlwTx = {
    id: number;
    amount: number;
    currency: string;
    status: string;
    created_at: string;
    customer?: { email?: string | null; name?: string | null };
  };

  type FlwListRes = { status: string; message?: string; data?: FlwTx[]; meta?: { page_info?: { total_pages?: number } } };

  const txs: FlwTx[] = [];
  for (let page = 1; page <= 10; page++) {
    const url = `https://api.flutterwave.com/v3/transactions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&status=successful&page=${page}`;
    const body = await jsonFetch<FlwListRes>(url, {
      headers: { Authorization: `Bearer ${creds.secretKey}` },
      cache: "no-store",
    });
    const items = Array.isArray(body?.data) ? body.data : [];
    txs.push(...items);
    const totalPages = safeNum(body?.meta?.page_info?.total_pages);
    if (totalPages && page >= totalPages) break;
    if (items.length < 20) break;
  }

  const successful = txs.filter((t) => safeStr(t.status).toLowerCase() === "successful");
  const currency = safeStr(successful.find((t) => t.currency)?.currency) || "USD";

  let grossCents = 0;
  let refundedCents = 0;
  const daily: Record<string, { grossCents: number; refundedCents: number; count: number }> = {};

  for (const t of successful) {
    // Flutterwave amounts are in major units.
    const amountCents = Math.round(safeNum(t.amount) * 100);
    grossCents += amountCents;

    const created = safeStr(t.created_at) || now.toISOString();
    const day = dayKeyUtc(new Date(created));
    daily[day] = daily[day] ?? { grossCents: 0, refundedCents: 0, count: 0 };
    daily[day].grossCents += amountCents;
    daily[day].count += 1;
  }

  // Best-effort refunds endpoint.
  try {
    type FlwRefund = { amount_refunded?: number; refund_amount?: number; currency?: string; status?: string; created_at?: string };
    type FlwRefundRes = { status: string; data?: FlwRefund[] };
    const url = `https://api.flutterwave.com/v3/refunds?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const body = await jsonFetch<FlwRefundRes>(url, {
      headers: { Authorization: `Bearer ${creds.secretKey}` },
      cache: "no-store",
    });
    const items = Array.isArray(body?.data) ? body.data : [];
    for (const r of items) {
      const amt = safeNum((r as any).amount_refunded ?? (r as any).refund_amount);
      if (amt <= 0) continue;
      const cents = Math.round(amt * 100);
      refundedCents += cents;
      const created = safeStr((r as any).created_at) || null;
      if (created) {
        const day = dayKeyUtc(new Date(created));
        daily[day] = daily[day] ?? { grossCents: 0, refundedCents: 0, count: 0 };
        daily[day].refundedCents += cents;
      }
    }
  } catch {
    // ignore
  }

  const dailyRows = Object.entries(daily)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, v]) => ({ day, count: v.count, grossCents: v.grossCents, refundedCents: v.refundedCents, netCents: v.grossCents - v.refundedCents }));

  const recent = successful
    .slice()
    .sort((a, b) => new Date(safeStr(b.created_at) || 0).getTime() - new Date(safeStr(a.created_at) || 0).getTime())
    .slice(0, 20)
    .map((t) => ({
      id: String(t.id),
      createdIso: new Date(safeStr(t.created_at) || now.toISOString()).toISOString(),
      amountCents: Math.round(safeNum(t.amount) * 100),
      refundedCents: 0,
      currency: safeStr(t.currency) || currency,
      email: t.customer?.email ?? null,
      name: t.customer?.name ?? null,
      receiptUrl: null,
    }));

  return {
    ok: true,
    provider: "flutterwave",
    providerLabel: "Flutterwave",
    range,
    startIso: start.toISOString(),
    endIso: now.toISOString(),
    currency: currency.toLowerCase(),
    totals: { chargeCount: successful.length, grossCents, refundedCents, netCents: grossCents - refundedCents },
    daily: dailyRows,
    recent,
    note: txs.length >= 200 ? "Limited to the most recent pages of transactions in the selected range." : undefined,
  };
}

async function fetchMollieReport(creds: { apiKey: string }, range: SalesRangeKey): Promise<SalesReportPayload> {
  const now = new Date();
  const start = startForRange(range, now);

  type MolliePayment = {
    id: string;
    status: string;
    createdAt: string;
    amount: { value: string; currency: string };
    amountRefunded?: { value: string; currency: string };
    billingEmail?: string | null;
    consumerName?: string | null;
    _links?: { next?: { href?: string } };
  };

  type MollieList = { _embedded?: { payments?: MolliePayment[] }; _links?: { next?: { href?: string } } };

  const payments: MolliePayment[] = [];
  let nextUrl: string | null = `https://api.mollie.com/v2/payments?limit=250`;
  const cap = 1500;

  while (nextUrl && payments.length < cap) {
    const body = await jsonFetch<MollieList>(nextUrl, {
      headers: { Authorization: `Bearer ${creds.apiKey}` },
      cache: "no-store",
    });

    const items = Array.isArray(body?._embedded?.payments) ? body._embedded!.payments! : [];
    for (const p of items) {
      const created = new Date(safeStr(p.createdAt) || 0);
      if (created.getTime() && created < start) {
        nextUrl = null;
        break;
      }
      payments.push(p);
    }

    const nextHref = safeStr(body?._links?.next?.href);
    nextUrl = nextHref ? nextHref : null;

    if (items.length === 0) break;
  }

  const paid = payments.filter((p) => {
    const st = safeStr(p.status).toLowerCase();
    return st === "paid" || st === "authorized";
  });

  const currency = safeStr(paid.find((p) => p.amount?.currency)?.amount?.currency) || "EUR";

  let grossCents = 0;
  let refundedCents = 0;
  const daily: Record<string, { grossCents: number; refundedCents: number; count: number }> = {};

  for (const p of paid) {
    const ccy = safeStr(p.amount?.currency) || currency;
    const amount = toCentsFromDecimalString(safeStr(p.amount?.value), ccy);
    const refunded = p.amountRefunded ? toCentsFromDecimalString(safeStr(p.amountRefunded.value), ccy) : 0;

    grossCents += amount;
    refundedCents += refunded;

    const createdMs = new Date(safeStr(p.createdAt) || now.toISOString()).getTime();
    const day = dayKeyUtc(new Date(createdMs || now.getTime()));
    daily[day] = daily[day] ?? { grossCents: 0, refundedCents: 0, count: 0 };
    daily[day].grossCents += amount;
    daily[day].refundedCents += refunded;
    daily[day].count += 1;
  }

  const dailyRows = Object.entries(daily)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, v]) => ({ day, count: v.count, grossCents: v.grossCents, refundedCents: v.refundedCents, netCents: v.grossCents - v.refundedCents }));

  const recent = paid
    .slice()
    .sort((a, b) => new Date(safeStr(b.createdAt) || 0).getTime() - new Date(safeStr(a.createdAt) || 0).getTime())
    .slice(0, 20)
    .map((p) => {
      const ccy = safeStr(p.amount?.currency) || currency;
      const amount = toCentsFromDecimalString(safeStr(p.amount?.value), ccy);
      const refunded = p.amountRefunded ? toCentsFromDecimalString(safeStr(p.amountRefunded.value), ccy) : 0;
      return {
        id: safeStr(p.id) || "payment",
        createdIso: new Date(safeStr(p.createdAt) || now.toISOString()).toISOString(),
        amountCents: amount,
        refundedCents: refunded,
        currency: ccy,
        email: (p as any).billingEmail ?? null,
        name: (p as any).consumerName ?? null,
        receiptUrl: null,
      };
    });

  return {
    ok: true,
    provider: "mollie",
    providerLabel: "Mollie",
    range,
    startIso: start.toISOString(),
    endIso: now.toISOString(),
    currency: currency.toLowerCase(),
    totals: { chargeCount: paid.length, grossCents, refundedCents, netCents: grossCents - refundedCents },
    daily: dailyRows,
    recent,
    note: payments.length >= cap ? "Limited to the most recent 1,500 payments." : undefined,
  };
}

async function fetchMercadoPagoReport(creds: { accessToken: string }, range: SalesRangeKey): Promise<SalesReportPayload> {
  const now = new Date();
  const start = startForRange(range, now);

  const begin_date = start.toISOString();
  const end_date = now.toISOString();

  type MpPayment = {
    id: number;
    status: string;
    date_created: string;
    transaction_amount: number;
    currency_id: string;
    transaction_amount_refunded?: number;
    payer?: { email?: string | null; first_name?: string | null; last_name?: string | null };
  };

  type MpSearchRes = { results?: MpPayment[]; paging?: { total?: number; offset?: number; limit?: number } };

  const payments: MpPayment[] = [];
  const limit = 50;
  const cap = 1000;

  for (let offset = 0; offset < cap; offset += limit) {
    const url = `https://api.mercadopago.com/v1/payments/search?range=date_created&begin_date=${encodeURIComponent(begin_date)}&end_date=${encodeURIComponent(end_date)}&limit=${limit}&offset=${offset}`;
    const body = await jsonFetch<MpSearchRes>(url, {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
      cache: "no-store",
    });
    const items = Array.isArray(body?.results) ? body.results : [];
    payments.push(...items);
    if (items.length < limit) break;
  }

  const approved = payments.filter((p) => safeStr(p.status).toLowerCase() === "approved");
  const currency = safeStr(approved.find((p) => p.currency_id)?.currency_id) || "USD";

  let grossCents = 0;
  let refundedCents = 0;
  const daily: Record<string, { grossCents: number; refundedCents: number; count: number }> = {};

  for (const p of approved) {
    const amountCents = Math.round(safeNum(p.transaction_amount) * 100);
    const refunded = Math.round(safeNum((p as any).transaction_amount_refunded) * 100);
    grossCents += amountCents;
    refundedCents += refunded;

    const created = safeStr(p.date_created) || now.toISOString();
    const day = dayKeyUtc(new Date(created));
    daily[day] = daily[day] ?? { grossCents: 0, refundedCents: 0, count: 0 };
    daily[day].grossCents += amountCents;
    daily[day].refundedCents += refunded;
    daily[day].count += 1;
  }

  const dailyRows = Object.entries(daily)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, v]) => ({ day, count: v.count, grossCents: v.grossCents, refundedCents: v.refundedCents, netCents: v.grossCents - v.refundedCents }));

  const recent = approved
    .slice()
    .sort((a, b) => new Date(safeStr(b.date_created) || 0).getTime() - new Date(safeStr(a.date_created) || 0).getTime())
    .slice(0, 20)
    .map((p) => {
      const email = p.payer?.email ?? null;
      const name = [p.payer?.first_name, p.payer?.last_name].filter(Boolean).join(" ") || null;
      return {
        id: String(p.id),
        createdIso: new Date(safeStr(p.date_created) || now.toISOString()).toISOString(),
        amountCents: Math.round(safeNum(p.transaction_amount) * 100),
        refundedCents: Math.round(safeNum((p as any).transaction_amount_refunded) * 100),
        currency: safeStr(p.currency_id) || currency,
        email,
        name,
        receiptUrl: null,
      };
    });

  return {
    ok: true,
    provider: "mercadopago",
    providerLabel: "Mercado Pago",
    range,
    startIso: start.toISOString(),
    endIso: now.toISOString(),
    currency: currency.toLowerCase(),
    totals: { chargeCount: approved.length, grossCents, refundedCents, netCents: grossCents - refundedCents },
    daily: dailyRows,
    recent,
    note: payments.length >= cap ? "Limited to the most recent 1,000 payments." : undefined,
  };
}

async function fetchAuthorizeNetReport(
  creds: { apiLoginId: string; transactionKey: string; environment: "production" | "sandbox" },
  range: SalesRangeKey,
): Promise<SalesReportPayload> {
  const authorizenet = await requireAuthorizeNet();
  const now = new Date();
  const start = startForRange(range, now);

  const env = creds.environment === "sandbox" ? authorizenet.constants.endpoint.sandbox : authorizenet.constants.endpoint.production;

  const merchantAuth = new authorizenet.APIContracts.MerchantAuthenticationType();
  merchantAuth.setName(creds.apiLoginId);
  merchantAuth.setTransactionKey(creds.transactionKey);

  const batchReq = new authorizenet.APIContracts.GetSettledBatchListRequest();
  batchReq.setMerchantAuthentication(merchantAuth);
  batchReq.setIncludeStatistics(true);
  batchReq.setFirstSettlementDate(start.toISOString());
  batchReq.setLastSettlementDate(now.toISOString());

  const batchCtrl = new authorizenet.APIControllers.GetSettledBatchListController(batchReq.getJSON());
  batchCtrl.setEnvironment(env);

  const batchRes = await new Promise<any>((resolve, reject) => {
    batchCtrl.execute(() => {
      const apiResponse = batchCtrl.getResponse();
      const response = new authorizenet.APIContracts.GetSettledBatchListResponse(apiResponse);
      const msg = response?.getMessages?.()?.getMessage?.()?.[0];
      const code = msg?.getCode?.() ? String(msg.getCode()) : null;
      if (code && code !== "I00001") {
        reject(new Error(msg?.getText?.() ? String(msg.getText()) : "Authorize.Net request failed"));
        return;
      }
      resolve(response);
    });
  });

  const batches = batchRes?.getBatchList?.()?.getBatch?.() ?? [];
  const batchIds: string[] = (Array.isArray(batches) ? batches : []).map((b: any) => String(b?.getBatchId?.() ?? "")).filter(Boolean);

  const txs: Array<{ id: string; createdIso: string; amountCents: number; refundedCents: number; currency: string }> = [];

  for (const batchId of batchIds.slice(0, 20)) {
    const txReq = new authorizenet.APIContracts.GetTransactionListRequest();
    txReq.setMerchantAuthentication(merchantAuth);
    txReq.setBatchId(batchId);

    const txCtrl = new authorizenet.APIControllers.GetTransactionListController(txReq.getJSON());
    txCtrl.setEnvironment(env);

    const txRes = await new Promise<any>((resolve, reject) => {
      txCtrl.execute(() => {
        const apiResponse = txCtrl.getResponse();
        const response = new authorizenet.APIContracts.GetTransactionListResponse(apiResponse);
        const msg = response?.getMessages?.()?.getMessage?.()?.[0];
        const code = msg?.getCode?.() ? String(msg.getCode()) : null;
        if (code && code !== "I00001") {
          reject(new Error(msg?.getText?.() ? String(msg.getText()) : "Authorize.Net request failed"));
          return;
        }
        resolve(response);
      });
    });

    const list = txRes?.getTransactions?.()?.getTransaction?.() ?? [];
    const rows = Array.isArray(list) ? list : [];

    for (const r of rows) {
      const id = safeStr(r?.getTransId?.() ?? r?.getTransactionId?.() ?? "");
      const submit = safeStr(r?.getSubmitTimeUTC?.() ?? "") || now.toISOString();
      const settleAmt = Number(r?.getSettleAmount?.() ?? 0);
      if (!Number.isFinite(settleAmt)) continue;

      // settleAmount is major units; negative for refunds/voids depending on account.
      const amountCents = Math.round(Math.abs(settleAmt) * 100);
      const refunded = settleAmt < 0 ? amountCents : 0;
      txs.push({ id: id || `tx_${batchId}`, createdIso: new Date(submit).toISOString(), amountCents: refunded ? 0 : amountCents, refundedCents: refunded, currency: "usd" });
    }
  }

  let grossCents = 0;
  let refundedCents = 0;
  const daily: Record<string, { grossCents: number; refundedCents: number; count: number }> = {};

  for (const t of txs) {
    grossCents += t.amountCents;
    refundedCents += t.refundedCents;
    const day = dayKeyUtc(new Date(t.createdIso));
    daily[day] = daily[day] ?? { grossCents: 0, refundedCents: 0, count: 0 };
    if (t.amountCents > 0) {
      daily[day].count += 1;
      daily[day].grossCents += t.amountCents;
    }
    daily[day].refundedCents += t.refundedCents;
  }

  const dailyRows = Object.entries(daily)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, v]) => ({ day, count: v.count, grossCents: v.grossCents, refundedCents: v.refundedCents, netCents: v.grossCents - v.refundedCents }));

  const recent = txs
    .slice()
    .sort((a, b) => new Date(b.createdIso).getTime() - new Date(a.createdIso).getTime())
    .slice(0, 20)
    .map((t) => ({
      id: t.id,
      createdIso: t.createdIso,
      amountCents: t.amountCents,
      refundedCents: t.refundedCents,
      currency: t.currency,
      email: null,
      name: null,
      receiptUrl: null,
    }));

  const chargeCount = txs.filter((t) => t.amountCents > 0).length;

  return {
    ok: true,
    provider: "authorizenet",
    providerLabel: "Authorize.Net",
    range,
    startIso: start.toISOString(),
    endIso: now.toISOString(),
    currency: "usd",
    totals: { chargeCount, grossCents, refundedCents, netCents: grossCents - refundedCents },
    daily: dailyRows,
    recent,
    note: batchIds.length > 20 ? "Limited to the most recent 20 settled batches." : undefined,
  };
}

async function fetchBraintreeReport(
  creds: { merchantId: string; publicKey: string; privateKey: string; environment: "production" | "sandbox" },
  range: SalesRangeKey,
): Promise<SalesReportPayload> {
  const braintree = await requireBraintree();
  const now = new Date();
  const start = startForRange(range, now);

  const gateway = new braintree.BraintreeGateway({
    environment: creds.environment === "sandbox" ? braintree.Environment.Sandbox : braintree.Environment.Production,
    merchantId: creds.merchantId,
    publicKey: creds.publicKey,
    privateKey: creds.privateKey,
  });

  const sales: any[] = [];
  const credits: any[] = [];

  // Collect up to a cap to keep requests bounded.
  const cap = 1200;

  await new Promise<void>((resolve, reject) => {
    gateway.transaction.search(
      (search: any) => {
        search.createdAt().between(start, now);
        search.type().is(braintree.Transaction.Type.Sale);
      },
      (err: any, results: any) => {
        if (err) return reject(err);
        results.each((t: any) => {
          if (sales.length < cap) sales.push(t);
        }, () => resolve());
      },
    );
  });

  await new Promise<void>((resolve, reject) => {
    gateway.transaction.search(
      (search: any) => {
        search.createdAt().between(start, now);
        search.type().is(braintree.Transaction.Type.Credit);
      },
      (err: any, results: any) => {
        if (err) return reject(err);
        results.each((t: any) => {
          if (credits.length < cap) credits.push(t);
        }, () => resolve());
      },
    );
  });

  const currency = safeStr(sales.find((t) => t.currencyIsoCode)?.currencyIsoCode) || safeStr(credits.find((t) => t.currencyIsoCode)?.currencyIsoCode) || "USD";

  let grossCents = 0;
  let refundedCents = 0;
  const daily: Record<string, { grossCents: number; refundedCents: number; count: number }> = {};

  for (const t of sales) {
    const amountCents = toCentsFromDecimalString(safeStr(t.amount), currency);
    grossCents += amountCents;
    const createdIso = new Date(t.createdAt ?? now).toISOString();
    const day = dayKeyUtc(new Date(createdIso));
    daily[day] = daily[day] ?? { grossCents: 0, refundedCents: 0, count: 0 };
    daily[day].grossCents += amountCents;
    daily[day].count += 1;
  }

  for (const t of credits) {
    const amountCents = Math.abs(toCentsFromDecimalString(safeStr(t.amount), currency));
    refundedCents += amountCents;
    const createdIso = new Date(t.createdAt ?? now).toISOString();
    const day = dayKeyUtc(new Date(createdIso));
    daily[day] = daily[day] ?? { grossCents: 0, refundedCents: 0, count: 0 };
    daily[day].refundedCents += amountCents;
  }

  const dailyRows = Object.entries(daily)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, v]) => ({ day, count: v.count, grossCents: v.grossCents, refundedCents: v.refundedCents, netCents: v.grossCents - v.refundedCents }));

  const recent = sales
    .slice()
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
    .slice(0, 20)
    .map((t) => ({
      id: safeStr(t.id) || "transaction",
      createdIso: new Date(t.createdAt ?? now).toISOString(),
      amountCents: toCentsFromDecimalString(safeStr(t.amount), currency),
      refundedCents: 0,
      currency,
      email: t.customer?.email ?? null,
      name: [t.customer?.firstName, t.customer?.lastName].filter(Boolean).join(" ") || null,
      receiptUrl: null,
    }));

  return {
    ok: true,
    provider: "braintree",
    providerLabel: "Braintree",
    range,
    startIso: start.toISOString(),
    endIso: now.toISOString(),
    currency: currency.toLowerCase(),
    totals: { chargeCount: sales.length, grossCents, refundedCents, netCents: grossCents - refundedCents },
    daily: dailyRows,
    recent,
    note: sales.length >= cap || credits.length >= cap ? "Limited to the most recent results." : undefined,
  };
}

export type ConnectCredentialsInput =
  | { provider: "stripe"; secretKey: string }
  | { provider: "authorizenet"; apiLoginId: string; transactionKey: string; environment?: "production" | "sandbox" }
  | { provider: "braintree"; merchantId: string; publicKey: string; privateKey: string; environment?: "production" | "sandbox" }
  | { provider: "razorpay"; keyId: string; keySecret: string }
  | { provider: "paystack"; secretKey: string }
  | { provider: "flutterwave"; secretKey: string }
  | { provider: "mollie"; apiKey: string }
  | { provider: "mercadopago"; accessToken: string };

export async function validateSalesCredentials(input: ConnectCredentialsInput): Promise<{ displayHint?: string } | void> {
  switch (input.provider) {
    case "stripe": {
      // Validation happens in stripe integration setter.
      return { displayHint: maskSecret(input.secretKey) };
    }
    case "razorpay": {
      const auth = Buffer.from(`${input.keyId}:${input.keySecret}`).toString("base64");
      await jsonFetch<any>("https://api.razorpay.com/v1/payments?count=1", { headers: { Authorization: `Basic ${auth}` }, cache: "no-store" });
      return { displayHint: `${maskSecret(input.keyId, 4, 3)} / ${maskSecret(input.keySecret)}` };
    }
    case "paystack": {
      await jsonFetch<any>("https://api.paystack.co/transaction?perPage=1&page=1", { headers: { Authorization: `Bearer ${input.secretKey}` }, cache: "no-store" });
      return { displayHint: maskSecret(input.secretKey) };
    }
    case "flutterwave": {
      await jsonFetch<any>("https://api.flutterwave.com/v3/transactions?status=successful&page=1", { headers: { Authorization: `Bearer ${input.secretKey}` }, cache: "no-store" });
      return { displayHint: maskSecret(input.secretKey) };
    }
    case "mollie": {
      await jsonFetch<any>("https://api.mollie.com/v2/payments?limit=1", { headers: { Authorization: `Bearer ${input.apiKey}` }, cache: "no-store" });
      return { displayHint: maskSecret(input.apiKey) };
    }
    case "mercadopago": {
      await jsonFetch<any>("https://api.mercadopago.com/v1/payments/search?limit=1", { headers: { Authorization: `Bearer ${input.accessToken}` }, cache: "no-store" });
      return { displayHint: maskSecret(input.accessToken) };
    }
    case "authorizenet": {
      const authorizenet = await requireAuthorizeNet();
      const env = (input.environment ?? "production") === "sandbox" ? authorizenet.constants.endpoint.sandbox : authorizenet.constants.endpoint.production;
      const merchantAuth = new authorizenet.APIContracts.MerchantAuthenticationType();
      merchantAuth.setName(input.apiLoginId);
      merchantAuth.setTransactionKey(input.transactionKey);
      const req = new authorizenet.APIContracts.GetMerchantDetailsRequest();
      req.setMerchantAuthentication(merchantAuth);
      const ctrl = new authorizenet.APIControllers.GetMerchantDetailsController(req.getJSON());
      ctrl.setEnvironment(env);
      await new Promise<void>((resolve, reject) => {
        ctrl.execute(() => {
          const apiResponse = ctrl.getResponse();
          const res = new authorizenet.APIContracts.GetMerchantDetailsResponse(apiResponse);
          const msg = res?.getMessages?.()?.getMessage?.()?.[0];
          const code = msg?.getCode?.() ? String(msg.getCode()) : null;
          if (code && code !== "I00001") return reject(new Error(msg?.getText?.() ? String(msg.getText()) : "Authorize.Net auth failed"));
          resolve();
        });
      });
      return { displayHint: `${maskSecret(input.apiLoginId, 4, 3)} / ${maskSecret(input.transactionKey)}` };
    }
    case "braintree": {
      const braintree = await requireBraintree();
      const gateway = new braintree.BraintreeGateway({
        environment: (input.environment ?? "production") === "sandbox" ? braintree.Environment.Sandbox : braintree.Environment.Production,
        merchantId: input.merchantId,
        publicKey: input.publicKey,
        privateKey: input.privateKey,
      });
      await new Promise<void>((resolve, reject) => {
        gateway.merchantAccount.find(input.merchantId, (err: any) => {
          if (err) return reject(err);
          resolve();
        });
      });
      return { displayHint: `${maskSecret(input.merchantId, 4, 3)} / ${maskSecret(input.publicKey, 4, 3)}` };
    }
    default:
      return;
  }
}

export async function getSalesReportForOwner(ownerId: string, range: SalesRangeKey): Promise<SalesReportPayload> {
  const status = await getSalesReportingStatus(ownerId);

  const active = status.activeProvider ?? (status.providers.stripe.configured ? "stripe" : null);
  if (!active) {
    return { ok: false, error: "No sales provider connected" };
  }

  try {
    switch (active) {
      case "stripe":
        return await fetchStripeReport(ownerId, range);
      case "razorpay": {
        const creds = await getProviderCredentials<{ keyId: string; keySecret: string }>(ownerId, "razorpay");
        if (!creds?.keyId || !creds?.keySecret) return { ok: false, error: "Razorpay is not connected" };
        return await fetchRazorpayReport(creds, range);
      }
      case "paystack": {
        const creds = await getProviderCredentials<{ secretKey: string }>(ownerId, "paystack");
        if (!creds?.secretKey) return { ok: false, error: "Paystack is not connected" };
        return await fetchPaystackReport(creds, range);
      }
      case "flutterwave": {
        const creds = await getProviderCredentials<{ secretKey: string }>(ownerId, "flutterwave");
        if (!creds?.secretKey) return { ok: false, error: "Flutterwave is not connected" };
        return await fetchFlutterwaveReport(creds, range);
      }
      case "mollie": {
        const creds = await getProviderCredentials<{ apiKey: string }>(ownerId, "mollie");
        if (!creds?.apiKey) return { ok: false, error: "Mollie is not connected" };
        return await fetchMollieReport(creds, range);
      }
      case "mercadopago": {
        const creds = await getProviderCredentials<{ accessToken: string }>(ownerId, "mercadopago");
        if (!creds?.accessToken) return { ok: false, error: "Mercado Pago is not connected" };
        return await fetchMercadoPagoReport(creds, range);
      }
      case "authorizenet": {
        const creds = await getProviderCredentials<{ apiLoginId: string; transactionKey: string; environment?: "production" | "sandbox" }>(ownerId, "authorizenet");
        if (!creds?.apiLoginId || !creds?.transactionKey) return { ok: false, error: "Authorize.Net is not connected" };
        return await fetchAuthorizeNetReport({ apiLoginId: creds.apiLoginId, transactionKey: creds.transactionKey, environment: creds.environment ?? "production" }, range);
      }
      case "braintree": {
        const creds = await getProviderCredentials<{ merchantId: string; publicKey: string; privateKey: string; environment?: "production" | "sandbox" }>(ownerId, "braintree");
        if (!creds?.merchantId || !creds?.publicKey || !creds?.privateKey) return { ok: false, error: "Braintree is not connected" };
        return await fetchBraintreeReport({ merchantId: creds.merchantId, publicKey: creds.publicKey, privateKey: creds.privateKey, environment: creds.environment ?? "production" }, range);
      }
      default:
        return { ok: false, error: `Unsupported provider: ${providerLabel(active as any)}` };
    }
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String((e as any).message) : "Unable to load sales";
    return { ok: false, error: msg };
  }
}
