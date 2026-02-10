"use client";

import { useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/ToastProvider";

type PublicFolderRes =
  | {
      ok: true;
      folder: {
        id: string;
        name: string;
        parentId: string | null;
        tag: string;
        createdAt: string;
        shareUrl: string;
        downloadUrl: string;
      };
      folders: Array<{
        id: string;
        name: string;
        parentId: string | null;
        tag: string;
        createdAt: string;
        shareUrl: string;
        downloadUrl: string;
      }>;
      items: Array<{
        id: string;
        folderId: string | null;
        fileName: string;
        mimeType: string;
        fileSize: number;
        tag: string;
        createdAt: string;
        openUrl: string;
        downloadUrl: string;
        shareUrl: string;
        previewUrl?: string;
      }>;
    }
  | { ok: false; error?: string };

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function formatBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  let idx = 0;
  let v = n;
  while (v >= 1024 && idx < units.length - 1) {
    v /= 1024;
    idx += 1;
  }
  return `${v.toFixed(v >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export function PublicMediaFolderClient(props: { folderId: string; token: string }) {
  const { folderId, token } = props;

  const toast = useToast();

  const apiJsonUrl = useMemo(
    () => `/api/public/media/folder/${String(folderId)}/${String(token)}?json=1`,
    [folderId, token],
  );
  const zipUrl = useMemo(
    () => `/api/public/media/folder/${String(folderId)}/${String(token)}`,
    [folderId, token],
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PublicFolderRes | null>(null);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setData(null);

    fetch(apiJsonUrl, { cache: "no-store" })
      .then((r) => r.json().catch(() => null).then((j) => ({ r, j })))
      .then(({ r, j }) => {
        if (!alive) return;
        if (!r.ok || !j || j.ok !== true) {
          setError(typeof j?.error === "string" ? j.error : "Folder not found");
          setLoading(false);
          return;
        }
        setData(j as PublicFolderRes);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setError("Failed to load folder");
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [apiJsonUrl]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Loading…</div>
      </div>
    );
  }

  if (error || !data || data.ok !== true) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700">Not found.</div>
      </div>
    );
  }

  const folder = data.folder;
  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <div className="rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="text-xs font-semibold text-zinc-500">Shared folder</div>
        <h1 className="mt-2 break-words text-2xl font-bold text-brand-ink">{folder.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span className="font-mono">tag: {folder.tag}</span>
          <span>•</span>
          <span>{data.items.length} file{data.items.length === 1 ? "" : "s"}</span>
          <span>•</span>
          <span>{data.folders.length} folder{data.folders.length === 1 ? "" : "s"}</span>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <a
            href={zipUrl}
            className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
          >
            Download zip
          </a>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            onClick={() => void copy(window.location.href)}
          >
            Copy folder link
          </button>
        </div>

        {data.folders.length ? (
          <div className="mt-8">
            <div className="text-xs font-semibold text-zinc-500">Folders</div>
            <div className="mt-2 space-y-2">
              {data.folders.map((f) => (
                <a
                  key={f.id}
                  href={f.shareUrl}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-left hover:bg-zinc-50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-900">{f.name}</div>
                    <div className="mt-1 truncate font-mono text-[11px] text-zinc-500">tag: {f.tag}</div>
                  </div>
                  <div className="text-xs font-semibold text-zinc-600">Open</div>
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {data.items.length ? (
          <div className="mt-8">
            <div className="text-xs font-semibold text-zinc-500">Files</div>
            <div className="mt-2 space-y-2">
              {data.items.map((it) => {
                const isImg = it.mimeType.startsWith("image/");
                return (
                  <div
                    key={it.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {isImg && it.previewUrl ? (
                        <img src={it.previewUrl} alt={it.fileName} className="h-10 w-10 rounded-2xl object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 text-[10px] font-semibold text-zinc-700">
                          FILE
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-900">{it.fileName}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                          <span className="font-mono">tag: {it.tag}</span>
                          <span>•</span>
                          <span>{formatBytes(it.fileSize)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <a
                        href={it.openUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                      >
                        Open
                      </a>
                      <a
                        href={it.downloadUrl}
                        className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                      >
                        Download
                      </a>
                      <button
                        type="button"
                        className={classNames(
                          "rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50",
                        )}
                        onClick={() => void copy(window.location.origin + it.shareUrl)}
                      >
                        Copy link
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-600">
            This folder is empty.
          </div>
        )}
      </div>
    </div>
  );
}
