import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { PortalBlogPostClient } from "@/app/portal/app/services/blogs/[postId]/PortalBlogPostClient";

export default async function PortalBlogPostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/portal/login?from=/portal/app/services/blogs");

  if (session.user.role !== "CLIENT" && session.user.role !== "ADMIN") {
    redirect("/app");
  }

  const { postId } = await params;
  return <PortalBlogPostClient postId={postId} />;
}
