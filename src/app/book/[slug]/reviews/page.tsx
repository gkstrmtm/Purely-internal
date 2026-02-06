import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Deprecated: reviews are not part of the public booking URL surface.
export default function PublicBookingReviewsPage() {
  notFound();
}
