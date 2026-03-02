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
  const [confirmPauseOpen, setConfirmPauseOpen] = useState(false);

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
      {confirmPauseOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="text-lg font-bold text-zinc-900">Pause campaign?</div>
            <div className="mt-2 text-sm text-zinc-600">
              Are you sure you want to pause this campaign? This will stop your ad from running.
            </div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmPauseOpen(false)}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmPauseOpen(false);
                  void toggle();
                }}
                className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
              >
                Pause campaign
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isPending ? <div className="text-xs font-semibold text-[color:var(--color-brand-blue)]">Pending approval</div> : null}
      {isRejected ? <div className="text-xs font-semibold text-rose-700">Changes requested</div> : null}

      <button
        type="button"
        onClick={() => {
          if (props.enabled) {
            setConfirmPauseOpen(true);
            return;
          }
          void toggle();
        }}
        disabled={busy || (!isApproved && !props.enabled)}
        className={
          "rounded-2xl px-4 py-2 text-sm font-semibold disabled:opacity-60 " +
          (props.enabled
            ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
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
