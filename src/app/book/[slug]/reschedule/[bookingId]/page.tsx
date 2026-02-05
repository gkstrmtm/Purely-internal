import { PublicRescheduleClient } from "./PublicRescheduleClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ slug: string; bookingId: string }>;
  searchParams?: Promise<{ t?: string }>;
};

export default async function PublicReschedulePage(props: PageProps) {
  const { slug, bookingId } = await props.params;
  const spUnknown: unknown = (await props.searchParams?.catch(() => ({}))) ?? {};
  const sp = spUnknown && typeof spUnknown === "object" ? (spUnknown as Record<string, unknown>) : {};
  const t = typeof sp.t === "string" ? sp.t : "";

  return <PublicRescheduleClient slug={slug} bookingId={bookingId} token={t} />;
}
