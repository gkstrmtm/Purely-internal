"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CampaignToggleButton(props: {
  campaignId: string;
  enabled: boolean;
  reviewStatus?: "PENDING" | "APPROVED" | "REJECTED" | null;
  reviewNotes?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reviewStatus = props.reviewStatus ?? null;
  const isApproved = reviewStatus === "APPROVED";
  const isPending = reviewStatus === "PENDING";
  const isRejected = reviewStatus === "REJECTED";

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

  async function requestReview() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/ads/api/campaigns/${encodeURIComponent(props.campaignId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestReview: true }),
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
      {isPending ? <div className="text-xs font-semibold text-[color:var(--color-brand-blue)]">Pending approval</div> : null}
      {isRejected ? <div className="text-xs font-semibold text-rose-700">Changes requested</div> : null}

      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy || (!isApproved && !props.enabled)}
        className={
          "rounded-2xl px-4 py-2 text-sm font-semibold disabled:opacity-60 " +
          (props.enabled
            ? "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            : "bg-[color:var(--color-brand-blue)] text-white hover:opacity-95")
        }
        title={!isApproved && !props.enabled ? "This campaign will go live after manager approval." : undefined}
      >
        {busy ? "Saving…" : props.enabled ? "Pause" : "Enable"}
      </button>

      {isRejected ? (
        <button
          type="button"
          onClick={() => void requestReview()}
          disabled={busy}
          className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
        >
          Request review
        </button>
      ) : null}

      {isRejected && props.reviewNotes ? <div className="max-w-xs text-right text-xs text-rose-700">{props.reviewNotes}</div> : null}
      {error ? <div className="text-xs font-semibold text-red-600">{error}</div> : null}
    </div>
  );
}
