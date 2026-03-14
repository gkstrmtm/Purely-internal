import { notFound } from "next/navigation";

import { resolveCustomDomain } from "@/lib/customDomainResolver";

import ChatbotEmbedClient from "@/app/embed/chatbot/ChatbotEmbedClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function PendingVerification() {
  return (
    <main className="mx-auto w-full max-w-2xl p-8">
      <h1 className="text-2xl font-bold text-zinc-900">Domain pending verification</h1>
      <p className="mt-2 text-sm text-zinc-700">This domain is saved, but not verified yet.</p>
    </main>
  );
}

export default async function CustomDomainChatbotEmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { domain } = await params;
  const host = decodeURIComponent(String(domain || "")).trim().toLowerCase();
  if (!host) notFound();

  const mapping = await resolveCustomDomain(host);
  if (!mapping) notFound();
  if (mapping.status !== "VERIFIED") return <PendingVerification />;

  const sp = await searchParams;
  const get = (k: string) => {
    const v = sp?.[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const agentId = get("agentId") || "";
  const signedUrlEndpoint = get("signedUrlEndpoint") || "/api/public/elevenlabs/convai/signed-url";
  const placementX = get("placementX") || "right";
  const placementY = get("placementY") || "bottom";
  const primaryColor = get("primaryColor") || "";
  const launcherStyle = get("launcherStyle") || "bubble";
  const launcherImageUrl = get("launcherImageUrl") || "";

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ margin: 0, background: "transparent", overflow: "hidden" }}>
        <ChatbotEmbedClient
          agentId={agentId}
          signedUrlEndpoint={signedUrlEndpoint}
          placementX={placementX}
          placementY={placementY}
          primaryColor={primaryColor || undefined}
          launcherStyle={launcherStyle}
          launcherImageUrl={launcherImageUrl || undefined}
        />
      </body>
    </html>
  );
}
