export function webhookBaseUrlFromRequest(req?: Request): string {
  const env = process.env.PUBLIC_WEBHOOK_BASE_URL || process.env.NEXTAUTH_URL;
  if (env && env.startsWith("http")) return env.replace(/\/$/, "");

  // Default for production docs: avoid showing Vercel placeholder domains.
  // Local dev still uses the request host.
  const defaultBase = "https://purelyautomation.com";

  if (!req) return defaultBase;

  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const proto = req.headers.get("x-forwarded-proto") || "http";

  if (host.includes("localhost") || host.includes("127.0.0.1")) {
    return `${proto}://${host}`.replace(/\/$/, "");
  }

  // Prefer the request host if it's already a custom domain.
  // Otherwise fall back to the default purelyautomation.com.
  if (host && !host.endsWith(".vercel.app")) {
    return `${proto}://${host}`.replace(/\/$/, "");
  }

  return defaultBase;
}

export function withHooksPrefix(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `/hooks${p}`;
}

export function webhookUrlFromRequest(req: Request | undefined, path: string): string {
  const base = webhookBaseUrlFromRequest(req);
  return `${base}${withHooksPrefix(path)}`;
}
