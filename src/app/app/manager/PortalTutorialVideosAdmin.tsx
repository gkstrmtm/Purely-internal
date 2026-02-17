"use client";

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

type SaveState =
  | { slug: string | null; status: "idle" }
  | { slug: string; status: "saving" }
  | { slug: string | null; status: "saved" };

export default function PortalTutorialVideosAdmin() {
  const [tutorials, setTutorials] = useState<TutorialMeta[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [saveState, setSaveState] = useState<SaveState>({ slug: null, status: "idle" });

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

  async function save(slug: string) {
    const url = (values[slug] ?? "").trim();
    setSaveState({ slug, status: "saving" });

    const res = await fetch("/api/manager/tutorial-videos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, url }),
    }).catch(() => null as any);

    if (!res?.ok) {
      const msg = await res?.json().catch(() => null as any);
      const error = (msg && typeof msg.error === "string" && msg.error) || "Could not save video URL.";
      setSaveState({ slug: null, status: "idle" });
      window.alert(error);
      return;
    }

    setSaveState({ slug, status: "saved" });
    window.setTimeout(() => {
      setSaveState({ slug: null, status: "idle" });
    }, 1500);
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

      <div className="mt-4 max-h-[460px] overflow-y-auto rounded-2xl border border-zinc-200">
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
              const isSaving = saveState.status === "saving" && saveState.slug === t.slug;
              const isSaved = saveState.status === "saved" && saveState.slug === t.slug;
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
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[color:var(--color-brand-blue)]"
                      placeholder="https://… (YouTube, Loom, etc.)"
                      value={value}
                      onChange={(e) =>
                        setValues((prev) => ({
                          ...prev,
                          [t.slug]: e.target.value,
                        }))
                      }
                    />
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-60"
                      onClick={() => void save(t.slug)}
                      disabled={isSaving}
                    >
                      {isSaving ? "Saving…" : isSaved ? "Saved" : "Save"}
                    </button>
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
