import { requirePortalUser } from "@/lib/portalAuth";
import { PortalBlogPostClient } from "@/app/portal/app/services/blogs/[postId]/PortalBlogPostClient";

export default async function PortalBlogPostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  await requirePortalUser();

  const { postId } = await params;
  return <PortalBlogPostClient postId={postId} />;
}
