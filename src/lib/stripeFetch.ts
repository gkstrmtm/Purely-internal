type StripeErrorResponse = {
  error?: { message?: string; type?: string; code?: string };
};

function stripeKey() {
  return process.env.STRIPE_SECRET_KEY ?? "";
}

export function isStripeConfigured() {
  return stripeKey().length > 0;
}

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

export async function stripeGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const key = stripeKey();
  if (!key) throw new Error("Stripe is not configured");

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

  const json = (await res.json().catch(() => ({}))) as StripeErrorResponse & T;

  if (!res.ok) {
    const msg = json?.error?.message ?? `Stripe error (${res.status})`;
    throw new Error(msg);
  }

  return json as T;
}

export async function stripePost<T>(
  path: string,
  params: Record<string, unknown>,
  opts?: { idempotencyKey?: string },
): Promise<T> {
  const key = stripeKey();
  if (!key) throw new Error("Stripe is not configured");

  const headers: Record<string, string> = {
    authorization: `Bearer ${key}`,
    "content-type": "application/x-www-form-urlencoded",
  };
  const idempotencyKey = String(opts?.idempotencyKey || "").trim();
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;

  const res = await fetch(`https://api.stripe.com${path}`, {
    method: "POST",
    headers,
    body: toFormBody(params).toString(),
  });

  const json = (await res.json().catch(() => ({}))) as StripeErrorResponse & T;

  if (!res.ok) {
    const msg = json?.error?.message ?? `Stripe error (${res.status})`;
    throw new Error(msg);
  }

  return json as T;
}

export async function stripeDelete<T>(path: string): Promise<T> {
  const key = stripeKey();
  if (!key) throw new Error("Stripe is not configured");

  const res = await fetch(`https://api.stripe.com${path}` as string, {
    method: "DELETE",
    headers: {
      authorization: `Bearer ${key}`,
    },
  });

  const json = (await res.json().catch(() => ({}))) as StripeErrorResponse & T;

  if (!res.ok) {
    const msg = json?.error?.message ?? `Stripe error (${res.status})`;
    throw new Error(msg);
  }

  return json as T;
}

export async function getOrCreateStripeCustomerId(
  email: string,
  opts?: {
    ownerId?: string | null | undefined;
  },
) {
  const ownerId = String(opts?.ownerId ?? "").trim();

  // Fast path: look up by email.
  const list = await stripeGet<{ data: Array<{ id: string; metadata?: Record<string, string> | null }> }>(
    "/v1/customers",
    {
      email,
      limit: 1,
    },
  );

  if (list.data?.[0]?.id) {
    const id = list.data[0].id;
    // Backfill stable metadata when available so future lookups can survive email changes.
    if (ownerId) {
      const existingOwner = String(list.data[0].metadata?.pa_owner_id ?? "").trim();
      if (!existingOwner) {
        await stripePost(`/v1/customers/${encodeURIComponent(id)}`, {
          "metadata[pa_owner_id]": ownerId,
          "metadata[pa_primary_email]": String(email || "").trim(),
        }).catch(() => null);
      }
    }
    return id;
  }

  // If the email changed, fall back to Stripe search by stable owner id.
  if (ownerId) {
    const query = `metadata['pa_owner_id']:'${ownerId.replace(/'/g, "\\'")}'`;
    const found = await stripeGet<{ data: Array<{ id: string }> }>("/v1/customers/search", { query, limit: 1 }).catch(
      () => null as any,
    );
    if (found?.data?.[0]?.id) return found.data[0].id;
  }

  const created = await stripePost<{ id: string }>("/v1/customers", {
    email,
    ...(ownerId
      ? {
          "metadata[pa_owner_id]": ownerId,
          "metadata[pa_primary_email]": String(email || "").trim(),
        }
      : null),
  });
  return created.id;
}
