"use client";

import { createPortal } from "react-dom";
import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PutBlobResult } from "@vercel/blob";
import { upload as uploadToVercelBlob } from "@vercel/blob/client";

import { AppModal } from "@/components/AppModal";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { InlineSpinner } from "@/components/InlineSpinner";
import { useToast } from "@/components/ToastProvider";
import { PORTAL_VARIANT_HEADER, portalVariantFromPathname } from "@/lib/portalVariant";
import { toPurelyHostedUrl } from "@/lib/publicHostedOrigin";

type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  tag: string;
  createdAt: string;
  shareUrl: string;
  downloadUrl?: string;
  color?: string | null;
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
  openUrl?: string;
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

type AllFoldersRes =
  | { ok: true; folders: Array<{ id: string; parentId: string | null; name: string; tag: string; createdAt: string }> }
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

function inferFolderAccent(color?: string | null, tag?: string | null, name?: string | null) {
  const explicit = String(color || "").toLowerCase();
  if (explicit) return explicit;

  const text = `${String(tag || "")} ${String(name || "")}`.toLowerCase();
  if (text.includes("b2c")) return "pink";
  if (text.includes("b2b")) return "blue";
  return "default";
}

function itemPreviewKind(item: Item): "image" | "video" | "file" {
  if (item.mimeType.startsWith("image/")) return "image";
  if (item.mimeType.startsWith("video/")) return "video";
  return "file";
}

function itemTypeLabel(item: Item) {
  const ext = item.fileName.includes(".") ? item.fileName.split(".").pop() : "";
  if (ext) return String(ext).toUpperCase();
  if (item.mimeType.startsWith("audio/")) return "AUDIO";
  if (item.mimeType.startsWith("video/")) return "VIDEO";
  if (item.mimeType.startsWith("image/")) return "IMAGE";
  return "FILE";
}

