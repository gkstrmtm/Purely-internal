"use client";

import { useEffect } from "react";

const SCRIPT_SRC = "https://unpkg.com/@elevenlabs/convai-widget-embed";

function ensureWidgetScriptLoaded() {
  if (typeof document === "undefined") return;

  const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
  if (existing) return;

  const script = document.createElement("script");
  script.src = SCRIPT_SRC;
  script.async = true;
  script.type = "text/javascript";
  document.head.appendChild(script);
}

export function ElevenLabsConvaiWidget(props: { agentId: string | null | undefined; className?: string }) {
  useEffect(() => {
    ensureWidgetScriptLoaded();
  }, []);

  const agentId = typeof props.agentId === "string" ? props.agentId.trim() : "";

  if (!agentId) {
    return (
      <div className={props.className ?? ""}>
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
          No ElevenLabs agent ID configured.
        </div>
      </div>
    );
  }

  return (
    <div className={props.className ?? ""}>
      {/* Remount on agentId changes so the widget reliably refreshes. */}
      <elevenlabs-convai key={agentId} agent-id={agentId} />
    </div>
  );
}
