export function isVercelCronRequest(req: Request): boolean {
  const header = (req.headers.get("x-vercel-cron") ?? "").trim().toLowerCase();
  if (header === "1" || header === "true" || header === "yes") return true;

  const ua = (req.headers.get("user-agent") ?? "").trim().toLowerCase();
  if (ua.includes("vercel-cron")) return true;

  return false;
}

export function readCronAuthValue(
  req: Request,
  opts: {
    headerNames?: string[];
    queryParamNames?: string[];
    allowBearer?: boolean;
  } = {},
): string | null {
  const headerNames = Array.isArray(opts.headerNames) ? opts.headerNames : [];
  const queryParamNames = Array.isArray(opts.queryParamNames) ? opts.queryParamNames : ["secret"];
  const allowBearer = opts.allowBearer !== false;

  for (const name of headerNames) {
    const v = (req.headers.get(name) ?? "").trim();
    if (v) return v;
  }

  if (allowBearer) {
    const authz = (req.headers.get("authorization") ?? "").trim();
    const lower = authz.toLowerCase();
    if (lower.startsWith("bearer ")) {
      const token = authz.slice(7).trim();
      if (token) return token;
    }
  }

  const url = new URL(req.url);
  for (const key of queryParamNames) {
    const v = (url.searchParams.get(key) ?? "").trim();
    if (v) return v;
  }

  return null;
}
