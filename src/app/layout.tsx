import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ToastProvider";
import { AiReceptionistWidget } from "@/components/AiReceptionistWidget";

export const metadata: Metadata = {
  title: "Purely Automation",
  description: "Automation systems for businesses so you can focus on higher leverage tasks.",
  metadataBase: new URL("https://purelyautomation.com"),
  icons: {
    icon: [{ url: "/brand/purelylogo.png", type: "image/png" }],
    shortcut: [{ url: "/brand/purelylogo.png", type: "image/png" }],
    apple: [{ url: "/brand/purelylogo.png", type: "image/png" }],
  },
  openGraph: {
    title: "Purely Automation",
    description: "Automation systems for businesses so you can focus on higher leverage tasks.",
    url: "/",
    siteName: "Purely Automation",
    images: [{ url: "/opengraph-image.svg", width: 1200, height: 630, alt: "Purely Automation" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Purely Automation",
    description: "Automation systems for businesses so you can focus on higher leverage tasks.",
    images: ["/opengraph-image.svg"],
  },
};

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
