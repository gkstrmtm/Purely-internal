"use client";

import { upload as uploadToVercelBlob } from "@vercel/blob/client";
import { useEffect, useMemo, useState } from "react";

type TutorialMeta = {
  slug: string;
  label: string;
  kind: "core" | "service";
};

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded" }
  | { status: "error"; message: string };

type OpState =
  | { slug: string | null; status: "idle" }
  | { slug: string; status: "uploading" }
  | { slug: string; status: "saving" }
  | { slug: string; status: "saved" };

export default function PortalTutorialPhotosAdmin() {
  const [tutorials, setTutorials] = useState<TutorialMeta[]>([]);
  const [photos, setPhotos] = useState<Record<string, string[]>>({});
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [opState, setOpState] = useState<OpState>({ slug: null, status: "idle" });
  const [pasteUrl, setPasteUrl] = useState<Record<string, string>>({});

  useEffect(() => {
    let mounted = true;
    setLoadState({ status: "loading" });
    (async () => {
      const res = await fetch("/api/manager/tutorial-photos", { cache: "no-store" }).catch(
        () => null as any,
      );
      if (!mounted) return;
      if (!res?.ok) {
        setLoadState({ status: "error", message: "Could not load tutorial photos." });
        return;
      }
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; tutorials?: TutorialMeta[]; photos?: Record<string, string[]> }
        | null;
      if (!json?.ok || !Array.isArray(json.tutorials)) {
        setLoadState({ status: "error", message: "Unexpected response." });
        return;
      }
      setTutorials(json.tutorials);
      setPhotos(json.photos ?? {});
      setLoadState({ status: "loaded" });
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const viewBaseUrl = useMemo(() => "/portal/tutorials/", []);

  async function attachPhotoUrl(slug: string, url: string, remove?: boolean) {
    setOpState({ slug, status: "saving" });

    const res = await fetch("/api/manager/tutorial-photos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, url, remove: Boolean(remove) }),
    }).catch(() => null as any);

    if (!res?.ok) {
      const msg = await res?.json().catch(() => null as any);
      const error = (msg && typeof msg.error === "string" && msg.error) || "Could not save photo.";
      setOpState({ slug: null, status: "idle" });
      window.alert(error);
      return false;
    }

    setPhotos((prev) => {
      const current = Array.isArray(prev[slug]) ? prev[slug] : [];
      const next = remove ? current.filter((p) => p !== url) : current.includes(url) ? current : [url, ...current];
      return { ...prev, [slug]: next };
    });

    setOpState({ slug, status: "saved" });
    window.setTimeout(() => setOpState({ slug: null, status: "idle" }), 1200);
    return true;
  }

  async function uploadFile(slug: string, file: File) {
    setOpState({ slug, status: "uploading" });

    let blobUrl: string;
    try {
      const blob = await uploadToVercelBlob(file.name || "tutorial.png", file, {
        access: "public",
        handleUploadUrl: "/api/manager/blob-upload",
      });
      blobUrl = blob.url;
    } catch (err) {
      const msg = (err as any)?.message ? String((err as any).message) : "Upload failed";
      setOpState({ slug: null, status: "idle" });
      window.alert(msg);
      return;
    }

    const ok = await attachPhotoUrl(slug, blobUrl, false);
    if (!ok) return;
  }

  if (loadState.status === "loading" || loadState.status === "idle") {
    return (
      <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="text-base font-semibold text-brand-ink">Tutorial photos</div>
        <p className="mt-1 text-sm text-zinc-600">Loading tutorial list…</p>
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div className="mt-8 rounded-3xl border border-red-200 bg-red-50 p-6">
        <div className="text-base font-semibold text-red-900">Tutorial photos</div>
        <p className="mt-1 text-sm text-red-800">{loadState.message}</p>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-brand-ink">Tutorial photos</div>
          <p className="mt-1 text-sm text-zinc-600">
            Upload screenshots that appear on each help &amp; tutorial page.
          </p>
        </div>
        <div className="text-xs text-zinc-500">Max 24 per page.</div>
      </div>

      <div className="mt-4 max-h-[540px] overflow-y-auto rounded-2xl border border-zinc-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Tutorial</th>
              <th className="px-4 py-3">Key</th>
              <th className="px-4 py-3">Photos</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tutorials.map((t) => {
              const list = Array.isArray(photos[t.slug]) ? photos[t.slug] : [];
              const isBusy =
                (opState.status === "uploading" || opState.status === "saving") && opState.slug === t.slug;
              const isSaved = opState.status === "saved" && opState.slug === t.slug;

              return (
                <tr key={t.slug} className="border-t border-zinc-200">
                  <td className="px-4 py-3 align-top text-sm text-zinc-900">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{t.label}</span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-zinc-600">
                        {t.kind === "core" ? "Portal" : "Service"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-xs text-zinc-500">{t.slug}</td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-wrap items-center gap-2">
                      {list.slice(0, 6).map((url) => (
                        <div key={url} className="group relative h-14 w-20 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
                          <a href={url} target="_blank" rel="noreferrer" className="block h-full w-full">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="Tutorial screenshot" className="h-full w-full object-cover" loading="lazy" />
                          </a>
                          <button
                            type="button"
                            className="absolute right-1 top-1 hidden rounded-md bg-white/90 px-1.5 py-1 text-[10px] font-semibold text-zinc-800 shadow-sm hover:bg-white group-hover:block"
                            onClick={() => void attachPhotoUrl(t.slug, url, true)}
                            disabled={isBusy}
                            title="Remove"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      {list.length > 6 ? (
                        <div className="text-xs font-semibold text-zinc-500">+{list.length - 6} more</div>
                      ) : null}
                      {list.length === 0 ? (
                        <div className="text-xs text-zinc-500">No photos yet.</div>
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-brand-ink hover:bg-zinc-50">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={isBusy}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.currentTarget.value = "";
                            if (!f) return;
                            void uploadFile(t.slug, f);
                          }}
                        />
                        {opState.status === "uploading" && opState.slug === t.slug ? "Uploading…" : "Upload photo"}
                      </label>

                      <input
                        className="min-w-60 flex-1 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 outline-none focus:border-(--color-brand-blue)"
                        placeholder="Or paste an image URL"
                        value={pasteUrl[t.slug] ?? ""}
                        onChange={(e) => setPasteUrl((prev) => ({ ...prev, [t.slug]: e.target.value }))}
                        disabled={isBusy}
                      />
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-60"
                        disabled={isBusy}
                        onClick={() => {
                          const url = (pasteUrl[t.slug] ?? "").trim();
                          if (!url) return;
                          void attachPhotoUrl(t.slug, url, false).then((ok) => {
                            if (ok) setPasteUrl((prev) => ({ ...prev, [t.slug]: "" }));
                          });
                        }}
                      >
                        {opState.status === "saving" && opState.slug === t.slug ? "Saving…" : isSaved ? "Saved" : "Add"}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    <a
                      href={`${viewBaseUrl}${t.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                    >
                      View page
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
