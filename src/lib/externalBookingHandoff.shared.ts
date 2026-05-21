export function buildExternalBookingHandoffPath(slug: string): string {
  return `/api/public/booking/${encodeURIComponent(slug)}/handoff`;
}