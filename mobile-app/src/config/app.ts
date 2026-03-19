const PORTAL_FALLBACK = 'https://purelyautomation.com';

export const portalBaseUrl = (process.env.EXPO_PUBLIC_PORTAL_BASE_URL ?? PORTAL_FALLBACK).replace(/\/$/, '');

// Keep logo host independent from API base URL so auth proxy domains don't break image loading.
const LOGO_BASE = (process.env.EXPO_PUBLIC_PORTAL_LOGO_BASE_URL ?? PORTAL_FALLBACK).replace(/\/$/, '');
export const portalLogoUrl = `${LOGO_BASE}/brand/1.png`;

export const AppConfig = {
  // Optional. If omitted, the app will call same-origin paths (recommended for Vercel)
  // and rely on `mobile-app/vercel.json` rewrites to proxy to the Portal backend.
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,

  portalVariantHeaderName: "x-portal-variant",
  portalVariant: "portal" as const,

  appHeaderName: "x-pa-app",
  appHeaderValue: "portal" as const,
} as const;
