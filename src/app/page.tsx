import type { Metadata } from "next";

import { MarketingLanding } from "@/components/marketing/MarketingLanding";

export const metadata: Metadata = {
  title: "Purely Automation",
  description: "Automation powered call ops and booking",
};

export default function Home() {
  return <MarketingLanding />;
}
