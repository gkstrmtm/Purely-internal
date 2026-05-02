import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { ToastProvider } from "@/components/ToastProvider";
import { AiReceptionistWidget } from "@/components/AiReceptionistWidget";
import { PLATFORM_METADATA, hostnameFromHeader, isPlatformHostname } from "@/lib/customDomainMetadata";

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = hostnameFromHeader(h.get("x-forwarded-host")) || hostnameFromHeader(h.get("host")) || null;

  if (!isPlatformHostname(host) && host) {
    const protocol = host === "localhost" || host === "127.0.0.1" ? "http" : "https";
    return {
      metadataBase: new URL(`${protocol}://${host}`),
      icons: {
        icon: [],
        shortcut: [],
        apple: [],
      },
    };
  }

  return {
    ...PLATFORM_METADATA,
    icons: {
      icon: [{ url: "/brand/purelylogo.png", type: "image/png" }],
      shortcut: [{ url: "/brand/purelylogo.png", type: "image/png" }],
      apple: [{ url: "/brand/purelylogo.png", type: "image/png" }],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="min-h-dvh overflow-x-hidden antialiased"
      >
        <ToastProvider>
          {children}
          <AiReceptionistWidget />
        </ToastProvider>
      </body>
    </html>
  );
}
