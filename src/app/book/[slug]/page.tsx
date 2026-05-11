import { PublicBookingClient } from "@/app/book/[slug]/PublicBookingClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PublicBookingClient target={{ kind: "slug", slug }} />;
}
