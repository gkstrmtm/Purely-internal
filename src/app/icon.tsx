import { headers } from "next/headers";
import { ImageResponse } from "next/og";

import { hostnameFromHeader, isPlatformHostname, resolveCustomDomainBranding } from "@/lib/customDomainMetadata";

export const dynamic = "force-dynamic";
export const size = {
  width: 32,
  height: 32,
};
export const contentType = "image/png";

function assetUrlForHost(host: string | null, raw: string | null | undefined) {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (!host || !value.startsWith("/")) return null;
  const protocol = host === "localhost" || host === "127.0.0.1" ? "http" : "https";
  return `${protocol}://${host}${value}`;
}

function initialsFromName(name: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return "PA";
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "PA";
}

function platformIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #2563eb 100%)",
          color: "white",
          fontSize: 18,
          fontWeight: 800,
          borderRadius: 8,
        }}
      >
        PA
      </div>
    ),
    { ...size },
  );
}

export default async function Icon() {
  const h = await headers();
  const host = hostnameFromHeader(h.get("x-forwarded-host")) || hostnameFromHeader(h.get("host")) || null;

  if (!host || isPlatformHostname(host)) {
    return platformIcon();
  }

  const branding = await resolveCustomDomainBranding(host);
  const logoUrl = assetUrlForHost(host, branding.logoUrl);

  if (logoUrl) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "white",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <img src={logoUrl} alt={branding.siteName} width="32" height="32" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      ),
      { ...size },
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
          color: "#1d4ed8",
          fontSize: 16,
          fontWeight: 800,
          borderRadius: 8,
          border: "1px solid rgba(37,99,235,0.18)",
        }}
      >
        {initialsFromName(branding.siteName)}
      </div>
    ),
    { ...size },
  );
}
