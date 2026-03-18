export const AppConfig = {
  // Optional. If omitted, the app will call same-origin paths (recommended for Vercel)
  // and rely on `mobile-app/vercel.json` rewrites to proxy to the Portal backend.
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,

  portalVariantHeaderName: "x-portal-variant",
  portalVariant: "portal" as const,

  appHeaderName: "x-pa-app",
  appHeaderValue: "portal" as const,
} as const;
