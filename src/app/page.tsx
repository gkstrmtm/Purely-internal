import type { Metadata } from "next";

import { MarketingLanding } from "@/components/marketing/MarketingLanding";

export const metadata: Metadata = {
  title: "Purely Automation",
  description: "Automation systems for businesses so you can focus on higher leverage tasks.",
};

export default function Home() {
  return <MarketingLanding />;
}
