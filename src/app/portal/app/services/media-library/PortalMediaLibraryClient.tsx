"use client";

import { createPortal } from "react-dom";
import { type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PutBlobResult } from "@vercel/blob";
import { upload as uploadToVercelBlob } from "@vercel/blob/client";

import { IconCopy, IconExport, IconSearch, IconUpload } from "@/app/portal/PortalIcons";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import LiquidGlassPopupSurface from "@/components/LiquidGlassPopupSurface";
import { useToast } from "@/components/ToastProvider";
import { portalGlassButtonClass } from "@/components/portalGlass";
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

type SelectableEntity = { kind: "folder" | "item"; id: string };

type RenameTarget = SelectableEntity & { initial: string };

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

function entityKey(kind: SelectableEntity["kind"], id: string) {
  return `${kind}:${id}`;
}

function splitFileName(name: string) {
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === name.length - 1) return { stem: name, ext: "" };
  return { stem: name.slice(0, lastDot), ext: name.slice(lastDot) };
}

function FolderGlyph({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <path
        d="M3.75 7.5C3.75 6.25736 4.75736 5.25 6 5.25H10.05C10.4478 5.25 10.8293 5.40767 11.1107 5.68934L12.1716 6.75H18C19.2426 6.75 20.25 7.75736 20.25 9V16.5C20.25 17.7426 19.2426 18.75 18 18.75H6C4.75736 18.75 3.75 17.7426 3.75 16.5V7.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckboxGlyph({ checked }: { checked: boolean }) {
  return (
    <span
      className={classNames(
        "inline-flex h-5 w-5 items-center justify-center rounded-full border transition-colors duration-150",
        checked ? "border-(--color-brand-blue) bg-(--color-brand-blue) text-white" : "border-zinc-300 bg-white text-transparent",
      )}
    >
      <svg width="12" height="12" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <path d="M4.5 10.5L8.25 14.25L15.5 6.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function PortalMediaLibraryClient() {
  const toastNotify = useToast();
  const portalVariant = useMemo(() => {
    if (typeof window === "undefined") return "portal" as const;
    return portalVariantFromPathname(window.location.pathname);
  }, []);
  const variantHeaders = useMemo(() => ({ [PORTAL_VARIANT_HEADER]: portalVariant }), [portalVariant]);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);
  const [previewTitleEditing, setPreviewTitleEditing] = useState(false);
  const [previewTitleValue, setPreviewTitleValue] = useState("");

  useEffect(() => {
    if (error) toastNotify.error(error);
  }, [error, toastNotify]);

  const [folderId, setFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Folder[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  const [search, setSearch] = useState<string>("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

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

  const [renaming, setRenaming] = useState<null | { entries: RenameTarget[] }>(null);
  const [renameValue, setRenameValue] = useState("");

  const [moving, setMoving] = useState<null | { entries: SelectableEntity[] }>(null);
  const [allFolders, setAllFolders] = useState<Array<{ id: string; parentId: string | null; name: string }>>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [moveDestId, setMoveDestId] = useState<string | null>(null);
  const [moveCreatingName, setMoveCreatingName] = useState("");
  const [moveWorking, setMoveWorking] = useState(false);

  const previewItem = useMemo(() => {
    if (!previewItemId) return null;
    return items.find((i) => i.id === previewItemId) || null;
  }, [previewItemId, items]);

  const selectedKeySet = useMemo(() => new Set(selectedKeys), [selectedKeys]);

  useEffect(() => {
    if (!previewOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewOpen]);

  useEffect(() => {
    if (!previewItem) {
      setPreviewOpen(false);
      setPreviewTitleEditing(false);
    }
  }, [previewItem]);

  useEffect(() => {
    if (!previewItem) return;
    setPreviewTitleValue(previewItem.fileName);
  }, [previewItem]);

  const load = useCallback(async (nextFolderId: string | null) => {
    const isFirstLoad = !hasLoadedOnceRef.current;
    if (isFirstLoad) setLoading(true);
    else setRefreshing(true);

    setError(null);
    let didLoad = false;

    const url = new URL("/api/portal/media/list", window.location.origin);
    if (nextFolderId) url.searchParams.set("folderId", nextFolderId);

    try {
      const res = await fetch(url.toString(), { cache: "no-store", headers: variantHeaders });
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
  }, [variantHeaders]);

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

  const selectionEntries = useMemo(
    () => [
      ...filteredFolders.map((folder) => ({ kind: "folder" as const, id: folder.id })),
      ...filteredItems.map((item) => ({ kind: "item" as const, id: item.id })),
    ],
    [filteredFolders, filteredItems],
  );

  const selectedEntities = useMemo(() => {
    const out: SelectableEntity[] = [];
    for (const key of selectedKeys) {
      const [kind, id] = key.split(":");
      if ((kind === "folder" || kind === "item") && id) out.push({ kind, id });
    }
    return out;
  }, [selectedKeys]);

  const selectedFolders = useMemo(() => {
    const ids = new Set(selectedEntities.filter((entry) => entry.kind === "folder").map((entry) => entry.id));
    return folders.filter((folder) => ids.has(folder.id));
  }, [folders, selectedEntities]);

  const selectedItems = useMemo(() => {
    const ids = new Set(selectedEntities.filter((entry) => entry.kind === "item").map((entry) => entry.id));
    return items.filter((item) => ids.has(item.id));
  }, [items, selectedEntities]);

  const selectionCount = selectedKeys.length;

  const menuSelectionEntries = useMemo(() => {
    if (!openMenu) return [] as SelectableEntity[];
    const targetKey = entityKey(openMenu.kind, openMenu.id);
    if (selectedKeySet.has(targetKey) && selectedKeys.length > 1) return selectedEntities;
    return [{ kind: openMenu.kind, id: openMenu.id }];
  }, [openMenu, selectedEntities, selectedKeys.length, selectedKeySet]);

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    setCreatingFolder(true);
    setError(null);

    const res = await fetch("/api/portal/media/folders", {
      method: "POST",
      headers: { "content-type": "application/json", ...variantHeaders },
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
            headers: { "content-type": "application/json", ...variantHeaders },
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
        headers: variantHeaders,
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

  async function copyAbsoluteUrl(urlPath: string) {
    const absolute = urlPath.startsWith("http") ? urlPath : toPurelyHostedUrl(urlPath);
    await copy(absolute);
    toastNotify.success("Link copied.");
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
      headers: { "content-type": "application/json", ...variantHeaders },
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
    const EST_HEIGHT = kind === "folder" ? 356 : 292;

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    const left = Math.max(VIEWPORT_PAD, Math.min(viewportW - menuWidth - VIEWPORT_PAD, r.right - menuWidth));

    const spaceBelow = viewportH - r.bottom - GAP - VIEWPORT_PAD;
    const spaceAbove = r.top - GAP - VIEWPORT_PAD;
    const placeDown = spaceBelow >= Math.min(EST_HEIGHT, 260) || spaceBelow >= spaceAbove;

    const available = placeDown ? spaceBelow : spaceAbove;
    const maxHeight = Math.max(220, Math.min(EST_HEIGHT, available));
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

    const res = await fetch(`/api/portal/media/items/${id}`, { method: "DELETE", headers: variantHeaders });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json?.ok) {
      setError(typeof json?.error === "string" ? json.error : "Delete failed");
      return;
    }

    setSelectedKeys((prev) => prev.filter((key) => key !== entityKey("item", id)));
    if (previewItemId === id) {
      setPreviewOpen(false);
      setPreviewItemId(null);
    }
    await load(folderId);
  }

  async function ensureAllFoldersLoaded() {
    if (foldersLoading) return;
    setFoldersLoading(true);
    const res = await fetch("/api/portal/media/folders", { cache: "no-store", headers: variantHeaders });
    const json = (await res.json().catch(() => null)) as AllFoldersRes | null;
    if (!res.ok || !json || json.ok !== true) {
      setFoldersLoading(false);
      setError(typeof (json as any)?.error === "string" ? (json as any).error : "Failed to load folders");
      return;
    }
    setAllFolders((json.folders || []).map((f) => ({ id: f.id, parentId: f.parentId, name: f.name })));
    setFoldersLoading(false);
  }

  function openRename(entries: RenameTarget[]) {
    setOpenMenu(null);
    setRenaming({ entries });
    setRenameValue(entries[0]?.initial || "");
  }

  async function renameEntity(kind: "folder" | "item", id: string, next: string) {
    const endpoint = kind === "item" ? `/api/portal/media/items/${id}` : `/api/portal/media/folders/${id}`;
    const payload = kind === "item" ? { fileName: next } : { name: next };

    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...variantHeaders },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || (json && json.ok === false)) {
      throw new Error(typeof json?.error === "string" ? json.error : "Rename failed");
    }
  }

  async function submitRename() {
    if (!renaming) return;
    const next = renameValue.replace(/[\r\n\t\0]/g, " ").replace(/\s+/g, " ").trim();
    if (!next) return;

    setMoveWorking(true);
    setError(null);

    try {
      if (renaming.entries.length === 1) {
        const entry = renaming.entries[0];
        await renameEntity(entry.kind, entry.id, next);
      } else {
        await Promise.all(
          renaming.entries.map((entry, index) => {
            const numbered = `${next} ${index + 1}`;
            if (entry.kind === "item") {
              const { ext } = splitFileName(entry.initial);
              return renameEntity("item", entry.id, `${numbered}${ext}`);
            }
            return renameEntity("folder", entry.id, numbered);
          }),
        );
      }

      if (previewItem && renaming.entries.some((entry) => entry.kind === "item" && entry.id === previewItem.id)) {
        setPreviewTitleEditing(false);
      }

      setRenaming(null);
      setMoveWorking(false);
      toastNotify.success(renaming.entries.length > 1 ? "Selected items renamed." : "Name updated.");
      await load(folderId);
    } catch (err) {
      setMoveWorking(false);
      setError((err as Error)?.message || "Rename failed");
    }
  }

  async function savePreviewTitle() {
    if (!previewItem) return;
    const next = previewTitleValue.replace(/[\r\n\t\0]/g, " ").replace(/\s+/g, " ").trim();
    if (!next || next === previewItem.fileName) {
      setPreviewTitleEditing(false);
      setPreviewTitleValue(previewItem.fileName);
      return;
    }

    setMoveWorking(true);
    setError(null);
    try {
      await renameEntity("item", previewItem.id, next);
      setPreviewTitleEditing(false);
      setMoveWorking(false);
      toastNotify.success("Name updated.");
      await load(folderId);
    } catch (err) {
      setMoveWorking(false);
      setError((err as Error)?.message || "Rename failed");
    }
  }

  async function openMove(entries: SelectableEntity[]) {
    setOpenMenu(null);
    setMoving({ entries });
    setMoveDestId(folderId);
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

    try {
      await Promise.all(
        moving.entries.map(async (entry) => {
          const endpoint = entry.kind === "item" ? `/api/portal/media/items/${entry.id}` : `/api/portal/media/folders/${entry.id}`;
          const payload = entry.kind === "item" ? { folderId: moveDestId } : { parentId: moveDestId };

          const res = await fetch(endpoint, {
            method: "PATCH",
            headers: { "content-type": "application/json", ...variantHeaders },
            body: JSON.stringify(payload),
          });
          const json = (await res.json().catch(() => null)) as any;
          if (!res.ok || (json && json.ok === false)) {
            throw new Error(typeof json?.error === "string" ? json.error : "Move failed");
          }
        }),
      );

      setMoving(null);
      setMoveWorking(false);
      toastNotify.success(moving.entries.length > 1 ? "Selected items moved." : "Moved.");
      await load(folderId);
    } catch (err) {
      setMoveWorking(false);
      setError((err as Error)?.message || "Move failed");
    }
  }

  async function createFolderInMove() {
    const name = moveCreatingName.trim();
    if (!name) return;
    if (moveWorking) return;
    setMoveWorking(true);
    setError(null);

    const res = await fetch("/api/portal/media/folders", {
      method: "POST",
      headers: { "content-type": "application/json", ...variantHeaders },
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

  function selectOnly(entity: SelectableEntity, index?: number) {
    setSelectedKeys([entityKey(entity.kind, entity.id)]);
    setSelectMode(true);
    if (typeof index === "number") setLastSelectedIndex(index);
  }

  function clearSelection() {
    setSelectedKeys([]);
    setSelectMode(false);
    setLastSelectedIndex(null);
  }

  function toggleEntitySelection(entity: SelectableEntity, index?: number) {
    const key = entityKey(entity.kind, entity.id);
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((entry) => entry !== key) : [...prev, key]));
    setSelectMode(true);
    if (typeof index === "number") setLastSelectedIndex(index);
  }

  function selectRange(index: number) {
    const start = lastSelectedIndex ?? index;
    const low = Math.min(start, index);
    const high = Math.max(start, index);
    const keys = selectionEntries.slice(low, high + 1).map((entry) => entityKey(entry.kind, entry.id));
    setSelectedKeys((prev) => Array.from(new Set([...prev, ...keys])));
    setSelectMode(true);
    setLastSelectedIndex(index);
  }

  function handleEntitySelect(entity: SelectableEntity, index: number, event?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) {
    if (event?.shiftKey) {
      selectRange(index);
      return;
    }
    if (event?.metaKey || event?.ctrlKey || selectMode) {
      toggleEntitySelection(entity, index);
      return;
    }
    selectOnly(entity, index);
  }

  function beginSelectionFromMenu(entity: SelectableEntity, index: number) {
    if (selectedKeySet.has(entityKey(entity.kind, entity.id))) {
      setSelectMode(true);
      setLastSelectedIndex(index);
      return;
    }
    selectOnly(entity, index);
  }

  async function copySelectionLinks(entries: SelectableEntity[]) {
    const urls = entries
      .map((entry) => {
        if (entry.kind === "folder") return folders.find((folder) => folder.id === entry.id)?.shareUrl ?? null;
        return items.find((item) => item.id === entry.id)?.shareUrl ?? null;
      })
      .filter((value): value is string => Boolean(value))
      .map((urlPath) => (urlPath.startsWith("http") ? urlPath : toPurelyHostedUrl(urlPath)));

    if (!urls.length) return;
    await copy(urls.join("\n"));
    toastNotify.success(urls.length > 1 ? `${urls.length} links copied.` : "Link copied.");
  }

  function downloadSelection(entries: SelectableEntity[]) {
    for (const entry of entries) {
      if (entry.kind === "folder") {
        const folder = folders.find((currentFolder) => currentFolder.id === entry.id);
        if (!folder) continue;
        triggerDownload(folder.downloadUrl || folder.shareUrl, `${folder.name}.zip`);
        continue;
      }
      const item = items.find((currentItem) => currentItem.id === entry.id);
      if (!item) continue;
      triggerDownload(item.downloadUrl, item.fileName);
    }
  }

  function openRenameForSelection(entries: SelectableEntity[]) {
    const targets = entries
      .map((entry) => {
        if (entry.kind === "folder") {
          const folder = folders.find((currentFolder) => currentFolder.id === entry.id);
          if (!folder) return null;
          return { kind: "folder" as const, id: folder.id, initial: folder.name };
        }
        const item = items.find((currentItem) => currentItem.id === entry.id);
        if (!item) return null;
        return { kind: "item" as const, id: item.id, initial: item.fileName };
      })
      .filter((value): value is RenameTarget => Boolean(value));

    if (!targets.length) return;
    openRename(targets);
  }

  return (
    <div className="mx-auto w-full max-w-none">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Media library</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Store files in folders, copy share links, and attach media into SMS and email.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative block h-10 w-72 max-w-full">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
              <IconSearch size={16} />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files and folders"
              className="h-10 w-full rounded-2xl border border-zinc-200 bg-white pl-10 pr-4 text-sm text-zinc-900 placeholder:text-zinc-500"
            />
          </label>
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
            <IconUpload size={16} className="text-white" />
            {uploading ? "Uploading…" : "Upload"}
          </button>
          <button
            type="button"
            onClick={() => setNewFolderOpen(true)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
          >
            <FolderGlyph className="text-zinc-600" />
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

      <div className="-mx-4 mt-4 sm:-mx-6 lg:-mx-8">
        <div className="overflow-hidden border-y border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Folders</div>
                <div className="mt-1 text-xs text-zinc-500">Each folder gets a tag you can reference later.</div>
              </div>
              {selectMode ? <div className="text-xs text-zinc-500">Pick multiple folders and files for bulk actions.</div> : null}
            </div>
            {selectionCount ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-[rgba(29,78,216,0.07)] p-3">
                <div className="mr-2 text-sm font-semibold text-zinc-900">{selectionCount} selected</div>
                <div className="text-xs text-zinc-500">
                  {selectedFolders.length ? `${selectedFolders.length} folder${selectedFolders.length === 1 ? "" : "s"}` : ""}
                  {selectedFolders.length && selectedItems.length ? " • " : ""}
                  {selectedItems.length ? `${selectedItems.length} file${selectedItems.length === 1 ? "" : "s"}` : ""}
                </div>
                <button
                  type="button"
                  onClick={() => openRenameForSelection(selectedEntities)}
                  className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => void openMove(selectedEntities)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  <FolderGlyph className="text-zinc-600" />
                  Move
                </button>
                <button
                  type="button"
                  onClick={() => void copySelectionLinks(selectedEntities)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  <IconCopy size={14} className="text-zinc-600" />
                  Copy links
                </button>
                <button
                  type="button"
                  onClick={() => downloadSelection(selectedEntities)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  <IconExport size={14} className="text-zinc-600" />
                  Download
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-2xl px-3 py-2 text-xs font-semibold text-zinc-500 hover:bg-white/70 hover:text-zinc-800"
                >
                  Clear
                </button>
              </div>
            ) : null}
          </div>

          <div className="p-4">
            {refreshing ? <div className="sr-only" aria-live="polite">Refreshing media library</div> : null}
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
                      {filteredFolders.map((f, index) => {
                        const isSelected = selectedKeySet.has(entityKey("folder", f.id));
                        return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={(event) => {
                            if (selectMode || event.shiftKey || event.metaKey || event.ctrlKey) {
                              handleEntitySelect({ kind: "folder", id: f.id }, index, event);
                              return;
                            }
                            setFolderId(f.id);
                          }}
                          onContextMenu={(event) => {
                            beginSelectionFromMenu({ kind: "folder", id: f.id }, index);
                            openDotsMenu(event, "folder", f.id);
                          }}
                          className={classNames(
                            "relative flex w-full flex-col border bg-white p-3.5 text-left transition hover:border-zinc-300 hover:bg-zinc-50",
                            isSelected ? "border-(--color-brand-blue) bg-[rgba(29,78,216,0.04)]" : "border-zinc-200",
                            selectMode ? "rounded-3xl" : "rounded-2xl",
                          )}
                        >
                          {selectMode ? (
                            <span className="absolute left-3 top-3 z-10">
                              <CheckboxGlyph checked={isSelected} />
                            </span>
                          ) : null}
                          <div className="flex items-start justify-between gap-3">
                            <div className={classNames("flex min-w-0 items-center gap-3", selectMode ? "pl-7" : "") }>
                              <div className={classNames("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", folderColorClass(f.color, f.tag, f.name))}>
                                <FolderGlyph className="text-white" />
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-zinc-900">{f.name}</div>
                                <div className="mt-0.5 truncate font-mono text-[11px] text-zinc-500">tag: {f.tag}</div>
                              </div>
                            </div>
                            <button
                              type="button"
                              className={classNames(portalGlassButtonClass, "shrink-0 rounded-xl px-2 py-1 text-sm font-semibold text-zinc-600 hover:bg-white/80")}
                              aria-label="Folder actions"
                              onClick={(e) => {
                                e.stopPropagation();
                                openDotsMenu(e, "folder", f.id);
                              }}
                            >
                              ⋯
                            </button>
                          </div>
                        </button>
                      );})}
                    </div>
                  </div>
                ) : null}

                {filteredItems.length ? (
                  <div>
                    <div className="text-xs font-semibold text-zinc-500">Files</div>
                    <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      {filteredItems.map((it, itemIndex) => {
                        const previewKind = itemPreviewKind(it);
                        const index = filteredFolders.length + itemIndex;
                        const isSelected = selectedKeySet.has(entityKey("item", it.id));
                        return (
                          <button
                            key={it.id}
                            type="button"
                            onClick={(event) => {
                              if (selectMode || event.shiftKey || event.metaKey || event.ctrlKey) {
                                handleEntitySelect({ kind: "item", id: it.id }, index, event);
                                return;
                              }
                              setPreviewItemId(it.id);
                              setPreviewOpen(true);
                            }}
                            onContextMenu={(event) => {
                              beginSelectionFromMenu({ kind: "item", id: it.id }, index);
                              openDotsMenu(event, "item", it.id);
                            }}
                            className={classNames(
                              "relative flex min-h-56 w-full flex-col rounded-2xl border p-4 text-left transition hover:border-zinc-300 hover:bg-zinc-50",
                              previewItemId === it.id ? "border-zinc-900" : "border-zinc-200",
                              isSelected ? "border-(--color-brand-blue) bg-[rgba(29,78,216,0.04)]" : "",
                            )}
                          >
                            {selectMode ? (
                              <span className="absolute left-4 top-4 z-10">
                                <CheckboxGlyph checked={isSelected} />
                              </span>
                            ) : null}
                            <div className="flex w-full items-start justify-between gap-3">
                              <div className={classNames("min-w-0 flex-1", selectMode ? "pl-7" : "") }>
                                <div title={it.fileName} className="truncate text-sm font-semibold leading-5 text-zinc-900">{it.fileName}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                                  <span className="font-mono">tag: {it.tag}</span>
                                  <span>•</span>
                                  <span>{formatBytes(it.fileSize)}</span>
                                </div>
                              </div>
                              <button
                                type="button"
                                className={classNames(portalGlassButtonClass, "shrink-0 rounded-xl px-2 py-1 text-sm font-semibold text-zinc-600 hover:bg-white/80")}
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
              <LiquidGlassPopupSurface
                className="fixed z-95 w-56 overflow-y-auto p-1.5 shadow-lg"
                style={{ left: openMenu.left, top: openMenu.top, maxHeight: openMenu.maxHeight }}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                {openMenu.kind === "item" ? (
                  <>
                    <button
                      type="button"
                      className="w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-zinc-900 transition-colors duration-150 hover:bg-white/16"
                      onClick={() => {
                        const entryIndex = selectionEntries.findIndex((entry) => entry.kind === "item" && entry.id === openMenu.id);
                        beginSelectionFromMenu({ kind: "item", id: openMenu.id }, entryIndex);
                        setOpenMenu(null);
                      }}
                    >
                      {selectedKeySet.has(entityKey("item", openMenu.id)) ? "Keep selected" : "Select"}
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-zinc-900 transition-colors duration-150 hover:bg-white/16"
                      onClick={() => {
                        openRenameForSelection(menuSelectionEntries);
                      }}
                    >
                      {menuSelectionEntries.length > 1 ? `Rename ${menuSelectionEntries.length} selected` : "Rename"}
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-zinc-900 transition-colors duration-150 hover:bg-white/16"
                      onClick={() => {
                        setOpenMenu(null);
                        void openMove(menuSelectionEntries);
                      }}
                    >
                      Add to folder
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-zinc-900 transition-colors duration-150 hover:bg-white/16"
                      onClick={() => {
                        setOpenMenu(null);
                        void copySelectionLinks(menuSelectionEntries);
                      }}
                    >
                      {menuSelectionEntries.length > 1 ? "Copy links" : "Copy link"}
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-zinc-900 transition-colors duration-150 hover:bg-white/16"
                      onClick={() => {
                        setOpenMenu(null);
                        downloadSelection(menuSelectionEntries);
                      }}
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-red-700 transition-colors duration-150 hover:bg-red-500/10"
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
                      className="w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-zinc-900 transition-colors duration-150 hover:bg-white/16"
                      onClick={() => {
                        const entryIndex = selectionEntries.findIndex((entry) => entry.kind === "folder" && entry.id === openMenu.id);
                        beginSelectionFromMenu({ kind: "folder", id: openMenu.id }, entryIndex);
                        setOpenMenu(null);
                      }}
                    >
                      {selectedKeySet.has(entityKey("folder", openMenu.id)) ? "Keep selected" : "Select"}
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-zinc-900 transition-colors duration-150 hover:bg-white/16"
                      onClick={() => {
                        openRenameForSelection(menuSelectionEntries);
                      }}
                    >
                      {menuSelectionEntries.length > 1 ? `Rename ${menuSelectionEntries.length} selected` : "Rename"}
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-zinc-900 transition-colors duration-150 hover:bg-white/16"
                      onClick={() => {
                        setOpenMenu(null);
                        void openMove(menuSelectionEntries);
                      }}
                    >
                      Move to folder
                    </button>
                    {menuSelectionEntries.length === 1 ? <div className="px-4 py-2 text-[11px] font-semibold text-zinc-500">Color</div> : null}
                    {menuSelectionEntries.length === 1 ? <div className="flex flex-wrap gap-2 px-4 pb-3">
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
                    </div> : null}
                    <button
                      type="button"
                      className="w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-zinc-900 transition-colors duration-150 hover:bg-white/16"
                      onClick={() => {
                        setOpenMenu(null);
                        void copySelectionLinks(menuSelectionEntries);
                      }}
                    >
                      {menuSelectionEntries.length > 1 ? "Copy links" : "Copy folder link"}
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-zinc-900 transition-colors duration-150 hover:bg-white/16"
                      onClick={() => {
                        setOpenMenu(null);
                        downloadSelection(menuSelectionEntries);
                      }}
                    >
                      Download
                    </button>
                  </>
                )}
              </LiquidGlassPopupSurface>
            </div>,
            document.body,
          )
        : null}

      {renaming && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-100 flex items-end justify-center px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center">
              <div className="absolute inset-0 bg-black/40" onMouseDown={() => setRenaming(null)} />
              <LiquidGlassPopupSurface
                className="relative max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] w-full max-w-md overflow-auto rounded-4xl p-5 shadow-xl"
                overlayClassName="border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.76),rgba(255,255,255,0.42))] shadow-[0_24px_64px_rgba(15,23,42,0.16)] backdrop-blur-[24px]"
                showTopGlow={false}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">{renaming.entries.length > 1 ? "Rename selected" : "Rename"}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {renaming.entries.length > 1 ? "Use one base name and the library will number each selected item." : "Update the display name."}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Close rename dialog"
                    className={classNames(portalGlassButtonClass, "shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full text-base font-semibold text-zinc-600 transition-colors duration-150 hover:bg-white/80 hover:text-zinc-900")}
                    onClick={() => setRenaming(null)}
                    disabled={moveWorking}
                  >
                    ×
                  </button>
                </div>

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
                    className="h-10 rounded-full bg-brand-blue/10 px-4 text-sm font-semibold text-(--color-brand-blue) hover:bg-brand-blue/15 disabled:opacity-60"
                    onClick={() => void submitRename()}
                    disabled={moveWorking || !renameValue.trim()}
                  >
                    Save
                  </button>
                </div>
              </LiquidGlassPopupSurface>
            </div>,
            document.body,
          )
        : null}

      {moving && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-100 flex items-end justify-center px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center">
              <div className="absolute inset-0 bg-black/40" onMouseDown={() => setMoving(null)} />
              <LiquidGlassPopupSurface
                className="relative max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] w-full max-w-lg overflow-auto rounded-4xl p-5 shadow-xl"
                overlayClassName="border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.76),rgba(255,255,255,0.42))] shadow-[0_24px_64px_rgba(15,23,42,0.16)] backdrop-blur-[24px]"
                showTopGlow={false}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">
                      {moving.entries.every((entry) => entry.kind === "item") ? "Add to folder" : "Move selected"}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">Pick a destination, or create a new folder.</div>
                  </div>
                  <button
                    type="button"
                    aria-label="Close move dialog"
                    className={classNames(portalGlassButtonClass, "shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full text-base font-semibold text-zinc-600 transition-colors duration-150 hover:bg-white/80 hover:text-zinc-900")}
                    onClick={() => setMoving(null)}
                    disabled={moveWorking}
                  >
                    ×
                  </button>
                </div>

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

                <div className="mt-4 rounded-3xl border border-white/35 bg-white/45 p-3">
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
                      className="h-10 rounded-full bg-brand-blue/10 px-4 text-sm font-semibold text-(--color-brand-blue) hover:bg-brand-blue/15 disabled:opacity-60"
                    >
                      Create
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="h-10 rounded-2xl bg-[rgba(29,78,216,0.12)] px-4 text-sm font-semibold text-(--color-brand-blue) hover:bg-[rgba(29,78,216,0.18)] disabled:opacity-60"
                    onClick={() => void submitMove()}
                    disabled={moveWorking}
                  >
                    Save
                  </button>
                </div>
              </LiquidGlassPopupSurface>
            </div>,
            document.body,
          )
        : null}

      {previewOpen && previewItem && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-110 flex items-end justify-center px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center">
              <div className="absolute inset-0 bg-black/40" onMouseDown={() => setPreviewOpen(false)} />
              <LiquidGlassPopupSurface className="relative max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] w-full max-w-md overflow-auto rounded-4xl p-5 shadow-xl" showTopGlow={false}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {previewTitleEditing ? (
                      <input
                        autoFocus
                        value={previewTitleValue}
                        onChange={(e) => setPreviewTitleValue(e.target.value)}
                        onBlur={() => void savePreviewTitle()}
                        onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
                          if (e.key === "Enter") void savePreviewTitle();
                          if (e.key === "Escape") {
                            setPreviewTitleEditing(false);
                            setPreviewTitleValue(previewItem.fileName);
                          }
                        }}
                        className="h-9 w-full min-w-55 rounded-2xl border border-white/40 bg-white/70 px-3 text-sm font-semibold text-zinc-900 outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPreviewTitleEditing(true)}
                        className="truncate text-left text-sm font-semibold text-zinc-900 hover:text-(--color-brand-blue)"
                        title="Rename file"
                      >
                        {previewItem.fileName}
                      </button>
                    )}
                    <div className="mt-1 text-xs text-zinc-500">
                      {previewItem.mimeType} • {formatBytes(previewItem.fileSize)}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Close preview"
                    className={classNames(portalGlassButtonClass, "shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full text-base font-semibold text-zinc-600 transition-colors duration-150 hover:bg-white/80 hover:text-zinc-900")}
                    onClick={() => setPreviewOpen(false)}
                  >
                    ×
                  </button>
                </div>

                {itemPreviewKind(previewItem) === "image" && previewItem.previewUrl ? (
                  <div className="mt-4 overflow-hidden rounded-[28px] border border-white/35 bg-white/70">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewItem.previewUrl} alt={previewItem.fileName} className="w-full object-cover" />
                  </div>
                ) : itemPreviewKind(previewItem) === "video" && (previewItem.previewUrl || previewItem.openUrl) ? (
                  <div className="mt-4 overflow-hidden rounded-[28px] border border-white/35 bg-black">
                    <video
                      src={previewItem.previewUrl || previewItem.openUrl}
                      className="w-full"
                      controls
                      playsInline
                      preload="metadata"
                    />
                  </div>
                ) : (
                  <div className="mt-4 rounded-[28px] border border-dashed border-white/35 bg-white/55 p-6 text-sm text-zinc-700">
                    Preview not available for this file type.
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void copyAbsoluteUrl(previewItem.shareUrl)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/70 px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-white/85"
                  >
                    <IconCopy size={16} className="text-zinc-600" />
                    Copy link
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerDownload(previewItem.downloadUrl, previewItem.fileName)}
                    className="inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewOpen(false);
                      void openMove([{ kind: "item", id: previewItem.id }]);
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/70 px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-white/85"
                  >
                    <FolderGlyph className="text-zinc-600" />
                    Add to folder
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewOpen(false);
                      void removeItemById(previewItem.id, previewItem.fileName);
                    }}
                    className="rounded-2xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                  >
                    Delete
                  </button>
                </div>
              </LiquidGlassPopupSurface>
            </div>,
            document.body,
          )
        : null}

      {newFolderOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-100 flex items-end justify-center px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center">
              <div
                className="absolute inset-0 bg-black/40"
                onMouseDown={() => {
                  if (creatingFolder) return;
                  setNewFolderOpen(false);
                }}
              />
              <LiquidGlassPopupSurface
                className="relative w-full max-w-md overflow-auto rounded-4xl p-5 shadow-xl"
                overlayClassName="border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.76),rgba(255,255,255,0.42))] shadow-[0_24px_64px_rgba(15,23,42,0.16)] backdrop-blur-[24px]"
                showTopGlow={false}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Create folder</div>
                    <div className="mt-1 text-sm text-zinc-600">Create a new folder in {folderId ? "the current folder" : "Media Library"}.</div>
                  </div>
                  <button
                    type="button"
                    aria-label="Close create folder dialog"
                    className={classNames(portalGlassButtonClass, "shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full text-base font-semibold text-zinc-600 transition-colors duration-150 hover:bg-white/80 hover:text-zinc-900")}
                    onClick={() => setNewFolderOpen(false)}
                    disabled={creatingFolder}
                  >
                    ×
                  </button>
                </div>
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Folder name"
                  className="mt-4 w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-sm text-zinc-900 outline-none focus:border-zinc-300"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void createFolder();
                    }
                  }}
                />
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void createFolder()}
                    disabled={creatingFolder || !newFolderName.trim()}
                    className="rounded-full bg-brand-blue/10 px-4 py-2 text-sm font-semibold text-(--color-brand-blue) hover:bg-brand-blue/15 disabled:opacity-60"
                  >
                    {creatingFolder ? "Creating…" : "Create folder"}
                  </button>
                </div>
              </LiquidGlassPopupSurface>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
