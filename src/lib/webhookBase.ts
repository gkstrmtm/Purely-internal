export function webhookBaseUrlFromRequest(req?: Request): string {
  const explicit = process.env.PUBLIC_WEBHOOK_BASE_URL;
  if (explicit && explicit.startsWith("http")) return explicit.replace(/\/$/, "");

  const nextAuth = process.env.NEXTAUTH_URL;
  if (nextAuth && nextAuth.startsWith("http")) {
    const cleaned = nextAuth.replace(/\/$/, "");
    // Avoid showing placeholder / Vercel domains unless explicitly requested.
    // If someone truly wants a Vercel domain, set PUBLIC_WEBHOOK_BASE_URL.
    if (!cleaned.includes("YOUR-VERCEL-DOMAIN")) {
      try {
        const u = new URL(cleaned);
        if (u.hostname && !u.hostname.endsWith(".vercel.app")) return cleaned;
      } catch {
        // ignore
      }
    }
  }

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
  if (host && !host.endsWith(".vercel.app") && !host.includes("YOUR-VERCEL-DOMAIN")) {
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
