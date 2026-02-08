"use client";

import { createPortal } from "react-dom";
import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";

type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  tag: string;
  createdAt: string;
  shareUrl: string;
};

type Item = {
  id: string;
  folderId: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  tag: string;
  createdAt: string;
  previewUrl?: string;
  downloadUrl: string;
  shareUrl: string;
};

type ListRes =
  | {
      ok: true;
      folder: Folder | null;
      breadcrumbs: Folder[];
      folders: Folder[];
      items: Item[];
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

export function PortalMediaLibraryClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [folderId, setFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Folder[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  const [search, setSearch] = useState<string>("");
  const [selected, setSelected] = useState<{ kind: "folder"; id: string } | { kind: "item"; id: string } | null>(null);

  const [openMenu, setOpenMenu] = useState<
    | null
    | {
        kind: "folder" | "item";
        id: string;
        left: number;
        top: number;
      }
  >(null);

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  const selectedFolder = useMemo(() => {
    if (!selected || selected.kind !== "folder") return null;
    return folders.find((f) => f.id === selected.id) || null;
  }, [selected, folders]);

  const selectedItem = useMemo(() => {
    if (!selected || selected.kind !== "item") return null;
    return items.find((i) => i.id === selected.id) || null;
  }, [selected, items]);

  async function load(nextFolderId: string | null) {
    setLoading(true);
    setError(null);

    const url = new URL("/api/portal/media/list", window.location.origin);
    if (nextFolderId) url.searchParams.set("folderId", nextFolderId);

    const res = await fetch(url.toString(), { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as ListRes | null;

    if (!res.ok || !json || json.ok !== true) {
      setLoading(false);
      setError(typeof (json as any)?.error === "string" ? (json as any).error : "Failed to load media library");
      return;
    }

    setBreadcrumbs(Array.isArray(json.breadcrumbs) ? json.breadcrumbs : []);
    setFolders(Array.isArray(json.folders) ? json.folders : []);
    setItems(Array.isArray(json.items) ? json.items : []);
    setLoading(false);
  }

  useEffect(() => {
    void load(folderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId]);

  const filteredFolders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter((f) => f.name.toLowerCase().includes(q) || f.tag.toLowerCase().includes(q));
  }, [folders, search]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.fileName.toLowerCase().includes(q) || i.tag.toLowerCase().includes(q));
  }, [items, search]);

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    setCreatingFolder(true);
    setError(null);

    const res = await fetch("/api/portal/media/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parentId: folderId, name }),
    });

    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json?.ok) {
      setCreatingFolder(false);
      setError(typeof json?.error === "string" ? json.error : "Could not create folder");
      return;
    }

    setNewFolderName("");
    setCreatingFolder(false);
    await load(folderId);
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || !files.length) return;
    if (uploading) return;
    setUploading(true);
    setError(null);

    try {
      const form = new FormData();
      if (folderId) form.append("folderId", folderId);
      Array.from(files).forEach((f) => form.append("files", f));

      const res = await fetch("/api/portal/media/items", {
        method: "POST",
        body: form,
      });

      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        setUploading(false);
        setError(typeof json?.error === "string" ? json.error : "Upload failed");
        return;
      }

      setUploading(false);
      await load(folderId);
    } catch {
      setUploading(false);
      setError("Upload failed. Please try again.");
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }

  function openDotsMenu(e: MouseEvent, kind: "folder" | "item", id: string) {
    e.preventDefault();
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const left = Math.min(window.innerWidth - 240, Math.max(12, r.left));
    const top = Math.min(window.innerHeight - 240, Math.max(12, r.bottom + 8));
    setOpenMenu({ kind, id, left, top });
  }

  const menuTarget = useMemo(() => {
    if (!openMenu) return null;
    if (openMenu.kind === "item") return items.find((x) => x.id === openMenu.id) || null;
    return folders.find((x) => x.id === openMenu.id) || null;
  }, [openMenu, items, folders]);

  async function removeItemById(id: string, fileName: string) {
    if (!confirm(`Delete "${fileName}"?`)) return;

    const res = await fetch(`/api/portal/media/items/${id}`, { method: "DELETE" });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json?.ok) {
      setError(typeof json?.error === "string" ? json.error : "Delete failed");
      return;
    }

    setSelected(null);
    await load(folderId);
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Media library</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Store files in folders, copy share links, and attach media into SMS and email.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files and tags…"
            className="h-10 w-[240px] max-w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm"
          />
          <input
            ref={uploadRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              void uploadFiles(e.currentTarget.files);
              e.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => uploadRef.current?.click()}
            disabled={uploading}
            className={
              "inline-flex h-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
            }
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => setFolderId(null)}
          className={classNames(
            "rounded-full border px-3 py-1 text-xs font-semibold",
            !folderId ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
          )}
        >
          Root
        </button>
        {breadcrumbs.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setFolderId(b.id)}
            className={
              "rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            }
            title={b.tag}
          >
            {b.name}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white lg:col-span-7">
          <div className="border-b border-zinc-100 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Folders</div>
                <div className="mt-1 text-xs text-zinc-500">Each folder gets a tag you can reference later.</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="New folder name"
                  className="h-9 w-[220px] max-w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void createFolder()}
                  disabled={creatingFolder || !newFolderName.trim()}
                  className="h-9 rounded-2xl bg-brand-ink px-4 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                >
                  Create
                </button>
              </div>
            </div>
          </div>

          <div className="p-4">
            {loading ? (
              <div className="text-sm text-zinc-600">Loading…</div>
            ) : filteredFolders.length === 0 && filteredItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-600">
                No media yet. Create a folder or upload a file.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredFolders.length ? (
                  <div>
                    <div className="text-xs font-semibold text-zinc-500">Folders</div>
                    <div className="mt-2 space-y-1">
                      {filteredFolders.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            setFolderId(f.id);
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-left hover:bg-zinc-50"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-zinc-900">{f.name}</div>
                            <div className="mt-1 truncate font-mono text-[11px] text-zinc-500">tag: {f.tag}</div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <div className="text-xs font-semibold text-zinc-600">Open</div>
                            <button
                              type="button"
                              className="rounded-xl px-2 py-1 text-sm font-semibold text-zinc-600 hover:bg-zinc-100"
                              aria-label="Folder actions"
                              onClick={(e) => openDotsMenu(e, "folder", f.id)}
                            >
                              ⋯
                            </button>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {filteredItems.length ? (
                  <div>
                    <div className="text-xs font-semibold text-zinc-500">Files</div>
                    <div className="mt-2 space-y-1">
                      {filteredItems.map((it) => {
                        const isImg = it.mimeType.startsWith("image/");
                        return (
                          <button
                            key={it.id}
                            type="button"
                            onClick={() => setSelected({ kind: "item", id: it.id })}
                            className={classNames(
                              "flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left hover:bg-zinc-50",
                              selected?.kind === "item" && selected.id === it.id ? "border-zinc-900" : "border-zinc-200",
                            )}
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
                              <div className="text-xs font-semibold text-zinc-600">Preview</div>
                              <button
                                type="button"
                                className="rounded-xl px-2 py-1 text-sm font-semibold text-zinc-600 hover:bg-zinc-100"
                                aria-label="File actions"
                                onClick={(e) => openDotsMenu(e, "item", it.id)}
                              >
                                ⋯
                              </button>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white lg:col-span-5">
          <div className="border-b border-zinc-100 p-4">
            <div className="text-sm font-semibold text-zinc-900">Preview</div>
            <div className="mt-1 text-xs text-zinc-500">Select a file to view actions.</div>
          </div>

          <div className="p-4">
            {selectedItem ? (
              <div>
                <div className="text-base font-semibold text-zinc-900">{selectedItem.fileName}</div>
                <div className="mt-1 text-xs text-zinc-500">{selectedItem.mimeType} • {formatBytes(selectedItem.fileSize)}</div>

                {selectedItem.previewUrl && selectedItem.mimeType.startsWith("image/") ? (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                    <img src={selectedItem.previewUrl} alt={selectedItem.fileName} className="w-full object-cover" />
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-600">
                    Preview not available for this file type.
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void copy(selectedItem.shareUrl)}
                    className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    Copy link
                  </button>
                  <a
                    href={selectedItem.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    Download
                  </a>
                  <button
                    type="button"
                    onClick={() => void removeItemById(selectedItem.id, selectedItem.fileName)}
                    className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : selectedFolder ? (
              <div>
                <div className="text-base font-semibold text-zinc-900">{selectedFolder.name}</div>
                <div className="mt-1 font-mono text-xs text-zinc-500">tag: {selectedFolder.tag}</div>
                <div className="mt-4 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-600">
                  Folder preview. Select a file to see download + share actions.
                </div>
              </div>
            ) : (
              <div className="text-sm text-zinc-600">Select a folder or file.</div>
            )}
          </div>
        </div>
      </div>

      {openMenu && menuTarget && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[90]" aria-hidden>
              <div className="absolute inset-0" onMouseDown={() => setOpenMenu(null)} onTouchStart={() => setOpenMenu(null)} />
              <div
                className="fixed z-[95] w-56 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg"
                style={{ left: openMenu.left, top: openMenu.top }}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                {openMenu.kind === "item" ? (
                  <>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                      onClick={() => {
                        setOpenMenu(null);
                        void copy(window.location.origin + (menuTarget as Item).shareUrl);
                      }}
                    >
                      Copy link
                    </button>
                    <a
                      className="block w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                      href={(menuTarget as Item).downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setOpenMenu(null)}
                    >
                      Download
                    </a>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm font-semibold text-red-700 hover:bg-red-50"
                      onClick={() => {
                        setOpenMenu(null);
                        const it = menuTarget as Item;
                        void removeItemById(it.id, it.fileName);
                      }}
                    >
                      Delete
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                      onClick={() => {
                        setOpenMenu(null);
                        void copy(window.location.origin + (menuTarget as Folder).shareUrl);
                      }}
                    >
                      Copy folder link
                    </button>
                  </>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
