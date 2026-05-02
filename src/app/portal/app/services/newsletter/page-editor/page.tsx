import { HostedServicePageEditorClient } from "@/components/HostedServicePageEditorClient";

export default async function PortalNewsletterPageEditorPage({
  searchParams,
}: {
  searchParams?: Promise<{ pageKey?: string }>;
}) {
  const resolved = (((await searchParams?.catch(() => ({}))) ?? {}) as { pageKey?: string });
  const pageKey = typeof resolved.pageKey === "string" ? resolved.pageKey.trim() : "";

  return <HostedServicePageEditorClient service="NEWSLETTER" serviceLabel="Newsletter" backHref="/services/newsletter" defaultPageKey={pageKey || "newsletter_home"} />;
}