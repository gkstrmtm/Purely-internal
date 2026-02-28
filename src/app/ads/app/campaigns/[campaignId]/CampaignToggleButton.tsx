"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CampaignToggleButton(props: { campaignId: string; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/ads/api/campaigns/${encodeURIComponent(props.campaignId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: !props.enabled }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Update failed"));
      router.refresh();
    } catch (err: any) {
      setError(String(err?.message || "Update failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        className={
          "rounded-2xl px-4 py-2 text-sm font-semibold disabled:opacity-60 " +
          (props.enabled
            ? "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            : "bg-brand-ink text-white hover:opacity-95")
        }
      >
        {busy ? "Saving…" : props.enabled ? "Pause" : "Enable"}
      </button>
      {error ? <div className="text-xs font-semibold text-red-600">{error}</div> : null}
    </div>
  );
}
