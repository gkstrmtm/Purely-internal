import type { Metadata } from "next";

import { ServicesSuggestedSetupFab } from "@/app/portal/app/services/ServicesSuggestedSetupFab";

export const metadata: Metadata = {
  title: "Services",
};

export default function PortalAppServicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <ServicesSuggestedSetupFab />
    </>
  );
}
