import { redirect } from "next/navigation";

function safeFrom(raw: unknown) {
  if (typeof raw !== "string") return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  return raw;
}

export default function PortalLoginRedirectPage({
  searchParams,
}: {
  searchParams?: { from?: string | string[] };
}) {
  const from = safeFrom(Array.isArray(searchParams?.from) ? searchParams?.from[0] : searchParams?.from);
  const qs = from ? `?from=${encodeURIComponent(from)}` : "";
  redirect(`/login${qs}`);
}
