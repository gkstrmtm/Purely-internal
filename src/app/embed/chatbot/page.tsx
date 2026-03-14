import ChatbotEmbedClient from "@/app/embed/chatbot/ChatbotEmbedClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ChatbotEmbedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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
