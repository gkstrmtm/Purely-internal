import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ToastProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Purely Automation",
  description: "Automation systems for businesses so you can focus on higher leverage tasks.",
  metadataBase: new URL("https://purelyautomation.com"),
  icons: {
    icon: "/icon.svg",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
