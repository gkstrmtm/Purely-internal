"use client";

import { useEffect, useMemo } from "react";

import { ConvaiChatWidget } from "@/components/ConvaiChatWidget";

function cleanString(v: unknown, max = 200) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function asPlacementX(v: string) {
  return v === "left" || v === "center" || v === "right" ? v : "right";
}

function asPlacementY(v: string) {
  return v === "top" || v === "middle" || v === "bottom" ? v : "bottom";
}

function asLauncherStyle(v: string) {
  return v === "dots" || v === "spark" || v === "bubble" ? v : "bubble";
}

export default function ChatbotEmbedClient({
  agentId,
  signedUrlEndpoint,
  placementX,
  placementY,
  primaryColor,
  launcherStyle,
  launcherImageUrl,
}: {
  agentId: string;
  signedUrlEndpoint: string;
  placementX?: string;
  placementY?: string;
  primaryColor?: string;
  launcherStyle?: string;
  launcherImageUrl?: string;
}) {
  const props = useMemo(() => {
    const agent = cleanString(agentId, 120);
    const endpoint = cleanString(signedUrlEndpoint, 200) || "/api/public/elevenlabs/convai/signed-url";
    return {
      agentId: agent,
      signedUrlEndpoint: endpoint.startsWith("/") ? endpoint : "/api/public/elevenlabs/convai/signed-url",
      placementX: asPlacementX(cleanString(placementX, 20)) as any,
      placementY: asPlacementY(cleanString(placementY, 20)) as any,
      primaryColor: cleanString(primaryColor, 24) || undefined,
      launcherStyle: asLauncherStyle(cleanString(launcherStyle, 20)) as any,
      launcherImageUrl: cleanString(launcherImageUrl, 500) || undefined,
    };
  }, [agentId, launcherImageUrl, launcherStyle, placementX, placementY, primaryColor, signedUrlEndpoint]);

  useEffect(() => {
    // Keep the embed transparent and non-scrollable.
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
  }, []);

  if (!props.agentId) {
    return null;
  }

  return (
    <div style={{ width: "100%", height: "100%", background: "transparent" }}>
      <ConvaiChatWidget
        agentId={props.agentId}
        signedUrlEndpoint={props.signedUrlEndpoint}
        placementX={props.placementX}
        placementY={props.placementY}
        positioning="fixed"
        primaryColor={props.primaryColor}
        launcherStyle={props.launcherStyle}
        launcherImageUrl={props.launcherImageUrl}
      />
    </div>
  );
}
