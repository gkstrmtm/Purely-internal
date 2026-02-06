"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Destination = { id: string; label: string; url: string };

type Review = {
  id: string;
  rating: number;
  name: string;
  body: string | null;
  photoUrls: unknown;
  createdAt: string;
};

const MAX_PHOTOS = 25;

export function PublicReviewsClient({
  siteHandle,
  brandPrimary,
  destinations,
  initialReviews,
}: {
  siteHandle: string;
  brandPrimary: string;
  destinations: Destination[];
  initialReviews: Review[];
}) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const photoPreviews = useMemo(() => photos.map((f) => ({ file: f, url: URL.createObjectURL(f) })), [photos]);

  useEffect(() => {
    return () => {
      for (const p of photoPreviews) URL.revokeObjectURL(p.url);
    };
  }, [photoPreviews]);

  async function submit() {
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      const form = new FormData();
      form.append("name", name);
      form.append("rating", String(rating));
      form.append("body", body);
      for (const f of photos.slice(0, MAX_PHOTOS)) form.append("photos", f);

      const res = await fetch(`/api/public/reviews/${siteHandle}/submit`, { method: "POST", body: form });
      const text = await res.text().catch(() => "");
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      const rec = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
      if (!res.ok || !rec?.ok) throw new Error((typeof rec?.error === "string" ? rec.error : null) || `Failed to submit (HTTP ${res.status})`);

      setStatus("Thanks — your review was submitted.");
      setName("");
      setRating(5);
      setBody("");
      setPhotos([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="text-lg font-semibold text-zinc-900">Leave a review</div>
        <div className="mt-1 text-sm text-zinc-600">Share your experience.</div>

        {error ? <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {status ? <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{status}</div> : null}

        <div className="mt-4 grid gap-3">
          <label className="text-xs font-semibold text-zinc-600">Your name</label>
          <input
            className="h-11 rounded-2xl border border-zinc-200 bg-white px-4 text-sm outline-none focus:border-zinc-300"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane"
            disabled={busy}
          />

          <div>
            <div className="text-xs font-semibold text-zinc-600">Rating</div>
            <div className="mt-2 flex items-center gap-2">
              {Array.from({ length: 5 }).map((_, i) => {
                const v = i + 1;
                const on = v <= rating;
                return (
                  <button
                    key={v}
                    type="button"
                    disabled={busy}
                    className={
                      "h-10 w-10 rounded-2xl border border-zinc-200 text-xl transition " +
                      (on ? "bg-zinc-900 text-white" : "bg-white text-zinc-500 hover:bg-zinc-50")
                    }
                    onClick={() => setRating(v)}
                    aria-label={`${v} star`}
                  >
                    ★
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-600">Review</label>
            <textarea
              className="mt-2 min-h-[120px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What did you like?"
              disabled={busy}
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-zinc-600">Photos (optional)</div>
            <input
              type="file"
              multiple
              accept="image/*"
              disabled={busy}
              className="mt-2 block w-full text-sm"
              onChange={(e) => setPhotos(Array.from(e.target.files || []).slice(0, MAX_PHOTOS))}
            />
            {photoPreviews.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {photoPreviews.map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p.url} src={p.url} alt="" className="h-20 w-20 rounded-xl border border-zinc-200 object-cover" />
                ))}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => void submit()}
            className="mt-2 inline-flex h-11 items-center justify-center rounded-2xl px-5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: brandPrimary }}
          >
            {busy ? "Submitting…" : "Submit review"}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {destinations.length ? (
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="text-sm font-semibold text-zinc-900">Other review sites</div>
            <div className="mt-1 text-sm text-zinc-600">You can also leave a review on these platforms.</div>
            <div className="mt-4 grid grid-cols-1 gap-3">
              {destinations.map((d) => (
                <a
                  key={d.id}
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-4 hover:bg-zinc-50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-900">{d.label}</div>
                    <div className="truncate text-xs text-zinc-500">{d.url}</div>
                  </div>
                  <div className="text-sm font-semibold" style={{ color: brandPrimary }}>
                    Open
                  </div>
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-zinc-900">Recent reviews</div>
          <div className="mt-4 space-y-3">
            {initialReviews.length === 0 ? <div className="text-sm text-zinc-600">No reviews yet.</div> : null}
            {initialReviews.slice(0, 30).map((r) => {
              const rr = Math.max(1, Math.min(5, Math.round(Number(r.rating) || 0)));
              const urls = Array.isArray(r.photoUrls) ? (r.photoUrls as string[]) : [];
              return (
                <div key={r.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900">{r.name}</div>
                      <div className="mt-1 text-xs text-zinc-500">{new Date(r.createdAt).toLocaleDateString()}</div>
                    </div>
                    <div className="text-sm text-zinc-900">{"★".repeat(rr)}<span className="text-zinc-300">{"★".repeat(5 - rr)}</span></div>
                  </div>
                  {r.body ? <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{r.body}</div> : null}
                  {urls.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {urls.slice(0, 6).map((u) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={u} src={u} alt="" className="h-20 w-20 rounded-xl border border-zinc-200 object-cover" />
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
