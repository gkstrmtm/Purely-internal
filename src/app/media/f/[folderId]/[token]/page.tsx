import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PublicMediaFolderPage({
  params,
}: {
  params: Promise<{ folderId: string; token: string }>;
}) {
  const { folderId, token } = await params;
  redirect(`/api/public/media/folder/${String(folderId)}/${String(token)}`);
}
