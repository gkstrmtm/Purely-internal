"use client";

import { upload as uploadToVercelBlob } from "@vercel/blob/client";
import { useEffect, useState } from "react";

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

export default function PortalTutorialVideosAdmin() {
  const [tutorials, setTutorials] = useState<TutorialMeta[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [opState, setOpState] = useState<OpState>({ slug: null, status: "idle" });

  useEffect(() => {
    let mounted = true;
    setLoadState({ status: "loading" });
    (async () => {
      const res = await fetch("/api/manager/tutorial-videos", { cache: "no-store" }).catch(() => null as any);
      if (!mounted) return;
      if (!res?.ok) {
        setLoadState({ status: "error", message: "Could not load tutorial videos." });
        return;
      }
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; tutorials?: TutorialMeta[]; videos?: Record<string, string> }
        | null;
      if (!json?.ok || !Array.isArray(json.tutorials)) {
        setLoadState({ status: "error", message: "Unexpected response." });
        return;
      }
      setTutorials(json.tutorials);
      setValues(json.videos ?? {});
      setLoadState({ status: "loaded" });
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function persist(slug: string, url: string) {
    setOpState({ slug, status: "saving" });

    const res = await fetch("/api/manager/tutorial-videos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, url }),
    }).catch(() => null as any);

    if (!res?.ok) {
      const msg = await res?.json().catch(() => null as any);
      const error = (msg && typeof msg.error === "string" && msg.error) || "Could not save video URL.";
      setOpState({ slug: null, status: "idle" });
      window.alert(error);
      return false;
    }

    setOpState({ slug, status: "saved" });
    window.setTimeout(() => {
      setOpState({ slug: null, status: "idle" });
    }, 1500);
    return true;
  }

  async function save(slug: string) {
    const url = (values[slug] ?? "").trim();
    await persist(slug, url);
  }

  async function uploadFile(slug: string, file: File) {
    setOpState({ slug, status: "uploading" });

    let blobUrl: string;
    try {
      const blob = await uploadToVercelBlob(file.name || "tutorial-video.mp4", file, {
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

    setValues((prev) => ({ ...prev, [slug]: blobUrl }));
    const ok = await persist(slug, blobUrl);
    if (!ok) return;
  }

  if (loadState.status === "loading" || loadState.status === "idle") {
    return (
      <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="text-base font-semibold text-brand-ink">Tutorial videos</div>
        <p className="mt-1 text-sm text-zinc-600">Loading tutorial list…</p>
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div className="mt-8 rounded-3xl border border-red-200 bg-red-50 p-6">
        <div className="text-base font-semibold text-red-900">Tutorial videos</div>
        <p className="mt-1 text-sm text-red-800">{loadState.message}</p>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-brand-ink">Tutorial videos</div>
          <p className="mt-1 text-sm text-zinc-600">
            Add or update the video URL that appears at the top of each help &amp; tutorial page.
          </p>
        </div>
        <div className="text-xs text-zinc-500">
          Leave a field blank to remove the video.
        </div>
      </div>

      <div className="mt-4 max-h-115 overflow-y-auto rounded-2xl border border-zinc-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Tutorial</th>
              <th className="px-4 py-3">Key</th>
              <th className="px-4 py-3">Video URL</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tutorials.map((t) => {
              const value = values[t.slug] ?? "";
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
                    <input
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-(--color-brand-blue) disabled:opacity-60"
                      placeholder="https://… (YouTube, Loom, etc.)"
                      value={value}
                      disabled={isBusy}
                      onChange={(e) =>
                        setValues((prev) => ({
                          ...prev,
                          [t.slug]: e.target.value,
                        }))
                      }
                    />

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50">
                        <input
                          type="file"
                          accept="video/*"
                          className="hidden"
                          disabled={isBusy}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.currentTarget.value = "";
                            if (!f) return;
                            void uploadFile(t.slug, f);
                          }}
                        />
                        {opState.status === "uploading" && opState.slug === t.slug ? "Uploading…" : "Upload video"}
                      </label>

                      {value ? (
                        <a
                          href={value}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-(--color-brand-blue) hover:underline"
                        >
                          Open URL
                        </a>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        href={`/portal/tutorials/${t.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                      >
                        View page
                      </a>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-60"
                        onClick={() => void save(t.slug)}
                        disabled={isBusy}
                      >
                        {opState.status === "saving" && opState.slug === t.slug ? "Saving…" : isSaved ? "Saved" : "Save"}
                      </button>
                    </div>
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
