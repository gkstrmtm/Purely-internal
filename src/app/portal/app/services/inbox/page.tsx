import { PortalServiceGate } from "@/app/portal/app/services/PortalServiceGate";
import { PortalInboxClient } from "@/app/portal/app/services/inbox/PortalInboxClient";
import { redirect } from "next/navigation";

export default async function PortalInboxServicePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(resolvedSearchParams ?? {})) {
    if (typeof v === "string") p.append(k, v);
    else if (Array.isArray(v)) for (const item of v) if (typeof item === "string") p.append(k, item);
  }
  const qs = p.toString();
  redirect(`/portal/app/services/inbox/email${qs ? `?${qs}` : ""}`);

  return (
    <PortalServiceGate slug="inbox">
      <PortalInboxClient />
    </PortalServiceGate>
  );
}
