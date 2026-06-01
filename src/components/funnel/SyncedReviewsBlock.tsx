"use client";

import { useEffect, useState } from "react";

type SyncedReview = {
  id: string;
  rating: number;
  name: string;
  body: string | null;
  photoUrls: string[];
  businessReply?: string | null;
  businessReplyAt?: string | null;
  createdAt: string;
};

export function SyncedReviewsBlock({
  pageId,
  limit = 6,
  minRating = 4,
  columns = 3,
  showBusinessReply = false,
  includePhotos = false,
  isEditor = false,
}: {
  pageId?: string | null;
  limit?: number;
  minRating?: number;
  columns?: 1 | 2 | 3;
  showBusinessReply?: boolean;
  includePhotos?: boolean;
  isEditor?: boolean;
}) {
  const [reviews, setReviews] = useState<SyncedReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const normalizedPageId = String(pageId || "").trim();
    if (!normalizedPageId) {
      setReviews([]);
      setLoading(false);
      setError(isEditor ? "Save this page once to connect its organic reviews feed." : "Reviews are not available for this page yet.");
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      pageId: normalizedPageId,
      limit: String(Math.max(1, Math.min(12, Number(limit) || 6))),
      minRating: String(Math.max(1, Math.min(5, Number(minRating) || 4))),
      showBusinessReply: showBusinessReply ? "1" : "0",
      includePhotos: includePhotos ? "1" : "0",
    });

    setLoading(true);
    setError(null);

    fetch(`/api/public/funnel-builder/page-reviews?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; reviews?: SyncedReview[] } | null;
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load reviews");
        setReviews(Array.isArray(json.reviews) ? json.reviews : []);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message = err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "Failed to load reviews";
        setReviews([]);
        setError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [includePhotos, isEditor, limit, minRating, pageId, showBusinessReply]);

  const gridClassName = [
    "grid gap-4",
    columns >= 2 ? "md:grid-cols-2" : "",
    columns >= 3 ? "xl:grid-cols-3" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (loading && reviews.length === 0) {
    return (
      <div className={gridClassName}>
        {Array.from({ length: Math.max(1, Math.min(columns, 3)) }).map((_, index) => (
          <div
            key={`synced-reviews-loading-${index}`}
            className="animate-pulse rounded-[28px] border border-zinc-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)]"
          >
            <div className="h-3 w-24 rounded-full bg-zinc-200" />
            <div className="mt-4 h-3 w-full rounded-full bg-zinc-200" />
            <div className="mt-2 h-3 w-5/6 rounded-full bg-zinc-200" />
            <div className="mt-6 h-3 w-28 rounded-full bg-zinc-200" />
          </div>
        ))}
      </div>
    );
  }

  if (error && reviews.length === 0) {
    return <div className="rounded-3xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">{error}</div>;
  }

  if (reviews.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-sm text-zinc-600">
        No matching reviews yet. Lower the minimum rating or collect more published reviews in Reviews Setup.
      </div>
    );
  }

  return (
    <div className={gridClassName}>
      {reviews.map((review) => (
        <article
          key={review.id}
          className="flex h-full flex-col rounded-[28px] border border-zinc-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)]"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-zinc-950">{review.name}</div>
            <div className="text-xs font-semibold text-amber-600">{review.rating}/5</div>
          </div>

          {review.body ? <p className="mt-4 text-sm leading-7 text-zinc-700">{review.body}</p> : null}

          {includePhotos && review.photoUrls.length ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {review.photoUrls.slice(0, 2).map((url, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${review.id}-photo-${index}`}
                  alt={`${review.name} review photo ${index + 1}`}
                  src={url}
                  className="h-28 w-full rounded-2xl border border-zinc-200 object-cover"
                />
              ))}
            </div>
          ) : null}

          <div className="mt-5 border-t border-zinc-100 pt-4 text-xs text-zinc-500">
            {new Date(review.createdAt).toLocaleDateString()}
          </div>

          {showBusinessReply && review.businessReply ? (
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="text-[11px] font-medium text-zinc-500">Business reply</div>
              <div className="mt-2 text-sm leading-6 text-zinc-700">{review.businessReply}</div>
              {review.businessReplyAt ? (
                <div className="mt-2 text-[11px] text-zinc-500">{new Date(review.businessReplyAt).toLocaleDateString()}</div>
              ) : null}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}