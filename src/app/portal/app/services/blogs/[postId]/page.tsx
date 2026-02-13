import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalBlogPostClient } from "@/app/portal/app/services/blogs/[postId]/PortalBlogPostClient";

export default async function PortalBlogPostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;

  return (
    <PortalServiceGate slug="blogs">
      <PortalBlogPostClient postId={postId} />
    </PortalServiceGate>
  );
}
