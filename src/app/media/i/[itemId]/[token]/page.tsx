import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PublicMediaItemPage({
  params,
}: {
  params: Promise<{ itemId: string; token: string }>;
}) {
  const { itemId, token } = await params;

  redirect(`/api/public/media/item/${String(itemId)}/${String(token)}`);
}
