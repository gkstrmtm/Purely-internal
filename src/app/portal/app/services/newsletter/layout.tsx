import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PortalNewsletterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PortalServiceGate slug="newsletter">{children}</PortalServiceGate>;
}
