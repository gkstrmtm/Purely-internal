import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { HostedServicePageEditorClient } from "@/components/HostedServicePageEditorClient";

export default async function PortalBlogsPageEditorPage({
  searchParams,
}: {
  searchParams?: Promise<{ pageKey?: string }>;
}) {
  const resolved = (((await searchParams?.catch(() => ({}))) ?? {}) as { pageKey?: string });
  const pageKey = typeof resolved.pageKey === "string" ? resolved.pageKey.trim() : "";

  return (
    <PortalServiceGate slug="blogs">
      <HostedServicePageEditorClient service="BLOGS" serviceLabel="Blogs" backHref="/services/blogs" defaultPageKey={pageKey || "blogs_index"} />
    </PortalServiceGate>
  );
}