export function PortalMediaLibraryClient() {
  const toastNotify = useToast();
  const portalVariant = useMemo(() => {
    if (typeof window === "undefined") return "portal" as const;
    return portalVariantFromPathname(window.location.pathname);
  }, []);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (error) toastNotify.error(error);
  }, [error, toastNotify]);

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
        maxHeight: number;
      }
  >(null);

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);

  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  const [toast, setToast] = useState<null | { text: string; left: number; top: number }>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const [renaming, setRenaming] = useState<null | { kind: "folder" | "item"; id: string; initial: string }>(null);
  const [renameValue, setRenameValue] = useState("");

  const [moving, setMoving] = useState<null | { kind: "folder" | "item"; id: string }>(null);
  const [allFolders, setAllFolders] = useState<Array<{ id: string; parentId: string | null; name: string }>>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [moveDestId, setMoveDestId] = useState<string | null>(null);
  const [moveCreatingName, setMoveCreatingName] = useState("");
  const [moveWorking, setMoveWorking] = useState(false);

  const selectedItem = useMemo(() => {
    if (!selected || selected.kind !== "item") return null;
    return items.find((i) => i.id === selected.id) || null;
  }, [selected, items]);

  useEffect(() => {
    if (!previewOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewOpen]);

  useEffect(() => {
    if (selected?.kind !== "item") setPreviewOpen(false);
  }, [selected?.kind]);

  const load = useCallback(async (nextFolderId: string | null) => {
    const isFirstLoad = !hasLoadedOnceRef.current;
    if (isFirstLoad) setLoading(true);
    else setRefreshing(true);

    setError(null);
    let didLoad = false;

    const url = new URL("/api/portal/media/list", window.location.origin);
    if (nextFolderId) url.searchParams.set("folderId", nextFolderId);

    try {
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ListRes | null;

      if (!res.ok || !json || json.ok !== true) {
        setError(typeof (json as any)?.error === "string" ? (json as any).error : "Failed to load media library");
        return;
      }

      setBreadcrumbs(Array.isArray(json.breadcrumbs) ? json.breadcrumbs : []);
      setFolders(Array.isArray(json.folders) ? json.folders : []);
      setItems(Array.isArray(json.items) ? json.items : []);
      didLoad = true;
    } finally {
      if (didLoad) hasLoadedOnceRef.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(folderId);
  }, [folderId, load]);

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
    setNewFolderOpen(false);
    setCreatingFolder(false);
    await load(folderId);
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || !files.length) return;
    if (uploading) return;
    setUploading(true);
    setError(null);

    try {
      const list = Array.from(files);
      const totalBytes = list.reduce((sum, f) => sum + (typeof f.size === "number" ? f.size : 0), 0);
      const wantsBlobUpload =
        totalBytes > 4 * 1024 * 1024 ||
        list.some((f) => (typeof f.size === "number" ? f.size : 0) > 4 * 1024 * 1024);

      if (wantsBlobUpload) {
        for (const f of list) {
          let blob: PutBlobResult;
          try {
            blob = await uploadToVercelBlob(f.name || "upload.bin", f, {
              access: "public",
              handleUploadUrl: "/api/portal/media/blob-upload",
              headers: { [PORTAL_VARIANT_HEADER]: portalVariant },
            });
          } catch (err) {
            const msg = (err as any)?.message ? String((err as any).message) : "Upload failed";
            throw new Error(msg);
          }

          const finalizeRes = await fetch("/api/portal/media/items/from-blob", {
            method: "POST",
            headers: { "content-type": "application/json", [PORTAL_VARIANT_HEADER]: portalVariant },
            body: JSON.stringify({
              url: blob.url,
              fileName: f.name || blob.pathname || "upload.bin",
              mimeType: f.type || blob.contentType || "application/octet-stream",
              fileSize: Number.isFinite(f.size) ? f.size : 0,
              folderId: folderId || null,
            }),
          });
          const finalizeJson = (await finalizeRes.json().catch(() => null)) as any;
          if (!finalizeRes.ok || !finalizeJson || finalizeJson.ok !== true) {
            throw new Error(typeof finalizeJson?.error === "string" ? finalizeJson.error : "Upload failed");
          }
        }

        setUploading(false);
        await load(folderId);
        return;
      }

      const form = new FormData();
      if (folderId) form.append("folderId", folderId);
      list.forEach((f) => form.append("files", f));

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

  function showToastNear(el: HTMLElement | null, text: string) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.min(window.innerWidth - 220, Math.max(12, r.left));
    const top = Math.min(window.innerHeight - 48, Math.max(12, r.top - 42));
    setToast({ text, left, top });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1400);
  }

  async function copyAbsoluteUrl(urlPath: string, el?: HTMLElement | null) {
    const absolute = urlPath.startsWith("http") ? urlPath : toPurelyHostedUrl(urlPath);
    await copy(absolute);
    showToastNear(el ?? null, "Link copied");
  }

  function triggerDownload(urlPath: string, fileName?: string) {
    const a = document.createElement("a");
    a.href = urlPath.startsWith("http") ? urlPath : toPurelyHostedUrl(urlPath);
    a.download = fileName || "";
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function folderColorClass(color?: string | null, tag?: string | null, name?: string | null) {
    switch (inferFolderAccent(color, tag, name)) {
      case "blue":
        return "bg-(--color-brand-blue)";
      case "green":
        return "bg-emerald-500";
      case "amber":
        return "bg-amber-500";
      case "purple":
        return "bg-violet-500";
      case "pink":
        return "bg-pink-500";
      case "red":
        return "bg-red-500";
      default:
        return "bg-zinc-400";
    }
  }

  async function setFolderColor(folderIdToSet: string, color: string | null) {
    setError(null);
    const res = await fetch(`/api/portal/media/folders/${folderIdToSet}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ color }),
    });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || (json && json.ok === false)) {
      setError(typeof json?.error === "string" ? json.error : "Could not update folder color");
      return;
    }
    await load(folderId);
  }

  function openDotsMenu(e: MouseEvent, kind: "folder" | "item", id: string) {
    e.preventDefault();
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();

    const menuWidth = 224; // w-56
    const VIEWPORT_PAD = 12;
    const GAP = 8;
    const EST_HEIGHT = 320;

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    const left = Math.max(VIEWPORT_PAD, Math.min(viewportW - menuWidth - VIEWPORT_PAD, r.right - menuWidth));

    const spaceBelow = viewportH - r.bottom - GAP - VIEWPORT_PAD;
    const spaceAbove = r.top - GAP - VIEWPORT_PAD;
    const placeDown = spaceBelow >= Math.min(EST_HEIGHT, 260) || spaceBelow >= spaceAbove;

    const available = placeDown ? spaceBelow : spaceAbove;
    const maxHeight = Math.max(160, Math.min(EST_HEIGHT, available));
    const usedHeight = Math.min(EST_HEIGHT, maxHeight);

    const rawTop = placeDown ? r.bottom + GAP : r.top - GAP - usedHeight;
    const top = Math.max(VIEWPORT_PAD, Math.min(viewportH - VIEWPORT_PAD - usedHeight, rawTop));

    setOpenMenu({ kind, id, left, top, maxHeight });
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

  async function ensureAllFoldersLoaded() {
    if (foldersLoading) return;
    setFoldersLoading(true);
    const res = await fetch("/api/portal/media/folders", { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as AllFoldersRes | null;
    if (!res.ok || !json || json.ok !== true) {
      setFoldersLoading(false);
      setError(typeof (json as any)?.error === "string" ? (json as any).error : "Failed to load folders");
      return;
    }
    setAllFolders((json.folders || []).map((f) => ({ id: f.id, parentId: f.parentId, name: f.name })));
    setFoldersLoading(false);
  }

  function openRename(kind: "folder" | "item", id: string, initial: string) {
    setOpenMenu(null);
    setRenaming({ kind, id, initial });
    setRenameValue(initial);
  }

  async function submitRename() {
    if (!renaming) return;
    const next = renameValue.replace(/[\r\n\t\0]/g, " ").replace(/\s+/g, " ").trim();
    if (!next) return;

    setMoveWorking(true);
    setError(null);

    const endpoint =
      renaming.kind === "item" ? `/api/portal/media/items/${renaming.id}` : `/api/portal/media/folders/${renaming.id}`;
    const payload = renaming.kind === "item" ? { fileName: next } : { name: next };

    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || (json && json.ok === false)) {
      setMoveWorking(false);
      setError(typeof json?.error === "string" ? json.error : "Rename failed");
      return;
    }

    setRenaming(null);
    setMoveWorking(false);
    await load(folderId);
  }

  async function openMove(kind: "folder" | "item", id: string) {
    setOpenMenu(null);
    setMoving({ kind, id });
    setMoveDestId(kind === "item" ? folderId : folderId);
    await ensureAllFoldersLoaded();
  }

  function buildFolderOptions() {
    const children = new Map<string | null, Array<{ id: string; parentId: string | null; name: string }>>();
    for (const f of allFolders) {
      const k = f.parentId ?? null;
      const arr = children.get(k) ?? [];
      arr.push(f);
      children.set(k, arr);
    }
    for (const [k, arr] of children) {
      arr.sort((a, b) => a.name.localeCompare(b.name));
      children.set(k, arr);
    }

    const out: Array<{ id: string; name: string; depth: number }> = [];
    const walk = (parentId: string | null, depth: number) => {
      const list = children.get(parentId) ?? [];
      for (const f of list) {
        out.push({ id: f.id, name: f.name, depth });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }

  async function submitMove() {
    if (!moving) return;
    setMoveWorking(true);
    setError(null);

    const endpoint = moving.kind === "item" ? `/api/portal/media/items/${moving.id}` : `/api/portal/media/folders/${moving.id}`;
    const payload = moving.kind === "item" ? { folderId: moveDestId } : { parentId: moveDestId };

    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || (json && json.ok === false)) {
      setMoveWorking(false);
      setError(typeof json?.error === "string" ? json.error : "Move failed");
      return;
    }

    setMoving(null);
    setMoveWorking(false);
    await load(folderId);
  }

  async function createFolderInMove() {
    const name = moveCreatingName.trim();
    if (!name) return;
    if (moveWorking) return;
    setMoveWorking(true);
    setError(null);

    const res = await fetch("/api/portal/media/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parentId: moveDestId, name }),
    });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json?.ok) {
      setMoveWorking(false);
      setError(typeof json?.error === "string" ? json.error : "Could not create folder");
      return;
    }

    setMoveCreatingName("");
    await ensureAllFoldersLoaded();
    setMoveDestId(String(json.folderId));
    setMoveWorking(false);
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
            className="h-10 w-60 max-w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 placeholder:text-zinc-500"
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
            className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-(--color-brand-blue) px-4 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-60"
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-base leading-none">+</span>
            {uploading ? "Uploading…" : "Upload"}
          </button>
          <button
            type="button"
            onClick={() => setNewFolderOpen(true)}
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
          >
            New folder
          </button>
        </div>
      </div>

      {folderId ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setFolderId(null)}
            className="text-xs font-semibold text-(--color-brand-blue) hover:underline"
          >
            All media
          </button>
          {breadcrumbs.map((b) => (
            <div key={b.id} className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">/</span>
              <button
                type="button"
                onClick={() => setFolderId(b.id)}
                className="text-xs font-semibold text-zinc-700 hover:underline"
                title={b.tag}
              >
                {b.name}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4">
        <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Folders</div>
                <div className="mt-1 text-xs text-zinc-500">Each folder gets a tag you can reference later.</div>
              </div>
              <div className="text-xs text-zinc-500">Select any item for preview actions.</div>
            </div>
          </div>

          <div className="p-4">
            {refreshing ? (
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-500">
                <InlineSpinner className="h-4 w-4 animate-spin text-zinc-400" />
                Refreshing…
              </div>
            ) : null}
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
                    <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      {filteredFolders.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            setFolderId(f.id);
                          }}
                          className="flex min-h-40 w-full flex-col rounded-2xl border border-zinc-200 bg-white p-4 text-left transition hover:border-zinc-300 hover:bg-zinc-50"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className={classNames("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", folderColorClass(f.color, f.tag, f.name))}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path
                                    d="M3.75 7.5C3.75 6.25736 4.75736 5.25 6 5.25H10.05C10.4478 5.25 10.8293 5.40767 11.1107 5.68934L12.1716 6.75H18C19.2426 6.75 20.25 7.75736 20.25 9V16.5C20.25 17.7426 19.2426 18.75 18 18.75H6C4.75736 18.75 3.75 17.7426 3.75 16.5V7.5Z"
                                    stroke="white"
                                    strokeWidth="1.8"
                                  />
                                </svg>
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-zinc-900">{f.name}</div>
                                <div className="mt-1 truncate font-mono text-[11px] text-zinc-500">tag: {f.tag}</div>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="shrink-0 rounded-xl px-2 py-1 text-sm font-semibold text-zinc-600 hover:bg-zinc-100"
                              aria-label="Folder actions"
                              onClick={(e) => {
                                e.stopPropagation();
                                openDotsMenu(e, "folder", f.id);
                              }}
                            >
                              ⋯
                            </button>
                          </div>
                          <div className="mt-auto inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">
                            Open folder
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {filteredItems.length ? (
                  <div>
                    <div className="text-xs font-semibold text-zinc-500">Files</div>
                    <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      {filteredItems.map((it) => {
                        const previewKind = itemPreviewKind(it);
                        return (
                          <button
                            key={it.id}
                            type="button"
                            onClick={() => {
                              setSelected({ kind: "item", id: it.id });
                              setPreviewOpen(true);
                            }}
                            className={classNames(
                              "flex min-h-56 w-full flex-col rounded-2xl border p-4 text-left transition hover:border-zinc-300 hover:bg-zinc-50",
                              selected?.kind === "item" && selected.id === it.id ? "border-zinc-900" : "border-zinc-200",
                            )}
                          >
                            <div className="flex w-full items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="line-clamp-2 wrap-break-word text-sm font-semibold leading-5 text-zinc-900">{it.fileName}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                                  <span className="font-mono">tag: {it.tag}</span>
                                  <span>•</span>
                                  <span>{formatBytes(it.fileSize)}</span>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="shrink-0 rounded-xl px-2 py-1 text-sm font-semibold text-zinc-600 hover:bg-zinc-100"
                                aria-label="File actions"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDotsMenu(e, "item", it.id);
                                }}
                              >
                                ⋯
                              </button>
                            </div>
                            <div className="mt-3 flex min-w-0 w-full flex-1 flex-col items-start gap-3">
                              <div className="aspect-square w-full overflow-hidden rounded-2xl bg-zinc-100">
                                {previewKind === "image" && it.previewUrl ? (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img src={it.previewUrl} alt={it.fileName} className="h-full w-full object-cover" />
                                ) : previewKind === "video" && (it.previewUrl || it.openUrl) ? (
                                  <video
                                    src={it.previewUrl || it.openUrl}
                                    className="h-full w-full object-cover"
                                    muted
                                    playsInline
                                    preload="metadata"
                                  />
                                ) : (
                                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-zinc-700">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                      <path
                                        d="M7.5 3.75H13.5L16.5 6.75V20.25H7.5V3.75Z"
                                        stroke="#3f3f46"
                                        strokeWidth="1.8"
                                      />
                                      <path d="M13.5 3.75V6.75H16.5" stroke="#3f3f46" strokeWidth="1.8" />
                                    </svg>
                                    <div className="rounded-full bg-white/80 px-3 py-1 text-[10px] font-semibold tracking-wide text-zinc-700">
                                      {itemTypeLabel(it)}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="mt-auto inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">
                              {previewKind === "video" ? "Preview video" : previewKind === "image" ? "Preview image" : "Open file"}
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

      </div>

      {openMenu && menuTarget && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-90" aria-hidden>
              <div className="absolute inset-0" onMouseDown={() => setOpenMenu(null)} onTouchStart={() => setOpenMenu(null)} />
              <div
                className="fixed z-95 w-56 overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-lg"
                style={{ left: openMenu.left, top: openMenu.top, maxHeight: openMenu.maxHeight }}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                {openMenu.kind === "item" ? (
                  <>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                      onClick={() => {
                        const it = menuTarget as Item;
                        openRename("item", it.id, it.fileName);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                      onClick={() => {
                        const it = menuTarget as Item;
                        void openMove("item", it.id);
                      }}
                    >
                      Add to folder
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                      onClick={(e) => {
                        setOpenMenu(null);
                        void copyAbsoluteUrl((menuTarget as Item).shareUrl, e.currentTarget);
                      }}
                    >
                      Copy link
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                      onClick={() => {
                        const it = menuTarget as Item;
                        setOpenMenu(null);
                        triggerDownload(it.downloadUrl, it.fileName);
                      }}
                    >
                      Download
                    </button>
                    <a
                      className="block w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                      href={(menuTarget as Item).openUrl || (menuTarget as Item).previewUrl || (menuTarget as Item).downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setOpenMenu(null)}
                    >
                      Open in new tab
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
                        const f = menuTarget as Folder;
                        openRename("folder", f.id, f.name);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                      onClick={() => {
                        const f = menuTarget as Folder;
                        void openMove("folder", f.id);
                      }}
                    >
                      Move to folder
                    </button>
                    <div className="px-4 py-2 text-[11px] font-semibold text-zinc-500">Color</div>
                    <div className="flex flex-wrap gap-2 px-4 pb-3">
                      {[
                        { k: null, c: "bg-zinc-400" },
                        { k: "blue", c: "bg-(--color-brand-blue)" },
                        { k: "green", c: "bg-emerald-500" },
                        { k: "amber", c: "bg-amber-500" },
                        { k: "purple", c: "bg-violet-500" },
                        { k: "pink", c: "bg-pink-500" },
                        { k: "red", c: "bg-red-500" },
                      ].map((x) => (
                        <button
                          key={String(x.k)}
                          type="button"
                          className={classNames("h-6 w-6 rounded-xl border border-white", x.c)}
                          onClick={() => {
                            setOpenMenu(null);
                            const f = menuTarget as Folder;
                            void setFolderColor(f.id, x.k);
                          }}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                      onClick={(e) => {
                        setOpenMenu(null);
                        void copyAbsoluteUrl((menuTarget as Folder).shareUrl, e.currentTarget);
                      }}
                    >
                      Copy folder link
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                      onClick={() => {
                        const f = menuTarget as Folder;
                        setOpenMenu(null);
                        triggerDownload(f.downloadUrl || f.shareUrl, `${f.name}.zip`);
                      }}
                    >
                      Download zip
                    </button>
                  </>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}

      {toast && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed z-200 rounded-2xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white shadow-lg"
              style={{ left: toast.left, top: toast.top }}
            >
              {toast.text}
            </div>,
            document.body,
          )
        : null}

      {renaming && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-100 flex items-end justify-center px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center">
              <div className="absolute inset-0 bg-black/40" onMouseDown={() => setRenaming(null)} />
              <div className="relative max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] w-full max-w-md overflow-auto rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl">
                <div className="text-sm font-semibold text-zinc-900">Rename</div>
                <div className="mt-1 text-xs text-zinc-500">Update the display name.</div>

                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitRename();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  className="mt-4 h-10 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 placeholder:text-zinc-500"
                />

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="h-10 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                    onClick={() => setRenaming(null)}
                    disabled={moveWorking}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-2xl bg-brand-ink px-4 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                    onClick={() => void submitRename()}
                    disabled={moveWorking || !renameValue.trim()}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {moving && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-100 flex items-end justify-center px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center">
              <div className="absolute inset-0 bg-black/40" onMouseDown={() => setMoving(null)} />
              <div className="relative max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] w-full max-w-lg overflow-auto rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl">
                <div className="text-sm font-semibold text-zinc-900">
                  {moving.kind === "item" ? "Add to folder" : "Move folder"}
                </div>
                <div className="mt-1 text-xs text-zinc-500">Pick a destination, or create a new folder.</div>

                <div className="mt-4">
                  <label className="text-xs font-semibold text-zinc-600">Destination</label>
                  <PortalListboxDropdown
                    value={moveDestId ?? ""}
                    onChange={(v) => setMoveDestId(v ? v : null)}
                    disabled={foldersLoading || moveWorking}
                    options={[
                      { value: "", label: "Top level" },
                      ...buildFolderOptions().map((opt) => ({
                        value: opt.id,
                        label: "\u00A0".repeat(opt.depth * 2) + opt.name,
                      })),
                    ]}
                    className="mt-2 w-full"
                    buttonClassName="flex h-10 w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                  />
                </div>

                <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-xs font-semibold text-zinc-700">Create a new folder here</div>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      value={moveCreatingName}
                      onChange={(e) => setMoveCreatingName(e.target.value)}
                      placeholder="Folder name"
                      className="h-10 flex-1 rounded-2xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 placeholder:text-zinc-500"
                      disabled={moveWorking}
                    />
                    <button
                      type="button"
                      onClick={() => void createFolderInMove()}
                      disabled={moveWorking || !moveCreatingName.trim()}
                      className="h-10 rounded-2xl bg-brand-ink px-4 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                    >
                      Create
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="h-10 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                    onClick={() => setMoving(null)}
                    disabled={moveWorking}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-2xl bg-(--color-brand-blue) px-4 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                    onClick={() => void submitMove()}
                    disabled={moveWorking}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {previewOpen && selectedItem && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-110 flex items-end justify-center px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center">
              <div className="absolute inset-0 bg-black/40" onMouseDown={() => setPreviewOpen(false)} />
              <div className="relative max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] w-full max-w-md overflow-auto rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-900">{selectedItem.fileName}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {selectedItem.mimeType} • {formatBytes(selectedItem.fileSize)}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Close preview"
                    className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-base font-semibold text-zinc-500 transition-colors duration-150 hover:bg-zinc-50 hover:text-zinc-800"
                    onClick={() => setPreviewOpen(false)}
                  >
                    ×
                  </button>
                </div>

                {itemPreviewKind(selectedItem) === "image" && selectedItem.previewUrl ? (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={selectedItem.previewUrl} alt={selectedItem.fileName} className="w-full object-cover" />
                  </div>
                ) : itemPreviewKind(selectedItem) === "video" && (selectedItem.previewUrl || selectedItem.openUrl) ? (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-black">
                    <video
                      src={selectedItem.previewUrl || selectedItem.openUrl}
                      className="w-full"
                      controls
                      playsInline
                      preload="metadata"
                    />
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-600">
                    Preview not available for this file type.
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={(e) => void copyAbsoluteUrl(selectedItem.shareUrl, e.currentTarget)}
                    className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    Copy link
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerDownload(selectedItem.downloadUrl, selectedItem.fileName)}
                    className="inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewOpen(false);
                      openRename("item", selectedItem.id, selectedItem.fileName);
                    }}
                    className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewOpen(false);
                      void openMove("item", selectedItem.id);
                    }}
                    className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    Add to folder
                  </button>
                  <a
                    href={selectedItem.openUrl || selectedItem.previewUrl || selectedItem.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                    onClick={() => setPreviewOpen(false)}
                  >
                    Open
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewOpen(false);
                      void removeItemById(selectedItem.id, selectedItem.fileName);
                    }}
                    className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      <AppModal
        open={newFolderOpen}
        onClose={() => {
          if (creatingFolder) return;
          setNewFolderOpen(false);
        }}
        title="Create folder"
      >
        <div className="space-y-3">
          <div className="text-sm text-zinc-600">Create a new folder in {folderId ? "the current folder" : "Media Library"}.</div>
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-zinc-300"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void createFolder();
              }
            }}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setNewFolderOpen(false)}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              disabled={creatingFolder}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void createFolder()}
              disabled={creatingFolder || !newFolderName.trim()}
              className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
            >
              {creatingFolder ? "Creating…" : "Create folder"}
            </button>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
