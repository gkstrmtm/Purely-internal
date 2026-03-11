type StripeErrorResponse = {
  error?: { message?: string; type?: string; code?: string };
};

function toFormBody(params: Record<string, unknown>) {
  const body = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      for (const v of value) body.append(key, String(v));
      continue;
    }

    body.append(key, String(value));
  }

  return body;
}

function stripeKeyHeader(secretKey: string): string {
  const k = String(secretKey || "").trim();
  if (!k) throw new Error("Stripe key is missing");
  return k;
}

async function parseStripeResponse<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => ({}))) as StripeErrorResponse & T;
  if (!res.ok) {
    const msg = json?.error?.message ?? `Stripe error (${res.status})`;
    throw new Error(msg);
  }
  return json as T;
}

export async function stripeGetWithKey<T>(secretKey: string, path: string, params?: Record<string, unknown>): Promise<T> {
  const key = stripeKeyHeader(secretKey);

  const url = new URL(`https://api.stripe.com${path}`);
  if (params) {
    const search = toFormBody(params);
    search.forEach((v, k) => url.searchParams.append(k, v));
  }

  const res = await fetch(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${key}`,
    },
  });

  return parseStripeResponse<T>(res);
}

export async function stripePostWithKey<T>(
  secretKey: string,
  path: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const key = stripeKeyHeader(secretKey);
  const url = new URL(`https://api.stripe.com${path}`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params ? toFormBody(params) : undefined,
  });

  return parseStripeResponse<T>(res);
}
