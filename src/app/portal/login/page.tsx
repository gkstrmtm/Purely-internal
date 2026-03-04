import { redirect } from "next/navigation";

function safeFrom(raw: unknown) {
  if (typeof raw !== "string") return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  return raw;
}

export default async function PortalLoginRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const from = safeFrom(
    Array.isArray(resolvedSearchParams?.from) ? resolvedSearchParams?.from[0] : resolvedSearchParams?.from,
  );
  const qs = from ? `?from=${encodeURIComponent(from)}` : "";
  redirect(`/login${qs}`);
}
