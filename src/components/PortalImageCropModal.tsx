"use client";

import React, { useEffect, useMemo, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

import { AppModal } from "@/components/AppModal";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";

type AspectPreset = "original" | "1:1" | "16:9" | "4:3" | "3:4";

export type PortalImageCropModalProps = {
  open: boolean;
  imageUrl: string | null;
  title?: string;
  onClose: () => void;
  onSave: (file: File) => Promise<void> | void;
};

async function urlToObjectUrl(url: string): Promise<{ objectUrl: string; mimeType: string | null } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    return { objectUrl, mimeType: blob.type || null };
  } catch {
    return null;
  }
}

function createImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

async function cropToPngBlob(imageSrc: string, crop: Area): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(crop.width));
  canvas.height = Math.max(1, Math.round(crop.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Failed to export cropped image");
  return blob;
}

export default function PortalImageCropModal({
  open,
  imageUrl,
  title = "Crop image",
  onClose,
  onSave,
}: PortalImageCropModalProps) {
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [aspectPreset, setAspectPreset] = useState<AspectPreset>("original");

  const aspect = useMemo(() => {
    if (aspectPreset === "1:1") return 1;
    if (aspectPreset === "16:9") return 16 / 9;
    if (aspectPreset === "4:3") return 4 / 3;
    if (aspectPreset === "3:4") return 3 / 4;
    if (naturalSize?.w && naturalSize?.h) return naturalSize.w / naturalSize.h;
    return 4 / 3;
  }, [aspectPreset, naturalSize?.h, naturalSize?.w]);

  useEffect(() => {
    if (!open) return;
    if (!imageUrl) return;

    let mounted = true;
    let prevUrl: string | null = null;

    (async () => {
      setLoading(true);
      setNaturalSize(null);
      try {
        const r = await urlToObjectUrl(imageUrl);
        if (!mounted) return;
        if (!r) {
          setLocalUrl(imageUrl);
          prevUrl = null;
          return;
        }
        prevUrl = r.objectUrl;
        setLocalUrl(r.objectUrl);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      if (prevUrl) URL.revokeObjectURL(prevUrl);
    };
  }, [open, imageUrl]);

  useEffect(() => {
    if (!open) return;
    if (!localUrl) return;
    let mounted = true;
    void (async () => {
      try {
        const img = await createImage(localUrl);
        if (!mounted) return;
        setNaturalSize({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [open, localUrl]);

  const canSave = !!localUrl && !!croppedAreaPixels;

  return (
    <AppModal
      open={open}
      title={title}
      description="Drag to reposition, scroll/zoom to frame, then save."
      onClose={onClose}
      widthClassName="w-[min(880px,calc(100vw-32px))]"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
            disabled={!canSave || loading}
            onClick={async () => {
              if (!localUrl || !croppedAreaPixels) return;
              setLoading(true);
              try {
                const blob = await cropToPngBlob(localUrl, croppedAreaPixels);
                const file = new File([blob], `cropped-${Date.now()}.png`, { type: "image/png" });
                await onSave(file);
              } finally {
                setLoading(false);
              }
            }}
          >
            Save
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Aspect</div>
            <PortalListboxDropdown<AspectPreset>
              value={aspectPreset}
              onChange={setAspectPreset}
              options={[
                { value: "original", label: "Original" },
                { value: "1:1", label: "1:1" },
                { value: "16:9", label: "16:9" },
                { value: "4:3", label: "4:3" },
                { value: "3:4", label: "3:4" },
              ]}
              portal
              className="min-w-45"
              buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
              disabled={loading}
            />
          </label>

          <label className="block flex-1">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Zoom</div>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full"
            />
          </label>
        </div>

        <div className="relative h-105 w-full overflow-hidden rounded-2xl bg-zinc-950">
          {localUrl ? (
            <Cropper
              image={localUrl}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
              objectFit="contain"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-zinc-300">
              {loading ? "Loading…" : "No image"}
            </div>
          )}
        </div>

        {naturalSize ? (
          <div className="text-xs text-zinc-500">Original size: {naturalSize.w}×{naturalSize.h}</div>
        ) : null}
      </div>
    </AppModal>
  );
}
